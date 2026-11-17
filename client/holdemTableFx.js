// ========================================
// TEXAS HOLD 'EM TABLE EFFECTS
// Dealer button, bet chip stacks, and chips sliding to the pot / winner.
// Everything is drawn with CSS (no image files).
// ========================================
//
// app.js calls:
//   tableFxUpdate(state)      on every game state (bets, pot, dealer)
//   tableFxHandComplete(res)  when a hand is won (pot slides to the winner)
//   tableFxNewHand()          when a new hand starts (winner's chips disappear)

const TABLE_FX = {
  layer: null,
  betStacks: {},     // playerId -> element in front of the player
  potPile: null,     // chips in the middle
  winnerPiles: [],   // piles that slid to winners (removed next hand)
  puck: null,        // dealer button
  dealerId: null,
  prevState: null,
  collectedPot: 0,   // amount already swept into the middle
  collecting: false
};
const SLIDE_MS = 600;

/* ---------- chip drawing ---------- */
// Denominations (dollars) and their chip colours
const CHIP_DENOMS = [
  { value: 1000, color: '#f9a825', edge: '#222' },   // Sit 'N Go sizes
  { value: 500, color: '#6a1b9a', edge: '#ffd700' },
  { value: 100, color: '#222', edge: '#ffd700' },
  { value: 25, color: '#1b8a3a', edge: '#fff' },
  { value: 5, color: '#c62828', edge: '#fff' },
  { value: 1, color: '#1e5bc6', edge: '#fff' },
  { value: 0.25, color: '#7b1fa2', edge: '#fff' },
  { value: 0.05, color: '#eeeeee', edge: '#c62828' },
  { value: 0.01, color: '#ff9800', edge: '#fff' }
];
const MAX_CHIPS_PER_COLUMN = 7;
const CHIP_W = 32;    // chip size in px
const CHIP_H = 21;
const CHIP_STEP = 5;  // px between stacked chips

/** Break an amount into chips, biggest first (capped so stacks stay small). */
function chipsFor(amount) {
  let cents = Math.round(amount * 100);
  const chips = [];
  for (const d of CHIP_DENOMS) {
    const dc = Math.round(d.value * 100);
    while (cents >= dc && chips.length < MAX_CHIPS_PER_COLUMN * 3) {
      chips.push(d);
      cents -= dc;
    }
  }
  return chips;
}

/** Build a chip pile element: up to 3 short columns, plus the dollar amount. */
function buildChipPile(amount) {
  const el = document.createElement('div');
  el.className = 'fx-chip-pile';
  const columns = document.createElement('div');
  columns.className = 'fx-chip-columns';
  const chips = chipsFor(amount);
  for (let c = 0; c < 3; c++) {
    const colChips = chips.slice(c * MAX_CHIPS_PER_COLUMN, (c + 1) * MAX_CHIPS_PER_COLUMN);
    if (colChips.length === 0) break;
    const col = document.createElement('div');
    col.className = 'fx-chip-column';
    colChips.reverse().forEach((d, i) => {
      const chip = document.createElement('div');
      chip.className = 'fx-chip';
      chip.style.background = d.color;
      chip.style.borderColor = d.edge;
      chip.style.bottom = `${i * CHIP_STEP}px`;
      col.appendChild(chip);
    });
    col.style.height = `${CHIP_H + (colChips.length - 1) * CHIP_STEP}px`;
    columns.appendChild(col);
  }
  const label = document.createElement('div');
  label.className = 'fx-chip-label';
  label.textContent = fmtChips(amount);
  el.appendChild(columns);
  el.appendChild(label);
  return el;
}

/* ---------- sounds (synthesized with Web Audio, no files) ---------- */
const CHIP_SOUND_VOLUME = 0.35;
let chipAudioCtx = null;

function getChipAudio() {
  try {
    if (!chipAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      chipAudioCtx = new AudioCtx();
    }
    if (chipAudioCtx.state === 'suspended') chipAudioCtx.resume();
    return chipAudioCtx;
  } catch (e) {
    return null;
  }
}

/** A short burst of white noise, the raw material for chip sounds. */
function noiseBuffer(ctx, seconds) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** One clay chip tapping another: a bright click plus a short ceramic ring. */
function chipClick(ctx, out, when, loudness = 1) {
  // Click
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.03);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200 + Math.random() * 1600;
  band.Q.value = 2.5;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.0001, when);
  clickGain.gain.exponentialRampToValueAtTime(0.9 * loudness, when + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
  noise.connect(band).connect(clickGain).connect(out);
  noise.start(when);
  noise.stop(when + 0.035);

  // Ring
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = 2300 + Math.random() * 600;
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, when);
  toneGain.gain.exponentialRampToValueAtTime(0.18 * loudness, when + 0.002);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  tone.connect(toneGain).connect(out);
  tone.start(when);
  tone.stop(when + 0.06);
}

