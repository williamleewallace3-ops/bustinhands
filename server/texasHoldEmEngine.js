const { rankValue, SUIT_RANK } = require('./utils');

// ========================================
// TEXAS HOLD 'EM POKER ENGINE
// ========================================

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

/**
 * Create a new Texas Hold 'Em game
 */
function createGame(roomId, smallBlind = 0.05, bigBlind = 0.10) {
  return {
    roomId,
    players: [],           // Active players at table
    waiting: [],          // Waiting room queue
    
    // Game state
    state: 'waiting',     // 'waiting', 'blinds', 'preflop', 'flop', 'turn', 'river', 'showdown', 'gameOver'
    smallBlind,
    bigBlind,
    pot: 0,
    sidePots: [],         // Array of { amount, eligiblePlayers: Set(socketIds) }
    
    // Board cards
    communityCards: [],   // 5 cards total by river
    
    // Turn/betting
    currentBettor: null,  // socket ID of player whose turn it is
    bettingRound: 0,      // Number of complete betting rounds
    minBet: 0,            // Minimum bet amount
    highestBet: bigBlind, // Highest bet in current round
    
    // Dealer/Blind positions
    dealerButton: 0,      // Index in players array
    smallBlindPos: 0,
    bigBlindPos: 0,
    
    // Active players (haven't folded)
    activePlayers: [],    // socket IDs
    
    // Betting round tracking
    playersActedThisRound: new Set(),  // socket IDs of players who have acted in current round
    
    // Hand history
    deck: [],
    playerHands: {},      // socket ID -> [2 cards]
    foldedPlayers: new Set(),
    allInPlayers: new Set(),
    
    // Side pot tracking
    playerContributions: {}, // socket ID -> total amount contributed to pot
    allInAmounts: [],        // [{ playerId, amount }] sorted by amount
    
    // Blind change request
    blindChangeRequest: null, // { requester, smallBlind, bigBlind, votes: Set }
  };
}

/**
 * Initialize a new hand
 */
function startNewHand(game) {
  // Reset hand state
  game.state = 'blinds';
  game.communityCards = [];
  game.pot = 0;
  game.sidePots = [];
  game.bettingRound = 0;
  game.highestBet = game.bigBlind;
  game.minBet = game.bigBlind;
  game.playerHands = {};
  game.foldedPlayers = new Set();
  game.allInPlayers = new Set();
  game.activePlayers = game.players.map(p => p.id);
  game.playersActedThisRound = new Set();
  game.playerContributions = {};
  game.allInAmounts = [];
  
  // Initialize contributions tracking
  game.players.forEach(p => {
    game.playerContributions[p.id] = 0;
  });
  
  // Move dealer button
  if (game.players.length > 0) {
    game.dealerButton = (game.dealerButton + 1) % game.players.length;
    game.smallBlindPos = (game.dealerButton + 1) % game.players.length;
    game.bigBlindPos = (game.dealerButton + 2) % game.players.length;
  }
  
  // Build and shuffle deck
  game.deck = buildDeck();
  
  // Deal 2 cards to each player
  for (let i = 0; i < game.players.length; i++) {
    game.playerHands[game.players[i].id] = [game.deck.pop(), game.deck.pop()];
  }
  
  // Collect blinds
  collectBlinds(game);
}

/**
 * Collect small and big blinds
 */
