// ========================================
// TEXAS HOLD 'EM POKER ENGINE
// ========================================
//
// Money: every amount the engine exposes (stacks, bets, pot, blinds) is in
// dollars, but all arithmetic is done in whole cents through the helpers
// below, so amounts never pick up floating-point errors like 4.999999999.
//
// Bets and raises: the `amount` sent with 'bet' or 'raise' is the TOTAL the
// player wants their bet to be this street ("raise to"), not the increment.
//
// handlePlayerAction / startNewHand / removePlayer return one of:
//   { error }                       - action rejected, nothing changed
//   { success: true }               - betting continues, game.currentBettor is next
//   { success: true, autoAdvanceNeeded: true }
//                                   - no more betting possible; deal the remaining
//                                     streets with autoAdvanceOneStreet(), then
//                                     call determineWinner()
//   { success: true, handComplete } - hand is over and has already been paid out;
//                                     handComplete is the determineWinner() result

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['C', 'D', 'H', 'S'];

// Hand rankings (from best to worst)
const HAND_RANKINGS = {
  ROYAL_FLUSH: 10,
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  PAIR: 2,
  HIGH_CARD: 1
};

/* ===============================
   MONEY HELPERS (whole cents)
================================ */
const toCents = (dollars) => Math.round((Number(dollars) || 0) * 100);
const toDollars = (cents) => cents / 100;
const add = (a, b) => toDollars(toCents(a) + toCents(b));
const sub = (a, b) => toDollars(toCents(a) - toCents(b));
const roundMoney = (x) => toDollars(toCents(x));

/**
 * Create a new Texas Hold 'Em game
 */
function createGame(roomId, smallBlind = 0.05, bigBlind = 0.10) {
  return {
    roomId,
    players: [],          // Players dealt into the current hand, in seat order
    state: 'waiting',     // 'waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'
    handInProgress: false,
    smallBlind: roundMoney(smallBlind),
    bigBlind: roundMoney(bigBlind),
    pendingBlinds: null,  // { smallBlind, bigBlind } applied at the start of the next hand
    pot: 0,
    sidePots: [],         // [{ amount, eligiblePlayers: Set(ids) }], built at showdown
    communityCards: [],
    currentBettor: null,  // id of the player whose turn it is (null during run-outs)
    highestBet: 0,        // Highest total bet this street
    lastRaiseSize: bigBlind, // Size of the last full raise this street (minimum raise increment)
    dealerButton: -1,
    smallBlindPos: 0,
    bigBlindPos: 0,
    activePlayers: [],    // ids of players who have not folded
    playersActedThisRound: new Set(),
    deck: [],
    playerHands: {},
    foldedPlayers: new Set(),
    allInPlayers: new Set(),
    playerContributions: {}, // id -> total put in the pot this hand
    startingStacks: {},      // id -> stack at the start of the hand
    lastResult: null,        // determineWinner() result for the finished hand
    lastActions: {},         // id -> text of their last action ("Call $2.00", "Fold", ...)
    blindChangeRequest: null
  };
}

/**
 * Start a new hand with game.players (caller sets the seat list; needs 2+).
 * Moves the button, posts blinds and deals hole cards.
 */
