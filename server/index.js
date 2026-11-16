const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { findBestHand, HAND_TYPE_RANK, rankValue, SUIT_RANK } = require('./utils');
const texasHoldEmEngine = require('./texasHoldEmEngine');
const firstPlayDone = {}; // roomId -> true/false
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(cors());

// Disable caching for development to ensure clients get latest updates
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use(express.static(path.join(__dirname, '../client')));

/* ===============================
   PLAYER STATS DATABASE (in-memory)
================================ */
const playerStats = {}; // playerName -> { wins: num, gamesPlayed: num }

function getOrCreatePlayer(playerName) {
  if (!playerStats[playerName]) {
    playerStats[playerName] = { wins: 0, gamesPlayed: 0 };
  }
  return playerStats[playerName];
}

function updatePlayerStats(playerName) {
  const stats = getOrCreatePlayer(playerName);
  stats.wins++;
  stats.gamesPlayed++;
}

function incrementGamesPlayed(playerName) {
  const stats = getOrCreatePlayer(playerName);
  stats.gamesPlayed++;
}

/* ===============================
   GAME STATE
================================ */
const rooms = {};      // roomId -> [{ socket, name }]
const ready = {};      // roomId -> { socketId: bool }
const hands = {};      // roomId -> { socketId: [card] }
const started = {};    // roomId -> bool
const inGame = {};     // roomId -> [socketId] - the 4 active players
const waitingRoom = {}; // roomId -> [socketId] - players in waiting room

// Texas Hold 'Em specific
const roomGameTypes = {}; // roomId -> gameType ('chinesePoker' or 'texasHoldEm')
const holdEmGames = {};    // roomId -> texasHoldEmGame object
const holdEmPlayerData = {}; // roomId -> { socketId: { buyIn, stack, name, ready, status: 'active'|'watching'|'busted' } }
const holdEmBustedPlayers = {}; // roomId -> Set of socketIds who busted and are watching

// Turn/trick state
const currentTurn = {};    // roomId -> socketId
const lastPlay = {};       // roomId -> { playerId, playerName, cards, eval } OR null
const passSet = {};        // roomId -> Set(socketId) that have passed since lastPlay
const tablePlays = {};     // roomId -> [{ player, cards }] (since last clear)
const discards = {};       // roomId -> card (3-player discard)
const revealedHands = {};  // roomId -> { socketId: [cards] }

/* ===============================
   CARD HELPERS
================================ */
const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const SUITS = ['C','S','H','D']; // weakest -> strongest

// Note: rankValue is imported from utils.js
function suitValue(s) { return SUITS.indexOf(s); }

function cardKey(c) { return `${c.rank}_${c.suit}`; }

function hasCard(hand, rank, suit) {
  return hand.some(c => c.rank === rank && c.suit === suit);
}

function removeCardsFromHand(hand, cardsToRemove) {
  const remove = new Set(cardsToRemove.map(cardKey));
  return hand.filter(c => !remove.has(cardKey(c)));
}

function isAutoPassHand(cards, evalResult) {
  if (!evalResult || !evalResult.ok) return false;

  const hasTwoDiamonds = hasCard(cards, '2', 'D');

  if (evalResult.type === 'single') {
    return cards.length === 1 && hasTwoDiamonds;
  }

  if (evalResult.type === 'pair' || evalResult.type === 'trips') {
    const allTwos = cards.every(c => c.rank === '2');
    return allTwos && hasTwoDiamonds;
  }

  if (evalResult.type === 'straight_flush') {
    // Only auto-pass for J-Q-K-A-2 of diamonds (2 high straight flush)
    const straightHigh = evalResult.key?.[0];
    const allDiamonds = cards.every(c => c.suit === 'D');
    return straightHigh === 12 && allDiamonds && hasTwoDiamonds;
  }

  return false;
}

function sameCards(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map(cardKey));
  for (const c of b) if (!sa.has(cardKey(c))) return false;
  return true;
}

function evalHand(cards) {
  const n = cards.length;
  if (![1,2,3,5].includes(n)) return { ok:false, reason:'You can only play 1, 2, 3, or 5 cards.' };

  // basic counts
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const ranks = Object.keys(counts);

  // Helper for tie-suit: highest card suit decides ties
  const hi = highestCard(cards);
  const tieSuit = suitValue(hi.suit);

  if (n === 1) {
    return {
      ok:true,
      type:'single',
      cat:1,
      key:[rankValue(cards[0].rank), suitValue(cards[0].suit)],
      tieSuit
    };
  }

  if (n === 2) {
    if (ranks.length !== 1) return { ok:false, reason:'2-card hands must be a pair.' };
    const r = ranks[0];
    const maxSuit = Math.max(...cards.map(c => suitValue(c.suit)));
    return { ok:true, type:'pair', cat:2, key:[rankValue(r), maxSuit], tieSuit:maxSuit };
  }

  if (n === 3) {
    if (ranks.length !== 1) return { ok:false, reason:'3-card hands must be three of a kind.' };
    const r = ranks[0];
    const maxSuit = Math.max(...cards.map(c => suitValue(c.suit)));
    return { ok:true, type:'trips', cat:3, key:[rankValue(r), maxSuit], tieSuit:maxSuit };
  }

  // n === 5
  // Only allow: straight, flush, full house, straight flush
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  function straightHighValue(cards5) {
    const vals = [...new Set(cards5.map(c => rankValue(c.rank)))].sort((a,b)=>a-b);
    if (vals.length !== 5) return null;

    // Special case: {2,3,4,5,6} where 2 is LOW
    const set = new Set(vals);
    const special = set.has(12) && set.has(0) && set.has(1) && set.has(2) && set.has(3);
    if (special) return 3; // 6-high

    // General case: allow wrap-around consecutive modulo 13
    for (let start = 0; start < 13; start++) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        if (!set.has((start + k) % 13)) { ok = false; break; }
      }
      if (ok) return (start + 4) % 13; // high card value
    }
    return null;
  }

  const straightHigh = straightHighValue(cards);

  // Count patterns
  const freq = Object.entries(counts).map(([r,c]) => ({ r, c, v: rankValue(r) }))
    .sort((a,b) => (b.c - a.c) || (b.v - a.v));
  const pattern = freq.map(x => x.c).join(',');

  // Straight Flush
  if (isFlush && straightHigh !== null) {
    // For straight flushes, tie breaker should be the suit of the actual high card
    let straightTieSuit = tieSuit;
    
    // Special case: if it's a low straight, use suit of 6
    const set = new Set(cards.map(c => rankValue(c.rank)));
    const isLowStraight = set.has(12) && set.has(0) && set.has(1) && set.has(2) && set.has(3);
    if (isLowStraight) {
      const sixCard = cards.find(c => c.rank === '6');
      straightTieSuit = sixCard ? suitValue(sixCard.suit) : tieSuit;
    } else {
      // For normal straights, find the actual high card based on straightHigh value
      const highRankCard = cards.find(c => rankValue(c.rank) === straightHigh);
      straightTieSuit = highRankCard ? suitValue(highRankCard.suit) : tieSuit;
    }
    
    return { ok:true, type:'straight_flush', cat:8, key:[straightHigh, straightTieSuit], tieSuit:straightTieSuit };
  }

  // Full House
  if (pattern === '3,2') {
    const tripsRank = freq.find(x => x.c === 3).v;
    return { ok:true, type:'full_house', cat:6, key:[tripsRank, tieSuit], tieSuit };
  }

  // Flush
  if (isFlush) {
    const highCard = sortCardsHighFirst(cards)[0];
    const highRank = rankValue(highCard.rank);
    const highSuit = suitValue(highCard.suit);
    return { ok:true, type:'flush', cat:5, key:[highRank, highSuit], tieSuit: highSuit };
  }

  // Straight
  if (straightHigh !== null) {
    // For straights, tie breaker should be the suit of the actual high card
    // For low straight (2-3-4-5-6), high card is 6, not 2
    let straightTieSuit = tieSuit;
    
    // Special case: if it's a low straight, use suit of 6
    const set = new Set(cards.map(c => rankValue(c.rank)));
    const isLowStraight = set.has(12) && set.has(0) && set.has(1) && set.has(2) && set.has(3);
    if (isLowStraight) {
      const sixCard = cards.find(c => c.rank === '6');
      straightTieSuit = sixCard ? suitValue(sixCard.suit) : tieSuit;
    } else {
      // For normal straights, find the actual high card based on straightHigh value
      const highRankCard = cards.find(c => rankValue(c.rank) === straightHigh);
      straightTieSuit = highRankCard ? suitValue(highRankCard.suit) : tieSuit;
    }
    
    return { ok:true, type:'straight', cat:4, key:[straightHigh, straightTieSuit], tieSuit:straightTieSuit };
  }

  // Four of a Kind (Quads)
  if (pattern === '4,1') {
    const quadsRank = freq.find(x => x.c === 4).v;
    const kickerSuit = cards.find(c => rankValue(c.rank) !== quadsRank).suit;
    return { ok:true, type:'quads', cat:7, key:[quadsRank, suitValue(kickerSuit)], tieSuit };
  }

  // Explicitly reject Two Pair
  if (pattern === '2,2,1') {
    return { ok:false, reason:'Two-pair is not allowed in this game.' };
  }

  // Reject ANY other 5-card hand
  return { ok:false, reason:'Only straight, flush, full house, quads, or straight flush are allowed as 5-card hands.' };
}

