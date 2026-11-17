// Texas Hold 'Em engine tests. Run with:  npm test
const assert = require('node:assert/strict');
const E = require('../server/texasHoldEmEngine');

const realLog = console.log;
console.log = () => {}; // keep engine output quiet

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, err }); }
}

const C = (s) => ({ rank: s.slice(0, -1), suit: s.slice(-1) });
const cards = (str) => str.split(' ').map(C);
const cents = (x) => Math.round(x * 100);
const chips = (g) => cents(g.players.reduce((a, p) => a + p.stack, 0));

/** New game with the given stacks; dealerButton is the seat that becomes dealer. */
function newHand(stacks, { dealer = 0, sb = 0.05, bb = 0.10 } = {}) {
  const g = E.createGame('test', sb, bb);
  g.players = stacks.map((s, i) => ({ id: 'P' + i, name: 'P' + i, stack: s, currentBet: 0 }));
  g.dealerButton = dealer - 1;
  const res = E.startNewHand(g);
  return { g, res };
}
const act = (g, action, amount) => E.handlePlayerAction(g, g.currentBettor, action, amount);
const player = (g, id) => g.players.find(p => p.id === id);

/** Finish an all-in run-out the way the server does. */
function runOut(g) {
  while (!E.autoAdvanceOneStreet(g)) { /* deal next street */ }
  return E.determineWinner(g);
}

/* ---------- payouts ---------- */
test('fold win pays the pot once (even if determineWinner is called again)', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'fold');
  const res = act(g, 'fold');
  assert.ok(res.handComplete, 'hand should be complete');
  assert.equal(chips(g), 3000);
  E.determineWinner(g); // what the old server did
  assert.equal(chips(g), 3000);
});

test('showdown pays the pot once', () => {
  const { g } = newHand([10, 10]);
  act(g, 'call'); act(g, 'check');
  let res;
  for (let i = 0; i < 3; i++) { act(g, 'check'); res = act(g, 'check'); }
  assert.ok(res.handComplete, 'river checked through should complete the hand');
  assert.equal(chips(g), 2000);
  E.determineWinner(g);
  assert.equal(chips(g), 2000);
});

/* ---------- all-in flow ---------- */
test('all-in and call triggers the automatic run-out', () => {
  const { g } = newHand([10, 10]);
  act(g, 'raise', 10);
  const res = act(g, 'call');
  assert.equal(res.autoAdvanceNeeded, true);
  assert.equal(g.currentBettor, null);
  const result = runOut(g);
  assert.equal(g.communityCards.length, 5);
  assert.equal(chips(g), 2000);
  assert.ok(result.winners.length >= 1);
});

test('short all-in blind does not get stuck preflop', () => {
  // dealer P0, SB P1 is short (0.03), BB P2
  const { g } = newHand([10, 0.03, 10]);
  assert.equal(player(g, 'P1').stack, 0);
  act(g, 'call');          // P0 calls 0.10
  const res = act(g, 'check'); // P2 (BB) checks
  assert.equal(g.state, 'flop');
  assert.ok(res.success);
  assert.notEqual(g.currentBettor, 'P1', 'all-in player must not be asked to act');
});

test('short all-in first in seat order does not block the round', () => {
  // seats: P0 short, P1, P2; dealer P2 -> SB P0 (short), BB P1
  const { g } = newHand([0.03, 10, 10], { dealer: 2 });
  act(g, 'call');           // P2 calls
  act(g, 'check');          // P1 BB checks
  assert.equal(g.state, 'flop');
});

test('all-in players are skipped when choosing who acts', () => {
  const { g } = newHand([5, 10, 10]); // dealer P0, SB P1, BB P2
  act(g, 'raise', 5);       // P0 all-in
  act(g, 'call');           // P1 calls
  act(g, 'call');           // P2 calls
  assert.equal(g.state, 'flop');
  assert.notEqual(g.currentBettor, 'P0');
  assert.equal(g.currentBettor, 'P1'); // first live player left of the dealer
});

/* ---------- bet / raise rules ---------- */
test('cannot raise to less than the current bet', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'call');
  const res = act(g, 'raise', 0.06); // SB tries to "raise" below the big blind
  assert.ok(res.error);
  assert.equal(g.highestBet, 0.10);
});