function startNewHand(game) {
  if (game.players.length < 2) return { error: 'Need at least 2 players' };

  // Apply any blind change that was approved during the previous hand
  if (game.pendingBlinds) {
    game.smallBlind = game.pendingBlinds.smallBlind;
    game.bigBlind = game.pendingBlinds.bigBlind;
    game.pendingBlinds = null;
  }

  game.state = 'preflop';
  game.handInProgress = true;
  game.communityCards = [];
  game.pot = 0;
  game.sidePots = [];
  game.highestBet = 0;
  game.lastRaiseSize = game.bigBlind;
  game.playerHands = {};
  game.foldedPlayers = new Set();
  game.allInPlayers = new Set();
  game.playersActedThisRound = new Set();
  game.playerContributions = {};
  game.startingStacks = {};
  game.lastResult = null;
  game.lastActions = {};
  game.handNumber = (game.handNumber || 0) + 1;
  game.handLog = [];
  game.players.forEach(p => {
    p.stack = roundMoney(p.stack);
    p.currentBet = 0;
    game.playerContributions[p.id] = 0;
    game.startingStacks[p.id] = p.stack;
  });
  game.activePlayers = game.players.map(p => p.id);

  // Move the dealer button. Heads-up, the dealer posts the small blind.
  const n = game.players.length;
  game.dealerButton = (game.dealerButton + 1) % n;
  if (n === 2) {
    game.smallBlindPos = game.dealerButton;
    game.bigBlindPos = (game.dealerButton + 1) % n;
  } else {
    game.smallBlindPos = (game.dealerButton + 1) % n;
    game.bigBlindPos = (game.dealerButton + 2) % n;
  }

  game.deck = buildDeck();
  for (const p of game.players) {
    game.playerHands[p.id] = [game.deck.pop(), game.deck.pop()];
  }

  const sbPlayer = game.players[game.smallBlindPos];
  const bbPlayer = game.players[game.bigBlindPos];
  postBlind(game, sbPlayer, game.smallBlind);
  postBlind(game, bbPlayer, game.bigBlind);

  logHand(game, `Blinds ${money(game.smallBlind)}/${money(game.bigBlind)}  |  Dealer: ${game.players[game.dealerButton].name}`);
  logHand(game, `Seats: ${game.players.map(p => `${p.name} ${money(game.startingStacks[p.id])}`).join(', ')}`);
  logHand(game, `Hole cards: ${game.players.map(p => `${p.name} ${cardList(game.playerHands[p.id])}`).join(', ')}`);
  logHand(game, '--- Preflop ---');
  logHand(game, `${sbPlayer.name} posts small blind ${money(sbPlayer.currentBet)}${toCents(sbPlayer.stack) === 0 ? ' (all-in)' : ''}`);
  logHand(game, `${bbPlayer.name} posts big blind ${money(bbPlayer.currentBet)}${toCents(bbPlayer.stack) === 0 ? ' (all-in)' : ''}`);
  // Callers owe the full big blind even if the big blind was short
  game.highestBet = game.bigBlind;

  // Preflop: first to act is left of the big blind (heads-up: the dealer/small blind)
  const firstSeat = n === 2 ? game.smallBlindPos : (game.bigBlindPos + 1) % n;
  game.currentBettor = null;
  const first = findNextToAct(game, firstSeat);
  if (first) {
    game.currentBettor = first.id;
    return { success: true };
  }
  // Nobody can act (e.g. both blinds all-in): deal it out
  return endBettingRound(game);
}

function postBlind(game, player, amount) {
  const pay = Math.min(toCents(amount), toCents(player.stack));
  putChips(game, player, toDollars(pay));
}

/** Move chips from a player's stack into the pot. */
function putChips(game, player, amount) {
  player.stack = sub(player.stack, amount);
  player.currentBet = add(player.currentBet, amount);
  game.playerContributions[player.id] = add(game.playerContributions[player.id] || 0, amount);
  game.pot = add(game.pot, amount);
  if (toCents(player.stack) === 0) game.allInPlayers.add(player.id);
}

/* ===============================
   TURN ORDER
================================ */
const isFolded = (game, p) => game.foldedPlayers.has(p.id);
const canAct = (game, p) => !isFolded(game, p) && toCents(p.stack) > 0;

/** Does this player still need to act before the betting round can close? */
function needsToAct(game, p) {
  if (!canAct(game, p)) return false;
  if (toCents(p.currentBet) < toCents(game.highestBet)) return true;
  if (game.playersActedThisRound.has(p.id)) return false;
  // Matched the bet but hasn't acted: only matters if someone else can still act
  return game.players.filter(x => canAct(game, x)).length > 1;
}

/** First player at or after seat index `startSeat` who needs to act, or null. */
function findNextToAct(game, startSeat) {
  const n = game.players.length;
  for (let i = 0; i < n; i++) {
    const p = game.players[(startSeat + i) % n];
    if (needsToAct(game, p)) return p;
  }
  return null;
}

/**
 * Handle player action (fold, check, call, bet, raise)
 */
