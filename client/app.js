const socket = io();

/* ===============================
   SOCKET ID + TURN STATE
================================ */
let mySocketId = null;
let lastTurnPlayerId = null;
let playerStatus = 'loading'; // 'active' or 'waiting'
let myOwnStats = null; // Store own stats
let currentGameState = null; // Store current game state for betting validation
let foldedPlayersThisHand = new Set(); // Track which players have folded in current hand

socket.on('connect', () => {
  mySocketId = socket.id;
  console.log("My socket id:", mySocketId);
  
  // If we have joined a room before and the game is active, rejoin on reconnect
  if (roomId && playerName && gameDiv.style.display === 'block') {
    console.log('🔄 Rejoining room after reconnect:', roomId);
    // Same game as before (without gameType the server assumed Chinese Poker)
    socket.emit('joinRoom', { playerName, roomId, gameType: selectedGame,
      holdemMode: window.holdemChipMode ? 'sng' : 'cash' });
  }
});

/* ===============================
   BASIC SOCKET FEEDBACK
================================ */
socket.on('errorMessage', (msg) => {
  alert(msg);
});

socket.on('playerStatus', ({ status, queuePosition, stats }) => {
  playerStatus = status;
  console.log(`Player status: ${status}${queuePosition > 0 ? ' (queue position: ' + queuePosition + ')' : ''}`);
  
  // Show/hide Ready button based on status
  if (status === 'active') {
    readyBtn.style.display = 'inline-block';
  } else if (status === 'waiting') {
    readyBtn.style.display = 'none';
  }

  updateInGameHeaderVisibility();
  
  // Store stats
  if (stats) {
    myOwnStats = stats;
  }
});

socket.on('playAccepted', ({ playedCards }) => {
  // Remove played cards from DOM while preserving hand arrangement
  const cardEls = Array.from(playerHandDiv.querySelectorAll('.card'));
  const toRemove = [];
  
  cardEls.forEach((el, idx) => {
    if (idx < playerCards.length) {
      const card = playerCards[idx];
      if (playedCards.some(p => p.rank === card.rank && p.suit === card.suit)) {
        toRemove.push(el);
      }
    }
  });
  
  // Remove the card elements
  toRemove.forEach(el => el.remove());
  
  // Update playerCards array
  playerCards = playerCards.filter(c =>
    !playedCards.some(p => p.rank === c.rank && p.suit === c.suit)
  );
});

socket.on('gameOver', ({ winner, loser, mySocketId }) => {
  showWinnerDisplay(winner, loser, mySocketId);
});

socket.on('handRevealed', ({ socketId, playerName, cards }) => {
  displayRevealedHand(socketId, playerName, cards);
});

socket.on('clearReveals', () => {
  const revealsContainer = document.getElementById('revealsContainer');
  if (revealsContainer) revealsContainer.remove();
});

let powerTakenTimeout = null;

socket.on('powerTaken', ({ playerId, playerName, cards, card }) => {
  console.log('🎯 Power taken received:', { playerId, playerName, cards, card });
  hasPowerLead = Boolean(mySocketId && playerId === mySocketId);
  // Support both 'cards' (full hand) and 'card' (single card for backwards compatibility)
  const cardsToShow = cards || [card] || [{ rank: '2', suit: 'D' }];
  console.log('Cards to display:', cardsToShow, 'Array?', Array.isArray(cardsToShow));
  showPowerTakenBanner(playerName, cardsToShow);
});

function showPowerTakenBanner(playerName, cards) {
  console.log('Creating power taken banner for:', playerName, 'with cards:', cards);
  const existing = document.getElementById('powerTakenBanner');
  if (existing) existing.remove();
  if (powerTakenTimeout) {
    clearTimeout(powerTakenTimeout);
    powerTakenTimeout = null;
  }

  const banner = document.createElement('div');
  banner.id = 'powerTakenBanner';
  banner.className = 'power-taken-banner';

  const message = document.createElement('div');
  message.className = 'power-taken-message';
  message.textContent = `${playerName || 'A player'} has taken power`;

  // Create container for cards
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'power-taken-cards-container';
  
  // Handle both single card and array of cards
  const cardsArray = Array.isArray(cards) ? cards : [cards];
  console.log('cardsArray:', cardsArray, 'length:', cardsArray.length);
  
  cardsArray.forEach((card, idx) => {
    console.log(`Adding card ${idx}:`, card);
    const cardImage = document.createElement('img');
    cardImage.className = 'power-taken-card';
    cardImage.src = `/cards/${cardFileName(card)}`;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardsContainer.appendChild(cardImage);
  });

  banner.appendChild(message);
  banner.appendChild(cardsContainer);
  document.body.appendChild(banner);

  requestAnimationFrame(() => banner.classList.add('visible'));

  powerTakenTimeout = setTimeout(() => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 220);
    powerTakenTimeout = null;
  }, 3000);
}