test('minimum raise is the size of the last raise', () => {
  const { g } = newHand([10, 10, 10]);
  assert.ok(act(g, 'raise', 0.15).error, 'raise to 0.15 is less than a full raise');
  assert.ok(act(g, 'raise', 0.30).success);       // raise of 0.20
  assert.ok(act(g, 'raise', 0.45).error, 'reraise must be at least 0.20 more');
  assert.ok(act(g, 'raise', 0.50).success);
  assert.equal(E.getMinRaiseTo(g), 0.70);
});

test('short all-in raise is allowed below the minimum', () => {
  const { g } = newHand([10, 0.12, 10]); // SB P1 has 0.12 total
  act(g, 'call');                        // P0 calls 0.10
  const res = act(g, 'raise', 0.12);     // P1 all-in to 0.12 (less than a full raise)
  assert.ok(res.success);
  assert.equal(g.highestBet, 0.12);
  assert.equal(player(g, 'P1').stack, 0);
});

test('big blind option bet adds to the posted blind instead of replacing it', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'call'); act(g, 'call');        // P0, P1 limp
  assert.equal(g.currentBettor, 'P2');   // BB option
  act(g, 'bet', 0.30);                   // raise to 0.30 total
  assert.equal(player(g, 'P2').stack, 9.70);
  assert.equal(g.pot, 0.50);
});

test('a full raise makes earlier players act again', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'call'); act(g, 'call');        // P0, P1 call
  act(g, 'raise', 0.40);                 // BB raises
  assert.equal(g.state, 'preflop');
  assert.equal(g.currentBettor, 'P0');
});

test('call with less than the amount owed goes all-in', () => {
  const { g } = newHand([10, 10, 3]);
  act(g, 'raise', 5);                    // P0 raises to 5
  act(g, 'fold');                        // P1 folds
  act(g, 'call');                        // P2 calls all-in for 3
  assert.equal(player(g, 'P2').stack, 0);
});

/* ---------- side pots ---------- */
test('side pots never create or lose money', () => {
  const g = E.createGame('t', 0.05, 0.10);
  g.players = ['A', 'B', 'C'].map(id => ({ id, name: id, stack: 0, currentBet: 0 }));
  g.players[1].stack = 5; g.players[2].stack = 5;
  g.playerContributions = { A: 1, B: 5, C: 5 };
  g.pot = 11; g.handInProgress = true; g.dealerButton = 0;
  g.foldedPlayers = new Set(['C']);
  g.communityCards = cards('2C 7D 9H JS KD');
  g.playerHands = { A: cards('AH AD'), B: cards('3C 4D'), C: cards('5C 6D') };
  const res = E.determineWinner(g);
  const paid = Object.values(res.winnings).reduce((a, b) => a + cents(b), 0);
  assert.equal(paid, 1100);
  assert.equal(res.winnings.A, 3);   // main pot: 1 from each player
  assert.equal(res.winnings.B, 8);   // side pot: B's 4 + C's folded 4
});

test('side pot goes to the best hand among players who covered it', () => {
  const g = E.createGame('t', 0.05, 0.10);
  g.players = ['A', 'B', 'C'].map(id => ({ id, name: id, stack: 0, currentBet: 0 }));
  g.playerContributions = { A: 2, B: 6, C: 6 };
  g.pot = 14; g.handInProgress = true; g.dealerButton = 0;
  g.communityCards = cards('2C 7D 9H JS KD');
  g.playerHands = { A: cards('AH AD'), B: cards('QH QC'), C: cards('3C 4D') };
  const res = E.determineWinner(g);
  assert.equal(res.winnings.A, 6);   // main pot 2 x 3
  assert.equal(res.winnings.B, 8);   // side pot 4 x 2
  assert.equal(res.winnings.C, 0);
});

test('uncalled chips are returned and do not count as a win', () => {
  const g = E.createGame('t', 0.05, 0.10);
  g.players = ['A', 'B'].map(id => ({ id, name: id, stack: 0, currentBet: 0 }));
  g.playerContributions = { A: 2, B: 10 };
  g.pot = 12; g.handInProgress = true; g.dealerButton = 0;
  g.communityCards = cards('2C 7D 9H JS KD');
  g.playerHands = { A: cards('AH AD'), B: cards('3C 4D') };
  const res = E.determineWinner(g);
  assert.equal(res.winnings.A, 4);
  assert.equal(res.winnings.B, 8);
  assert.deepEqual(res.winnerNames, ['A']);
});