function handlePlayerAction(game, playerId, action, amount = 0) {
  if (!game.handInProgress) return { error: 'No hand in progress' };
  const player = game.players.find(p => p.id === playerId);
  if (!player || game.currentBettor !== playerId) {
    return { error: 'Not your turn' };
  }
  if (!canAct(game, player)) return { error: 'You cannot act' };

  const toCall = sub(game.highestBet, player.currentBet);
  const betBefore = player.currentBet;
  const highestBefore = game.highestBet;

  switch (action) {
    case 'fold':
      game.foldedPlayers.add(playerId);
      game.activePlayers = game.activePlayers.filter(id => id !== playerId);
      break;

    case 'check':
      if (toCents(toCall) > 0) {
        return { error: 'Cannot check - there is a bet to call' };
      }
      break;

    case 'call': {
      if (toCents(toCall) <= 0) break; // nothing to call: same as a check
      const pay = Math.min(toCents(toCall), toCents(player.stack));
      putChips(game, player, toDollars(pay));
      break;
    }

    case 'bet':
    case 'raise': {
      const result = applyRaise(game, player, amount);
      if (result.error) return result;
      break;
    }

    default:
      return { error: 'Unknown action' };
  }

  game.playersActedThisRound.add(playerId);
  game.lastActions[playerId] = describeAction(game, player, action, betBefore, highestBefore);
  logHand(game, `${player.name}: ${game.lastActions[playerId]}`);
  return advanceBetting(game);
}

/** Short text for a player's action, shown in their seat window. */
function describeAction(game, player, action, betBefore, highestBefore) {
  const money = (x) => `$${Number(x).toFixed(2)}`;
  const allIn = toCents(player.stack) === 0;
  if (action === 'fold') return 'Fold';
  if (action === 'check' || (action === 'call' && toCents(player.currentBet) === toCents(betBefore))) {
    return 'Check';
  }
  if (allIn) return `All-in ${money(player.currentBet)}`;
  if (action === 'call') return `Call ${money(sub(player.currentBet, betBefore))}`;
  return toCents(highestBefore) === 0
    ? `Bet ${money(player.currentBet)}`
    : `Raise to ${money(player.currentBet)}`;
}

/**
 * Bet or raise to a total of `raiseTo` for this street.
 */
function applyRaise(game, player, raiseTo) {
  const target = toCents(raiseTo);
  const maxTotal = toCents(player.stack) + toCents(player.currentBet);
  const highest = toCents(game.highestBet);
  const minRaiseTo = getMinRaiseTo(game);
  const isAllIn = target >= maxTotal;
  const total = isAllIn ? maxTotal : target;

  if (!isAllIn) {
    if (total <= highest) {
      return { error: `Raise must be more than the current bet of $${game.highestBet.toFixed(2)}` };
    }
    if (total < toCents(minRaiseTo)) {
      return highest === 0
        ? { error: `Minimum bet is $${minRaiseTo.toFixed(2)}` }
        : { error: `Minimum raise is to $${minRaiseTo.toFixed(2)}` };
    }
  }

  putChips(game, player, toDollars(total - toCents(player.currentBet)));

  if (total > highest) {
    const raiseSize = total - highest;
    game.highestBet = toDollars(total);
    if (raiseSize >= toCents(game.lastRaiseSize)) {
      // A full raise re-opens the betting: everyone else must act again
      game.lastRaiseSize = toDollars(raiseSize);
      game.playersActedThisRound = new Set();
    }
    // A short all-in raise doesn't re-open betting, but anyone below the new
    // highest bet still has to call it (needsToAct checks the bet amount).
  }
  return { success: true };
}

/** Smallest legal "raise to" total right now. */
function getMinRaiseTo(game) {
  if (toCents(game.highestBet) === 0) return game.bigBlind;
  return add(game.highestBet, game.lastRaiseSize);
}

/**
 * After an action: pick the next player, or close the betting round.
 */
function advanceBetting(game) {
  const remaining = game.players.filter(p => !isFolded(game, p));
  if (remaining.length === 1) {
    return { success: true, handComplete: determineWinner(game) };
  }

  const currentSeat = game.players.findIndex(p => p.id === game.currentBettor);
  const next = findNextToAct(game, currentSeat + 1);
  if (next) {
    game.currentBettor = next.id;
    return { success: true };
  }
  return endBettingRound(game);
}

/**
 * Betting round is over: deal the next street, run it out, or go to showdown.
 */
function endBettingRound(game) {
  resetStreet(game);
  const remaining = game.players.filter(p => !isFolded(game, p));
  const actors = remaining.filter(p => canAct(game, p));

  if (game.state === 'river') {
    return { success: true, handComplete: determineWinner(game) };
  }
  if (actors.length <= 1) {
    // Nobody can bet any more: deal the remaining streets automatically
    game.currentBettor = null;
    logHand(game, '(No more betting possible: the rest of the board is dealt out)');
    return { success: true, autoAdvanceNeeded: true };
  }

  dealNextStreet(game);
  // After the flop, action starts with the first player left of the dealer
  const first = findNextToAct(game, game.dealerButton + 1);
  game.currentBettor = first ? first.id : null;
  return { success: true };
}