/* ===============================
   HAND COMPARISON HELPER
================================ */
function sortCardsHighFirst(cards) {
  return [...cards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
}

function highestCard(cards) {
  return sortCardsHighFirst(cards)[0];
}

function compareEval(evalA, evalB) {
  // Compare two evaluated hands
  // Returns: > 0 if A wins, < 0 if B wins, 0 if tie
  
  if (evalA.cat !== evalB.cat) {
    return evalA.cat - evalB.cat; // higher category wins
  }
  
  // Same category, compare keys element by element
  const keyA = evalA.key;
  const keyB = evalB.key;
  
  for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
    const a = keyA[i] || 0;
    const b = keyB[i] || 0;
    if (a !== b) return a - b;
  }
  
  return 0; // identical hands
}

/* ===============================
   GAME START / DEAL
================================ */
function buildDeck() {
  const deck = [];
  for (const s of ['C','D','H','S']) {
    for (const r of RANKS) deck.push({ suit:s, rank:r });
  }
  shuffle(deck);
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
function hasAllFourTwos(hand) {
  return hand.filter(c => c.rank === '2').length === 4;
}

function emitTurn(roomId) {
  const pid = currentTurn[roomId];
  const activePlayers = (inGame[roomId] || []).map(sid => rooms[roomId].find(p => p.socket.id === sid)).filter(p => p);
  const p = activePlayers.find(x => x.socket.id === pid);
  
  // Reorder activePlayers to start with current turn player (play order)
  const currentIdx = activePlayers.findIndex(player => player.socket.id === pid);
  const orderedPlayers = currentIdx >= 0
    ? [...activePlayers.slice(currentIdx), ...activePlayers.slice(0, currentIdx)]
    : activePlayers;
  
  // Gather all active player info with stats (in turn order)
  const players = orderedPlayers.map(player => {
    const stats = getOrCreatePlayer(player.name);
    const winPercent = stats.gamesPlayed > 0 
      ? Math.round((stats.wins / stats.gamesPlayed) * 100) 
      : 0;
    return {
      socketId: player.socket.id,
      name: player.name,
      wins: stats.wins,
      gamesPlayed: stats.gamesPlayed,
      winPercent,
      cardsRemaining: hands[roomId][player.socket.id]?.length || 0
    };
  });
  
  io.to(roomId).emit('turnUpdate', { 
    playerId: pid, 
    playerName: p?.name || '',
    players,
    playerCount: activePlayers.length
  });
}

function startGame(roomId) {
  started[roomId] = true;

  // Clear revealed hands for everyone as the next game starts
  io.to(roomId).emit('clearReveals');

  tablePlays[roomId] = [];
  lastPlay[roomId] = null;
  passSet[roomId] = new Set();
  firstPlayDone[roomId] = false;

  discards[roomId] = null;

    hands[roomId] = {};
  // Only deal to players in inGame array
  const activePlayers = inGame[roomId].map(sid => rooms[roomId].find(p => p.socket.id === sid)).filter(p => p);
  
  // Determine cards to deal based on number of active players
  const cardsPerPlayer = activePlayers.length === 3 ? 17 : 13;

  // Re-deal until no one has all four 2s
  let deck;
  let tries = 0;

  while (true) {
    tries++;
    deck = buildDeck();

    // Deal hands in memory first
    const tempHands = {};
    activePlayers.forEach(p => {
      tempHands[p.socket.id] = deck.splice(0, cardsPerPlayer);
    });

    // If any player has all four 2s, re-deal
    const someoneHasAllFourTwos = Object.values(tempHands).some(hasAllFourTwos);
    if (!someoneHasAllFourTwos) {
      hands[roomId] = tempHands;
      break;
    }

    // Safety valve (extremely unlikely)
    if (tries > 500) {
      hands[roomId] = tempHands; // accept anyway
      break;
    }
  }

  // Now emit hands to each active player
  activePlayers.forEach(p => {
    p.socket.emit('dealHand', hands[roomId][p.socket.id]);
  });

  // 3-player discard rule: final card face up
  if (activePlayers.length === 3) {
    discards[roomId] = deck.shift() || null;
    io.to(roomId).emit('discardCard', discards[roomId]);
  }

  // Find 3 of clubs holder to start
  const starter = activePlayers.find(p => hasCard(hands[roomId][p.socket.id], '3', 'C'));
  currentTurn[roomId] = starter ? starter.socket.id : activePlayers[0].socket.id;

  io.to(roomId).emit('updateTable', []); // clear table
  emitTurn(roomId);
}

/* ===============================
   SOCKET.IO
================================ */
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', ({ playerName, roomId, gameType = 'chinesePoker' }) => {
    socket.playerName = playerName;
    socket.roomId = roomId;
    socket.gameType = gameType;

    // Initialize game type for room (all players in a room play the same game)
    if (!roomGameTypes[roomId]) {
      roomGameTypes[roomId] = gameType;
      console.log(`🎮 Room ${roomId} set to ${gameType}`);
    }

    // Initialize Chinese Poker state
    if (gameType === 'chinesePoker') {
      if (!rooms[roomId]) rooms[roomId] = [];
      if (!ready[roomId]) ready[roomId] = {};
      if (!inGame[roomId]) inGame[roomId] = [];
      if (!waitingRoom[roomId]) waitingRoom[roomId] = [];
      if (started[roomId] == null) started[roomId] = false;

      if (rooms[roomId].length >= 10) {
        socket.emit('errorMessage', 'Room is full (max 10 players).');
        return;
      }

      socket.join(roomId);
      rooms[roomId].push({ socket, name: playerName });
      ready[roomId][socket.id] = false;

      // Automatically assign to active game or waiting room based on position
      if (started[roomId] === true) {
        waitingRoom[roomId].push(socket.id);
        const queuePosition = waitingRoom[roomId].length;
        console.log(`Player ${playerName} (${socket.id}) joined mid-game, added to waiting room queue. Position: ${queuePosition}`);
        const stats = playerStats[playerName] || { wins: 0, gamesPlayed: 0 };
        socket.emit('playerStatus', { status: 'waiting', queuePosition, stats });
      } else if (inGame[roomId].length < 4) {
        inGame[roomId].push(socket.id);
        console.log(`Player ${playerName} (${socket.id}) auto-joined active game. Count: ${inGame[roomId].length}`);
        const stats = playerStats[playerName] || { wins: 0, gamesPlayed: 0 };
        socket.emit('playerStatus', { status: 'active', queuePosition: -1, stats });
      } else {
        waitingRoom[roomId].push(socket.id);
        const queuePosition = waitingRoom[roomId].length;
        console.log(`Player ${playerName} (${socket.id}) auto-joined waiting room queue. Position: ${queuePosition}`);
        const stats = playerStats[playerName] || { wins: 0, gamesPlayed: 0 };
        socket.emit('playerStatus', { status: 'waiting', queuePosition, stats });
      }

      // Broadcast updated player list
      io.to(roomId).emit('updatePlayers', rooms[roomId].map(p => ({
        name: p.name,
        ready: !!ready[roomId][p.socket.id]
      })));
      
      // Emit active players list with stats for the player list panel
      const activePlayersData = inGame[roomId].map(socketId => {
        const player = rooms[roomId].find(p => p.socket.id === socketId);
        if (!player) return null;
        const stats = playerStats[player.name] || { wins: 0, gamesPlayed: 0 };
        return {
          socketId: socketId,
          name: player.name,
          wins: stats.wins,
          gamesPlayed: stats.gamesPlayed,
          cardsRemaining: 0 // Will be updated during game
        };
      }).filter(x => x);
      io.to(roomId).emit('activePlayersListUpdate', activePlayersData);
      
      const waiting = waitingRoom[roomId].map(sid => {
        const p = rooms[roomId].find(pl => pl.socket.id === sid);
        return p ? { socketId: p.socket.id, name: p.name } : null;
      }).filter(x => x);
      io.to(roomId).emit('waitingList', waiting);
      
      const otherPlayers = rooms[roomId]
        .filter(p => p.socket.id !== socket.id)
        .map(p => ({ socketId: p.socket.id, name: p.name }));
      socket.emit('existingPlayers', otherPlayers);
      
      const newPlayerInfo = { socketId: socket.id, name: playerName };
      socket.to(roomId).emit('newPlayerJoined', newPlayerInfo);
    } 
    // Initialize Texas Hold 'Em state
    else if (gameType === 'texasHoldEm') {
      if (!holdEmGames[roomId]) {
        holdEmGames[roomId] = texasHoldEmEngine.createGame(roomId, 0.05, 0.10);
      }
      if (!holdEmPlayerData[roomId]) {
        holdEmPlayerData[roomId] = {};
      }

      socket.join(roomId);
      
      // Store player data (will get buyIn amount from player)
      holdEmPlayerData[roomId][socket.id] = {
        name: playerName,
        socket,
        buyIn: 0,
        stack: 0,
        ready: false
      };

      console.log(`🤠 Player ${playerName} (${socket.id}) joined Texas Hold 'Em room ${roomId}`);
      
      // Prompt for buy-in amount
      socket.emit('promptBuyIn', {
        minBuyIn: 1.00,
        maxBuyIn: 1000.00,
        suggestedBuyIn: 10.00
      });
      
      // Notify other players
      const otherPlayers = Object.values(holdEmPlayerData[roomId])
        .filter(p => p.socket.id !== socket.id)
        .map(p => ({ socketId: p.socket.id, name: p.name }));
      
      socket.emit('existingPlayers', otherPlayers);
      
      io.to(roomId).emit('playerJoinedGame', {
        socketId: socket.id,
        name: playerName
      });
    }
  });

  /* ===============================
     TEXAS HOLD 'EM HANDLERS
  ================================ */

  /**
   * Handle Texas Hold 'Em buy-in submission
   */
  socket.on('submitBuyIn', ({ roomId, buyInAmount }) => {
    if (!holdEmPlayerData[roomId] || !holdEmPlayerData[roomId][socket.id]) {
      socket.emit('errorMessage', 'Invalid room or player data');
      return;
    }

    const playerData = holdEmPlayerData[roomId][socket.id];
    if (playerData.buyIn > 0) {
      socket.emit('errorMessage', 'You have already bought in');
      return;
    }

    buyInAmount = Math.round((parseFloat(buyInAmount) || 0) * 100) / 100;
    if (buyInAmount < HOLDEM_BUY_IN.minBuyIn || buyInAmount > HOLDEM_BUY_IN.maxBuyIn) {
      socket.emit('errorMessage', 'Buy-in must be between $1 and $1000');
      return;
    }

    playerData.buyIn = buyInAmount;
    playerData.stack = buyInAmount;
    playerData.status = 'active';
    playerData.ready = false; // Player must click ready to be dealt in

    broadcastHoldEmLobby(roomId);
  });

  /**
   * Handle Texas Hold 'Em ready click
   */
  socket.on('texasHoldEmReady', ({ roomId }) => {
    if (!holdEmPlayerData[roomId] || !holdEmPlayerData[roomId][socket.id]) {
      socket.emit('errorMessage', 'Invalid room or player data');
      return;
    }

    const playerData = holdEmPlayerData[roomId][socket.id];
    if (!playerData.stack || playerData.stack <= 0) {
      socket.emit('errorMessage', 'Cannot ready up - no stack');
      return;
    }

    playerData.ready = true;
    broadcastHoldEmLobby(roomId);

    const game = holdEmGames[roomId];
    if (!game || game.handInProgress || game.nextHandTimer) {
      return; // A hand is being played: they'll be dealt in when the next one starts
    }

    if (game.handsPlayed > 0) {
      // Game was paused waiting for players: resume as soon as 2 can play
      startNextHoldEmHand(roomId);
      return;
    }

    // First hand: wait until everyone who has bought in is ready
    const withStack = Object.values(holdEmPlayerData[roomId]).filter(p => p.stack > 0);
    if (withStack.length >= 2 && withStack.every(p => p.ready)) {
      startNextHoldEmHand(roomId);
    }
  });

  /**
   * Handle Texas Hold 'Em player actions (fold, check, call, bet, raise)
   * For bet/raise, amount is the total to raise to.
   */
  socket.on('pokerAction', ({ roomId, gameType, action, amount }) => {
    const game = holdEmGames[roomId];
    if (gameType !== 'texasHoldEm' || !game) {
      socket.emit('errorMessage', 'Invalid game');
      return;
    }

    const result = texasHoldEmEngine.handlePlayerAction(game, socket.id, action, parseFloat(amount) || 0);
    if (result.error) {
      socket.emit('errorMessage', result.error);
      return;
    }
    processHoldEmResult(roomId, result);
  });

  /**
   * Winner of a hand where everyone else folded chooses to show or muck.
   */
  socket.on('showOrMuck', ({ roomId, show }) => {
    const game = holdEmGames[roomId];
    if (!game || !game.showOffer || game.showOffer.playerId !== socket.id) return;
    game.showOffer = null;

    if (show) {
      io.to(roomId).emit('cardsShown', {
        playerId: socket.id,
        playerName: socket.playerName,
        cards: game.playerHands[socket.id] || []
      });
      const shown = (game.playerHands[socket.id] || []).map(c => `${c.rank}${c.suit}`).join(' ');
      appendHandLog(`Hand #${game.handNumber}: ${socket.playerName} showed [${shown}]\n\n`);
      scheduleNextHoldEmHand(roomId, HOLDEM_SHOWN_CARDS_DELAY);
    } else {
      appendHandLog(`Hand #${game.handNumber}: ${socket.playerName} mucked\n\n`);
      io.to(roomId).emit('cardsMucked', { playerId: socket.id, playerName: socket.playerName });
      scheduleNextHoldEmHand(roomId, HOLDEM_MUCK_DELAY);
    }
  });

  /**
   * Handle blind change request (Texas Hold 'Em)
   */
  socket.on('requestBlindChange', ({ roomId, smallBlind, bigBlind }) => {
    const game = holdEmGames[roomId];
    if (!game) {
      socket.emit('errorMessage', 'Game not found');
      return;
    }

    const result = texasHoldEmEngine.requestBlindChange(game, socket.id, smallBlind, bigBlind);
    if (result.error) {
      socket.emit('errorMessage', result.error);
      return;
    }

    io.to(roomId).emit('blindChangeProposed', {
      proposedBy: socket.playerName,
      smallBlind: game.blindChangeRequest.smallBlind,
      bigBlind: game.blindChangeRequest.bigBlind,
      votesReceived: result.votesReceived,
      votesNeeded: result.votesNeeded
    });
  });

  /**
   * Vote on blind change (Texas Hold 'Em). One "no" vote cancels the request.
   */
  socket.on('voteBlindChange', ({ roomId, approve }) => {
    const game = holdEmGames[roomId];
    if (!game) {
      socket.emit('errorMessage', 'Game not found');
      return;
    }

    const result = texasHoldEmEngine.voteOnBlindChange(game, socket.id, approve);
    if (result.error) {
      socket.emit('errorMessage', result.error);
      return;
    }

    if (result.approved) {
      io.to(roomId).emit('blindsChanged', {
        smallBlind: result.newBlinds.smallBlind,
        bigBlind: result.newBlinds.bigBlind,
        effectiveNextHand: game.handInProgress
      });
    } else if (result.rejected) {
      io.to(roomId).emit('blindChangeRejected', { rejectedBy: socket.playerName });
    } else if (result.pending) {
      io.to(roomId).emit('voteUpdate', {
        votesReceived: result.votesReceived,
        votesNeeded: result.votesNeeded
      });
    }
  });

  /**
   * Handle rebuy after busting out (Texas Hold 'Em)
   */
  socket.on('submitRebuy', ({ roomId, rebuyAmount }) => {
    if (!holdEmPlayerData[roomId] || !holdEmPlayerData[roomId][socket.id]) {
      socket.emit('errorMessage', 'Invalid room or player data');
      return;
    }

    const playerData = holdEmPlayerData[roomId][socket.id];
    if (playerData.status !== 'busted') {
      socket.emit('errorMessage', 'Can only rebuy if busted');
      return;
    }

    rebuyAmount = Math.round((parseFloat(rebuyAmount) || 0) * 100) / 100;
    if (rebuyAmount < HOLDEM_BUY_IN.minBuyIn || rebuyAmount > HOLDEM_BUY_IN.maxBuyIn) {
      socket.emit('errorMessage', 'Rebuy must be between $1 and $1000');
      return;
    }

    seatHoldEmPlayerForNextHand(roomId, socket.id, rebuyAmount);
    io.to(roomId).emit('playerRebuyin', {
      playerId: socket.id,
      playerName: playerData.name,
      rebuyAmount
    });
    resumeHoldEmIfPaused(roomId);
  });

  /**
   * Handle player choosing to watch instead of rebuy (Texas Hold 'Em)
   */
  socket.on('chooseToWatch', ({ roomId }) => {
    if (!holdEmPlayerData[roomId] || !holdEmPlayerData[roomId][socket.id]) {
      socket.emit('errorMessage', 'Invalid room or player data');
      return;
    }

    const playerData = holdEmPlayerData[roomId][socket.id];
    playerData.status = 'watching';
    playerData.ready = false;

    io.to(roomId).emit('playerWatching', {
      playerId: socket.id,
      playerName: playerData.name
    });
  });

  /**
   * Re-buy from the Re-buy button (Texas Hold 'Em): works any time while
   * busted or watching; they're dealt in when the next hand starts.
   */
  socket.on('rejoinGame', ({ roomId, buyInAmount }) => {
    if (!holdEmPlayerData[roomId] || !holdEmPlayerData[roomId][socket.id]) {
      socket.emit('errorMessage', 'Invalid room or player data');
      return;
    }

    const playerData = holdEmPlayerData[roomId][socket.id];
    if (playerData.status !== 'watching' && playerData.status !== 'busted') {
      socket.emit('errorMessage', 'You still have chips - no need to re-buy');
      return;
    }

    buyInAmount = Math.round((parseFloat(buyInAmount) || 0) * 100) / 100;
    if (buyInAmount < HOLDEM_BUY_IN.minBuyIn || buyInAmount > HOLDEM_BUY_IN.maxBuyIn) {
      socket.emit('errorMessage', 'Buy-in must be between $1 and $1000');
      return;
    }

    seatHoldEmPlayerForNextHand(roomId, socket.id, buyInAmount);
    io.to(roomId).emit('playerRejoinedGame', {
      playerId: socket.id,
      playerName: playerData.name,
      buyInAmount
    });
    resumeHoldEmIfPaused(roomId);
  });

  socket.on('revealHand', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const hand = hands[roomId]?.[socket.id] || [];
    if (!revealedHands[roomId]) revealedHands[roomId] = {};
    revealedHands[roomId][socket.id] = hand;

    // Broadcast to all players in room
    io.to(roomId).emit('handRevealed', {
      socketId: socket.id,
      playerName: socket.playerName,
      cards: hand
    });
  });

  socket.on('playerReady', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    // Only allow players in active game to ready up
    if (!inGame[roomId].includes(socket.id)) {
      console.log(`Player ${socket.playerName} (${socket.id}) tried to ready but is not in active game`);
      socket.emit('errorMessage', 'Only active players can ready up. You are in the waiting room.');
      return;
    }

    ready[roomId][socket.id] = true;
    console.log(`Player ${socket.playerName} is ready. Ready count: ${Object.values(ready[roomId]).filter(Boolean).length}`);
    
    // Start game when all active players are ready (3 or 4 players)
    if (!started[roomId] && inGame[roomId].length >= 3) {
      const readyCount = inGame[roomId].filter(id => ready[roomId][id]).length;
      if (readyCount === inGame[roomId].length) {
        startGame(roomId);
      }
    }

    io.to(roomId).emit('updatePlayers', rooms[roomId].map(p => ({
      name: p.name,
      ready: !!ready[roomId][p.socket.id]
    })));

    // Emit waiting list
    const waiting = waitingRoom[roomId].map(sid => {
      const p = rooms[roomId].find(pl => pl.socket.id === sid);
      return p ? { socketId: p.socket.id, name: p.name } : null;
    }).filter(x => x);
    io.to(roomId).emit('waitingList', waiting);
  });

  socket.on('playHand', (playedCards) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    // Must be your turn
    if (currentTurn[roomId] !== socket.id) {
      socket.emit('errorMessage', "Not your turn.");
      return;
    }

    // Must be started
    if (!started[roomId]) {
      socket.emit('errorMessage', "Game hasn't started yet.");
      return;
    }

    // Validate cards exist in hand
    const hand = hands[roomId]?.[socket.id] || [];
    for (const c of playedCards) {
      if (!hand.some(hc => hc.rank === c.rank && hc.suit === c.suit)) {
        socket.emit('errorMessage', "You tried to play a card you don't have.");
        return;
      }
    }

    // Evaluate hand type
    const e = evalHand(playedCards);
    if (!e.ok) {
      socket.emit('errorMessage', e.reason);
      return;
    }

    // First play of the ENTIRE GAME must include 3 of Clubs
if (!firstPlayDone[roomId]) {
  const mustHave3C = hasCard(playedCards, '3', 'C');
  if (!mustHave3C) {
    socket.emit('errorMessage', 'First play must include the 3 of Clubs.');
    return;
  }
}

    // Must beat previous hand if there is one
    if (lastPlay[roomId]) {
      const prevCards = lastPlay[roomId].cards;
      const prevEval = lastPlay[roomId].eval;

      // Must match card count (Big-Two style, matches your “beat” phrasing)
      if (playedCards.length !== prevCards.length) {
        socket.emit('errorMessage', `You must play the same number of cards (${prevCards.length}).`);
        return;
      }

      const cmp = compareEval(e, prevEval);
      console.log(`🔍 Comparing hands:`);
      console.log(`  Current play: ${JSON.stringify(e)}`);
      console.log(`  Previous play: ${JSON.stringify(prevEval)}`);
      console.log(`  Comparison result: ${cmp}`);
      if (cmp <= 0) {
        socket.emit('errorMessage', 'Your hand does not beat the previous hand.');
        return;
      }
    }

    // Accept play: remove cards from player hand
    hands[roomId][socket.id] = removeCardsFromHand(hand, playedCards);

    const wasFirstPlay = !firstPlayDone[roomId];
    firstPlayDone[roomId] = true;

    // Update trick/table state
    lastPlay[roomId] = {
      playerId: socket.id,
      playerName: socket.playerName,
      cards: playedCards,
      eval: e
    };

    passSet[roomId] = new Set(); // reset passes
    
    // Hide discard for everyone after first play (3-player game)
    if (wasFirstPlay) {
      io.to(roomId).emit('hideDiscard');
    }
    tablePlays[roomId].push({ player: socket.playerName, cards: playedCards, handType: e.type });

    // Broadcast updated table
    io.to(roomId).emit('updateTable', tablePlays[roomId]);

    // Tell THIS player their play was accepted (so client can safely remove UI cards)
    socket.emit('playAccepted', { playedCards });

    // Check if a player won (emptied their hand)
    if (hands[roomId][socket.id].length === 0) {
      // Winner! Update stats
      updatePlayerStats(socket.playerName);
      
      // Increment games played for all active players
      const activeIds = inGame[roomId] || [];
      const activePlayers = activeIds.map(sid => rooms[roomId].find(p => p.socket.id === sid)).filter(p => p);
      activePlayers.forEach(p => {
        if (p.name !== socket.playerName) { // winner already incremented
          incrementGamesPlayed(p.name);
        }
      });
      
      // Determine loser from remaining players with cards
      const playersWithCards = activeIds.filter(id => id !== socket.id && hands[roomId][id] && hands[roomId][id].length > 0);
      
      if (playersWithCards.length > 0) {
        // Find player with most cards
        const playerHandCounts = playersWithCards.map(id => ({
          id,
          socket: rooms[roomId].find(p => p.socket.id === id),
          hand: hands[roomId][id] || [],
          cardCount: (hands[roomId][id] || []).length
        }));
        
        const maxCards = Math.max(...playerHandCounts.map(p => p.cardCount));
        let losers = playerHandCounts.filter(p => p.cardCount === maxCards);
        
        // If tied on card count, compare best possible hands
        if (losers.length > 1) {
          const losersWithBestHands = losers.map(p => ({
            ...p,
            bestHand: findBestHand(p.hand)
          }));
          
          // Find the player with the WORST remaining hand (loser is eliminated)
          let loserPlayer = losersWithBestHands[0];
          for (let i = 1; i < losersWithBestHands.length; i++) {
            const challenger = losersWithBestHands[i];
            const loserTypeRank = HAND_TYPE_RANK[loserPlayer.bestHand.type] || 0;
            const challengerTypeRank = HAND_TYPE_RANK[challenger.bestHand.type] || 0;
            
            // Lower hand type rank is worse (better for elimination)
            if (challengerTypeRank < loserTypeRank) {
              loserPlayer = challenger;
            } else if (challengerTypeRank === loserTypeRank) {
              // Same hand type, compare rank
              if (challenger.bestHand.rank < loserPlayer.bestHand.rank) {
                loserPlayer = challenger;
              } else if (challenger.bestHand.rank === loserPlayer.bestHand.rank) {
                // Same rank, lower suit means they have the worse hand (loses)
                if (challenger.bestHand.suit < loserPlayer.bestHand.suit) {
                  loserPlayer = challenger;
                }
              }
            }
          }
          
          losers = [loserPlayer];
        }
        
        const loser = losers[0];
        
        // Check if there's actually a waiting room with players
        const hasWaitingRoom = waitingRoom[roomId] && waitingRoom[roomId].length > 0;
        
        // Clear revealed hands from previous game
        revealedHands[roomId] = {};
        
        // Emit game over with winner and loser (only show loser if waiting room exists)
        io.to(roomId).emit('gameOver', { 
          winner: socket.playerName,
          loser: hasWaitingRoom ? (loser.socket ? loser.socket.name : 'Unknown') : null,
          mySocketId: socket.id
        });
        
        // Move loser to back of waiting room queue (if waiting room exists)
        if (hasWaitingRoom) {
          // If we have a 3-player game and waiting players, bring waiting players up to 4
          // without removing the "loser" from the 3-player game
          if (inGame[roomId].length === 3) {
            // Bring waiting players to active game until we have 4
            const newPlayersAdded = [];
            while (inGame[roomId].length < 4 && waitingRoom[roomId].length > 0) {
              const nextPlayerId = waitingRoom[roomId].shift();
              inGame[roomId].push(nextPlayerId);
              newPlayersAdded.push(nextPlayerId);
            }
            
            // Notify newly promoted players they're now active
            newPlayersAdded.forEach(nextPlayerId => {
              const nextPlayerSocket = rooms[roomId].find(p => p.socket.id === nextPlayerId);
              if (nextPlayerSocket) {
                console.log(`📢 Sending active status to promoted player: ${nextPlayerSocket.name}`);
                io.to(nextPlayerId).emit('playerStatus', { status: 'active', queuePosition: -1 });
              }
            });
            
            // Notify all original players they remain active (including the "loser")
            console.log(`📢 Game expanded to ${inGame[roomId].length} players, all remain active`);
            inGame[roomId].forEach(id => {
              if (!newPlayersAdded.includes(id)) {
                const playerName = rooms[roomId].find(p => p.socket.id === id)?.name || 'Unknown';
                console.log(`📢 Sending active status to continuing player: ${playerName}`);
                io.to(id).emit('playerStatus', { status: 'active', queuePosition: -1 });
              }
            });
          } else {
            // 4-player game: remove loser and promote waiting player
            inGame[roomId] = inGame[roomId].filter(id => id !== loser.id);
            
            // Add loser to back of waiting room
            waitingRoom[roomId].push(loser.id);
            
            // Bring waiting players to active game until we have 4
            const newPlayersAdded = [];
            while (inGame[roomId].length < 4 && waitingRoom[roomId].length > 0) {
              const nextPlayerId = waitingRoom[roomId].shift();
              inGame[roomId].push(nextPlayerId);
              newPlayersAdded.push(nextPlayerId);
            }
            
            // Notify newly promoted players they're now active
            newPlayersAdded.forEach(nextPlayerId => {
              const nextPlayerSocket = rooms[roomId].find(p => p.socket.id === nextPlayerId);
              if (nextPlayerSocket) {
                console.log(`📢 Sending active status to promoted player: ${nextPlayerSocket.name}`);
                io.to(nextPlayerId).emit('playerStatus', { status: 'active', queuePosition: -1 });
              }
            });
            
            // Notify continuing players they're still active
            console.log(`📢 Continuing players in game: ${inGame[roomId].length}`);
            const continuingPlayers = inGame[roomId].filter(id => !newPlayersAdded.includes(id));
            continuingPlayers.forEach(id => {
              const playerName = rooms[roomId].find(p => p.socket.id === id)?.name || 'Unknown';
              console.log(`📢 Sending active status to continuing player: ${playerName}`);
              io.to(id).emit('playerStatus', { status: 'active', queuePosition: -1 });
            });
            
            if (loser.socket) {
              // Loser is now in waiting queue
              io.to(loser.id).emit('playerStatus', { 
                status: 'waiting', 
                queuePosition: waitingRoom[roomId].length
              });
            }
          }
          
          // Update queue positions for all remaining waiting players
          waitingRoom[roomId].forEach((id, index) => {
            io.to(id).emit('playerStatus', {
              status: 'waiting',
              queuePosition: index + 1
            });
          });
          
          // Update waiting room display for everyone
          const waitingNames = waitingRoom[roomId]
            .map(id => rooms[roomId].find(p => p.socket.id === id))
            .filter(p => p)
            .map(p => p.name);
          io.to(roomId).emit('waitingList', waitingNames);
        }
      } else {
        // No waiting room - just emit winner without loser
        io.to(roomId).emit('gameOver', { 
          winner: socket.playerName,
          loser: null
        });
        
        // Notify all continuing players they remain active
        inGame[roomId].forEach(id => {
          const playerName = rooms[roomId].find(p => p.socket.id === id)?.name || 'Unknown';
          console.log(`📢 Sending active status to continuing player (no waiting room): ${playerName}`);
          io.to(id).emit('playerStatus', { status: 'active', queuePosition: -1 });
        });
      }
      
      // Reset game state for next round
      started[roomId] = false;
      firstPlayDone[roomId] = false;
      
      // Clear ready states so players must ready up again
      ready[roomId] = {};
      const players = rooms[roomId] || [];
      players.forEach(p => {
        ready[roomId][p.socket.id] = false;
      });

      // Ensure all active players receive active status (ready button)
      (inGame[roomId] || []).forEach(id => {
        const playerName = rooms[roomId].find(p => p.socket.id === id)?.name || 'Unknown';
        console.log(`📢 Sending active status after reset: ${playerName}`);
        io.to(id).emit('playerStatus', { status: 'active', queuePosition: -1 });
      });
      
      return;
    }

    // Auto-pass for unbeatable 2♦ hands (single/pair/trips or J-Q-K-A-2♦ straight flush)
    if (isAutoPassHand(playedCards, e)) {
      io.to(roomId).emit('powerTaken', {
        playerId: socket.id,
        playerName: socket.playerName || 'A player',
        cards: playedCards
      });

      // Clear trick
      lastPlay[roomId] = null;
      passSet[roomId] = new Set();
      tablePlays[roomId] = [];

      io.to(roomId).emit('updateTable', []); // clear UI table

      // Turn goes back to the player who played the 2♦ hand
      currentTurn[roomId] = socket.id;
      emitTurn(roomId);
      return;
    }

    // Advance turn to next player (left)
    advanceTurn(roomId, socket.id);
  });

  socket.on('passTurn', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    if (!started[roomId]) {
      socket.emit('errorMessage', "Game hasn't started yet.");
      return;
    }

    if (currentTurn[roomId] !== socket.id) {
      socket.emit('errorMessage', "Not your turn.");
      return;
    }

    // If nobody has played yet in this trick, passing makes no sense
    if (!lastPlay[roomId]) {
      socket.emit('errorMessage', "You can't pass when there is no hand on the table.");
      return;
    }

    if (!passSet[roomId]) passSet[roomId] = new Set();
    passSet[roomId].add(socket.id);

    // If everyone except lastPlay player has passed -> clear table and last player starts
    const activeIds = inGame[roomId] || [];
    const lastPlayerId = lastPlay[roomId].playerId;

    const activePasses = [...passSet[roomId]];
    const needed = activeIds.length - 1;

    // Count passes excluding the last player (they don't need to pass)
    const passCountExLast = activePasses.filter(id => id !== lastPlayerId && activeIds.includes(id)).length;

    if (passCountExLast >= needed) {
      // Clear trick
      lastPlay[roomId] = null;
      passSet[roomId] = new Set();
      tablePlays[roomId] = [];

      io.to(roomId).emit('updateTable', []); // clear UI table

      // Turn goes to last player who played
      currentTurn[roomId] = lastPlayerId;
      emitTurn(roomId);
      return;
    }

    // Otherwise advance turn normally
    advanceTurn(roomId, socket.id);
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const gameType = socket.gameType;

    if (!roomId) return;

    // Handle Chinese Poker disconnection
    if (gameType === 'chinesePoker' && rooms[roomId]) {
      // If player was in active game and it was their turn, advance turn
      const wasActiveTurn = started[roomId] && currentTurn[roomId] === socket.id;
      
      rooms[roomId] = rooms[roomId].filter(p => p.socket.id !== socket.id);
      if (inGame[roomId]) inGame[roomId] = inGame[roomId].filter(id => id !== socket.id);
      if (waitingRoom[roomId]) waitingRoom[roomId] = waitingRoom[roomId].filter(id => id !== socket.id);
      if (ready[roomId]) delete ready[roomId][socket.id];
      if (hands[roomId]) delete hands[roomId][socket.id];
      
      // Broadcast disconnection to remaining players so they can clean up feeds
      io.to(roomId).emit('playerDisconnected', { socketId: socket.id });
      
      // Auto-advance turn if it was disconnected player's turn
      if (wasActiveTurn && inGame[roomId] && inGame[roomId].length > 0) {
        currentTurn[roomId] = inGame[roomId][0]; // Move to first remaining player
        emitTurn(roomId);
      }

      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        delete ready[roomId];
        delete hands[roomId];
        delete started[roomId];
        delete inGame[roomId];
        delete waitingRoom[roomId];
      delete currentTurn[roomId];
      delete lastPlay[roomId];
      delete passSet[roomId];
      delete tablePlays[roomId];
      delete discards[roomId];
      return;
    }

    io.to(roomId).emit('updatePlayers', rooms[roomId].map(p => ({
      name: p.name,
      ready: !!ready[roomId]?.[p.socket.id]
    })));
    // Update waiting list after disconnect
    const waiting = (waitingRoom[roomId] || []).map(sid => {
      const p = rooms[roomId].find(pl => pl.socket.id === sid);
      return p ? { socketId: p.socket.id, name: p.name } : null;
    }).filter(x => x);
    io.to(roomId).emit('waitingList', waiting);
    }
    // Handle Texas Hold 'Em disconnection: the player folds and their chips stay in the pot
    else if (gameType === 'texasHoldEm' && holdEmPlayerData[roomId]) {
      delete holdEmPlayerData[roomId][socket.id];
      if (holdEmBustedPlayers[roomId]) holdEmBustedPlayers[roomId].delete(socket.id);
      io.to(roomId).emit('playerDisconnected', { socketId: socket.id });

      const game = holdEmGames[roomId];
      if (game) {
        processHoldEmResult(roomId, texasHoldEmEngine.removePlayer(game, socket.id));
      }

      // Clean up room if empty
      if (Object.keys(holdEmPlayerData[roomId]).length === 0) {
        if (game) {
          clearTimeout(game.runOutTimer);
          clearTimeout(game.nextHandTimer);
        }
        delete holdEmGames[roomId];
        delete holdEmPlayerData[roomId];
        delete holdEmBustedPlayers[roomId];
        delete roomGameTypes[roomId];
      }
    }
  });

  /* ===============================
     CHAT MESSAGING
  ================================ */
  socket.on("chatMessage", ({ playerName, message, roomId }) => {
    if (!roomId || !message || !message.trim()) return;
    
    // Parse @mentions and notify mentioned players
    const mentionPattern = /@(\w+)/g;
    let match;
    const mentionedPlayers = new Set();
    
    while ((match = mentionPattern.exec(message)) !== null) {
      const mentionedName = match[1];
      mentionedPlayers.add(mentionedName);
    }
    
    // Send mention alerts to mentioned players
    if (mentionedPlayers.size > 0) {
      const playersInRoom = rooms[roomId] || [];
      playersInRoom.forEach(p => {
        if (mentionedPlayers.has(p.name)) {
          p.socket.emit('mentionAlert', { mentioner: playerName, message: message.trim() });
        }
      });
    }
    
    // Broadcast chat message to all players
    io.to(roomId).emit("chatMessage", { playerName, message: message.trim() });
  });
});