/** Chips being stacked: a few quick clacks (more chips, more clacks). */
function renderChipStack(ctx, out, startTime, chipCount = 3) {
  const clicks = Math.max(2, Math.min(5, chipCount));
  let t = startTime;
  for (let i = 0; i < clicks; i++) {
    chipClick(ctx, out, t, 1 - i * 0.12);
    t += 0.04 + Math.random() * 0.03;
  }
}

/** Chips sliding across felt: a soft swish with a little rattle. */
function renderChipSlide(ctx, out, startTime, seconds = SLIDE_MS / 1000) {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, seconds + 0.1);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(900, startTime);
  low.frequency.linearRampToValueAtTime(2200, startTime + seconds * 0.6);
  low.frequency.linearRampToValueAtTime(1200, startTime + seconds);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.5, startTime + 0.06);
  gain.gain.setValueAtTime(0.5, startTime + seconds * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + seconds);
  noise.connect(low).connect(band).connect(gain).connect(out);
  noise.start(startTime);
  noise.stop(startTime + seconds + 0.1);

  // A few chips knocking together as they move, and a settle at the end
  for (let i = 0; i < 3; i++) {
    chipClick(ctx, out, startTime + 0.08 + Math.random() * seconds * 0.6, 0.35);
  }
  chipClick(ctx, out, startTime + seconds - 0.02, 0.6);
  chipClick(ctx, out, startTime + seconds + 0.03, 0.45);
}

/** Play a chip sound now. kind: 'stack' | 'slide' */
function playChipSound(kind, amountOrSeconds) {
  const ctx = getChipAudio();
  if (!ctx) return;
  try {
    const out = ctx.createGain();
    out.gain.value = CHIP_SOUND_VOLUME;
    out.connect(ctx.destination);
    const now = ctx.currentTime + 0.01;
    if (kind === 'stack') renderChipStack(ctx, out, now, amountOrSeconds);
    else renderChipSlide(ctx, out, now);
    TABLE_FX.soundsPlayed = (TABLE_FX.soundsPlayed || 0) + 1;
  } catch (e) {
    // Sound is a nice-to-have; never let it break the game
  }
}

/* ---------- positions (screen coordinates) ---------- */
function seatEl(playerId) {
  return document.querySelector(`.player-seat[data-player-id="${playerId}"]`);
}

/** Where a player's bet sits: just inside their window, toward the table. */
function betAnchor(playerId) {
  const seat = seatEl(playerId);
  if (!seat) return null;
  const r = seat.getBoundingClientRect();
  if (seat.dataset.self === 'true') {
    // My bets sit to the right of my hole cards
    const hole = document.getElementById('playerHoleCardsList');
    const h = hole && hole.offsetWidth ? hole.getBoundingClientRect() : r;
    return { x: h.right + 60, y: h.top + h.height * 0.55 };
  }
  const onLeft = r.left + r.width / 2 < window.innerWidth / 2;
  return { x: onLeft ? r.right + 50 : r.left - 50, y: r.top + r.height * 0.4 };
}

/** Where the dealer button sits for a player. */
function puckAnchor(playerId) {
  const seat = seatEl(playerId);
  if (!seat) return null;
  const r = seat.getBoundingClientRect();
  if (seat.dataset.self === 'true') return { x: r.left - 26, y: r.top + r.height / 2 };
  const onLeft = r.left + r.width / 2 < window.innerWidth / 2;
  return { x: onLeft ? r.right + 24 : r.left - 24, y: r.bottom - 18 };
}

/** The middle of the table, beside the pot amount. */
function potAnchor() {
  const pot = document.getElementById('potDisplay');
  if (!pot) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = pot.getBoundingClientRect();
  return { x: r.left - 60, y: r.top + r.height * 0.6 };
}

function placeAt(el, point) {
  if (!el || !point) return;
  el.style.left = `${point.x}px`;
  el.style.top = `${point.y}px`;
}