function resetStreet(game) {
  game.players.forEach(p => { p.currentBet = 0; });
  // New street: clear last actions, but folds and all-ins stay for the whole hand
  for (const id of Object.keys(game.lastActions || {})) {
    const text = game.lastActions[id];
    if (text !== 'Fold' && !text.startsWith('All-in')) delete game.lastActions[id];
  }
  game.highestBet = 0;
  game.lastRaiseSize = game.bigBlind;
  game.playersActedThisRound = new Set();
}

function dealNextStreet(game) {
  if (game.state === 'preflop') {
    game.communityCards.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
    game.state = 'flop';
  } else if (game.state === 'flop') {
    game.communityCards.push(game.deck.pop());
    game.state = 'turn';
  } else if (game.state === 'turn') {
    game.communityCards.push(game.deck.pop());
    game.state = 'river';
  }
  const street = { flop: 'Flop', turn: 'Turn', river: 'River' }[game.state];
  if (street) logHand(game, `--- ${street} ${cardList(game.communityCards)} ---`);
}

/**
 * Deal one street during an all-in run-out.
 * Returns true once all five board cards are out (time for showdown).
 */
function autoAdvanceOneStreet(game) {
  if (game.communityCards.length >= 5) {
    game.state = 'showdown';
    return true;
  }
  dealNextStreet(game);
  return false;
}

/**
 * A player leaves mid-hand: they fold (their chips stay in the pot).
 * Outside a hand they are simply removed from the seat list.
 */
function removePlayer(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return { success: true };

  if (!game.handInProgress) {
    game.players = game.players.filter(p => p.id !== playerId);
    return { success: true };
  }

  if (isFolded(game, player)) return { success: true };
  game.lastActions[playerId] = 'Fold';
  logHand(game, `${player.name}: Fold (left the table)`);
  game.foldedPlayers.add(playerId);
  game.activePlayers = game.activePlayers.filter(id => id !== playerId);

  if (game.currentBettor === playerId || game.currentBettor === null) {
    if (game.currentBettor === null) {
      // During a run-out only check whether one player is left
      const remaining = game.players.filter(p => !isFolded(game, p));
      if (remaining.length === 1) return { success: true, handComplete: determineWinner(game) };
      return { success: true };
    }
    return advanceBetting(game);
  }

  // Someone else's turn: the hand may now be over, or they may be the last to act
  const remaining = game.players.filter(p => !isFolded(game, p));
  if (remaining.length === 1) return { success: true, handComplete: determineWinner(game) };
  const current = game.players.find(p => p.id === game.currentBettor);
  if (current && !needsToAct(game, current)) return advanceBetting(game);
  return { success: true };
}

/* ===============================
   SHOWDOWN / PAYOUT
================================ */

/**
 * Build the main pot and side pots from each player's total contribution.
 * Folded players' chips go into the pots, but they can't win them.
 */
function buildSidePots(game) {
  const contrib = {};
  game.players.forEach(p => { contrib[p.id] = toCents(game.playerContributions[p.id] || 0); });
  const live = game.players.filter(p => !isFolded(game, p));
  const levels = [...new Set(live.map(p => contrib[p.id]))].filter(c => c > 0).sort((a, b) => a - b);

  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of game.players) {
      amount += Math.min(contrib[p.id], level) - Math.min(contrib[p.id], prev);
    }
    const eligible = new Set(live.filter(p => contrib[p.id] >= level).map(p => p.id));
    if (amount > 0) pots.push({ amount, eligiblePlayers: eligible });
    prev = level;
  }
  // Chips folded players put in above every live player's total
  let leftover = 0;
  for (const p of game.players) leftover += Math.max(0, contrib[p.id] - prev);
  if (leftover > 0 && pots.length > 0) pots[pots.length - 1].amount += leftover;

  // Merge neighbouring pots with the same eligible players
  const merged = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    const same = last && last.eligiblePlayers.size === pot.eligiblePlayers.size &&
      [...pot.eligiblePlayers].every(id => last.eligiblePlayers.has(id));
    if (same) last.amount += pot.amount;
    else merged.push({ amount: pot.amount, eligiblePlayers: pot.eligiblePlayers });
  }

  game.sidePots = merged.map(p => ({ amount: toDollars(p.amount), eligiblePlayers: p.eligiblePlayers }));
  return merged; // amounts in cents
}