/* ===============================
   TEXAS HOLD 'EM GAME FLOW
================================ */
const HOLDEM_BUY_IN = { minBuyIn: 1.00, maxBuyIn: 1000.00, suggestedBuyIn: 10.00 };
const HOLDEM_STEP_DELAY = 3000; // ms between run-out streets, and between hands
const HOLDEM_MAX_SEATS = 9;     // seats around the table (the seat layout fits up to 9)
const HOLDEM_SHOWDOWN_DELAY = 5000;      // ms everyone's cards stay face up after a showdown
const HOLDEM_SHOW_DECISION_TIME = 6000;  // ms a fold-win winner has to choose Show or Muck
const HOLDEM_SHOWN_CARDS_DELAY = 5000;   // ms a winner's shown cards stay face up
const HOLDEM_MUCK_DELAY = 1500;          // ms before the next deal after a muck

function holdEmStatePayload(game) {
  return {
    state: game.state,
    pot: game.pot,
    communityCards: game.communityCards,
    currentBettor: game.currentBettor,
    highestBet: game.highestBet,
    minRaiseTo: texasHoldEmEngine.getMinRaiseTo(game),
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    dealerId: game.players[game.dealerButton]?.id || null,
    smallBlindId: game.players[game.smallBlindPos]?.id || null,
    bigBlindId: game.players[game.bigBlindPos]?.id || null,
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      currentBet: p.currentBet,
      folded: game.foldedPlayers.has(p.id),
      allIn: game.allInPlayers.has(p.id),
      lastAction: (game.lastActions && game.lastActions[p.id]) || ''
    }))
  };
}