/* ---------- setup ---------- */
function ensureTableFxLayer() {
  if (TABLE_FX.layer && document.body.contains(TABLE_FX.layer)) return TABLE_FX.layer;
  const layer = document.createElement('div');
  layer.id = 'tableFxLayer';
  document.body.appendChild(layer);
  TABLE_FX.layer = layer;
  addTableFxStyles();
  window.addEventListener('resize', repositionTableFx);
  return layer;
}

/** Keep everything in place when the window or seats move. */
function repositionTableFx() {
  for (const [id, el] of Object.entries(TABLE_FX.betStacks)) placeAt(el, betAnchor(id));
  if (TABLE_FX.potPile) placeAt(TABLE_FX.potPile, potAnchor());
  TABLE_FX.winnerPiles.forEach(p => placeAt(p.el, betAnchor(p.playerId)));
  if (TABLE_FX.puck && TABLE_FX.dealerId) placeAt(TABLE_FX.puck, puckAnchor(TABLE_FX.dealerId));
}

/* ---------- dealer button ---------- */
function moveDealerButton(dealerId) {
  if (!dealerId) return;
  const layer = ensureTableFxLayer();
  if (!TABLE_FX.puck) {
    TABLE_FX.puck = document.createElement('div');
    TABLE_FX.puck.className = 'fx-dealer-button';
    TABLE_FX.puck.textContent = 'D';
    layer.appendChild(TABLE_FX.puck);
    placeAt(TABLE_FX.puck, puckAnchor(dealerId)); // first time: appear in place
  }
  TABLE_FX.dealerId = dealerId;
  // Next frame so the move animates
  requestAnimationFrame(() => placeAt(TABLE_FX.puck, puckAnchor(dealerId)));
}

/* ---------- pot pile ---------- */
function setPotPile(amount) {
  const layer = ensureTableFxLayer();
  if (TABLE_FX.potPile) { TABLE_FX.potPile.remove(); TABLE_FX.potPile = null; }
  if (amount <= 0) return;
  TABLE_FX.potPile = buildChipPile(amount);
  TABLE_FX.potPile.classList.add('fx-pot-pile');
  layer.appendChild(TABLE_FX.potPile);
  placeAt(TABLE_FX.potPile, potAnchor());
}

/** Slide every bet stack into the middle, then grow the pot pile. */
function collectBetsToPot(newPotTotal) {
  const stacks = Object.values(TABLE_FX.betStacks);
  TABLE_FX.betStacks = {};
  if (stacks.length === 0) {
    TABLE_FX.collectedPot = newPotTotal;
    setPotPile(newPotTotal);
    return;
  }
  TABLE_FX.collecting = true;
  // The round usually ends on a call: clack its chips down, then sweep
  playChipSound('stack', 3);
  setTimeout(() => playChipSound('slide'), 150);
  const target = potAnchor();
  stacks.forEach(el => {
    el.classList.add('fx-sliding', 'fx-collecting');
    placeAt(el, target);
  });
  setTimeout(() => {
    stacks.forEach(el => el.remove());
    TABLE_FX.collecting = false;
    TABLE_FX.collectedPot = newPotTotal;
    setPotPile(newPotTotal);
  }, SLIDE_MS);
}

/* ---------- public hooks ---------- */

/**
 * Called with every game state:
 * { state, pot, players: [{ id, currentBet }], dealerId }
 */
function tableFxUpdate(gs) {
  if (!gs || !Array.isArray(gs.players)) return;
  ensureTableFxLayer();
  moveDealerButton(gs.dealerId);

  const prev = TABLE_FX.prevState;
  const betsNow = gs.players.reduce((sum, p) => sum + (p.currentBet || 0), 0);
  const streetChanged = prev && prev.state !== gs.state;
  const hadStacks = Object.keys(TABLE_FX.betStacks).length > 0;

  // Betting round over (new street, showdown, or bets reset): sweep to the middle
  if (hadStacks && (streetChanged || betsNow === 0)) {
    collectBetsToPot(Math.round((gs.pot - betsNow) * 100) / 100);
  }

  // Show / update each player's bet in front of them
  let newChips = 0; // chips added this update (for the stacking sound)
  for (const p of gs.players) {
    const amount = p.currentBet || 0;
    const existing = TABLE_FX.betStacks[p.id];
    if (amount > 0) {
      const before = existing ? Number(existing.dataset.amount) || 0 : 0;
      if (amount > before) newChips += chipsFor(amount - before).length;
      const pile = buildChipPile(amount);
      pile.dataset.amount = String(amount);
      pile.classList.add('fx-bet-stack');
      placeAt(pile, betAnchor(p.id));
      if (existing) existing.remove();
      TABLE_FX.layer.appendChild(pile);
      TABLE_FX.betStacks[p.id] = pile;
    } else if (existing && !streetChanged) {
      existing.remove();
      delete TABLE_FX.betStacks[p.id];
    }
  }

  // One stacking sound per update, even when both blinds go in together
  if (newChips > 0) playChipSound('stack', newChips);

  // Middle pile = chips already collected from earlier rounds
  if (!TABLE_FX.collecting && !hadStacks) {
    const collected = Math.round((gs.pot - betsNow) * 100) / 100;
    if (collected !== TABLE_FX.collectedPot) {
      TABLE_FX.collectedPot = collected;
      setPotPile(collected);
    }
  }

  TABLE_FX.prevState = { state: gs.state };
}