/**
 * Pay out the hand. Safe to call more than once: the hand is only paid once.
 */
function determineWinner(game) {
  if (!game.handInProgress && game.lastResult) return game.lastResult;

  game.state = 'showdown';
  game.currentBettor = null;
  resetStreet(game);
  const remainingPlayers = game.players.filter(p => !isFolded(game, p));
  const potCents = Object.values(game.playerContributions).reduce((a, c) => a + toCents(c), 0);
  game.pot = toDollars(potCents);
  let result;

  if (remainingPlayers.length === 1) {
    // Everyone else folded - winner takes the whole pot
    const winner = remainingPlayers[0];
    winner.stack = add(winner.stack, game.pot);
    result = {
      winners: [winner.id],
      winnerNames: [winner.name],
      pot: game.pot,
      method: 'fold',
      shownHands: [], // the winner may choose to show (handled by the server)
      sidePotDistribution: [{ potAmount: game.pot, winners: [winner.name] }],
      winnings: { [winner.id]: game.pot },
      winnerSummary: [{ name: winner.name, amount: game.pot, hand: null }]
    };
  } else {
    const hands = remainingPlayers.map(player => ({
      id: player.id,
      name: player.name,
      hand: evaluateHand(game.playerHands[player.id], game.communityCards)
    }));
    const pots = buildSidePots(game);
    const winningsCents = {};
    remainingPlayers.forEach(p => { winningsCents[p.id] = 0; });
    const sidePotDistribution = [];
    const contestedWinners = new Set();
    const contestedCents = {};

    // Odd cents go to the winner closest to the dealer's left
    const n = game.players.length;
    const seatOrder = id => (game.players.findIndex(p => p.id === id) - game.dealerButton - 1 + n) % n;

    for (const pot of pots) {
      const eligible = hands.filter(h => pot.eligiblePlayers.has(h.id));
      if (eligible.length === 0) continue;
      eligible.sort((a, b) => compareHands(b.hand, a.hand));
      const potWinners = eligible
        .filter(h => compareHands(h.hand, eligible[0].hand) === 0)
        .sort((a, b) => seatOrder(a.id) - seatOrder(b.id));
      const share = Math.floor(pot.amount / potWinners.length);
      let oddCents = pot.amount - share * potWinners.length;
      potWinners.forEach(w => {
        winningsCents[w.id] += share + (oddCents > 0 ? 1 : 0);
        if (oddCents > 0) oddCents--;
      });
      sidePotDistribution.push({
        potAmount: toDollars(pot.amount),
        winners: potWinners.map(w => w.name),
        // Only one player could win it: it's their own uncalled bet coming back
        uncalled: eligible.length === 1
      });
      if (eligible.length > 1) {
        const odd = pot.amount - share * potWinners.length;
        potWinners.forEach((w, i) => {
          contestedWinners.add(w.id);
          // Same split as above: the first winners in seat order take the odd cents
          contestedCents[w.id] = (contestedCents[w.id] || 0) + share + (i < odd ? 1 : 0);
        });
      }
    }

    const winnings = {};
    for (const id of Object.keys(winningsCents)) {
      winnings[id] = toDollars(winningsCents[id]);
      const player = game.players.find(p => p.id === id);
      if (player) player.stack = add(player.stack, winnings[id]);
    }

    // A player who only got their own uncalled chips back didn't win the hand
    const overallWinners = hands.filter(h => contestedWinners.has(h.id));
    result = {
      winners: overallWinners.map(w => w.id),
      winnerNames: overallWinners.map(w => w.name),
      pot: game.pot,
      method: 'showdown',
      allHands: hands.map(h => ({ name: h.name, hand: h.hand.description })),
      // Hole cards of everyone in the showdown, revealed to the table
      shownHands: hands.map(h => ({
        id: h.id,
        name: h.name,
        cards: game.playerHands[h.id],
        description: h.hand.description
      })),
      sidePotDistribution,
      winnings,
      // One line per winner: who, what they won from contested pots (not their
      // own uncalled bet coming back) and their hand in plain words
      winnerSummary: overallWinners.map(w => ({
        name: w.name,
        amount: toDollars(contestedCents[w.id]),
        hand: w.hand.plainName
      }))
    };
  }

  logResult(game, result);
  game.handInProgress = false;
  game.lastResult = result;
  return result;
}