test('split pots are paid in whole cents with nothing lost', () => {
  const g = E.createGame('t', 0.05, 0.10);
  g.players = ['A', 'B'].map(id => ({ id, name: id, stack: 0, currentBet: 0 }));
  g.playerContributions = { A: 0.08, B: 0.07 };
  g.pot = 0.15; g.handInProgress = true; g.dealerButton = 0;
  g.communityCards = cards('AS KS QS JS 10S'); // royal flush on board: split
  g.playerHands = { A: cards('2C 3D'), B: cards('2D 3C') };
  const res = E.determineWinner(g);
  const total = cents(res.winnings.A) + cents(res.winnings.B);
  assert.equal(total, 15);
  for (const v of Object.values(res.winnings)) assert.equal(cents(v) / 100, v);
});

/* ---------- hand ranking ---------- */
const better = (h1, h2, board) => E.compareHands(E.evaluateHand(cards(h1), cards(board)), E.evaluateHand(cards(h2), cards(board)));

test('kicker decides a pair', () => assert.ok(better('KH AC', 'KD QC', 'KS 9D 5C 3H 2D') > 0));
test('kicker decides two pair', () => assert.ok(better('AH 2C', 'KH 2D', 'QS QD 8C 8H 3D') > 0));
test('pair decides full house with trips on board', () => assert.ok(better('KH KC', '4C 4D', '7S 7D 7C 4H 2D') > 0));
test('second flush card matters', () => assert.ok(better('KH 9H', 'QH JH', 'AH 7H 3H 2C 5D') > 0));
test('high-card kickers all count', () => assert.ok(better('9C 8D', '9D 7C', 'AS KD JC 4H 2S') > 0));
test('wheel straight is 5-high', () => assert.ok(better('5H 6C', 'AH 5C', '4S 3D 2C 9H KD') > 0));
test('identical best hands tie', () => assert.equal(better('2C 3D', '2D 3C', 'AS KS QS JS 10S'), 0));
test('flush beats straight', () => assert.ok(better('2H 9H', 'JC 10D', 'KH 7H QD 9C 3H') > 0));

/* ---------- money / positions ---------- */
test('amounts stay in whole cents', () => {
  const { g } = newHand([10, 10]);
  act(g, 'raise', 5); act(g, 'call');
  const first = g.currentBettor;
  act(g, 'bet', 5);
  assert.equal(g.playerContributions[first], 10);
  for (const p of g.players) assert.equal(cents(p.stack) / 100, p.stack);
});

test('heads-up: dealer posts small blind, acts first preflop and last after the flop', () => {
  const { g } = newHand([10, 10], { dealer: 0 });
  assert.equal(player(g, 'P0').currentBet, 0.05);
  assert.equal(player(g, 'P1').currentBet, 0.10);
  assert.equal(g.currentBettor, 'P0');
  act(g, 'call'); act(g, 'check');
  assert.equal(g.state, 'flop');
  assert.equal(g.currentBettor, 'P1');
});

test('after the flop the first live player left of the dealer acts', () => {
  const { g } = newHand([10, 10, 10, 10]); // dealer P0, SB P1, BB P2
  act(g, 'call');            // P3
  act(g, 'call');            // P0
  act(g, 'fold');            // P1 (SB) folds
  act(g, 'check');           // P2
  assert.equal(g.state, 'flop');
  assert.equal(g.currentBettor, 'P2');
});

/* ---------- leaving mid-hand ---------- */
test('player leaving on their turn folds and play continues', () => {
  const { g } = newHand([10, 10, 10]);
  const leaver = g.currentBettor;
  const res = E.removePlayer(g, leaver);
  assert.ok(res.success);
  assert.ok(g.foldedPlayers.has(leaver));
  assert.notEqual(g.currentBettor, leaver);
});