function broadcastHoldEmState(roomId, event = 'gameStateUpdated') {
  const game = holdEmGames[roomId];
  if (game) io.to(roomId).emit(event, holdEmStatePayload(game));
}

/** Lobby list: everyone who has bought in and still has chips */
function broadcastHoldEmLobby(roomId) {
  const players = Object.values(holdEmPlayerData[roomId] || {})
    .filter(p => p.stack > 0)
    .map(p => ({ id: p.socket.id, name: p.name, ready: p.ready, stack: p.stack }));
  io.to(roomId).emit('playersUpdated', players);
}

/**
 * React to what the engine returned after an action, a new hand, or a player leaving.
 */
function processHoldEmResult(roomId, result) {
  const game = holdEmGames[roomId];
  if (!game || !result || result.error) return;

  broadcastHoldEmState(roomId);
  if (result.handComplete) {
    finishHoldEmHand(roomId, result.handComplete);
  } else if (result.autoAdvanceNeeded) {
    runOutHoldEmBoard(roomId);
  }
}

/** Nobody can bet any more: deal the remaining streets every few seconds, then show down. */
function runOutHoldEmBoard(roomId) {
  const game = holdEmGames[roomId];
  const stillThisHand = () => holdEmGames[roomId] === game && game.handInProgress;

  const step = () => {
    if (!stillThisHand()) return;
    const boardComplete = texasHoldEmEngine.autoAdvanceOneStreet(game);
    broadcastHoldEmState(roomId);
    if (boardComplete) {
      game.runOutTimer = setTimeout(() => {
        if (!stillThisHand()) return;
        finishHoldEmHand(roomId, texasHoldEmEngine.determineWinner(game));
      }, HOLDEM_STEP_DELAY);
    } else {
      game.runOutTimer = setTimeout(step, HOLDEM_STEP_DELAY);
    }
  };
  clearTimeout(game.runOutTimer);

  // Betting is over: turn every remaining player's cards face up before the
  // rest of the board is dealt
  const hands = game.players
    .filter(p => !game.foldedPlayers.has(p.id) && game.playerHands[p.id])
    .map(p => ({ id: p.id, name: p.name, cards: game.playerHands[p.id] }));
  io.to(roomId).emit('showdownReveal', { hands });

  game.runOutTimer = setTimeout(step, HOLDEM_STEP_DELAY);
}