/* ===============================
   HAND HISTORY (game.handLog: one line per event, written out by the server)
================================ */
const money = (x) => `$${Number(x || 0).toFixed(2)}`;
const cardList = (cards) => `[${(cards || []).map(c => `${c.rank}${c.suit}`).join(' ')}]`;

function logHand(game, line) {
  if (!game.handLog) game.handLog = [];
  game.handLog.push(line);
}

function logResult(game, result) {
  if (result.method === 'fold') {
    logHand(game, '--- Result ---');
    logHand(game, `${result.winnerNames[0]} wins ${money(result.pot)} (everyone else folded)`);
  } else {
    logHand(game, `--- Showdown  Board ${cardList(game.communityCards)} ---`);
    result.shownHands.forEach(h => logHand(game, `${h.name} ${cardList(h.cards)}: ${h.description}`));
    logHand(game, '--- Result ---');
    const contested = result.sidePotDistribution.filter(sp => !sp.uncalled);
    contested.forEach((sp, i) => {
      const label = contested.length === 1 ? 'Pot' : (i === 0 ? 'Main pot' : `Side pot ${i}`);
      logHand(game, `${label} ${money(sp.potAmount)}: ${sp.winners.join(' and ')}${sp.winners.length > 1 ? ' split' : ''}`);
    });
    result.sidePotDistribution.filter(sp => sp.uncalled).forEach(sp => {
      logHand(game, `Uncalled ${money(sp.potAmount)} returned to ${sp.winners.join(', ')}`);
    });
    result.winnerSummary.forEach(w => logHand(game, `${w.name} wins ${money(w.amount)} with ${w.hand}`));
  }
  logHand(game, `Ending stacks: ${game.players.map(p => `${p.name} ${money(p.stack)}`).join(', ')}`);
}

/* ===============================
   HAND EVALUATION
================================ */
const WORD_NAMES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const PLURAL_NAMES = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
const RANK_NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

/**
 * Evaluate best 5-card hand from up to 7 cards (2 hole + 5 community).
 * Returns { rank, tieBreaker: [numbers], description }.
 */
function evaluateHand(holeCards, communityCards) {
  const allCards = [...(holeCards || []), ...(communityCards || [])];
  if (allCards.length < 5) {
    return { rank: 0, tieBreaker: [], description: 'Incomplete' };
  }
  const combinations = generate5CardCombinations(allCards);
  return combinations
    .map(combo => evalPokerHand(combo))
    .reduce((best, current) => (compareHands(current, best) > 0 ? current : best));
}

function generate5CardCombinations(cards) {
  const combinations = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++)
            combinations.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
  return combinations;
}

/**
 * Evaluate a single 5-card hand. tieBreaker lists the card ranks that decide
 * ties, most important first (pairs/trips before kickers).
 */
function evalPokerHand(cards) {
  const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);

  // Group ranks by count, biggest group first, then by rank
  const counts = {};
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const groups = Object.keys(counts).map(Number)
    .sort((a, b) => counts[b] - counts[a] || b - a);
  const shape = groups.map(g => counts[g]);
  const desc = describeCards(cards);
  const W = v => WORD_NAMES[v];
  const P = v => PLURAL_NAMES[v];

  if (isFlush && straightHigh) {
    const royal = straightHigh === 14;
    return {
      rank: royal ? HAND_RANKINGS.ROYAL_FLUSH : HAND_RANKINGS.STRAIGHT_FLUSH,
      tieBreaker: [straightHigh],
      description: `${royal ? 'Royal Flush' : 'Straight Flush'} (${desc})`,
      plainName: royal ? 'Royal flush' : `${W(straightHigh)} high straight flush`
    };
  }
  if (shape[0] === 4) {
    return { rank: HAND_RANKINGS.FOUR_OF_A_KIND, tieBreaker: groups, description: `Four of a Kind (${desc})`, plainName: `Four ${P(groups[0])}` };
  }
  if (shape[0] === 3 && shape[1] === 2) {
    return { rank: HAND_RANKINGS.FULL_HOUSE, tieBreaker: groups, description: `Full House (${desc})`, plainName: `${P(groups[0])} full of ${P(groups[1])}` };
  }
  if (isFlush) {
    return { rank: HAND_RANKINGS.FLUSH, tieBreaker: values, description: `Flush (${desc})`, plainName: `${W(values[0])} high flush` };
  }
  if (straightHigh) {
    return { rank: HAND_RANKINGS.STRAIGHT, tieBreaker: [straightHigh], description: `Straight (${desc})`, plainName: `${W(straightHigh)} high straight` };
  }
  if (shape[0] === 3) {
    return { rank: HAND_RANKINGS.THREE_OF_A_KIND, tieBreaker: groups, description: `Three of a Kind (${desc})`, plainName: `Three ${P(groups[0])}` };
  }
  if (shape[0] === 2 && shape[1] === 2) {
    return { rank: HAND_RANKINGS.TWO_PAIR, tieBreaker: groups, description: `Two Pair (${desc})`, plainName: `Two pair, ${P(groups[0])} and ${P(groups[1])}` };
  }
  if (shape[0] === 2) {
    return { rank: HAND_RANKINGS.PAIR, tieBreaker: groups, description: `Pair of ${RANK_NAMES[groups[0]]}s (${desc})`, plainName: `Pair of ${P(groups[0])}` };
  }
  return { rank: HAND_RANKINGS.HIGH_CARD, tieBreaker: values, description: `High Card (${desc})`, plainName: `${W(values[0])} high` };
}