/* ===============================
   WINNER DISPLAY
================================ */
function showWinnerDisplay(winner, loser, winnerSocketId) {
  // Hide action buttons at game end
  bustBtn.style.display = 'none';
  passBtn.style.display = 'none';
  if (turnIndicator) {
    turnIndicator.style.display = 'none';
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'winnerOverlay';
  
  // Create winner banner
  const banner = document.createElement('div');
  banner.id = 'winnerBanner';
  
  const trophy = document.createElement('div');
  trophy.id = 'trophy';
  trophy.textContent = '🏆';
  
  const text = document.createElement('h1');
  text.textContent = `${winner} wins!`;
  
  const subtext = document.createElement('p');
  if (loser) {
    subtext.textContent = `${loser} sent to waiting room`;
  } else {
    subtext.textContent = 'Congratulations!';
  }
  
  banner.appendChild(trophy);
  banner.appendChild(text);
  banner.appendChild(subtext);
  
  overlay.appendChild(banner);
  document.body.appendChild(overlay);
  
  // Trigger animation
  setTimeout(() => overlay.classList.add('active'), 10);
  
  // Show reveal prompt for non-winners
  if (mySocketId !== winnerSocketId && playerCards.length > 0) {
    setTimeout(() => showRevealPrompt(), 1000);
  }
  
  // Remove winner overlay after 4 seconds (keep reveals until next deal)
  setTimeout(() => {
    overlay.remove();
  }, 4000);
}

function showRevealPrompt() {
  const prompt = document.createElement('div');
  prompt.id = 'revealPrompt';
  prompt.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    padding: 30px;
    border-radius: 15px;
    border: 2px solid #ffd700;
    z-index: 10001;
    text-align: center;
  `;
  
  const title = document.createElement('h2');
  title.textContent = 'Reveal Hand?';
  title.style.cssText = 'color: white; margin: 0 0 20px 0;';
  
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; gap: 15px; justify-content: center;';
  
  const yesBtn = document.createElement('button');
  yesBtn.textContent = 'Yes';
  yesBtn.style.cssText = `
    padding: 10px 30px;
    font-size: 18px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  `;
  yesBtn.onclick = () => {
    socket.emit('revealHand');
    prompt.remove();
  };
  
  const noBtn = document.createElement('button');
  noBtn.textContent = 'No';
  noBtn.style.cssText = `
    padding: 10px 30px;
    font-size: 18px;
    background: #f44336;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  `;
  noBtn.onclick = () => prompt.remove();
  
  btnContainer.appendChild(yesBtn);
  btnContainer.appendChild(noBtn);
  prompt.appendChild(title);
  prompt.appendChild(btnContainer);
  document.body.appendChild(prompt);
}

function displayRevealedHand(socketId, playerName, cards) {
  console.log(`Displaying revealed hand for ${playerName} (${socketId})`);
  
  // Remove existing reveal for this player
  const existing = document.getElementById(`reveal-${socketId}`);
  if (existing) {
    console.log(`Removing existing reveal for ${playerName}`);
    existing.remove();
  }
  
  const revealContainer = document.createElement('div');
  revealContainer.id = `reveal-${socketId}`;
  revealContainer.className = 'revealed-hand';
  revealContainer.style.cssText = 'background: rgba(0, 0, 0, 0.8); padding: 15px; border-radius: 10px; border: 2px solid #ffd700; margin-bottom: 10px; position: relative;';
  
  const label = document.createElement('div');
  label.textContent = `${playerName}'s remaining hand:`;
  label.style.cssText = 'color: white; font-weight: bold; margin-bottom: 10px; font-size: 16px;';
  
  const cardsDiv = document.createElement('div');
  cardsDiv.style.cssText = 'display: flex; gap: 5px; flex-wrap: wrap;';
  
  const sortedCards = sortCards([...cards]);
  sortedCards.forEach(card => {
    const cardWrapper = document.createElement('div');
    cardWrapper.style.cssText = 'width: 60px; height: 90px; border-radius: 5px; background: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
    
    const cardEl = document.createElement('img');
    cardEl.src = `/cards/${cardFileName(card)}`;
    cardEl.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 5px;';
    
    cardWrapper.appendChild(cardEl);
    cardsDiv.appendChild(cardWrapper);
  });
  
  revealContainer.appendChild(label);
  revealContainer.appendChild(cardsDiv);
  
  // Add to a container for all reveals
  let revealsContainer = document.getElementById('revealsContainer');
  if (!revealsContainer) {
    console.log('Creating new revealsContainer');
    revealsContainer = document.createElement('div');
    revealsContainer.id = 'revealsContainer';
    revealsContainer.style.cssText = `
      position: fixed;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      max-width: 90%;
      max-height: 60vh;
      overflow-y: auto;
      z-index: 9999;
      padding: 10px;
    `;
    document.body.appendChild(revealsContainer);
  } else {
    console.log(`Found existing revealsContainer with ${revealsContainer.children.length} children`);
  }
  
  revealsContainer.appendChild(revealContainer);
  console.log(`Added reveal. Container now has ${revealsContainer.children.length} children`);
}

/* ===============================
   RESET GAME
================================ */
function resetGame() {
  // Clear revealed hands
  const revealsContainer = document.getElementById('revealsContainer');
  if (revealsContainer) revealsContainer.remove();
  
  // Clear player hand and table
  playerCards = [];
  playerHandDiv.innerHTML = '';
  tableArea.innerHTML = '';
  
  // Hide and clear discard card (only clear the image, not the structure)
  const cardImageDiv = document.getElementById('discardCardImage');
  const discardDiv = document.getElementById('discardCardDiv');
  if (cardImageDiv) {
    cardImageDiv.innerHTML = '';
  }
  if (discardDiv) {
    discardDiv.style.display = 'none';
  }

  const powerBanner = document.getElementById('powerTakenBanner');
  if (powerBanner) {
    powerBanner.remove();
  }
  if (powerTakenTimeout) {
    clearTimeout(powerTakenTimeout);
    powerTakenTimeout = null;
  }
  
  // Reset buttons
  bustBtn.style.display = 'none';
  passBtn.style.display = 'none';
  
  // Hide turn indicator
  if (turnIndicator) {
    turnIndicator.style.display = 'none';
  }
  
  // Reset turn state
  lastTurnPlayerId = null;
  isMyTurn = false;
  currentTrickCardCount = null;
  hasPowerLead = false;
}

/* ===============================
   DOM ELEMENTS
================================ */
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');
const joinBtn = document.getElementById('joinBtn');
const readyBtn = document.getElementById('readyBtn');
const bustBtn = document.getElementById('bustBtn');
const passBtn = document.getElementById('passBtn');
const playerHandDiv = document.getElementById('playerHand');
const tableArea = document.getElementById('tableArea');

// These may not exist depending on your HTML — keep safe:
const playersArea = document.getElementById('playersArea');
const roomLabel = document.getElementById('roomLabel');
const sceneSelectInGame = document.getElementById('sceneSelectInGame');
const deckSelectInGame = document.getElementById('deckSelectInGame');
const inGameHeader = document.getElementById('inGameHeader');

function updateInGameHeaderVisibility() {
  if (!inGameHeader) return;

  const gameVisible = gameDiv && gameDiv.style.display !== 'none';
  const betweenGames = playerStatus === 'active' && readyBtn.style.display !== 'none';
  inGameHeader.style.display = (gameVisible && betweenGames) ? 'flex' : 'none';
}

/* ===============================
   TURN INDICATOR (create if missing)
================================ */
let turnIndicator = document.getElementById('turnIndicator');
if (!turnIndicator) {
  turnIndicator = document.createElement('div');
  turnIndicator.id = 'turnIndicator';
  turnIndicator.style.position = 'fixed';
  turnIndicator.style.left = '50%';
  turnIndicator.style.top = '20px';
  turnIndicator.style.transform = 'translateX(-50%)';
  turnIndicator.style.padding = '10px 18px';
  turnIndicator.style.background = 'rgba(0,0,0,0.65)';
  turnIndicator.style.borderRadius = '12px';
  turnIndicator.style.fontSize = '22px';
  turnIndicator.style.fontWeight = '800';
  turnIndicator.style.letterSpacing = '1px';
  turnIndicator.style.display = 'none';
  turnIndicator.style.zIndex = '2000';
  document.body.appendChild(turnIndicator);
}

/* ===============================
   GAME STATE
================================ */
let playerName, roomId, playerCards = [];
let draggingEl = null;
let placeholder = null;
let selectedScene = 'vampire-bar'; // default scene
let selectedDeck = '1'; // default deck
let selectedGame = 'chinesePoker'; // default game ('chinesePoker' or 'texasHoldEm')
let holdemMode = 'cash'; // Texas Hold 'Em: 'cash' or 'sng' (Sit 'N Go)
let isMyTurn = false;
let currentTrickCardCount = null;
let hasPowerLead = false;

/* ===============================
   CHAT & PLAYER LIST STATE
================================ */
let chatMessagesList = []; // array of { playerName, message, timestamp }
let playerListData = []; // array of player objects with stats
let waitingPlayers = []; // array of waiting players { socketId, name }
let activePlayers = []; // socketIds of active players
let currentPlayerId = null; // socketId of player whose turn it is

// Make playerListData globally accessible for enhancements
window.playerListData = playerListData;

const SCENE_BACKGROUNDS = {
  'vampire-bar': '/images/table_background.png',
  'high-roller': '/images/table_background1.png',
  'beach-party': '/images/table_background2.png',
  'japanese-temple': '/images/table_background3.png',
  'gsu-tailgate': '/images/table_background4.png'
};

function applyScene(scene) {
  if (!SCENE_BACKGROUNDS[scene]) return;
  selectedScene = scene;
  tableArea.style.backgroundImage = `url('${SCENE_BACKGROUNDS[scene]}')`;
  if (sceneSelectInGame && sceneSelectInGame.value !== scene) {
    sceneSelectInGame.value = scene;
  }
}

function applyDeck(deckNumber) {
  const normalizedDeck = String(deckNumber);
  if (normalizedDeck !== '1' && normalizedDeck !== '2') return;
  selectedDeck = normalizedDeck;
  if (deckSelectInGame && deckSelectInGame.value !== normalizedDeck) {
    deckSelectInGame.value = normalizedDeck;
  }
}

function initializeInGameOptions() {
  if (sceneSelectInGame) {
    sceneSelectInGame.value = selectedScene;
    if (!sceneSelectInGame.dataset.bound) {
      sceneSelectInGame.addEventListener('change', () => {
        applyScene(sceneSelectInGame.value);
      });
      sceneSelectInGame.dataset.bound = 'true';
    }
  }

  if (deckSelectInGame) {
    deckSelectInGame.value = selectedDeck;
    if (!deckSelectInGame.dataset.bound) {
      deckSelectInGame.addEventListener('change', () => {
        applyDeck(deckSelectInGame.value);
      });
      deckSelectInGame.dataset.bound = 'true';
    }
  }
}

/* ===============================
   CARD FILENAME HELPER
================================ */
function cardFileName(card) {
    const rankMap = {
        'J': 'jack',
        'Q': 'queen',
        'K': 'king',
        'A': 'ace'
    };
    
    const suitMap = {
        'C': 'clubs',
        'S': 'spades',
        'H': 'hearts',
        'D': 'diamonds'
    };
    
    const rank = rankMap[card.rank] || card.rank;
    const suit = suitMap[card.suit];
    
    return `${rank}_of_${suit}.png`;
}

/* ===============================
   JOIN ROOM
================================ */
joinBtn.addEventListener('click', () => {
    playerName = document.getElementById('playerName').value.trim();
    if (!playerName) return alert("Enter your name");

    // Show game selection
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const gameSelectOverlay = document.getElementById('gameSelectOverlay');
    
    lobbyOverlay.style.display = 'none';
    gameSelectOverlay.style.display = 'flex';
});

/* ===============================
   GAME SELECTION
================================ */
const chinesePokerBtn = document.getElementById('chinesePokerBtn');
const texasHoldEmBtn = document.getElementById('texasHoldEmBtn');

chinesePokerBtn.addEventListener('click', () => {
    selectedGame = 'chinesePoker';
    showSceneSelection();
});

texasHoldEmBtn.addEventListener('click', () => {
    selectedGame = 'texasHoldEm';
    // Next: Cash Game or Sit 'N Go
    document.getElementById('gameSelectOverlay').style.display = 'none';
    document.getElementById('holdemModeOverlay').style.display = 'flex';
});

document.getElementById('cashGameBtn').addEventListener('click', () => {
    holdemMode = 'cash';
    document.getElementById('holdemModeOverlay').style.display = 'none';
    showSceneSelection();
});

document.getElementById('sitAndGoBtn').addEventListener('click', () => {
    holdemMode = 'sng';
    document.getElementById('holdemModeOverlay').style.display = 'none';
    showSceneSelection();
});

document.getElementById('holdemModeBackBtn').addEventListener('click', () => {
    document.getElementById('holdemModeOverlay').style.display = 'none';
    document.getElementById('gameSelectOverlay').style.display = 'flex';
});

function showSceneSelection() {
  document.getElementById('gameSelectOverlay').style.display = 'none';
  document.getElementById('sceneOverlay').style.display = 'flex';
}

/* ===============================
   SCENE SELECTION
================================ */
const vampireBarBtn = document.getElementById('vampireBarBtn');
const highRollerBtn = document.getElementById('highRollerBtn');

vampireBarBtn.addEventListener('click', () => {
    selectedScene = 'vampire-bar';
    showDeckSelection();
});

highRollerBtn.addEventListener('click', () => {
    selectedScene = 'high-roller';
    showDeckSelection();
});

const beachPartyBtn = document.getElementById('beachPartyBtn');
const templeBtn = document.getElementById('templeBtn');
const tailgateBtn = document.getElementById('tailgateBtn');

beachPartyBtn.addEventListener('click', () => {
  selectedScene = 'beach-party';
  showDeckSelection();
});

templeBtn.addEventListener('click', () => {
  selectedScene = 'japanese-temple';
  showDeckSelection();
});

tailgateBtn.addEventListener('click', () => {
  selectedScene = 'gsu-tailgate';
  showDeckSelection();
});

function showDeckSelection() {
  document.getElementById('sceneOverlay').style.display = 'none';
  document.getElementById('deckOverlay').style.display = 'flex';
}

// Handle deck selection
const deckButtons = document.querySelectorAll('.deckBtn');
deckButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const deckNumber = btn.getAttribute('data-deck');
    applyDeck(deckNumber);
    startGame(selectedScene);
  });
});