function collectBlinds(game) {
  if (game.players.length < 2) return;
  
  const smallBlindPlayer = game.players[game.smallBlindPos];
  const bigBlindPlayer = game.players[game.bigBlindPos];
  
  console.log(`💳 Dealer pos: ${game.dealerButton}, SB pos: ${game.smallBlindPos} (${smallBlindPlayer.name}), BB pos: ${game.bigBlindPos} (${bigBlindPlayer.name})`);
  console.log(`📊 Players: ${game.players.map((p, i) => `${i}:${p.name}`).join(', ')}`);
  
  // Small blind
  if (smallBlindPlayer.stack >= game.smallBlind) {
    smallBlindPlayer.stack -= game.smallBlind;
    smallBlindPlayer.currentBet = game.smallBlind;
    game.playerContributions[smallBlindPlayer.id] += game.smallBlind;
    game.pot += game.smallBlind;
  } else {
    // All-in on small blind
    const amount = smallBlindPlayer.stack;
    game.pot += amount;
    game.playerContributions[smallBlindPlayer.id] += amount;
    smallBlindPlayer.currentBet = amount;
    smallBlindPlayer.stack = 0;
    game.allInPlayers.add(smallBlindPlayer.id);
    recordAllIn(game, smallBlindPlayer.id, amount);
  }
  
  // Big blind
  if (bigBlindPlayer.stack >= game.bigBlind) {
    bigBlindPlayer.stack -= game.bigBlind;
    bigBlindPlayer.currentBet = game.bigBlind;
    game.playerContributions[bigBlindPlayer.id] += game.bigBlind;
    game.pot += game.bigBlind;
  } else {
    // All-in on big blind
    const amount = bigBlindPlayer.stack;
    game.pot += amount;
    game.playerContributions[bigBlindPlayer.id] += amount;
    bigBlindPlayer.currentBet = amount;
    bigBlindPlayer.stack = 0;
    game.allInPlayers.add(bigBlindPlayer.id);
    recordAllIn(game, bigBlindPlayer.id, amount);
  }
  
  // Start betting with player after big blind
  game.state = 'preflop';
  game.currentBettor = game.players[(game.bigBlindPos + 1) % game.players.length].id;
  // DON'T pre-mark blinds as acted - they need to act when it comes to them
  console.log(`🎬 First to act: ${game.currentBettor}`);
}

/**
 * Handle player action (bet, call, raise, fold, check)
 */
function handlePlayerAction(game, playerId, action, amount = 0) {
  const player = game.players.find(p => p.id === playerId);
  if (!player || game.currentBettor !== playerId) {
    return { error: 'Not your turn' };
  }
  
  amount = Math.max(0, amount); // Ensure non-negative
  
  switch (action) {
    case 'fold':
      game.foldedPlayers.add(playerId);
      game.activePlayers = game.activePlayers.filter(id => id !== playerId);
      game.playersActedThisRound.add(playerId);
      break;
      
    case 'check':
      if (game.highestBet > (player.currentBet || 0)) {
        return { error: 'Cannot check - there is a bet to call' };
      }
      game.playersActedThisRound.add(playerId);
      break;
      
    case 'call':
      const amountToCall = game.highestBet - (player.currentBet || 0);
      if (player.stack < amountToCall) {
        // All-in on call - use all remaining stack
        const betAmount = player.stack;
        player.stack = 0;
        player.currentBet = (player.currentBet || 0) + betAmount;
        game.playerContributions[playerId] += betAmount;
        game.pot += betAmount;
        game.allInPlayers.add(playerId);
        recordAllIn(game, playerId, player.currentBet);
      } else {
        player.stack -= amountToCall;
        player.currentBet = game.highestBet;
        game.playerContributions[playerId] += amountToCall;
        game.pot += amountToCall;
      }
      game.playersActedThisRound.add(playerId);
      break;
      
    case 'raise':
      if (amount <= game.highestBet - (player.currentBet || 0)) {
        return { error: 'Raise must be greater than current bet' };
      }
      const actualRaise = Math.min(amount, player.stack + (player.currentBet || 0));
      const toRemove = actualRaise - (player.currentBet || 0);
      player.stack -= toRemove;
      player.currentBet = actualRaise;
      game.playerContributions[playerId] += toRemove;
      game.pot += toRemove;
      game.highestBet = actualRaise;
      
      if (player.stack === 0) {
        game.allInPlayers.add(playerId);
        recordAllIn(game, playerId, actualRaise);
      }
      game.playersActedThisRound.add(playerId);
      break;
      
    case 'bet':
      if (amount > player.stack) amount = player.stack;
      player.stack -= amount;
      player.currentBet = amount;
      game.playerContributions[playerId] += amount;
      game.pot += amount;
      game.highestBet = player.currentBet;
      
      if (player.stack === 0) {
        game.allInPlayers.add(playerId);
        recordAllIn(game, playerId, player.currentBet);
      }
      game.playersActedThisRound.add(playerId);
      break;
      
    default:
      return { error: 'Unknown action' };
  }
  
  // Move to next player
  advanceBetting(game);
  return { success: true };
}

/**
 * Record all-in amount for side pot calculation
 */