/**
 * Compare two evaluated hands.
 * Returns > 0 if hand1 is better, < 0 if hand2 is better, 0 if equal.
 */
function compareHands(hand1, hand2) {
  if (hand1.rank !== hand2.rank) return hand1.rank - hand2.rank;
  const a = hand1.tieBreaker || [];
  const b = hand2.tieBreaker || [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

/** High card of a straight (5 for A-2-3-4-5), or 0 if not a straight. */
function getStraightHigh(valuesDesc) {
  const unique = [...new Set(valuesDesc)];
  if (unique.length !== 5) return 0;
  if (unique[0] - unique[4] === 4) return unique[0];
  if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) return 5; // wheel
  return 0;
}

function getRankValue(rank) {
  const rankMap = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank] || 0;
}

function describeCards(cards) {
  return cards.map(c => `${c.rank}${c.suit}`).join(' ');
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return shuffle(deck);
}

/** Fisher-Yates shuffle */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/* ===============================
   BLIND CHANGES (vote, applied next hand)
================================ */
function requestBlindChange(game, requesterId, newSmallBlind, newBigBlind) {
  const sb = roundMoney(newSmallBlind);
  const bb = roundMoney(newBigBlind);
  if (sb <= 0 || bb <= 0 || bb <= sb) {
    return { error: 'Invalid blind values' };
  }
  game.blindChangeRequest = {
    requester: requesterId,
    smallBlind: sb,
    bigBlind: bb,
    votes: new Set([requesterId])
  };
  return { pending: true, votesReceived: 1, votesNeeded: requiredBlindVotes(game) };
}

function requiredBlindVotes(game) {
  return Math.ceil(game.players.length * 2 / 3);
}

function voteOnBlindChange(game, voterId, approve) {
  if (!game.blindChangeRequest) {
    return { error: 'No blind change pending' };
  }
  if (!approve) {
    game.blindChangeRequest = null;
    return { rejected: true };
  }

  game.blindChangeRequest.votes.add(voterId);
  const votesNeeded = requiredBlindVotes(game);
  const votesReceived = game.blindChangeRequest.votes.size;
  if (votesReceived >= votesNeeded) {
    const newBlinds = {
      smallBlind: game.blindChangeRequest.smallBlind,
      bigBlind: game.blindChangeRequest.bigBlind
    };
    game.blindChangeRequest = null;
    if (game.handInProgress) {
      game.pendingBlinds = newBlinds; // takes effect when the next hand starts
    } else {
      game.smallBlind = newBlinds.smallBlind;
      game.bigBlind = newBlinds.bigBlind;
    }
    return { approved: true, newBlinds };
  }
  return { pending: true, votesReceived, votesNeeded };
}

module.exports = {
  createGame,
  startNewHand,
  handlePlayerAction,
  determineWinner,
  evaluateHand,
  compareHands,
  removePlayer,
  getMinRaiseTo,
  requestBlindChange,
  voteOnBlindChange,
  autoAdvanceOneStreet,
  HAND_RANKINGS
};