function startGame(scene) {
    // A Sit 'N Go has its own room, so it never mixes with the cash game
    const isSitAndGo = selectedGame === 'texasHoldEm' && holdemMode === 'sng';
    const defaultRoomId = isSitAndGo ? 'sitAndGoRoom' : 'mainRoom';
    roomId = defaultRoomId;
    setHoldemChipMode(isSitAndGo);
    
    socket.emit('joinRoom', { playerName, roomId: defaultRoomId, gameType: selectedGame,
      holdemMode: isSitAndGo ? 'sng' : 'cash' });

    applyScene(scene);
    initializeInGameOptions();

    // Hide lobby and show game
    document.getElementById('lobby').style.display = 'none';
    gameDiv.style.display = 'block';
    if (roomLabel) roomLabel.textContent = isSitAndGo ? "Sit 'N Go" : 'Main Game';
    updateInGameHeaderVisibility();
    
    // Initialize game-specific UI
    // (the texas-holdem class hides the Chinese Poker chat and player panels)
    document.body.classList.toggle('texas-holdem', selectedGame === 'texasHoldEm');
    document.body.classList.toggle('holdem-sng', isSitAndGo);
    if (selectedGame === 'texasHoldEm') {
      initializeTexasHoldEmUI();
    }
}

/* ===============================
   CHAT & PLAYER LIST UI
================================ */
const chatInputEl = document.getElementById('chatInput');
const chatMessagesEl = document.getElementById('chatMessages');
const chatSendBtnEl = document.getElementById('chatSendBtn');
const playerListContentEl = document.getElementById('playerListContent');

// Chat input handler
if (chatSendBtnEl) {
  chatSendBtnEl.addEventListener('click', sendChatMessage);
  if (chatInputEl) {
    chatInputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }
}

function sendChatMessage() {
  if (!chatInputEl || !chatInputEl.value.trim()) return;
  
  const message = chatInputEl.value.trim();
  socket.emit('chatMessage', { playerName, message, roomId });
  chatInputEl.value = '';
  chatInputEl.focus();
}