function recordAllIn(game, playerId, totalBetAmount) {
  // Find if player already has all-in recorded
  const existing = game.allInAmounts.find(a => a.playerId === playerId);
  if (existing) {
    existing.amount = Math.max(existing.amount, totalBetAmount);
  } else {
    game.allInAmounts.push({ playerId, amount: totalBetAmount });
  }
  // Keep sorted by amount
  game.allInAmounts.sort((a, b) => a.amount - b.amount);
}

/**
 * Build side pots after a betting round completes
 * Side pots are created based on all-in levels
 */
function buildSidePots(game) {
  if (game.allInAmounts.length === 0) {
    // No all-ins, simple case
    game.sidePots = [{
      amount: game.pot,
      eligiblePlayers: new Set(game.players.filter(p => !game.foldedPlayers.has(p.id)).map(p => p.id))
    }];
    return;
  }

  game.sidePots = [];
  let previousAmount = 0;
  const nonFoldedPlayers = new Set(game.players.filter(p => !game.foldedPlayers.has(p.id)).map(p => p.id));

  // Create a pot for each all-in level
  for (const allIn of game.allInAmounts) {
    const playerId = allIn.playerId;
    const currentAmount = allIn.amount;

    if (currentAmount > previousAmount) {
      // Calculate pot size at this level
      // Everyone who bet at least (currentAmount - previousAmount) more is eligible
      const potIncrease = (currentAmount - previousAmount) * game.players.length;
      
      // Determine who is eligible for this side pot
      const eligible = new Set();
      for (const p of game.players) {
        if (!game.foldedPlayers.has(p.id) && game.playerContributions[p.id] >= currentAmount) {
          eligible.add(p.id);
        }
      }

      if (eligible.size > 0 && potIncrease > 0) {
        game.sidePots.push({
          amount: potIncrease,
          eligiblePlayers: eligible
        });
      }
    }

    previousAmount = currentAmount;
  }

  // Create final side pot for contributions above the highest all-in
  if (previousAmount > 0) {
    const maxContribution = Math.max(...Object.values(game.playerContributions));
    if (maxContribution > previousAmount) {
      const potIncrease = (maxContribution - previousAmount) * game.players.length;
      const eligible = new Set();
      for (const p of game.players) {
        if (!game.foldedPlayers.has(p.id) && game.playerContributions[p.id] >= maxContribution) {
          eligible.add(p.id);
        }
      }
      if (eligible.size > 0 && potIncrease > 0) {
        game.sidePots.push({
          amount: potIncrease,
          eligiblePlayers: eligible
        });
      }
    }
  }

  // Ensure at least one pot exists with all remaining players
  if (game.sidePots.length === 0) {
    game.sidePots.push({
      amount: game.pot,
      eligiblePlayers: nonFoldedPlayers
    });
  }
}

/**
 * Advance to next player
 */
