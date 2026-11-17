/**
 * Sit 'N Go tournament rules for Texas Hold 'Em.
 *
 * Everyone starts with the same chips, blinds go up on a clock, and players
 * are knocked out until one is left. Built for games of about 20-30 minutes.
 */

const STARTING_STACK = 1500;
const MAX_PLAYERS = 9;
// Minutes per blind level (SNG_LEVEL_MS can shorten it for testing)
const LEVEL_MS = Number(process.env.SNG_LEVEL_MS) || 4 * 60 * 1000;

// [small blind, big blind] per level; after the last one blinds keep doubling
const BLIND_LEVELS = [
  [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
  [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000],
  [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000], [6000, 12000]
];

/** Blinds for a level (0 = first level). */
function blindsForLevel(level) {
  if (level < BLIND_LEVELS.length) {
    const [smallBlind, bigBlind] = BLIND_LEVELS[level];
    return { smallBlind, bigBlind };
  }
  const [sb, bb] = BLIND_LEVELS[BLIND_LEVELS.length - 1];
  const factor = 2 ** (level - BLIND_LEVELS.length + 1);
  return { smallBlind: sb * factor, bigBlind: bb * factor };
}

/** Which level the clock is on after `elapsedMs`. */
function levelAt(elapsedMs, levelMs = LEVEL_MS) {
  return Math.max(0, Math.floor(elapsedMs / levelMs));
}

/** Share of the prize pool for each place, in percent. */
function payoutPercents(entrants) {
  if (entrants <= 4) return [100];
  if (entrants <= 6) return [65, 35];
  return [50, 30, 20];
}

/**
 * Dollar prize for each place (index 0 = 1st). Whole cents; any leftover
 * cent goes to 1st place.
 */
function prizes(buyIn, entrants) {
  const poolCents = Math.round((buyIn || 0) * 100) * entrants;
  const percents = payoutPercents(entrants);
  const cents = percents.map(p => Math.floor(poolCents * p / 100));
  cents[0] += poolCents - cents.reduce((a, b) => a + b, 0);
  return cents.map(c => c / 100);
}

/**
 * Finishing places for players knocked out in the same hand.
 * `busted`: [{ id, startingStack }] (stack at the start of that hand).
 * `playersStillIn`: how many players are left after this hand.
 * Whoever started the hand with more chips finishes higher.
 */
function placeEliminated(busted, playersStillIn) {
  return busted
    .slice()
    .sort((a, b) => b.startingStack - a.startingStack)
    .map((p, i) => ({ id: p.id, place: playersStillIn + 1 + i }));
}

/**
 * Prize for each knocked-out player. Players who started the hand with the
 * same chips tie: they share the prizes of the places they took, evenly.
 * `placed`: [{ id, place, startingStack }]. Returns { id: dollars }.
 */
function knockoutPrizes(placed, prizeList) {
  const result = {};
  const groups = {};
  for (const p of placed) (groups[p.startingStack] = groups[p.startingStack] || []).push(p);
  for (const group of Object.values(groups)) {
    const poolCents = group.reduce((sum, p) => sum + Math.round((prizeList[p.place - 1] || 0) * 100), 0);
    const share = Math.floor(poolCents / group.length);
    group
      .sort((a, b) => a.place - b.place)
      .forEach((p, i) => { result[p.id] = (share + (i < poolCents - share * group.length ? 1 : 0)) / 100; });
  }
  return result;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th" ... */
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/** A fresh tournament, waiting for players to register and ready up. */
function createTournament(buyIn = null) {
  return {
    status: 'registering',   // 'registering' | 'running' | 'finished'
    buyIn,                   // dollars per player (0 = just for fun, null = not set yet)
    buyInSetterId: null,     // who was asked to set the buy-in
    entrants: {},            // id -> { name, place } (place null while still in)
    startedAt: null,
    appliedLevel: 0,         // level whose blinds are in play
    levelTimer: null
  };
}

module.exports = {
  STARTING_STACK,
  MAX_PLAYERS,
  LEVEL_MS,
  BLIND_LEVELS,
  blindsForLevel,
  levelAt,
  payoutPercents,
  prizes,
  placeEliminated,
  knockoutPrizes,
  ordinal,
  createTournament
};