function displayChatMessage(playerName, message) {
  if (!chatMessagesEl) return;
  
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message';
  
  const nameEl = document.createElement('div');
  nameEl.className = 'chat-message-name';
  nameEl.textContent = playerName;
  
  const textEl = document.createElement('div');
  textEl.className = 'chat-message-text';
  textEl.textContent = message;
  
  msgEl.appendChild(nameEl);
  msgEl.appendChild(textEl);
  chatMessagesEl.appendChild(msgEl);
  
  // Auto-scroll to bottom
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updatePlayerList(players, currentTurn) {
  if (!playerListContentEl) return;
  
  playerListContentEl.innerHTML = '';
  
  if (!Array.isArray(players)) return;
  
  players.forEach((player, index) => {
    const playerEl = document.createElement('div');
    playerEl.className = 'player-item';
    
    if (player.socketId === currentTurn) {
      playerEl.classList.add('active-turn');
    }
    
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.innerHTML = `${player.name} <span class="play-order-badge">${['1st', '2nd', '3rd', '4th'][index]}</span>`;
    
    // Apply custom player color if available
    if (window.getPlayerColor) {
      const color = window.getPlayerColor(player.name);
      nameEl.style.color = color;
      const badgeEl = nameEl.querySelector('.play-order-badge');
      if (badgeEl) {
        badgeEl.style.background = color;
      }
    }
    
    const statsEl = document.createElement('div');
    statsEl.className = 'player-stats';
    
    const winPercent = player.gamesPlayed > 0 
      ? Math.round((player.wins / player.gamesPlayed) * 100) 
      : 0;
    
    statsEl.innerHTML = `
      <div class="player-stat-item"><span class="player-stat-label">Cards:</span><span class="player-stat-value">${player.cardsRemaining || 0}</span></div>
      <div class="player-stat-item"><span class="player-stat-label">Wins:</span><span class="player-stat-value">${player.wins || 0}</span></div>
      <div class="player-stat-item"><span class="player-stat-label">Games:</span><span class="player-stat-value">${player.gamesPlayed || 0}</span></div>
      <div class="player-stat-item"><span class="player-stat-label">Win%:</span><span class="player-stat-value">${winPercent}%</span></div>
    `;
    
    playerEl.appendChild(nameEl);
    playerEl.appendChild(statsEl);
    playerListContentEl.appendChild(playerEl);
  });
}

/* ===============================
   SOCKET HANDLERS: CHAT & PLAYER LIST
================================ */

/**
 * Receive chat message from server
 * Broadcast to all players in the room
 */
socket.on('chatMessage', ({ playerName, message }) => {
  console.log(`Chat: ${playerName}: ${message}`);
  displayChatMessage(playerName, message);
  
  // Store in chat history
  chatMessagesList.push({ playerName, message, timestamp: new Date() });
});

// Listen for mention alerts and play a chime
socket.on('mentionAlert', ({ mentioner, message }) => {
  playMentionChime();
  console.log(`You were mentioned by ${mentioner}`);
});

/**
 * Receive player list update from server
 * Shows all active players, their order, stats, etc.
 */
socket.on('playerListUpdate', ({ players, currentTurn }) => {
  console.log('Player list updated:', players);
  playerListData = players;
  window.playerListData = players; // Keep globally accessible
  currentPlayerId = currentTurn;
  updatePlayerList(players, currentTurn);
  
  // Update mention suggestions with current player list
  if (window.updatePlayerListForMentions) {
    window.updatePlayerListForMentions(players);
  }
  
  // Assign colors to players
  if (window.assignPlayerColors) {
    window.assignPlayerColors(players);
  }
});

// Listen for active players list updates (as players join the game)
socket.on('activePlayersListUpdate', (players) => {
  if (!playerListContentEl) return;
  
  playerListContentEl.innerHTML = '';
  
  if (!Array.isArray(players)) return;
  
  players.forEach((player, index) => {
    const playerEl = document.createElement('div');
    playerEl.className = 'player-item';
    
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name;
    
    // Apply custom player color if available
    if (window.getPlayerColor) {
      const color = window.getPlayerColor(player.name);
      nameEl.style.color = color;
    }
    
    const statsEl = document.createElement('div');
    statsEl.className = 'player-stats';
    
    const winPercent = player.gamesPlayed > 0 
      ? Math.round((player.wins / player.gamesPlayed) * 100) 
      : 0;
    
    statsEl.innerHTML = `
      <div class="player-stat-item"><span class="player-stat-label">Wins:</span><span class="player-stat-value">${player.wins || 0}</span></div>
      <div class="player-stat-item"><span class="player-stat-label">Games:</span><span class="player-stat-value">${player.gamesPlayed || 0}</span></div>
      <div class="player-stat-item"><span class="player-stat-label">Win%:</span><span class="player-stat-value">${winPercent}%</span></div>
    `;
    
    playerEl.appendChild(nameEl);
    playerEl.appendChild(statsEl);
    playerListContentEl.appendChild(playerEl);
  });
});

// Listen for waiting players list updates
socket.on('waitingList', (players) => {
  waitingPlayers = players || [];
  
  // If there's a waiting section already, update it; otherwise append it
  const existingWaitingSection = playerListContentEl.querySelector('.waiting-section');
  
  if (waitingPlayers.length === 0) {
    // Remove waiting section if no players waiting
    if (existingWaitingSection) {
      existingWaitingSection.remove();
    }
    return;
  }
  
  if (existingWaitingSection) {
    // Update existing waiting section
    const waitingList = existingWaitingSection.querySelector('.waiting-list');
    waitingList.innerHTML = '';
    
    waitingPlayers.forEach(player => {
      const playerEl = document.createElement('div');
      playerEl.className = 'waiting-player-item';
      playerEl.textContent = player.name;
      
      // Apply custom player color if available
      if (window.getPlayerColor) {
        const color = window.getPlayerColor(player.name);
        playerEl.style.color = color;
      }
      
      waitingList.appendChild(playerEl);
    });
  } else {
    // Create new waiting section
    const waitingSection = document.createElement('div');
    waitingSection.className = 'waiting-section';
    
    const waitingHeader = document.createElement('div');
    waitingHeader.className = 'waiting-header';
    waitingHeader.textContent = 'Waiting';
    
    const waitingList = document.createElement('div');
    waitingList.className = 'waiting-list';
    
    waitingPlayers.forEach(player => {
      const playerEl = document.createElement('div');
      playerEl.className = 'waiting-player-item';
      playerEl.textContent = player.name;
      
      // Apply custom player color if available
      if (window.getPlayerColor) {
        const color = window.getPlayerColor(player.name);
        playerEl.style.color = color;
      }
      
      waitingList.appendChild(playerEl);
    });
    
    waitingSection.appendChild(waitingHeader);
    waitingSection.appendChild(waitingList);
    playerListContentEl.appendChild(waitingSection);
  }
});

/**
 * Game is starting - show playing order
 */
socket.on('gameStart', ({ players, playOrder }) => {
  console.log('Game started! Playing order:', playOrder);
  const orderedPlayers = playOrder.map(socketId => 
    players.find(p => p.socketId === socketId)
  ).filter(p => p);
  
  playerListData = orderedPlayers;
  window.playerListData = orderedPlayers; // Keep globally accessible
  updatePlayerList(orderedPlayers, null);
  
  // Update mention suggestions with current player list
  if (window.updatePlayerListForMentions) {
    window.updatePlayerListForMentions(orderedPlayers);
  }
  
  // Assign colors to players
  if (window.assignPlayerColors) {
    window.assignPlayerColors(orderedPlayers);
  }
});

/* ===============================
   SORT CARDS LOW → HIGH
   3♣ lowest → 2♦ highest
================================ */
function sortCards(cards) {
    const rankOrder = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
    const suitOrder = ['C','S','H','D']; // weakest → strongest

    return cards.sort((a, b) => {
        const rankDiff = rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
        if (rankDiff !== 0) return rankDiff;

        return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    });
}

function attemptSingleCardAutoPlay(cardEl) {
  if (!isMyTurn) return;
  const isSingleResponse = currentTrickCardCount === 1;
  const isPowerLeadPlay = currentTrickCardCount === null;
  if (!isSingleResponse && !isPowerLeadPlay) return;

  const cardData = cardEl?.dataset?.card;
  if (!cardData) return;

  try {
    const card = JSON.parse(cardData);
    if (!card || !card.rank || !card.suit) return;
    socket.emit('playHand', [card]);
  } catch (e) {
    // ignore malformed card payload
  }
}

function bindCardInteractions(cardEl) {
  cardEl.addEventListener('click', () => cardEl.classList.toggle('selected'));
  cardEl.addEventListener('dblclick', () => attemptSingleCardAutoPlay(cardEl));
  cardEl.draggable = true;
  cardEl.addEventListener('dragstart', dragStartHandler);
  cardEl.addEventListener('dragend', dragEndHandler);
  cardEl.addEventListener('dragover', dragOverHandler);
  cardEl.addEventListener('drop', dropHandler);
}

/* ===============================
   RENDER PLAYER HAND
================================ */
function renderHand() {
    playerHandDiv.innerHTML = '';
    playerCards.forEach((c, i) => {
        const div = document.createElement('div');
        div.classList.add('card');
        div.dataset.index = i;
        // Store card data on element for reliable retrieval
        div.dataset.card = JSON.stringify(c);

        // Card image
        const img = document.createElement('img');
        img.src = `/cards/${cardFileName(c)}`;
        img.classList.add('card-image');
        div.appendChild(img);

        bindCardInteractions(div);

        playerHandDiv.appendChild(div);
    });
}

/* ===============================
   HAND CONTAINER DRAG EVENTS
================================ */
playerHandDiv.addEventListener('dragenter', (e) => {
    e.preventDefault();
});

playerHandDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
});

playerHandDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

/* ===============================
   ANIMATE DEAL HAND - LEFT TO RIGHT, CENTERED
================================ */
function getHandLayoutConfig(cardsCount) {
  const baseCardWidth = 80;
  const baseGap = 10;
  const maxWidth = Math.max(320, window.innerWidth - 60);

  let cardWidth = baseCardWidth;
  let gap = baseGap;
  let totalWidth = cardsCount * cardWidth + (cardsCount - 1) * gap;

  if (totalWidth > maxWidth) {
    const maxCardWidth = Math.floor((maxWidth - (cardsCount - 1) * gap) / cardsCount);
    cardWidth = Math.max(50, Math.min(baseCardWidth, maxCardWidth));
    totalWidth = cardsCount * cardWidth + (cardsCount - 1) * gap;
    if (totalWidth > maxWidth) {
      gap = Math.max(4, Math.floor((maxWidth - cardsCount * cardWidth) / (cardsCount - 1)));
    }
  }

  const cardHeight = Math.round(cardWidth * 1.5);
  return { cardWidth, cardHeight, gap };
}

function animateDealHand(cards) {
    playerHandDiv.innerHTML = ''; // clear existing hand
    playerCards = [...cards];

  const { cardWidth, cardHeight, gap } = getHandLayoutConfig(cards.length);
  playerHandDiv.style.gap = `${gap}px`;
    const totalWidth = cards.length * cardWidth + (cards.length - 1) * gap;

    const startXCenter = window.innerWidth / 2 - cardWidth / 2; // top center start
    const startY = -150; // start above screen

    // Target Y position: fixed just above bottom of screen
  const targetY = window.innerHeight - (cardHeight + 60); // keep cards visible

    // Leftmost X so that hand is centered
    const startXLeft = (window.innerWidth - totalWidth) / 2;

    cards.forEach((c, i) => {
        const div = document.createElement('div');
        div.classList.add('card');
        div.dataset.index = i;
        // Store card data on element
        div.dataset.card = JSON.stringify(c);

        div.style.width = `${cardWidth}px`;
        div.style.height = `${cardHeight}px`;

        // Face-down card
        const img = document.createElement('img');
        img.src = `/cards/card_back${selectedDeck === '2' ? '2' : ''}.png`;
        img.classList.add('card-image');
        div.appendChild(img);

        // Fixed start position (top center)
        div.style.position = 'fixed';
        div.style.left = `${startXCenter}px`;
        div.style.top = `${startY}px`;
        div.style.zIndex = 100 + i;
        div.style.transform = `rotate(${Math.random() * 10 - 5}deg)`;

        document.body.appendChild(div);

        // Calculate target X for left-to-right landing
        const targetX = startXLeft + i * (cardWidth + gap);

        // Animate to target
        setTimeout(() => {
            div.style.transition = 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
            div.style.left = `${targetX}px`;
            div.style.top = `${targetY}px`;
            div.style.transform = 'rotate(0deg)';
        }, i * 150);

        // Flip to face after animation
        setTimeout(() => {
            img.src = `/cards/${cardFileName(c)}`;
            div.style.position = '';
            div.style.left = '';
            div.style.top = '';
            div.style.transition = '';
            div.style.transform = '';

            // Re-enable interactions after animation
            bindCardInteractions(div);

            playerHandDiv.appendChild(div); // move to hand container
        }, cards.length * 150 + 600);
    });
}

/* ===============================
   SYNC PLAYER CARDS ARRAY WITH DOM ORDER
================================ */
function syncPlayerCardsWithDOM() {
    const cardEls = Array.from(playerHandDiv.querySelectorAll('.card'));
    playerCards = cardEls.map(el => {
        const cardData = el.dataset.card;
        return cardData ? JSON.parse(cardData) : null;
    }).filter(c => c !== null);
}

/* ===============================
   DRAG & DROP HANDLERS - SLIDE BASED
================================ */
function dragStartHandler(e) {
    draggingEl = e.currentTarget;
    draggingEl.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function dragEndHandler(e) {
    if (draggingEl) {
        draggingEl.style.opacity = '1';
        draggingEl = null;
    }
    // Sync the playerCards array after drag ends
    syncPlayerCardsWithDOM();
}

function dragOverHandler(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggingEl) return;
    
    const target = e.currentTarget;
    if (target !== draggingEl && target.classList.contains('card')) {
        const rect = target.getBoundingClientRect();
        const halfway = rect.left + rect.width / 2;
        
        // Slide cards: if dragging past this card, swap positions
        if (e.clientX < halfway) {
            // Dragging from right to left - move target after dragging element
            if (draggingEl.nextSibling !== target) {
                draggingEl.parentNode.insertBefore(target, draggingEl);
            }
        } else {
            // Dragging from left to right - move target before dragging element
            if (draggingEl.previousSibling !== target) {
                draggingEl.parentNode.insertBefore(draggingEl, target.nextSibling);
            }
        }
    }
}

function dropHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggingEl) {
        draggingEl.style.opacity = '1';
        draggingEl = null;
    }
    // Sync the playerCards array after drop
    syncPlayerCardsWithDOM();
}

/* ===============================
   RECEIVE INITIAL HAND
================================ */
socket.on('dealHand', cards => {
  resetGame();
  updateInGameHeaderVisibility();
  const sorted = sortCards(cards);
  animateDealHand(sorted);
});