/** Announce the result, save stacks, handle busted players, and queue the next hand. */
function finishHoldEmHand(roomId, result) {
  const game = holdEmGames[roomId];
  const data = holdEmPlayerData[roomId] || {};
  if (!game) return;
  clearTimeout(game.runOutTimer);
  writeHandHistory(roomId, game);

  io.to(roomId).emit('handComplete', {
    winners: result.winners,
    winnerNames: result.winnerNames,
    pot: result.pot,
    method: result.method,
    allHands: result.allHands,
    shownHands: result.shownHands || [], // showdown: everyone's cards face up
    sidePotDistribution: result.sidePotDistribution,
    winnings: result.winnings,
    winnerSummary: result.winnerSummary || []
  });

  for (const player of game.players) {
    const playerData = data[player.id];
    if (!playerData) continue; // left during the hand
    playerData.stack = player.stack; // carry the stack into the next hand

    if (player.stack <= 0) {
      playerData.status = 'busted';
      playerData.ready = false;
      holdEmBustedPlayers[roomId] = holdEmBustedPlayers[roomId] || new Set();
      holdEmBustedPlayers[roomId].add(player.id);
      playerData.socket.emit('youBusted', {
        bustedAmount: game.startingStacks[player.id] || 0, // what they lost this hand
        minRebuy: HOLDEM_BUY_IN.minBuyIn,
        maxRebuy: HOLDEM_BUY_IN.maxBuyIn,
        suggestedRebuy: HOLDEM_BUY_IN.suggestedBuyIn
      });
    }
  }

  // Everyone else folded: the winner may show or muck their cards
  const winnerId = result.method === 'fold' ? result.winners[0] : null;
  if (winnerId && data[winnerId]) {
    game.showOffer = { playerId: winnerId };
    data[winnerId].socket.emit('offerShowCards', { decisionSeconds: HOLDEM_SHOW_DECISION_TIME / 1000 });
    scheduleNextHoldEmHand(roomId, HOLDEM_SHOW_DECISION_TIME); // no answer = muck
  } else {
    game.showOffer = null;
    scheduleNextHoldEmHand(roomId, result.method === 'showdown' ? HOLDEM_SHOWDOWN_DELAY : HOLDEM_STEP_DELAY);
  }
}