test('player leaving heads-up ends the hand', () => {
  const { g } = newHand([10, 10]);
  const other = g.players.find(p => p.id !== g.currentBettor).id;
  const res = E.removePlayer(g, other);
  assert.ok(res.handComplete);
  assert.equal(chips(g), 2000);
});

/* ---------- blinds ---------- */
test('blind change approved mid-hand applies next hand; a no vote cancels', () => {
  const { g } = newHand([10, 10, 10]);
  E.requestBlindChange(g, 'P0', 0.10, 0.20);
  assert.ok(E.voteOnBlindChange(g, 'P1', true).approved);
  assert.equal(g.bigBlind, 0.10);
  act(g, 'fold'); act(g, 'fold');
  E.startNewHand(g);
  assert.equal(g.bigBlind, 0.20);
  E.requestBlindChange(g, 'P0', 1, 2);
  assert.ok(E.voteOnBlindChange(g, 'P1', false).rejected);
  assert.equal(g.blindChangeRequest, null);
});

/* ---------- showing cards ---------- */
test('showdown reveals the cards of everyone still in the hand, not folded players', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'fold');                         // P0 folds
  act(g, 'call'); act(g, 'check');        // P1, P2 to the flop
  let res;
  for (let i = 0; i < 3; i++) { act(g, 'check'); res = act(g, 'check'); }
  const shown = res.handComplete.shownHands;
  assert.deepEqual(shown.map(h => h.id).sort(), ['P1', 'P2']);
  assert.deepEqual(shown.find(h => h.id === 'P1').cards, g.playerHands.P1);
  assert.ok(shown.every(h => h.description));
});

test('a fold win reveals nothing automatically', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'fold');
  const res = act(g, 'fold');
  assert.deepEqual(res.handComplete.shownHands, []);
});

/* ---------- last action labels ---------- */
test('last actions are recorded and cleared each street (folds and all-ins stay)', () => {
  const { g } = newHand([10, 10, 10, 2]); // dealer P0, SB P1, BB P2, first to act P3
  act(g, 'raise', 2);        // P3 all-in for 2
  act(g, 'call');            // P0 calls 2
  act(g, 'fold');            // P1 folds
  act(g, 'raise', 4);        // P2 raises to 4
  assert.equal(g.lastActions.P3, 'All-in $2.00');
  assert.equal(g.lastActions.P0, 'Call $2.00');
  assert.equal(g.lastActions.P1, 'Fold');
  assert.equal(g.lastActions.P2, 'Raise to $4.00');
  act(g, 'call');            // P0 calls the raise -> flop
  assert.equal(g.state, 'flop');
  assert.equal(g.lastActions.P0, undefined);
  assert.equal(g.lastActions.P2, undefined);
  assert.equal(g.lastActions.P1, 'Fold');
  assert.equal(g.lastActions.P3, 'All-in $2.00');
  act(g, 'check');           // P2 checks
  act(g, 'bet', 1);          // P0 bets
  assert.equal(g.lastActions.P2, 'Check');
  assert.equal(g.lastActions.P0, 'Bet $1.00');
});

/* ---------- random stress test ---------- */
test('5,000 random hands: money is conserved and no hand gets stuck', () => {
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let h = 0; h < 5000; h++) {
    const n = 2 + Math.floor(rand() * 5);
    const stacks = Array.from({ length: n }, () => Math.round((0.05 + rand() * 5) * 100) / 100);
    const { g } = newHand(stacks, { dealer: Math.floor(rand() * n) });
    const start = stacks.reduce((a, s) => a + cents(s), 0);
    let res = { success: true };
    let steps = 0;
    if (g.currentBettor === null && g.handInProgress) res = { autoAdvanceNeeded: true };
    while (!res.handComplete && !res.autoAdvanceNeeded) {
      assert.ok(++steps < 200, `hand ${h} stuck`);
      const p = player(g, g.currentBettor);
      assert.ok(p && p.stack > 0, `hand ${h}: invalid player asked to act`);
      const toCall = g.highestBet - p.currentBet;
      const r = rand();
      if (r < 0.15) res = act(g, 'fold');
      else if (r < 0.55) res = act(g, toCall > 0 ? 'call' : 'check');
      else if (r < 0.85) {
        const target = E.getMinRaiseTo(g) + Math.floor(rand() * 3) * g.bigBlind;
        res = act(g, 'raise', target);
        if (res.error) res = act(g, toCall > 0 ? 'call' : 'check');
      } else res = act(g, 'raise', p.stack + p.currentBet); // all-in
      assert.ok(!res.error, `hand ${h}: unexpected error ${res.error}`);
    }
    if (res.autoAdvanceNeeded) runOut(g);
    assert.equal(chips(g), start, `hand ${h}: chips changed`);
    assert.equal(g.handInProgress, false);
  }
});