/* ===============================
   3-PLAYER DISCARD CARD
================================ */
socket.on('discardCard', (card) => {
    if (!card) return;
    
    const discardDiv = document.getElementById('discardCardDiv');
    const cardImageDiv = document.getElementById('discardCardImage');
    cardImageDiv.innerHTML = '';
    discardDiv.style.display = 'flex';
    
    const cardEl = document.createElement('div');
    cardEl.style.width = '80px';
    cardEl.style.height = '120px';
    cardEl.style.borderRadius = '12px';
    cardEl.style.overflow = 'hidden';
    cardEl.style.display = 'flex';
    cardEl.style.justifyContent = 'center';
    cardEl.style.alignItems = 'center';
    cardEl.style.backgroundColor = 'white';
    
    const img = document.createElement('img');
    img.src = `/cards/${cardFileName(card)}`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '10px';
    
    cardEl.appendChild(img);
    cardImageDiv.appendChild(cardEl);
});

/* ===============================
   HIDE DISCARD FOR EVERYONE
================================ */
socket.on('hideDiscard', () => {
    const discardDiv = document.getElementById('discardCardDiv');
    if (discardDiv) {
        discardDiv.style.display = 'none';
    }
});

/* ===============================
   READY BUTTON
================================ */
readyBtn.addEventListener('click', () => {
    if (selectedGame === 'texasHoldEm') {
      socket.emit('texasHoldEmReady', { roomId });
    } else {
      socket.emit('playerReady');
    }

    // Hide Ready button after clicking
    readyBtn.style.display = 'none';
  updateInGameHeaderVisibility();

    // Make sure action buttons stay hidden until it's actually this player's turn
    bustBtn.style.display = 'none';
    passBtn.style.display = 'none';

    // Hide turn indicator until server says it's your turn
    turnIndicator.style.display = 'none';
});

/* ===============================
   BUST A HAND
================================ */
bustBtn.addEventListener('click', () => {
    // Sync playerCards with current DOM order
    syncPlayerCardsWithDOM();
    
    const selectedEls = document.querySelectorAll('.card.selected');
    if (!selectedEls.length) return alert('Select cards to play');

    // Get cards from stored data on elements (survives rearrangement)
    const played = [];
    selectedEls.forEach(el => {
        const cardData = el.dataset.card;
        if (cardData) {
            played.push(JSON.parse(cardData));
        }
    });

    if (!played.length) return alert('Could not identify selected cards');

    // Deselect all cards
    selectedEls.forEach(el => el.classList.remove('selected'));

    // DO NOT remove cards locally yet — wait for server to accept
    socket.emit('playHand', played);
});

/* ===============================
   PASS BUTTON
================================ */
passBtn.addEventListener('click', () => {
    socket.emit('passTurn');
});

/* ===============================
   UPDATE PLAYERS AREA
================================ */
socket.on('updatePlayers', players => {
  if (!playersArea) return;
  playersArea.innerHTML = '';
  
  players.forEach(p => {
    const div = document.createElement('div');
    div.textContent = p.name + (p.ready ? ' ✅' : '');
    playersArea.appendChild(div);
  });
});

/* ===============================
   TURN CHIME
================================ */
function playTurnChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime); // A5

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    o.stop(ctx.currentTime + 0.36);

    setTimeout(() => ctx.close(), 500);
  } catch (e) {
    // ignore if audio blocked
  }
}

function playMentionChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = 'sine';
    o.frequency.setValueAtTime(1046, ctx.currentTime); // C6 - higher pitch for mention

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    o.stop(ctx.currentTime + 0.26);

    setTimeout(() => ctx.close(), 400);
  } catch (e) {
    // ignore if audio blocked
  }
}

/* ===============================
   SORT CARDS FOR TABLE DISPLAY
================================ */
function sortCardsForDisplay(cards, handType) {
  const RANK_ORDER = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const SUIT_RANK = { 'C': 1, 'S': 2, 'H': 3, 'D': 4 };
  
  // For straights and straight flushes, display in sequence order
  if (handType === 'straight' || handType === 'straight_flush') {
    // Check if this is a low straight (2-3-4-5-6 where 2 is low)
    const ranks = cards.map(c => c.rank);
    const hasLowStraight = ranks.includes('2') && ranks.includes('3') && 
                          ranks.includes('4') && ranks.includes('5') && 
                          ranks.includes('6');
    
    if (hasLowStraight) {
      // Display as 2-3-4-5-6 (2 is low in this case)
      const order = ['2', '3', '4', '5', '6'];
      return cards.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
    }
    
    // For normal straights, sort by rank value
    return [...cards].sort((a, b) => {
      const aVal = RANK_ORDER.indexOf(a.rank);
      const bVal = RANK_ORDER.indexOf(b.rank);
      return aVal - bVal;
    });
  }
  
  // For flushes, display highest cards first
  if (handType === 'flush') {
    return [...cards].sort((a, b) => {
      const aVal = RANK_ORDER.indexOf(a.rank);
      const bVal = RANK_ORDER.indexOf(b.rank);
      return bVal - aVal; // highest first
    });
  }
  
  // For other hands (pairs, trips, etc), group by rank then by suit
  return [...cards].sort((a, b) => {
    const aRank = RANK_ORDER.indexOf(a.rank);
    const bRank = RANK_ORDER.indexOf(b.rank);
    
    // Same rank: sort by suit
    if (aRank === bRank) {
      return SUIT_RANK[b.suit] - SUIT_RANK[a.suit];
    }
    
    // Different ranks: group matching ranks together, highest first
    return bRank - aRank;
  });
}

/* ===============================
   UPDATE TABLE AREA
================================ */
socket.on('updateTable', (table) => {
  tableArea.innerHTML = '';
  currentTrickCardCount = (Array.isArray(table) && table.length > 0)
    ? table[table.length - 1].cards.length
    : null;
  if (Array.isArray(table) && table.length > 0) {
    hasPowerLead = false;
  }

  const maxHandOffset = 10;
  const maxCardRotation = 3;

  table.forEach((play) => {
    const handDiv = document.createElement('div');
    handDiv.classList.add('table-hand');

    // Center (CSS can shift this if you want later)
    handDiv.style.position = 'absolute';
    handDiv.style.left = '50%';
    handDiv.style.top = '50%';
    const handOffsetX = (Math.random() * maxHandOffset * 2) - maxHandOffset;
    const handOffsetY = (Math.random() * maxHandOffset * 2) - maxHandOffset;
    handDiv.style.transform =
      `translate(calc(-50% + ${handOffsetX}px), calc(-50% + ${handOffsetY}px))`;

    // Ensure multi-card plays go left-to-right
    handDiv.style.display = 'flex';
    handDiv.style.flexDirection = 'row';
    handDiv.style.gap = '8px';
    handDiv.style.justifyContent = 'center';
    handDiv.style.alignItems = 'center';

    // Sort cards appropriately based on hand type
    const sortedCards = sortCardsForDisplay(play.cards, play.handType);

    sortedCards.forEach((c) => {
      const cardDiv = document.createElement('div');
      cardDiv.classList.add('table-card');

      // Keep table cards non-transparent
      cardDiv.style.backgroundColor = 'white';

      const cardRotate = (Math.random() * maxCardRotation * 2) - maxCardRotation;
      const cardOffsetY = (Math.random() * 4) - 2;
      cardDiv.style.transform = `translateY(${cardOffsetY}px) rotate(${cardRotate}deg)`;

      const img = document.createElement('img');
      img.src = `/cards/${cardFileName(c)}`;
      img.classList.add('card-image');

      cardDiv.appendChild(img);
      handDiv.appendChild(cardDiv);
    });

    tableArea.appendChild(handDiv);
  });
});