function advanceBetting(game) {
  // Find the index of the current bettor in the full players array
  const currentPlayerIdx = game.players.findIndex(p => p.id === game.currentBettor);
  
  if (currentPlayerIdx === -1) {
    // Current bettor not found, find first active player
    const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
    game.currentBettor = activePlayers[0]?.id || null;
    console.log(`⚠️  Current bettor not found, setting to first active: ${activePlayers[0]?.name}`);
    return;
  }
  
  // Find the next active player starting from the next position
  let nextIdx = (currentPlayerIdx + 1) % game.players.length;
  while (game.foldedPlayers.has(game.players[nextIdx].id) && game.players[nextIdx].id !== game.currentBettor) {
    nextIdx = (nextIdx + 1) % game.players.length;
  }
  
  game.currentBettor = game.players[nextIdx].id;
  
  // Check if betting round is complete
  const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
  const activePlayerIds = new Set(activePlayers.map(p => p.id));
  
  // All active players must have acted
  const allActed = activePlayers.every(p => game.playersActedThisRound.has(p.id));
  
  // All active players must have equal bets (or be all-in with $0 stack)
  const allEqual = activePlayers.every(p => 
    p.currentBet === activePlayers[0].currentBet || p.stack === 0
  );
  
  // Check if only 1 player can still act (all others are all-in or folded)
  // A player is all-in when their stack is $0
  const canActPlayers = activePlayers.filter(p => p.stack > 0);
  const onlyOneCanAct = canActPlayers.length === 1;
  
  console.log(`✅ Next to act: ${game.players[nextIdx].name}`);
  console.log(`   allActed=${allActed}, allEqual=${allEqual}, activeCount=${activePlayers.length}, canAct=${canActPlayers.length}`);
  console.log(`   playersActed: ${Array.from(game.playersActedThisRound).map(id => {
    const p = game.players.find(x => x.id === id);
    return p?.name || id;
  }).join(', ')}`);
  console.log(`   player stacks: ${activePlayers.map(p => `${p.name}(${p.stack})`).join(', ')}`);
  
  // Check if only 1 player left - hand ends immediately
  if (activePlayers.length === 1) {
    console.log(`🎯 Only 1 player remaining! Hand ends - winner takes the pot`);
    game.state = 'showdown';
    return determineWinner(game);
  }
  
  // Check if we need to auto-advance (only 1 player can act or all all-in)
  // This must be checked BEFORE advanceStreet() because advanceStreet() resets playersActedThisRound
  if (allActed && allEqual && canActPlayers.length <= 1 && game.state !== 'river') {
    console.log(`🎯 Auto-dealing remaining streets (everyone all-in or no one can raise)...`);
    advanceStreet(game);
    return { autoAdvanceNeeded: true };
  }
  
  // End betting round if all active players have acted AND all have equal bets
  if (allActed && allEqual) {
    console.log(`🎯 Betting round complete, advancing to next street`);
    advanceStreet(game);
  }
}

/**
 * Advance to next street (flop, turn, river, showdown)
 */
function advanceStreet(game) {
  // Build side pots before resetting bets
  buildSidePots(game);
  
  // Reset bets for next round
  game.players.forEach(p => p.currentBet = 0);
  game.highestBet = 0;
  game.minBet = game.bigBlind;
  game.bettingRound++;
  game.playersActedThisRound = new Set(); // Reset acting tracking for next round
  
  switch (game.state) {
    case 'preflop':
      // Reveal flop (3 cards)
      game.communityCards.push(game.deck.pop());
      game.communityCards.push(game.deck.pop());
      game.communityCards.push(game.deck.pop());
      game.state = 'flop';
      break;
      
    case 'flop':
      // Reveal turn (1 card)
      game.communityCards.push(game.deck.pop());
      game.state = 'turn';
      break;
      
    case 'turn':
      // Reveal river (1 card)
      game.communityCards.push(game.deck.pop());
      game.state = 'river';
      break;
      
    case 'river':
      // Showdown
      game.state = 'showdown';
      return determineWinner(game);
      
    default:
      break;
  }
  
  // Set first bettor to small blind (or first active player if SB folded)
  const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
  const smallBlindPlayer = game.players[game.smallBlindPos];
  if (activePlayers.includes(smallBlindPlayer)) {
    game.currentBettor = smallBlindPlayer.id;
  } else {
    game.currentBettor = activePlayers[0]?.id || null;
  }
  
  return null;
}

/**
 * Auto-advance one street (flop, turn, river) for when only 1 player can act
 */
function autoAdvanceOneStreet(game) {
  if (game.state === 'river') {
    game.state = 'showdown';
    return true; // True means we're done
  }
  
  const oldState = game.state;
  advanceStreet(game);
  console.log(`🎰 Auto-advanced: ${oldState} → ${game.state}`);
  
  return game.state === 'showdown';
}

/**
 * Auto-advance remaining streets (flop, turn, river) with delays when only 1 player can act
 */

/**
 * Determine winner(s) at showdown with side pot support
 */
