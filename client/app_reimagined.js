const socket = io();

/* ===============================
   SOCKET ID + TURN STATE
================================ */
let mySocketId = null;
let lastTurnPlayerId = null;
let playerStatus = 'loading'; // 'active' or 'waiting'
let myOwnStats = null; // Store own stats

socket.on('connect', () => {
  mySocketId = socket.id;
  console.log("My socket id:", mySocketId);
  
  // If we have joined a room before and the game is active, rejoin on reconnect
  if (roomId && playerName && gameDiv.style.display === 'block') {
    console.log('🔄 Rejoining room after reconnect:', roomId);
    socket.emit('joinRoom', { playerName, roomId });
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

socket.on('powerTaken', ({ playerId, playerName, card }) => {
  hasPowerLead = Boolean(mySocketId && playerId === mySocketId);
  showPowerTakenBanner(playerName, card || { rank: '2', suit: 'D' });
});

function showPowerTakenBanner(playerName, card) {
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

  const cardImage = document.createElement('img');
  cardImage.className = 'power-taken-card';
  cardImage.src = `/cards/${cardFileName(card)}`;
  cardImage.alt = '2 of diamonds';

  banner.appendChild(message);
  banner.appendChild(cardImage);
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
let isMyTurn = false;
let currentTrickCardCount = null;
let hasPowerLead = false;

/* ===============================
   CHAT & PLAYER LIST STATE
================================ */
let chatMessagesList = []; // array of { playerName, message, timestamp }
let playerListData = []; // array of player objects with stats
let activePlayers = []; // socketIds of active players
let currentPlayerId = null; // socketId of player whose turn it is

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

    // Show scene selection instead of going directly to game
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const sceneOverlay = document.getElementById('sceneOverlay');
    
    lobbyOverlay.style.display = 'none';
    sceneOverlay.style.display = 'flex';
});

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
    const defaultRoomId = 'mainRoom';
    roomId = defaultRoomId;
    
    socket.emit('joinRoom', { playerName, roomId: defaultRoomId });

    applyScene(scene);
    initializeInGameOptions();

    // Hide lobby and show game
    document.getElementById('lobby').style.display = 'none';
    gameDiv.style.display = 'block';
    if (roomLabel) roomLabel.textContent = 'Main Game';
    updateInGameHeaderVisibility();
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

/**
 * Receive player list update from server
 * Shows all active players, their order, stats, etc.
 */
socket.on('playerListUpdate', ({ players, currentTurn }) => {
  console.log('Player list updated:', players);
  playerListData = players;
  currentPlayerId = currentTurn;
  updatePlayerList(players, currentTurn);
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
  updatePlayerList(orderedPlayers, null);
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
    socket.emit('playerReady');

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