/* ===============================
   TURN UPDATE (buttons + indicator)
================================ */
socket.on('turnUpdate', ({ playerId, players, playerCount }) => {
  isMyTurn = Boolean(mySocketId && playerId === mySocketId);
  if (!isMyTurn) {
    hasPowerLead = false;
  }

  if (isMyTurn) {
    bustBtn.style.display = 'inline-block';
    passBtn.style.display = 'inline-block';

    if (turnIndicator) {
      turnIndicator.style.display = 'block';
      turnIndicator.textContent = 'YOUR TURN';
    }

    if (lastTurnPlayerId !== playerId) {
      playTurnChime();
    }
  } else {
    bustBtn.style.display = 'none';
    passBtn.style.display = 'none';

    if (turnIndicator) {
      turnIndicator.style.display = 'none';
    }
  }

  lastTurnPlayerId = playerId;
  
  // Update player list with stats
  if (players && players.length > 0) {
    updatePlayerList(players, playerId);
  }
});

// Handle player disconnection - clean up
socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

/* ===============================
   TEXAS HOLD 'EM SOCKET EVENTS
================================ */

socket.on('holdemMode', ({ mode }) => {
  if (selectedGame !== 'texasHoldEm') return;
  setHoldemChipMode(mode === 'sng');
  document.body.classList.toggle('holdem-sng', mode === 'sng');
});

socket.on('promptBuyIn', ({ minBuyIn, maxBuyIn, suggestedBuyIn }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('💰 Buy-in prompt received');
  
  // Show buy-in dialog
  const buyInAmount = prompt(
    `Buy in amount?\n(Minimum: $${minBuyIn.toFixed(2)}, Maximum: $${maxBuyIn.toFixed(2)}, Suggested: $${suggestedBuyIn.toFixed(2)})`,
    suggestedBuyIn.toFixed(2)
  );
  
  if (buyInAmount === null) {
    // User cancelled, show alert and prompt again
    alert('You must buy in to play');
    socket.emit('promptBuyIn', { minBuyIn, maxBuyIn, suggestedBuyIn });
    return;
  }
  
  const amount = parseFloat(buyInAmount);
  if (isNaN(amount) || amount < minBuyIn || amount > maxBuyIn) {
    alert(`Invalid amount. Must be between $${minBuyIn.toFixed(2)} and $${maxBuyIn.toFixed(2)}`);
    socket.emit('promptBuyIn', { minBuyIn, maxBuyIn, suggestedBuyIn });
    return;
  }
  
  socket.emit('submitBuyIn', { roomId, buyInAmount: amount });
});

socket.on('playersUpdated', (players) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('👥 Players updated:', players);
  const allReady = players.every(p => p.ready);
  const readyCount = players.filter(p => p.ready).length;
  
  if (allReady && players.length >= 2) {
    console.log(`✅ All ${players.length} players are ready!`);
  } else {
    console.log(`⏳ Waiting for players to ready up (${readyCount}/${players.length})`);
  }
  
  // Update UI to show player status
  // You can display this in a waiting area or status message
  displayGameMessage(`Players: ${readyCount}/${players.length} ready`, 'info');
});

socket.on('gameStarted', ({ players, blinds, dealerButton }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('🎮 Texas Hold Em game started');
  console.log(`Small blind: $${blinds.small.toFixed(2)}, Big blind: $${blinds.big.toFixed(2)}`);
  hideShowMuckChoice();
  tableFxNewHand();

  // Display player seating
  const seatingArea = document.getElementById('seatingArea');
  seatingArea.innerHTML = '';
  
  players.forEach((player, index) => {
    displayPlayerAtSeat(index, {
      id: player.id,
      name: player.name,
      stack: player.stack,
      isCurrentBettor: false
    }, players.length, players);
  });
  
  displayGameMessage('Game started! Dealing cards...', 'info');
});

socket.on('dealCards', ({ holeCards }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('🎰 You received hole cards');
  playerCards = holeCards;
  
  displayPlayerHoleCards(mySocketId, holeCards);
});

socket.on('gameState', ({ state, pot, communityCards, currentBettor, highestBet, minRaiseTo, smallBlind, bigBlind, dealerId, smallBlindId, bigBlindId, players }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  // Store current game state for betting validation
  window.currentGameState = {
    state, pot, communityCards, currentBettor, highestBet, minRaiseTo, smallBlind, bigBlind, players,
    playerStack: players.find(p => p.id === mySocketId)?.stack || 0,
    playerCurrentBet: players.find(p => p.id === mySocketId)?.currentBet || 0
  };
  
  console.log(`📊 Game state: ${state}, Pot: $${pot.toFixed(2)}, Highest Bet: $${highestBet.toFixed(2)}`);
  console.log(`🔍 gameState currentBettor: ${currentBettor}, My ID: ${mySocketId}, players:`, players.map(p => `${p.name}(${p.id})`).join(', '));
  
  // Update pot display
  updatePotDisplay(pot);
  
  // Update community cards
  if (communityCards && communityCards.length > 0) {
    displayCommunityCards(communityCards);
  }
  
  // Update players
  players.forEach((player, index) => {
    const seatDiv = document.getElementById(`seat-${index}`);
    if (seatDiv) {
      updateSeatStatus(seatDiv, player, { state, currentBettor, highestBet, dealerId, smallBlindId, bigBlindId });
    }
  });
  
  // Bet chips, pot pile, dealer button
  tableFxUpdate({ state, pot, players, dealerId });
  
  // Show betting controls if it's our turn
  if (currentBettor === mySocketId) {
    showBettingControls({ 
      highestBet: highestBet,
      minRaiseTo: minRaiseTo,
      playerCurrentBet: players.find(p => p.id === mySocketId)?.currentBet || 0,
      pot: pot || 0,
      playerStack: players.find(p => p.id === mySocketId)?.stack || 0,
      smallBlind: smallBlind,
      bigBlind: bigBlind
    });
  } else {
    hideBettingControls();
  }
});

socket.on('gameStateUpdated', ({ state, pot, communityCards, currentBettor, highestBet, minRaiseTo, smallBlind, bigBlind, dealerId, smallBlindId, bigBlindId, players }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  // Store current game state for betting validation
  window.currentGameState = {
    state, pot, communityCards, currentBettor, highestBet, minRaiseTo, smallBlind, bigBlind, players,
    playerStack: players.find(p => p.id === mySocketId)?.stack || 0,
    playerCurrentBet: players.find(p => p.id === mySocketId)?.currentBet || 0
  };
  
  console.log(`📊 State updated: ${state}`);
  
  // Update pot and community cards
  updatePotDisplay(pot);
  if (communityCards) displayCommunityCards(communityCards);
  
  // Update player displays
  players.forEach((player, index) => {
    const seatDiv = document.getElementById(`seat-${index}`);
    if (seatDiv) {
      if (player.folded) {
        // Trigger fold animation if player just folded
        if (!foldedPlayersThisHand.has(player.id)) {
          foldedPlayersThisHand.add(player.id);
          if (typeof animateFoldCards === 'function') {
            animateFoldCards(player.id);
          }
        }
      }
      // Stack, badges, last action, "To call", turn highlight, folded/all-in look
      updateSeatStatus(seatDiv, player, { state, currentBettor, highestBet, dealerId, smallBlindId, bigBlindId });
    }
  });
  
  // Bet chips, pot pile, dealer button
  tableFxUpdate({ state, pot, players, dealerId });
  
  // Show/hide betting controls
  console.log(`🎲 Current bettor: ${currentBettor}, My ID: ${mySocketId}, Should show controls: ${currentBettor === mySocketId}`);
  if (currentBettor === mySocketId) {
    const myPlayer = players.find(p => p.id === mySocketId);
    console.log(`✅ Showing betting controls for ${myPlayer?.name}`);
    showBettingControls({ 
      highestBet: highestBet, 
      minRaiseTo: minRaiseTo,
      playerCurrentBet: myPlayer?.currentBet || 0,
      pot: pot || 0,
      playerStack: myPlayer?.stack || 0,
      smallBlind: smallBlind || 0.05,
      bigBlind: bigBlind || 0.10
    });
  } else {
    console.log(`❌ Hiding betting controls (waiting for ${currentBettor})`);
    hideBettingControls();
  }
});