/* ---------- winner banner ---------- */
function showdown(contrib, hands, board, folded = []) {
  const ids = Object.keys(contrib);
  const g = E.createGame('t', 0.05, 0.10);
  g.players = ids.map(id => ({ id, name: id, stack: 0, currentBet: 0 }));
  g.playerContributions = { ...contrib };
  g.pot = Object.values(contrib).reduce((a, b) => a + b, 0);
  g.handInProgress = true; g.dealerButton = 0;
  g.foldedPlayers = new Set(folded);
  g.communityCards = cards(board);
  g.playerHands = Object.fromEntries(ids.map(id => [id, cards(hands[id])]));
  return E.determineWinner(g).winnerSummary;
}

test('banner: one winner, pot and plain hand name', () => {
  const s = showdown({ A: 0.75, B: 0.75 }, { A: 'AH 10D', B: '3C 4D' }, 'KH QD JS 4C 2H');
  assert.deepEqual(s, [{ name: 'A', amount: 1.5, hand: 'Ace high straight' }]);
});

test('banner: uncalled bet coming back is not counted as winnings', () => {
  const s = showdown({ A: 2, B: 10 }, { A: 'AH AD', B: '3C 4D' }, '2C 7D 9H JS KD');
  assert.deepEqual(s, [{ name: 'A', amount: 4, hand: 'Pair of Aces' }]);
});

test('banner: side pot winner gets their own line', () => {
  const s = showdown({ A: 2, B: 6, C: 6 }, { A: 'AH AD', B: 'QH QC', C: '3C 4D' }, '2C 7D 9H JS KD');
  assert.deepEqual(s, [
    { name: 'A', amount: 6, hand: 'Pair of Aces' },
    { name: 'B', amount: 8, hand: 'Pair of Queens' }
  ]);
});

test('banner: split pot shows each share, odd cent included', () => {
  const s = showdown({ A: 0.08, B: 0.07, C: 0.08 }, { A: '2C 3D', B: '4C 5D', C: '6C 7D' }, 'AS KS QS JS 10S');
  assert.equal(s.length, 3);
  assert.equal(s.reduce((a, w) => a + cents(w.amount), 0), 23);
  assert.ok(s.every(w => w.hand === 'Royal flush'));
});

test('banner: fold win shows no hand', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'fold');
  const res = act(g, 'fold');
  const winner = res.handComplete.winnerSummary;
  assert.equal(winner.length, 1);
  assert.equal(winner[0].hand, null);
  assert.equal(winner[0].amount, res.handComplete.pot);
});

/* ---------- hand history ---------- */
test('hand history: fold win records blinds, actions and result', () => {
  const { g } = newHand([10, 10, 10]);
  act(g, 'fold');
  act(g, 'fold');
  const log = g.handLog.join('\n');
  assert.match(log, /^Blinds \$0\.05\/\$0\.10 {2}\| {2}Dealer: /);
  assert.match(log, /Hole cards: .*\[\w+ \w+\]/);
  assert.match(log, /posts small blind \$0\.05/);
  assert.match(log, /posts big blind \$0\.10/);
  assert.equal((log.match(/: Fold/g) || []).length, 2);
  assert.match(log, /wins \$0\.15 \(everyone else folded\)/);
  assert.match(log, /Ending stacks: /);
});