/**
 * Hand over: slide the pot to the winner(s). winnings: { playerId: dollars }
 */
function tableFxHandComplete({ winnings }) {
  ensureTableFxLayer();
  // Wait for the last bets to reach the middle first
  const delay = TABLE_FX.collecting ? SLIDE_MS + 100 : 50;
  setTimeout(() => {
    if (TABLE_FX.potPile) { TABLE_FX.potPile.remove(); TABLE_FX.potPile = null; }
    TABLE_FX.collectedPot = 0;
    const start = potAnchor();
    if (Object.values(winnings || {}).some(a => a > 0)) playChipSound('slide');
    for (const [playerId, amount] of Object.entries(winnings || {})) {
      if (!(amount > 0) || !seatEl(playerId)) continue;
      const pile = buildChipPile(amount);
      pile.classList.add('fx-winner-pile');
      placeAt(pile, start);
      TABLE_FX.layer.appendChild(pile);
      TABLE_FX.winnerPiles.push({ el: pile, playerId });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        pile.classList.add('fx-sliding');
        placeAt(pile, betAnchor(playerId));
      }));
    }
  }, delay);
}

/** New hand: clear the winner's chips and any leftovers. */
function tableFxNewHand() {
  ensureTableFxLayer();
  TABLE_FX.winnerPiles.forEach(p => p.el.remove());
  TABLE_FX.winnerPiles = [];
  Object.values(TABLE_FX.betStacks).forEach(el => el.remove());
  TABLE_FX.betStacks = {};
  if (TABLE_FX.potPile) { TABLE_FX.potPile.remove(); TABLE_FX.potPile = null; }
  TABLE_FX.collectedPot = 0;
  TABLE_FX.collecting = false;
  TABLE_FX.prevState = null;
}

/* ---------- styles ---------- */
function addTableFxStyles() {
  if (document.getElementById('tableFxStyles')) return;
  const style = document.createElement('style');
  style.id = 'tableFxStyles';
  style.textContent = `
    #tableFxLayer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1500;
    }

    /* Dealer button */
    .fx-dealer-button {
      position: fixed;
      width: 36px;
      height: 36px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff, #dcdcdc 70%, #b5b5b5);
      border: 2px solid #8a8a8a;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.6);
      color: #111;
      font: bold 19px/32px Georgia, serif;
      text-align: center;
      transition: left 0.8s ease, top 0.8s ease;
    }

    /* Chip piles */
    .fx-chip-pile {
      position: fixed;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .fx-chip-pile.fx-sliding {
      transition: left ${SLIDE_MS}ms ease-in-out, top ${SLIDE_MS}ms ease-in-out;
    }
    .fx-chip-columns {
      display: flex;
      align-items: flex-end;
      gap: 2px;
    }
    .fx-chip-column {
      position: relative;
      width: ${CHIP_W}px;
    }
    .fx-chip {
      position: absolute;
      left: 0;
      width: ${CHIP_W}px;
      height: ${CHIP_H}px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 4px dashed #fff;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.55), inset 0 0 0 2px rgba(0, 0, 0, 0.15);
    }
    .fx-chip-label {
      font: bold 13px Arial, sans-serif;
      color: #fff;
      background: rgba(0, 0, 0, 0.65);
      padding: 1px 6px;
      border-radius: 8px;
      white-space: nowrap;
    }
    /* Amounts disappear as bets are swept into the pot */
    .fx-collecting .fx-chip-label {
      opacity: 0;
      transition: opacity 0.2s;
    }
    .fx-pot-pile .fx-chip-label {
      display: none; /* the pot total is shown beside it already */
    }
  `;
  document.head.appendChild(style);
}