socket.on('handComplete', ({ winners, winnerNames, pot, method, allHands, shownHands, sidePotDistribution, winnings, winnerSummary, eliminations }) => {
  if (selectedGame !== 'texasHoldEm') return;

  console.log('🏆 Hand complete!');

  // Slide the pot to the winner(s)
  tableFxHandComplete({ winnings });
  
  // Showdown: turn everyone's cards face up (they stay up until the next deal)
  (shownHands || []).forEach(h => {
    if (h.id !== mySocketId) revealSeatCards(h.id, h.cards);
  });

  // e.g. "T1 wins $1.50 with King high straight" (one line per winner)
  const message = (winnerSummary || [])
    .map(w => `${w.name} wins ${fmtChips(w.amount)}${w.hand ? ` with ${w.hand}` : ''}`)
    .concat((eliminations || []).map(e => `${e.name} is out in ${ordinal(e.place)} place`))
    .join('\n');
  
  // Keep the showdown result up as long as the cards are shown
  displayGameMessage(message, 'info', method === 'showdown' ? 5000 : 3000);
  hideBettingControls();
});

// I won with everyone else folding: choose to show or muck
socket.on('offerShowCards', ({ decisionSeconds }) => {
  if (selectedGame !== 'texasHoldEm') return;
  hideBettingControls();
  showShowMuckChoice(decisionSeconds);
});

// Everyone left is all-in: cards go face up before the rest of the board is dealt
socket.on('showdownReveal', ({ hands }) => {
  if (selectedGame !== 'texasHoldEm') return;
  hideBettingControls();
  (hands || []).forEach(h => {
    if (h.id !== mySocketId) revealSeatCards(h.id, h.cards);
  });
});

socket.on('cardsShown', ({ playerId, playerName, cards }) => {
  if (selectedGame !== 'texasHoldEm') return;
  if (playerId === mySocketId) {
    hideShowMuckChoice();
  } else {
    revealSeatCards(playerId, cards);
  }
  displayGameMessage(`${playerName} shows`, 'info', 5000);
});

socket.on('cardsMucked', ({ playerId, playerName }) => {
  if (selectedGame !== 'texasHoldEm') return;
  if (playerId === mySocketId) hideShowMuckChoice();
  displayGameMessage(`${playerName} mucks`, 'info', 1500);
});

socket.on('newHandStarted', ({ pot, players }) => {
  if (selectedGame !== 'texasHoldEm') return;

  console.log('🔄 New hand started');
  hideShowMuckChoice();
  tableFxNewHand();
  
  // Reset folded players tracking for new hand
  foldedPlayersThisHand.clear();
  
  // Clear community cards
  const cardsList = document.getElementById('communityCardsList');
  if (cardsList) cardsList.innerHTML = '';

  // Not dealt into this hand (watching / waiting): clear my old hole cards
  if (!players.some(p => p.id === mySocketId)) {
    const myCards = document.getElementById('playerHoleCardsList');
    if (myCards) myCards.innerHTML = '';
    hideBettingControls();
  }

  // Update player stacks and show their table cards
  players.forEach((player, index) => {
    const seatDiv = document.getElementById(`seat-${index}`);
    if (seatDiv) {
      seatDiv.classList.remove('folded', 'all-in');
      const stackDiv = seatDiv.querySelector('.player-stack');
      if (stackDiv) stackDiv.textContent = fmtChips(player.stack);
      
      // Show table cards at the start of new hand
      if (typeof showTableCards === 'function') {
        showTableCards(player.id);
      }
    }
  });
});

socket.on('blindsChanged', ({ smallBlind, bigBlind }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  displayGameMessage(
    `Blinds changed to $${smallBlind.toFixed(2)}/$${bigBlind.toFixed(2)}`,
    'info'
  );
});

socket.on('youBusted', ({ bustedAmount, minRebuy, maxRebuy, suggestedRebuy }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('💔 You are busted! Stack: $' + bustedAmount.toFixed(2));
  
  displayGameMessage('You are busted! Choose to rebuy or watch.', 'warning');
  hideBettingControls();
  // The Re-buy button stays on screen until a re-buy goes through
  if (typeof REBUY_LIMITS !== 'undefined') {
    REBUY_LIMITS.min = minRebuy;
    REBUY_LIMITS.max = maxRebuy;
    REBUY_LIMITS.suggested = suggestedRebuy;
  }
  showRebuyButton();

  // Show rebuy/watch options
  const choice = confirm(`You lost all your chips!\n\nClick OK to rebuy now, or Cancel to watch.\n(You can re-buy any time with the Re-buy button.)`);

  if (choice) {
    promptRebuy();
  } else {
    socket.emit('chooseToWatch', { roomId });
    displayGameMessage('You are now watching. Click Re-buy any time to get back in.', 'info');
  }
});

socket.on('waitingForRebuys', ({ activePlayers, bustOut }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log('⏳ Waiting for rebuys...');
  
  let message = 'Not enough players to continue.\n\n';
  message += 'Active: ' + activePlayers.map(p => p.name).join(', ') + '\n';
  message += 'Busted: ' + bustOut.map(p => p.name).join(', ');
  
  displayGameMessage(message, 'info');
  hideBettingControls();
});

socket.on('playerRebuyin', ({ playerId, playerName, rebuyAmount }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log(`${playerName} rebuys for $${rebuyAmount.toFixed(2)}`);
  if (playerId === mySocketId) {
    hideRebuyButton();
    displayGameMessage(`You re-bought for $${rebuyAmount.toFixed(2)}. You'll be dealt in when the next hand starts.`, 'info');
  } else {
    displayGameMessage(`${playerName} rebuys for $${rebuyAmount.toFixed(2)}`, 'info');
  }
});

socket.on('playerWatching', ({ playerId, playerName }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log(`${playerName} is now watching`);
  displayGameMessage(`${playerName} is now watching the game`, 'info');
});

socket.on('playerRejoinedGame', ({ playerId, playerName, buyInAmount }) => {
  if (selectedGame !== 'texasHoldEm') return;
  
  console.log(`${playerName} rejoined for $${buyInAmount.toFixed(2)}`);
  if (playerId === mySocketId) {
    hideRebuyButton();
    displayGameMessage(`You re-bought for $${buyInAmount.toFixed(2)}. You'll be dealt in when the next hand starts.`, 'info');
  } else {
    displayGameMessage(`${playerName} rejoined the game with $${buyInAmount.toFixed(2)}`, 'info');
  }
});