test('hand history: all-in run-out records every street and the showdown', () => {
  const { g } = newHand([10, 10]);
  act(g, 'raise', 10);
  const res = act(g, 'call');
  assert.ok(res.autoAdvanceNeeded);
  runOut(g);
  const log = g.handLog.join('\n');
  assert.match(log, /All-in \$10\.00/);
  assert.match(log, /No more betting possible/);
  assert.match(log, /--- Flop \[\S+ \S+ \S+\] ---/);
  assert.match(log, /--- Turn \[(\S+ ){3}\S+\] ---/);
  assert.match(log, /--- River \[(\S+ ){4}\S+\] ---/);
  assert.match(log, /--- Showdown {2}Board /);
  assert.match(log, /wins \$\d+\.\d\d with /);
});

test('hand history: each hand starts a fresh log with the next number', () => {
  const { g } = newHand([10, 10, 10]);
  const first = g.handNumber;
  act(g, 'fold'); act(g, 'fold');
  E.startNewHand(g);
  assert.equal(g.handNumber, first + 1);
  assert.ok(!g.handLog.some(l => /everyone else folded/.test(l)));
});

/* ---------- Sit 'N Go ---------- */
const SNGR = require('../server/sitAndGo');

test("sng: blind schedule starts at 25/50 and keeps rising", () => {
  assert.deepEqual(SNGR.blindsForLevel(0), { smallBlind: 25, bigBlind: 50 });
  assert.deepEqual(SNGR.blindsForLevel(6), { smallBlind: 300, bigBlind: 600 });
  const last = SNGR.BLIND_LEVELS.length - 1;
  const beyond = SNGR.blindsForLevel(last + 1);
  assert.equal(beyond.bigBlind, SNGR.blindsForLevel(last).bigBlind * 2);
  for (let l = 1; l < 25; l++) {
    assert.ok(SNGR.blindsForLevel(l).bigBlind > SNGR.blindsForLevel(l - 1).bigBlind);
  }
});

test('sng: level clock', () => {
  const m = 4 * 60 * 1000;
  assert.equal(SNGR.levelAt(0, m), 0);
  assert.equal(SNGR.levelAt(m - 1, m), 0);
  assert.equal(SNGR.levelAt(m, m), 1);
  assert.equal(SNGR.levelAt(25 * 60 * 1000, m), 6);
});

test('sng: payouts by table size, whole cents, nothing lost', () => {
  assert.deepEqual(SNGR.prizes(10, 3), [30]);
  assert.deepEqual(SNGR.prizes(10, 6), [39, 21]);
  assert.deepEqual(SNGR.prizes(10, 9), [45, 27, 18]);
  assert.deepEqual(SNGR.prizes(0, 6), [0, 0]);
  for (const buyIn of [0.33, 1, 7.77, 25]) {
    for (let n = 2; n <= 9; n++) {
      const p = SNGR.prizes(buyIn, n);
      assert.equal(p.reduce((a, b) => a + Math.round(b * 100), 0), Math.round(buyIn * 100) * n);
    }
  }
});

test('sng: players knocked out in the same hand are placed by starting stack', () => {
  const places = SNGR.placeEliminated(
    [{ id: 'small', startingStack: 200 }, { id: 'big', startingStack: 900 }], 3);
  assert.deepEqual(places, [{ id: 'big', place: 4 }, { id: 'small', place: 5 }]);
  assert.equal(SNGR.ordinal(1), '1st');
  assert.equal(SNGR.ordinal(2), '2nd');
  assert.equal(SNGR.ordinal(3), '3rd');
  assert.equal(SNGR.ordinal(11), '11th');
  assert.equal(SNGR.ordinal(22), '22nd');
});

test('sng: players who tie in a knockout share the prizes of their places', () => {
  const prizeList = SNGR.prizes(10, 7); // [35, 21, 14]
  const placed = [
    { id: 'A', place: 2, startingStack: 800 },
    { id: 'B', place: 3, startingStack: 800 },
    { id: 'C', place: 4, startingStack: 300 }
  ];
  const p = SNGR.knockoutPrizes(placed, prizeList);
  assert.equal(p.A, 17.5);
  assert.equal(p.B, 17.5);
  assert.equal(p.C, 0);
  // Different starting stacks: no sharing
  const q = SNGR.knockoutPrizes([{ id: 'A', place: 2, startingStack: 900 }, { id: 'B', place: 3, startingStack: 800 }], prizeList);
  assert.deepEqual(q, { A: 21, B: 14 });
  // Odd cent goes to the higher place
  const r = SNGR.knockoutPrizes([{ id: 'A', place: 1, startingStack: 5 }, { id: 'B', place: 2, startingStack: 5 }], [0.03, 0]);
  assert.equal(r.A + r.B, 0.03);
});