function determineWinner(game) {
  const remainingPlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
  
  if (remainingPlayers.length === 1) {
    // Everyone else folded - winner takes all pots
    const winner = remainingPlayers[0];
    winner.stack += game.pot;
    return {
      winners: [winner.id],
      winnerNames: [winner.name],
      pot: game.pot,
      method: 'fold',
      sidePotDistribution: [{
        potAmount: game.pot,
        winners: [winner.name]
      }]
    };
  }

  // Multiple players remaining - evaluate hands and distribute side pots
  const hands = remainingPlayers.map(player => ({
    id: player.id,
    name: player.name,
    hand: evaluateHand(game.playerHands[player.id], game.communityCards)
  }));

  // Build side pots if not already done
  if (game.sidePots.length === 0) {
    buildSidePots(game);
  }

  // Distribute each side pot to the best eligible player(s)
  const winnings = {}; // playerId -> total winnings
  remainingPlayers.forEach(p => {
    winnings[p.id] = 0;
  });

  const sidePotDistribution = [];
  let totalDistributed = 0;

  for (const sidePot of game.sidePots) {
    // Find best hand among eligible players
    const eligibleHands = hands.filter(h => sidePot.eligiblePlayers.has(h.id));
    
    if (eligibleHands.length === 0) {
      // No eligible players (shouldn't happen, but fallback)
      continue;
    }

    if (eligibleHands.length === 1) {
      // Only one eligible player gets this pot
      const winner = eligibleHands[0];
      winnings[winner.id] += sidePot.amount;
      totalDistributed += sidePot.amount;
      sidePotDistribution.push({
        potAmount: sidePot.amount,
        winners: [winner.name]
      });
    } else {
      // Multiple eligible players - find best hands
      eligibleHands.sort((a, b) => compareHands(b.hand, a.hand));
      const bestHandRank = eligibleHands[0].hand.rank;
      const bestTieBreaker = eligibleHands[0].hand.tieBreaker;
      
      const potWinners = eligibleHands.filter(h => 
        h.hand.rank === bestHandRank && h.hand.tieBreaker === bestTieBreaker
      );

      const winningsPerPlayer = sidePot.amount / potWinners.length;
      potWinners.forEach(winner => {
        winnings[winner.id] += winningsPerPlayer;
        totalDistributed += winningsPerPlayer;
      });

      sidePotDistribution.push({
        potAmount: sidePot.amount,
        winners: potWinners.map(w => w.name)
      });
    }
  }

  // Apply winnings to player stacks
  Object.keys(winnings).forEach(playerId => {
    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.stack += winnings[playerId];
    }
  });

  // Determine overall winners (players who won at least one pot)
  const overallWinners = hands.filter(h => winnings[h.id] > 0);

  return {
    winners: overallWinners.map(w => w.id),
    winnerNames: overallWinners.map(w => w.name),
    pot: game.pot,
    method: 'showdown',
    allHands: hands.map(h => ({ name: h.name, hand: h.hand.description })),
    sidePotDistribution: sidePotDistribution,
    winnings: winnings
  };
}

/**
 * Evaluate best 5-card hand from 7 cards (2 hole + 5 community)
 */
function evaluateHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];
  
  if (allCards.length < 5) {
    return { rank: 0, description: 'Incomplete' };
  }
  
  // Generate all 5-card combinations
  const combinations = generate5CardCombinations(allCards);
  const evaluatedHands = combinations.map(combo => evalPokerHand(combo));
  
  // Return best hand
  return evaluatedHands.reduce((best, current) =>
    compareHands(current, best) > 0 ? current : best
  );
}

/**
 * Generate all possible 5-card combinations from 7 cards
 */
function generate5CardCombinations(cards) {
  const combinations = [];
  const n = cards.length;
  
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            combinations.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  
  return combinations;
}

/**
 * Evaluate a single 5-card poker hand
 */