/** (Re)start the countdown to the next deal. */
function scheduleNextHoldEmHand(roomId, delay) {
  const game = holdEmGames[roomId];
  if (!game) return;
  clearTimeout(game.nextHandTimer);
  game.nextHandTimer = setTimeout(() => {
    game.nextHandTimer = null;
    game.showOffer = null;
    startNextHoldEmHand(roomId);
  }, delay);
}

/**
 * Deal a new hand to everyone who is ready and has chips. Current players keep
 * their seats; newcomers, rebuys and rejoins are seated after them.
 */
function startNextHoldEmHand(roomId) {
  const game = holdEmGames[roomId];
  const data = holdEmPlayerData[roomId];
  if (!game || !data || game.handInProgress) return;

  const canPlay = id => {
    const p = data[id];
    return p && p.ready && p.status === 'active' && p.stack > 0;
  };
  const seatIds = game.players.map(p => p.id).filter(canPlay).slice(0, HOLDEM_MAX_SEATS);
  for (const id of Object.keys(data)) {
    if (seatIds.includes(id) || !canPlay(id)) continue;
    if (seatIds.length < HOLDEM_MAX_SEATS) {
      seatIds.push(id);
      data[id].toldTableFull = false;
    } else if (!data[id].toldTableFull) {
      // Table is full: they stay bought in and get the next free seat
      data[id].toldTableFull = true;
      data[id].socket.emit('errorMessage',
        `The table is full (${HOLDEM_MAX_SEATS} players). You'll be dealt in when a seat opens.`);
    }
  }

  if (seatIds.length < 2) {
    game.state = 'waiting';
    if (game.handsPlayed > 0) {
      io.to(roomId).emit('waitingForRebuys', {
        activePlayers: seatIds.map(id => ({ id, name: data[id].name, stack: data[id].stack })),
        bustOut: Array.from(holdEmBustedPlayers[roomId] || [])
          .filter(id => data[id])
          .map(id => ({ id, name: data[id].name }))
      });
    }
    return;
  }

  const seatingChanged = game.players.map(p => p.id).join(',') !== seatIds.join(',');
  game.players = seatIds.map(id => ({ id, name: data[id].name, stack: data[id].stack, currentBet: 0 }));
  const result = texasHoldEmEngine.startNewHand(game);
  const isFirstHand = !game.handsPlayed;
  game.handsPlayed = (game.handsPlayed || 0) + 1;

  const seats = game.players.map(p => ({ id: p.id, name: p.name, stack: p.stack }));
  if (isFirstHand || seatingChanged) {
    // (Re)draw the seats around the table
    io.to(roomId).emit('gameStarted', {
      players: seats,
      blinds: { small: game.smallBlind, big: game.bigBlind },
      dealerButton: game.dealerButton
    });
  }
  if (!isFirstHand) {
    io.to(roomId).emit('newHandStarted', { pot: game.pot, players: seats });
  }

  for (const player of game.players) {
    const playerSocket = data[player.id]?.socket;
    if (playerSocket) {
      playerSocket.emit('dealCards', { holeCards: game.playerHands[player.id] });
    }
  }

  broadcastHoldEmState(roomId, 'gameState');
  if (result.autoAdvanceNeeded) runOutHoldEmBoard(roomId);
}