function chipGame(stacks, blinds = [25, 50]) {
  const g = E.createGame('t', blinds[0], blinds[1]);
  g.chipMode = true;
  g.unitCents = 100;
  g.players = stacks.map((s, i) => ({ id: 'P' + i, name: 'P' + i, stack: s, currentBet: 0 }));
  return g;
}

test('sng: split pots pay whole chips only', () => {
  const g = chipGame([0, 0]);
  g.playerContributions = { P0: 75, P1: 76 };
  g.pot = 151; g.handInProgress = true; g.dealerButton = 0;
  g.foldedPlayers = new Set();
  g.communityCards = cards('AS KS QS JS 10S');
  g.playerHands = { P0: cards('2C 3D'), P1: cards('4C 5D') };
  const res = E.determineWinner(g);
  for (const w of Object.values(res.winnings)) assert.equal(w, Math.round(w));
  assert.equal(res.winnings.P0 + res.winnings.P1, 151);
});

test('sng: bets round to whole chips and text has no $', () => {
  const g = chipGame([1500, 1500, 1500]);
  E.startNewHand(g);
  const r = E.handlePlayerAction(g, g.currentBettor, 'raise', 150.4);
  assert.ok(!r.error, r.error);
  assert.equal(g.highestBet, 150);
  const log = g.handLog.join('\n');
  assert.ok(!log.includes('$'), log);
  assert.match(log, /Raise to 150/);
});

test('sng: random tournaments end with one player holding every chip', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 40; t++) {
    const n = 2 + (t % 8);
    let stacks = Array(n).fill(SNGR.STARTING_STACK);
    const ids = stacks.map((_, i) => 'P' + i);
    const total = n * SNGR.STARTING_STACK;
    const places = {};
    let alive = ids.slice();
    let dealer = -1;
    for (let hand = 0; alive.length > 1; hand++) {
      assert.ok(hand < 5000, 'tournament never ended');
      const level = Math.floor(hand / 8);
      const { smallBlind, bigBlind } = SNGR.blindsForLevel(level);
      const g = chipGame([], [smallBlind, bigBlind]);
      g.players = alive.map(id => ({ id, name: id, stack: stacks[ids.indexOf(id)], currentBet: 0 }));
      g.dealerButton = dealer;
      // Blinds alone can put everyone all-in, so the start can need a run-out
      let res = E.startNewHand(g);
      dealer = g.dealerButton;
      let guard = 0;
      while (g.handInProgress && !res.autoAdvanceNeeded) {
        assert.ok(guard++ < 300, 'hand never ended');
        const p = g.players.find(x => x.id === g.currentBettor);
        const toCall = g.highestBet - p.currentBet;
        const r = rand();
        if (r < 0.2 && toCall > 0) res = act(g, 'fold');
        else if (r < 0.65) res = act(g, toCall > 0 ? 'call' : 'check');
        else res = act(g, 'raise', r < 0.85 ? E.getMinRaiseTo(g) : p.stack + p.currentBet);
        assert.ok(!res.error, res.error);
      }
      if (res.autoAdvanceNeeded) runOut(g);
      for (const p of g.players) {
        assert.equal(p.stack, Math.round(p.stack), 'fractional chips');
        stacks[ids.indexOf(p.id)] = p.stack;
      }
      assert.equal(stacks.reduce((a, b) => a + b, 0), total, 'chips created or lost');
      const busted = g.players.filter(p => p.stack === 0)
        .map(p => ({ id: p.id, startingStack: g.startingStacks[p.id] }));
      alive = alive.filter(id => stacks[ids.indexOf(id)] > 0);
      for (const { id, place } of SNGR.placeEliminated(busted, alive.length)) places[id] = place;
    }
    places[alive[0]] = 1;
    assert.deepEqual(Object.values(places).sort((a, b) => a - b), ids.map((_, i) => i + 1));
  }
});

console.log = realLog;
for (const f of failures) console.log(`FAIL  ${f.name}\n      ${f.err.message}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