function evalPokerHand(cards) {
  const ranks = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const suitCounts = countOccurrences(suits);
  const rankCounts = countOccurrences(ranks);
  
  // Check for flush
  const isFlush = Math.max(...Object.values(suitCounts)) === 5;
  
  // Check for straight
  const isStraight = checkStraight(ranks);
  
  // Get hand type and rank
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  if (isFlush && isStraight) {
    return {
      rank: HAND_RANKINGS.STRAIGHT_FLUSH,
      tieBreaker: ranks[0],
      description: `Straight Flush (${describeCards(cards)})`
    };
  } else if (counts[0] === 4) {
    const quad = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
    return {
      rank: HAND_RANKINGS.FOUR_OF_A_KIND,
      tieBreaker: parseInt(quad),
      description: `Four of a Kind (${describeCards(cards)})`
    };
  } else if (counts[0] === 3 && counts[1] === 2) {
    const trips = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
    return {
      rank: HAND_RANKINGS.FULL_HOUSE,
      tieBreaker: parseInt(trips),
      description: `Full House (${describeCards(cards)})`
    };
  } else if (isFlush) {
    return {
      rank: HAND_RANKINGS.FLUSH,
      tieBreaker: ranks[0],
      description: `Flush (${describeCards(cards)})`
    };
  } else if (isStraight) {
    return {
      rank: HAND_RANKINGS.STRAIGHT,
      tieBreaker: ranks[0],
      description: `Straight (${describeCards(cards)})`
    };
  } else if (counts[0] === 3) {
    const trips = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
    return {
      rank: HAND_RANKINGS.THREE_OF_A_KIND,
      tieBreaker: parseInt(trips),
      description: `Three of a Kind (${describeCards(cards)})`
    };
  } else if (counts[0] === 2 && counts[1] === 2) {
    return {
      rank: HAND_RANKINGS.TWO_PAIR,
      tieBreaker: Math.max(...Object.keys(rankCounts).filter(r => rankCounts[r] === 2)),
      description: `Two Pair (${describeCards(cards)})`
    };
  } else if (counts[0] === 2) {
    const pair = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
    return {
      rank: HAND_RANKINGS.PAIR,
      tieBreaker: parseInt(pair),
      description: `Pair (${describeCards(cards)})`
    };
  } else {
    return {
      rank: HAND_RANKINGS.HIGH_CARD,
      tieBreaker: ranks[0],
      description: `High Card (${describeCards(cards)})`
    };
  }
}

/**
 * Compare two evaluated hands
 * Returns: > 0 if hand1 is better, < 0 if hand2 is better, 0 if equal
 */
function compareHands(hand1, hand2) {
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }
  return hand1.tieBreaker - hand2.tieBreaker;
}

/**
 * Check if ranks form a straight
 */
function checkStraight(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  
  if (unique.length !== 5) return false;
  
  // Check normal straight
  if (unique[0] - unique[4] === 4) return true;
  
  // Check for A-2-3-4-5 (wheel)
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return true;
  }
  
  return false;
}

/**
 * Get numeric value for a rank
 */
function getRankValue(rank) {
  const rankMap = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank] || 0;
}

/**
 * Count occurrences of elements in array
 */
function countOccurrences(arr) {
  return arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Describe cards for output
 */
function describeCards(cards) {
  return cards.map(c => `${c.rank}${c.suit}`).join(' ');
}

/**
 * Build a standard 52-card deck
 */
function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  shuffle(deck);
  return deck;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Request blind change (requires consensus)
 */
function requestBlindChange(game, requesterId, newSmallBlind, newBigBlind) {
  if (newSmallBlind <= 0 || newBigBlind <= 0 || newBigBlind <= newSmallBlind) {
    return { error: 'Invalid blind values' };
  }
  
  game.blindChangeRequest = {
    requester: requesterId,
    smallBlind: newSmallBlind,
    bigBlind: newBigBlind,
    votes: new Set([requesterId])
  };
  
  return { pending: true };
}

/**
 * Vote on blind change
 */
function voteOnBlindChange(game, voterId, approve) {
  if (!game.blindChangeRequest) {
    return { error: 'No blind change pending' };
  }
  
  if (approve) {
    game.blindChangeRequest.votes.add(voterId);
  } else {
    return { error: 'Blind change rejected' };
  }
  
  // Check if consensus reached (2/3 of players)
  const requiredVotes = Math.ceil(game.players.length * 2 / 3);
  if (game.blindChangeRequest.votes.size >= requiredVotes) {
    game.smallBlind = game.blindChangeRequest.smallBlind;
    game.bigBlind = game.blindChangeRequest.bigBlind;
    game.minBet = game.bigBlind;
    const oldRequest = game.blindChangeRequest;
    game.blindChangeRequest = null;
    return { approved: true, newBlinds: { smallBlind: game.smallBlind, bigBlind: game.bigBlind } };
  }
  
  return { pending: true, votesNeeded: requiredVotes - game.blindChangeRequest.votes.size };
}

module.exports = {
  createGame,
  startNewHand,
  handlePlayerAction,
  determineWinner,
  evaluateHand,
  requestBlindChange,
  voteOnBlindChange,
  autoAdvanceOneStreet,
  HAND_RANKINGS
};