/* ===============================
   HOLD'EM HAND HISTORY
   Every finished hand is appended to logs/holdem-hands-YYYY-MM-DD.log
================================ */
const HAND_LOG_DIR = process.env.HAND_LOG_DIR || path.join(__dirname, '..', 'logs');
// On Render (which sets RENDER=true) print each full hand to the server output too,
// so it can be copied from the Render dashboard's Logs tab
const HAND_LOG_TO_CONSOLE = !!(process.env.RENDER || process.env.HAND_LOG_TO_CONSOLE);

function localStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  };
}

function appendHandLog(text) {
  if (HAND_LOG_TO_CONSOLE) console.log(text.trimEnd());
  const { day } = localStamp();
  fs.mkdir(HAND_LOG_DIR, { recursive: true }, (dirErr) => {
    if (dirErr) return console.error('Hand history: could not create logs folder', dirErr.message);
    fs.appendFile(path.join(HAND_LOG_DIR, `holdem-hands-${day}.log`), text, (err) => {
      if (err) console.error('Hand history: could not write', err.message);
    });
  });
}

function writeHandHistory(roomId, game) {
  if (!game.handLog || game.handLogWritten === game.handNumber) return;
  game.handLogWritten = game.handNumber;
  const { day, time } = localStamp();
  const header = `===== Hand #${game.handNumber}  ${day} ${time}  (room ${roomId}) =====`;
  appendHandLog([header, ...game.handLog, ''].join('\n') + '\n');
  if (!HAND_LOG_TO_CONSOLE) console.log(`📝 Hand #${game.handNumber} saved to hand history`);
}

/** Give a busted/watching player a new stack; they're dealt in from the next hand. */
function seatHoldEmPlayerForNextHand(roomId, socketId, amount) {
  const playerData = holdEmPlayerData[roomId][socketId];
  playerData.stack = amount;
  playerData.status = 'active';
  playerData.ready = true;
  if (holdEmBustedPlayers[roomId]) holdEmBustedPlayers[roomId].delete(socketId);
}

/** If the game stopped for lack of players, start again now that someone is back. */
function resumeHoldEmIfPaused(roomId) {
  const game = holdEmGames[roomId];
  if (game && game.handsPlayed > 0 && !game.handInProgress && !game.nextHandTimer) {
    startNextHoldEmHand(roomId);
  }
}

function advanceTurn(roomId, fromSocketId) {
  const activeIds = inGame[roomId] || [];
  const idx = activeIds.indexOf(fromSocketId);
  if (idx === -1) return;

  // next active player to the left (ready order)
  const nextId = activeIds[(idx + 1) % activeIds.length];
  currentTurn[roomId] = nextId;
  emitTurn(roomId);
}

/* ===============================
   START SERVER
================================ */
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
