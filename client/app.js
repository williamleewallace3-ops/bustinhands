const socket = io();

/* ===============================
   SOCKET ID + TURN STATE
================================ */
let mySocketId = null;
let lastTurnPlayerId = null;
let playerStatus = 'loading'; // 'active' or 'waiting'
let myOwnStats = null; // Store own stats until camera feed is created

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
   BASIC SOCKET FEEDBACK (ONE TIME ONLY)
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
  
  // Store stats and update feed if it exists
  if (stats) {
    myOwnStats = stats;
    if (mySocketId && playerFeeds[mySocketId]) {
      updatePlayerFeedStats(mySocketId, stats);
    }
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
  // Reset game state
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
  // Don't show ready button here - let playerStatus event control visibility
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
  
  // Reset feed order flag so they can be reordered for next game
  feedsOrderedThisGame = false;
  
  // NOTE: DO NOT reset playerNames, playerFeeds, or peerConnections here
  // These are needed to maintain video feeds across game restarts
  // Players remain connected and their feeds should persist
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
   WEBRTC & VIDEO STATE
================================ */
let localStream = null;
let peerConnections = {}; // socketId -> RTCPeerConnection
let dataChannels = {}; // socketId -> RTCDataChannel
let remoteStreams = {}; // socketId -> MediaStream used for accumulating tracks when event.streams is empty
let playerLayout = {}; // socketId -> window position (topLeft, topRight, bottomLeft, bottomRight)
let playerStats = {}; // socketId -> { name, wins, gamesPlayed, winPercent, cardsRemaining }
let activePlayer = null; // socketId of player whose turn it is
let pendingOffers = []; // Queue of offers to handle after camera is ready
let pendingIceCandidates = {}; // socketId -> array of ICE candidates to add when PC is created
let feedMonitorInterval = null; // Interval for checking/retrying missing feeds
let lastRenegotiationAttempt = {}; // Track when we last tried to renegotiate with each peer

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN servers for NAT traversal fallback
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

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
    
    // Open video panel in a separate window by default
    openVideoPanelWindow();

    // Initialize camera/microphone - browser will prompt for permissions
    initializeCamera();
}

/* ===============================
   VIDEO PANEL STATE
================================ */
const playerFeeds = {}; // socketId -> { videoElement, controls, enabled, panel: 'active'|'waiting' }
const playerNames = {}; // socketId -> playerName (local tracking)
let feedsOrderedThisGame = false; // Track if feeds have been ordered for current game
let cameraEnabled = true;
let micEnabled = true;
let videoPanelWindow = null;
let videoPanelDocument = null;
let activePlayers = []; // Track which socketIds are active players
let waitingPlayers = []; // Track which socketIds are waiting

function getVideoPanelDocument() {
  return document;
}

function getVideoPanelWindow() {
  return window;
}

function openVideoPanelWindow() {
  // Panel stays in main window but is made draggable and resizable
  // This avoids the cross-document video stream issue
  const panel = document.getElementById('videoPanel');
  const waitingPanel = document.getElementById('waitingPanel');
  if (!panel || !waitingPanel) return;
  
  // Ensure panels are visible and positioned for dragging
  panel.style.position = 'fixed';
  panel.style.zIndex = '2000';
  waitingPanel.style.zIndex = '1999';
  
  console.log('✅ Video panels ready to drag');
}

/* ===============================
   CAMERA / MICROPHONE INITIALIZATION
================================ */
async function initializeCamera(enableCam = true, enableMic = true) {
    cameraEnabled = enableCam;
    micEnabled = enableMic;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: enableMic ? { echoCancellation: true, noiseSuppression: true } : false,
            video: enableCam ? { width: 1280, height: 720, facingMode: 'user' } : false
        });
        console.log('✅ Camera and microphone initialized', localStream);
        
        // Track own name and create own video feed in panel
        playerNames[mySocketId] = playerName;
        const isOwnWaiting = waitingPlayers.includes(mySocketId);
        createPlayerFeed(mySocketId, playerName, localStream, true, isOwnWaiting);
        
        // Apply own stats if they were received earlier
        if (myOwnStats) {
            updatePlayerFeedStats(mySocketId, myOwnStats);
        }
        
        // FIRST: Handle any offers that came in before camera was ready
        // This ensures we respond to their offers before creating our own
        if (pendingOffers.length > 0) {
            console.log('📨 Processing', pendingOffers.length, 'pending offers now that camera is ready');
            const offersToProcess = pendingOffers.splice(0); // Get all pending offers
            for (const { from, offer } of offersToProcess) {
                try {
                    // Create peer connection or reuse existing
                    const pc = await createPeerConnection(from);
                    const isPolite = mySocketId > from;
                    
                    // If we have a local offer already, handle collision
                    if (pc.signalingState === 'have-local-offer') {
                        if (isPolite) {
                            console.log('⚠️ Pending offer collision with', from, '- rolling back (polite)');
                            await pc.setLocalDescription({ type: 'rollback' });
                        } else {
                            console.log('⚠️ Pending offer collision with', from, '- we stay impolite, ignore theirs');
                            continue;
                        }
                    }
                    
                    // Set their offer as remote description
                    await pc.setRemoteDescription(offer);
                    console.log('  🔗 Remote description set for pending offer from', from);
                    
                    // ⚠️ ESSENTIAL: Same transceiver fix as main offer handler (git 3e292d7)
                    // Must maintain consistency between pending and regular offer handling
                    // See /memories/repo/WebRTC_3Player_Video_Solution.md
                    
                    // CRITICAL FIX: Change all recvonly transceivers to sendrecv for the answer
                    const txceivers = pc.getTransceivers();
                    console.log('    🎬 Checking transceivers - total:', txceivers.length);
                    
                    try {
                      for (let i = 0; i < txceivers.length; i++) {
                        const t = txceivers[i];
                        if (t.direction === 'recvonly') {
                          t.direction = 'sendrecv';
                          console.log(`      🔄 Changed transceiver[${i}] from recvonly to sendrecv`);
                        }
                      }
                      console.log('      ✅ All recvonly transceivers changed to sendrecv');
                    } catch (err) {
                      console.warn('    ⚠️ Error updating directions:', err.message);
                    }
                    
                    // Process any queued ICE candidates for this connection
                    if (pc.pendingIceCandidates && pc.pendingIceCandidates.length > 0) {
                        console.log('📥 Processing', pc.pendingIceCandidates.length, 'queued ICE candidates for', from);
                        for (const candidate of pc.pendingIceCandidates) {
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            } catch (err) {
                                console.error('❌ Error adding ICE candidate:', err);
                            }
                        }
                        pc.pendingIceCandidates = [];
                    }
                    
                    // Create and send answer
                    console.log('📝 Creating answer for pending offer from', from);
                    const answer = await pc.createAnswer();
                    
                    // Safety check: verify audio port in answer
                    const pendingAudioPortMatch = answer.sdp.match(/^m=audio ([0-9]+)/m);
                    const pendingAudioPort = pendingAudioPortMatch ? pendingAudioPortMatch[1] : 'unknown';
                    if (pendingAudioPort === '9') {
                      console.warn('🚨 WARNING: Pending answer SDP has DISABLED audio port (9) for', from);
                    }
                    
                    await pc.setLocalDescription(answer);
                    socket.emit('answer', { to: from, answer });
                    console.log('📤 Sent answer to', from, '(audio port:', pendingAudioPort + ')');
                } catch (err) {
                    console.error('❌ Error processing pending offer from', from, ':', err);
                }
            }
        }
        
        // SECOND: Create peer connections with players who joined before camera was ready
        // For players we haven't already connected to via pending offers
        const existingPlayerIds = Object.keys(playerNames).filter(id => id !== mySocketId);
        for (const playerId of existingPlayerIds) {
            if (!peerConnections[playerId]) {
                console.log('📞 Creating new peer connection after camera init:', playerId);
                await createPeerConnectionAndOffer(playerId);
            } else {
                console.log('✅ Already have connection with', playerId, 'from pending offer response');
            }
        }
        
        // Add tracks to ALL existing peer connections
        for (const socketId of Object.keys(peerConnections)) {
            const pc = peerConnections[socketId];
            if (!pc) continue;

            const transceivers = pc.getTransceivers();
            localStream.getAudioTracks().forEach(track => {
                if (transceivers[0] && !transceivers[0].sender.track) {
                    console.log('🔄 Adding audio track to transceiver for peer connection:', socketId);
                    transceivers[0].sender.replaceTrack(track);
                }
            });
            localStream.getVideoTracks().forEach(track => {
                if (transceivers[1] && !transceivers[1].sender.track) {
                    console.log('🔄 Adding video track to transceiver for peer connection:', socketId);
                    transceivers[1].sender.replaceTrack(track);
                }
            });
        }
        
        // Renegotiate for connections that are stable to send tracks
        for (const socketId of Object.keys(peerConnections)) {
            const pc = peerConnections[socketId];
            if (pc && pc.signalingState === 'stable' && pc.localDescription && pc.remoteDescription) {
                pc.createOffer().then(offer => {
                    return pc.setLocalDescription(offer);
                }).then(() => {
                    socket.emit('offer', { to: socketId, offer: pc.localDescription });
                    console.log('📤 Sent renegotiation offer to', socketId);
                }).catch(err => console.error('Renegotiation failed:', err));
            }
        }
        
        // Request fresh offers from all existing players to ensure we get their video feeds
        console.log('🔄 Requesting fresh offers from all existing players');
        for (const socketId of Object.keys(peerConnections)) {
            if (socketId !== mySocketId) {
                console.log('  📨 Requesting offer from', socketId);
                socket.emit('requestOffer', { to: socketId });
            }
        }
        
        // Start monitoring feeds for failures and retrying
        startFeedMonitor();
    } catch (err) {
        console.error('❌ Error accessing camera/mic:', err);
        alert('Could not access camera or microphone. Video features disabled.');
    }
}

/* ===============================
   VIDEO PANEL FUNCTIONS
================================ */
function createPlayerFeed(socketId, playerName, stream, isLocal = false, isWaiting = false) {
    // Remove existing feed if it exists
    if (playerFeeds[socketId]) {
        playerFeeds[socketId].container.remove();
    }
    
    // Determine which panel to add to
    const panelId = isWaiting ? 'waitingPanelContent' : 'videoPanelContent';
    const panelContent = document.getElementById(panelId);
    if (!panelContent) {
        console.error(`❌ Panel content not found: ${panelId}`);
        return null;
    }
    
    // Create feed container in main document
    const feedContainer = document.createElement('div');
    feedContainer.className = 'player-feed';
    feedContainer.id = `feed-${socketId}`;
    
    // Video element - MUST be in main document for WebRTC streams
    const video = document.createElement('video');
    video.className = 'player-feed-video';
    video.autoplay = true;
    video.playsinline = true;
    video.muted = isLocal; // Mute own feed to prevent echo
    if (stream) {
        video.srcObject = stream;
        video.play().catch(err => console.warn('⚠️ Video play failed:', err));
    }
    
    // Player position badge
    const positionBadge = document.createElement('div');
    positionBadge.className = 'player-position-badge';
    positionBadge.textContent = '';
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'player-feed-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'player-feed-name';
    nameDiv.textContent = playerName;
    
    const statsDiv = document.createElement('div');
    statsDiv.className = 'player-feed-stats';
    statsDiv.textContent = 'Loading stats...';
    
    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'player-feed-cards';
    cardsDiv.textContent = '🂠';
    
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(statsDiv);
    infoDiv.appendChild(cardsDiv);
    
    // Controls (only for local player)
    let controlsDiv = null;
    if (isLocal) {
        controlsDiv = document.createElement('div');
        controlsDiv.className = 'player-feed-controls';
        
        const micBtn = document.createElement('button');
        micBtn.textContent = '🎤 Mic';
        micBtn.onclick = () => toggleMicrophone(micBtn);
        
        const camBtn = document.createElement('button');
        camBtn.textContent = '📹 Camera';
        camBtn.onclick = () => toggleCamera(camBtn);
        
        controlsDiv.appendChild(micBtn);
        controlsDiv.appendChild(camBtn);
    }
    
    // Assemble
    feedContainer.appendChild(video);
    feedContainer.appendChild(positionBadge);
    feedContainer.appendChild(infoDiv);
    if (controlsDiv) feedContainer.appendChild(controlsDiv);
    
    panelContent.appendChild(feedContainer);
    
    // Store reference
    playerFeeds[socketId] = {
        container: feedContainer,
        video,
        statsDiv,
        nameDiv,
        cardsDiv,
        positionBadge,
        stream,
        isLocal,
        panel: isWaiting ? 'waiting' : 'active'
    };
    
    return feedContainer;
}

function updatePlayerFeedName(socketId, newName) {
    const feed = playerFeeds[socketId];
    if (feed && feed.nameDiv) {
        feed.nameDiv.textContent = newName;
    }
}

function updatePlayerFeedStats(socketId, stats) {
    const feed = playerFeeds[socketId];
    if (!feed) return;
    
    const winPercent = stats.gamesPlayed > 0 
        ? Math.round((stats.wins / stats.gamesPlayed) * 100) 
        : 0;
    
    feed.statsDiv.textContent = `${stats.wins} wins | ${winPercent}% win rate`;
}

function updatePlayerFeedCards(socketId, cardsRemaining) {
    const feed = playerFeeds[socketId];
    if (!feed) return;
    
    feed.cardsDiv.textContent = `${cardsRemaining} cards left`;
}

function removePlayerFeed(socketId) {
    const feed = playerFeeds[socketId];
    if (feed) {
        feed.container.remove();
        delete playerFeeds[socketId];
    }
}

function toggleMicrophone(button) {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        button.classList.toggle('active', !audioTrack.enabled);
        button.textContent = audioTrack.enabled ? '🎤 Mic' : '🔇 Muted';
    }
}

function toggleCamera(button) {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        button.classList.toggle('active', !videoTrack.enabled);
        button.textContent = videoTrack.enabled ? '📹 Camera' : '📷 Off';
    }
}

function highlightPlayerTurn(socketId) {
    // Remove highlight from all feeds
    Object.values(playerFeeds).forEach(feed => {
        feed.container.classList.remove('active-turn');
    });
    
    // Add highlight to current player
    const feed = playerFeeds[socketId];
    if (feed) {
        feed.container.classList.add('active-turn');
    }
}

function reorderFeedsByPlayOrder(playersArray) {
    const panelContent = document.getElementById('videoPanelContent');
    if (!panelContent || !playersArray || playersArray.length === 0) return;
    
    // Update position badges and reorder ONLY active players
    playersArray.forEach((player, index) => {
        const feed = playerFeeds[player.socketId];
        if (feed && feed.panel === 'active') {
            // Update position badge with ordinal suffix
            const ordinals = ['1st', '2nd', '3rd', '4th'];
            feed.positionBadge.textContent = ordinals[index];
            
            // Reorder in DOM
            panelContent.appendChild(feed.container);
        }
    });
}

/* ===============================
   DRAG AND RESIZE PANEL
================================ */
function initializeVideoPanelDrag(panelDoc = document, panelId = 'videoPanel', headerId = 'videoPanelHeader') {
  const panel = panelDoc.getElementById(panelId);
  const header = panelDoc.getElementById(headerId);

  if (!panel || !header) return;

  const view = panelDoc.defaultView || window;
  const MIN_WIDTH = 260;
  const MIN_HEIGHT = 240;
  const getMaxBounds = () => {
    const v = panelDoc.defaultView || window;
    return {
      maxWidth: Math.min(v.innerWidth * 0.95, 1400),
      maxHeight: v.innerHeight - 20
    };
  };

  // Ensure top is set so resizing from edges behaves consistently
  const rect = panel.getBoundingClientRect();
  panel.style.top = rect.top + 'px';
  
  // For waiting panel, ensure it's positioned from right; for main panel, from left
  if (panel.classList.contains('waiting-panel')) {
    panel.style.right = '20px';
    panel.style.left = 'auto';
  } else {
    panel.style.left = rect.left + 'px';
    panel.style.right = 'auto';
  }

  let isDragging = false;
  let isResizing = false;
  let resizeDir = '';
  let dragStartX = 0;
  let dragStartY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startWidth = 0;
  let startHeight = 0;

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const startDrag = (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const r = panel.getBoundingClientRect();
    startLeft = r.left;
    startTop = r.top;
    panel.style.cursor = 'grabbing';
  };

  const startResize = (e, dir) => {
    isResizing = true;
    resizeDir = dir;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const r = panel.getBoundingClientRect();
    startLeft = r.left;
    startTop = r.top;
    startWidth = r.width;
    startHeight = r.height;
    panel.style.maxHeight = 'none';
    panel.style.maxWidth = 'none';
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;

      if (panel.classList.contains('waiting-panel')) {
        // For waiting panel, position from right
        const newRight = window.innerWidth - newLeft - panel.offsetWidth;
        panel.style.right = Math.max(0, newRight) + 'px';
        panel.style.left = 'auto';
      } else {
        // For main panel, position from left
        panel.style.left = newLeft + 'px';
        panel.style.right = 'auto';
      }
      panel.style.top = newTop + 'px';
      return;
    }

    if (!isResizing) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    let newLeft = startLeft;
    let newTop = startTop;
    let newWidth = startWidth;
    let newHeight = startHeight;

    const { maxWidth, maxHeight } = getMaxBounds();

    if (resizeDir.includes('e')) {
      newWidth = clamp(startWidth + dx, MIN_WIDTH, maxWidth);
    }
    if (resizeDir.includes('s')) {
      newHeight = clamp(startHeight + dy, MIN_HEIGHT, maxHeight);
    }
    if (resizeDir.includes('w')) {
      const width = clamp(startWidth - dx, MIN_WIDTH, maxWidth);
      newLeft = startLeft + (startWidth - width);
      newWidth = width;
    }
    if (resizeDir.includes('n')) {
      const height = clamp(startHeight - dy, MIN_HEIGHT, maxHeight);
      newTop = startTop + (startHeight - height);
      newHeight = height;
    }

    panel.style.top = newTop + 'px';
    panel.style.width = newWidth + 'px';
    panel.style.height = newHeight + 'px';
    
    if (panel.classList.contains('waiting-panel')) {
      // For waiting panel, position from right
      const newRight = window.innerWidth - newLeft - newWidth;
      panel.style.right = Math.max(0, newRight) + 'px';
      panel.style.left = 'auto';
    } else {
      // For main panel, position from left
      panel.style.left = newLeft + 'px';
      panel.style.right = 'auto';
    }
  };

  const stopActions = () => {
    isDragging = false;
    isResizing = false;
    resizeDir = '';
    panel.style.cursor = 'default';
  };

  if (!header.dataset.dragBound) {
    header.addEventListener('mousedown', (e) => startDrag(e));
    header.dataset.dragBound = 'true';
  }

  panelDoc.addEventListener('mousemove', onMouseMove);
  panelDoc.addEventListener('mouseup', stopActions);

  // Add resize handles if not present
  const dirs = ['n','s','e','w','ne','nw','se','sw'];
  let handles = panel.querySelectorAll('.video-panel-resizer');
  if (handles.length === 0) {
    dirs.forEach((dir) => {
      const handle = panelDoc.createElement('div');
      handle.className = `video-panel-resizer ${dir}`;
      panel.appendChild(handle);
    });
    handles = panel.querySelectorAll('.video-panel-resizer');
  }

  handles.forEach((handle) => {
    if (!handle.dataset.resizeBound) {
      const dirClass = dirs.find(d => handle.classList.contains(d));
      if (dirClass) {
        handle.addEventListener('mousedown', (e) => startResize(e, dirClass));
        handle.dataset.resizeBound = 'true';
      }
    }
  });
}

// Initialize drag on page load
window.addEventListener('DOMContentLoaded', () => {
  initializeVideoPanelDrag(document, 'videoPanel', 'videoPanelHeader');
  initializeVideoPanelDrag(document, 'waitingPanel', 'waitingPanelHeader');
});

/* ===============================
   WEBRTC HELPERS
================================ */
async function createPeerConnection(remoteSocketId) {
    if (peerConnections[remoteSocketId]) {
        console.log('♻️ Reusing existing peer connection for', remoteSocketId);
        return peerConnections[remoteSocketId];
    }
    
    console.log('🔨 Creating NEW peer connection for', remoteSocketId, '- localStream available:', !!localStream);
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[remoteSocketId] = peerConnection;
    
    // Ensure feed placeholder exists before tracks arrive
    if (!playerFeeds[remoteSocketId]) {
        const playerName = playerNames[remoteSocketId] || `Player ${remoteSocketId.substring(0, 4)}`;
        const isWaiting = waitingPlayers && waitingPlayers.includes(remoteSocketId);
        createPlayerFeed(remoteSocketId, playerName, null, false, isWaiting);
    }

    // ⚠️ CRITICAL: Do NOT use addTransceiver() here!
    // This causes transceiver duplication that breaks three-player video.
    // See git commit 3e292d7 and /memories/repo/WebRTC_3Player_Video_Solution.md
    // SOLUTION: Use addTrack() instead - creates transceivers naturally with proper direction
    console.log('📡 Peer connection ready for', remoteSocketId);
    
    // Immediately add local stream tracks using addTrack (creates transceivers with proper direction)
    if (localStream) {
        console.log('🎬 Adding local stream tracks to', remoteSocketId, '- using addTrack');
        let audioAdded = false, videoAdded = false;
        
        localStream.getAudioTracks().forEach(track => {
            console.log('  🔊 Audio track:', track.id, 'enabled:', track.enabled);
            if (!audioAdded) {
                console.log('  ➕ Adding audio via addTrack');
                peerConnection.addTrack(track, localStream);
                audioAdded = true;
            }
        });
        
        localStream.getVideoTracks().forEach(track => {
            console.log('  📹 Video track:', track.id, 'enabled:', track.enabled);
            if (!videoAdded) {
                console.log('  ➕ Adding video via addTrack');
                peerConnection.addTrack(track, localStream);
                videoAdded = true;
            }
        });
        
        console.log('✅ Tracks added - audio:', audioAdded, 'video:', videoAdded);
    } else {
        console.log('⚠️ NO localStream available for', remoteSocketId, '- tracks cannot be sent!');
    }
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
        console.log('✅ Received remote track from', remoteSocketId, '- kind:', event.track.kind);
        console.log('Remote streams:', event.streams);

        let streamToUse;
        if (event.streams && event.streams.length > 0) {
            streamToUse = event.streams[0];
        } else {
            // No stream array provided.  We may get separate ontrack events for
            // video and audio, so stash them in a persistent MediaStream so we
            // don't replace the video with an audio-only stream or vice versa.
            if (!remoteStreams[remoteSocketId]) {
                remoteStreams[remoteSocketId] = new MediaStream();
            }
            console.log('ℹ️ ontrack event had no streams, adding track to accumulated stream');
            remoteStreams[remoteSocketId].addTrack(event.track);
            streamToUse = remoteStreams[remoteSocketId];
        }

        displayRemoteStream(remoteSocketId, streamToUse);
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state for', remoteSocketId, ':', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            console.log('⚠️ Connection failed for', remoteSocketId, '- attempting ICE restart');
            // Attempt to restart ICE by creating a new offer with iceRestart
            if (localStream) {
                // Ensure transceivers are in proper state before ICE restart
                try {
                    const txs = peerConnection.getTransceivers();
                    for (let i = 0; i < txs.length; i++) {
                        const t = txs[i];
                        // Make sure any recvonly are changed to sendrecv for restart
                        if (t.direction === 'recvonly' && t.sender.track) {
                            t.direction = 'sendrecv';
                            console.log(`  🔄 [ICE restart] Changed transceiver[${i}] from recvonly to sendrecv`);
                        }
                    }
                } catch (err) {
                    console.warn('  ⚠️ Error updating transceivers for ICE restart:', err.message);
                }
                
                peerConnection.createOffer({ iceRestart: true })
                    .then(offer => {
                        console.log('  📝 ICE restart offer created, audio port:', 
                            (offer.sdp.match(/^m=audio ([0-9]+)/m) || ['','0'])[1]);
                        return peerConnection.setLocalDescription(offer);
                    })
                    .then(() => {
                        socket.emit('offer', {
                            to: remoteSocketId,
                            offer: peerConnection.localDescription
                        });
                        console.log('📤 Sent ICE restart offer to', remoteSocketId);
                    })
                    .catch(err => console.error('❌ ICE restart failed:', err));
            }
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state for', remoteSocketId, ':', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
            console.log('⚠️ ICE connection failed for', remoteSocketId);
        }
    };
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📤 Sending ICE candidate to', remoteSocketId, ':', event.candidate.candidate.substring(0, 50) + '...');
            socket.emit('ice-candidate', {
                to: remoteSocketId,
                candidate: event.candidate
            });
        } else {
            console.log('✅ ICE gathering complete for', remoteSocketId);
        }
    };
    
    // Apply any ICE candidates that arrived before this connection was created
    if (pendingIceCandidates[remoteSocketId] && pendingIceCandidates[remoteSocketId].length > 0) {
        console.log('📥 Applying', pendingIceCandidates[remoteSocketId].length, 'pending ICE candidates to', remoteSocketId);
        // Queue them on the new connection to be added when remote description is set
        if (!peerConnection.pendingIceCandidates) {
            peerConnection.pendingIceCandidates = [];
        }
        peerConnection.pendingIceCandidates.push(...pendingIceCandidates[remoteSocketId]);
        pendingIceCandidates[remoteSocketId] = []; // Clear the global queue
    }
    
    return peerConnection;
}

/* ===============================
   FEED MONITORING & RETRY SYSTEM
================================ */
function startFeedMonitor() {
    // Stop any existing monitor
    if (feedMonitorInterval) {
        clearInterval(feedMonitorInterval);
    }
    
    // Check feeds every 2 seconds
    feedMonitorInterval = setInterval(() => {
        monitorAndRetryFeeds();
    }, 2000);
    
    console.log('📡 Feed monitor started (checking every 2s)');
}

function stopFeedMonitor() {
    if (feedMonitorInterval) {
        clearInterval(feedMonitorInterval);
        feedMonitorInterval = null;
        console.log('🛑 Feed monitor stopped');
    }
}

function monitorAndRetryFeeds() {
    const now = Date.now();
    const RENEGOTIATION_COOLDOWN = 8000; // Wait at least 8 seconds between renegotiation attempts
    const MAX_RENEGOTIATION_ATTEMPTS = 1; // Only retry once before giving up
    
    for (const socketId of Object.keys(peerConnections)) {
        const pc = peerConnections[socketId];
        if (!pc || (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected')) {
            continue; // Skip if connection isn't in a good state
        }
        
        // Check if this peer's video feed has video tracks
        const feed = playerFeeds[socketId];
        if (!feed) continue;
        
        const stream = feed.video?.srcObject;
        const hasVideo = stream && stream.getVideoTracks && stream.getVideoTracks().length > 0;
        
        // If we have video, mark this peer as complete and stop retrying
        if (hasVideo) {
            if (lastRenegotiationAttempt[socketId] !== 'complete') {
                console.log('✅ Confirmed video feed from', socketId, '- stopping retry monitoring');
                lastRenegotiationAttempt[socketId] = 'complete';
            }
            continue; // Don't retry peers with video
        }
        
        // Skip if we've already marked this as complete
        if (lastRenegotiationAttempt[socketId] === 'complete') {
            continue;
        }
        
        const lastAttempt = lastRenegotiationAttempt[socketId] || 0;
        
        // Only try renegotiation once, after a delay
        if (typeof lastAttempt === 'number' && now - lastAttempt < RENEGOTIATION_COOLDOWN) {
            continue; // Too soon to retry
        }
        
        // Try renegotiation only once
        if (!lastRenegotiationAttempt[socketId]) {
            console.log('🔄 Missing video for', socketId, '- attempting renegotiation (attempt 1/' + MAX_RENEGOTIATION_ATTEMPTS + ')');
            lastRenegotiationAttempt[socketId] = now;
                
                // Request new offer from remote peer
                socket.emit('requestOffer', { to: socketId });
                
                // Also try creating new offer ourselves if stable
                if (pc.signalingState === 'stable' && pc.localDescription && pc.remoteDescription) {
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            socket.emit('offer', { to: socketId, offer: pc.localDescription });
                            console.log('📤 Sent renegotiation offer to', socketId);
                        })
                        .catch(err => console.warn('⚠️ Renegotiation offer failed for', socketId, ':', err));
                }
        }
    }
}

function displayRemoteStream(remoteSocketId, stream) {
    console.log('Displaying remote stream from', remoteSocketId);
    console.log('Stream tracks:', stream.getTracks().map(t => t.kind));
    
    // Check if stream has video
    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;
    console.log('Stream has video:', hasVideo, 'audio:', hasAudio);
    
    // Use locally tracked player name or placeholder
    const playerName = playerNames[remoteSocketId] || `Player ${remoteSocketId.substring(0, 4)}`;
    const isWaiting = waitingPlayers.includes(remoteSocketId);
    
    // Check if feed already exists
    if (playerFeeds[remoteSocketId]) {
        // Update existing feed with new stream
        const feed = playerFeeds[remoteSocketId];
        if (feed.video) {
            feed.video.srcObject = stream;
            feed.video.play().catch(err => console.warn('⚠️ Video play failed for', remoteSocketId, ':', err));
        }
        // Update name if we now have it
        if (playerNames[remoteSocketId] && feed.nameDiv) {
            feed.nameDiv.textContent = playerNames[remoteSocketId];
        }
        console.log('Updated existing feed for', remoteSocketId, 'with name:', playerName);
    } else {
        // Create new feed in appropriate panel
        console.log('Creating new feed for', remoteSocketId, 'with name:', playerName, '- waiting:', isWaiting);
        createPlayerFeed(remoteSocketId, playerName, stream, false, isWaiting);
    }
    
    // Request stats for this player
    socket.emit('getPlayerStats', { playerName });
}

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
  
  // Track current player socket IDs
  const currentPlayerIds = new Set();
  
  players.forEach(p => {
    const div = document.createElement('div');
    div.textContent = p.name + (p.ready ? ' ✅' : '');
    playersArea.appendChild(div);
    
    if (p.socket && p.socket.id) {
      currentPlayerIds.add(p.socket.id);
    }
  });
  
  // Remove feeds for disconnected players
  Object.keys(playerFeeds).forEach(socketId => {
    if (socketId !== mySocketId && !currentPlayerIds.has(socketId)) {
      removePlayerFeed(socketId);
      
      // Close peer connection
      if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
      }
    }
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
   TURN UPDATE (buttons + indicator + video windows)
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
  
  // Highlight current player's feed
  highlightPlayerTurn(playerId);
  
  // Update video panel with player stats and track names
  if (players && players.length > 0) {
    players.forEach(player => {
      // Track player names locally
      if (player.socketId && player.name) {
        playerNames[player.socketId] = player.name;
        // Update feed name if it exists and was showing a placeholder
        updatePlayerFeedName(player.socketId, player.name);
      }
      
      updatePlayerFeedStats(player.socketId, {
        wins: player.wins || 0,
        gamesPlayed: player.gamesPlayed || 0
      });
      
      updatePlayerFeedCards(player.socketId, player.cardsRemaining || 0);
    });
    
    // Reorder feeds by play order only once per game (at game start)
    if (!feedsOrderedThisGame) {
      // Move any waiting players back to active panel if they're now in the game
      players.forEach(player => {
        if (playerFeeds[player.socketId] && playerFeeds[player.socketId].panel === 'waiting') {
          const feed = playerFeeds[player.socketId];
          feed.container.remove();
          const activeContent = document.getElementById('videoPanelContent');
          if (activeContent) {
            activeContent.appendChild(feed.container);
            feed.panel = 'active';
          }
        }
      });
      
      reorderFeedsByPlayOrder(players);
      feedsOrderedThisGame = true;
    }
  }
});

// Waiting list handler: move players to waiting room panel
socket.on('waitingList', (waiting) => {
  console.log('📋 Received waitingList:', waiting);
  
  waitingPlayers = [];
  
  // Track waiting players' names and update panel
  if (Array.isArray(waiting)) {
    const waitingPanel = document.getElementById('waitingPanel');
    const hasWaiting = waiting.length > 0;
    
    if (waitingPanel) {
      waitingPanel.style.display = hasWaiting ? 'flex' : 'none';
    }
    
    waiting.forEach(async (player) => {
      if (player && player.socketId && player.name) {
        playerNames[player.socketId] = player.name;
        waitingPlayers.push(player.socketId);
        
        // If player feed exists, move it to waiting room
        if (playerFeeds[player.socketId]) {
          const feed = playerFeeds[player.socketId];
          // Move feed to waiting room if it's currently in active
          if (feed.panel === 'active') {
            feed.container.remove();
            const waitingContent = document.getElementById('waitingPanelContent');
            if (waitingContent) {
              waitingContent.appendChild(feed.container);
              feed.panel = 'waiting';
              feed.positionBadge.textContent = ''; // Clear position badge for waiting room
              feed.cardsDiv.textContent = ''; // Clear card count for waiting room
            }
          }
          // Update feed name if it exists
          updatePlayerFeedName(player.socketId, player.name);
        } else {
          // No feed exists for this waiting player - create peer connection if we don't have one
          if (!peerConnections[player.socketId] && localStream) {
            console.log('📞 Creating peer connection with waiting player:', player.socketId);
            await createPeerConnectionAndOffer(player.socketId);
          }
        }
      }
    });
  }
});

// Socket handler to track game start with active players
socket.on('updatePlayers', (players) => {
  console.log('📋 UpdatePlayers received:', players);
  
  // Update activePlayers array with currently active players
  if (Array.isArray(players)) {
    activePlayers = players.map(p => p.socketId || p).filter(id => id);
    
    // Hide waiting panel if no waiting players
    const waitingPanel = document.getElementById('waitingPanel');
    if (waitingPanel && waitingPlayers.length === 0) {
      waitingPanel.style.display = 'none';
    }
  }
});

// Handle existing players when joining room
socket.on('existingPlayers', async (players) => {
  console.log('📋 Existing players in room:', players);
  
  // Track their names and mark as active
  activePlayers = [];
  players.forEach(p => {
    if (p.socketId && p.name) {
      playerNames[p.socketId] = p.name;
      activePlayers.push(p.socketId);
    }
  });
  
  // Wait for local stream to be ready before creating peer connections
  if (localStream) {
    // Create peer connections with all existing players
    for (const player of players) {
      await createPeerConnectionAndOffer(player.socketId);
    }
  } else {
    // If camera not ready yet, connections will be created when camera initializes
    console.log('⏳ Camera not ready yet, peer connections will be created after initialization');
  }
});

// Handle when a new player joins the room
socket.on('newPlayerJoined', async (playerInfo) => {
  console.log('👤 New player joined:', playerInfo);
  
  if (playerInfo && playerInfo.socketId && playerInfo.name) {
    // Track the new player's name
    playerNames[playerInfo.socketId] = playerInfo.name;
    activePlayers.push(playerInfo.socketId); // Add to active players
    console.log('📝 Tracked new player name:', playerInfo.name, 'for socketId:', playerInfo.socketId);
    
    // Create peer connection with the new player if we have a local stream
    if (localStream) {
      console.log('📞 Creating peer connection with new player:', playerInfo.socketId);
      await createPeerConnectionAndOffer(playerInfo.socketId);
    } else {
      console.log('⏳ No local stream yet, will create connection when camera initializes');
    }
  } else {
    console.error('❌ Invalid playerInfo received:', playerInfo);
  }
});

// Handle player disconnection announcement from server
socket.on('playerDisconnected', ({ socketId }) => {
  console.log('👋 Player disconnected:', socketId);
  
  // Remove their feed
  removePlayerFeed(socketId);
  
  // Close peer connection
  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }
  
  // Remove their name tracking
  delete playerNames[socketId];
});

// Helper to create peer connection and send offer
async function createPeerConnectionAndOffer(remoteSocketId) {
  if (peerConnections[remoteSocketId]) {
    console.log('Peer connection already exists for', remoteSocketId);
    return;
  }
  
  try {
    const pc = await createPeerConnection(remoteSocketId);
    
    // Only create offer if our socketId is smaller (to avoid both sides offering)
    if (mySocketId < remoteSocketId) {
      console.log('📞 Creating offer for', remoteSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('📤 Sending offer to', remoteSocketId);
      socket.emit('offer', { to: remoteSocketId, offer });
      console.log('✅ Offer emitted to', remoteSocketId);
    } else {
      console.log('⏳ Waiting for offer from', remoteSocketId);
    }
  } catch (err) {
    console.error('❌ Error creating peer connection:', err);
  }
}

/* ===============================
   WEBRTC SIGNALING HANDLERS
================================ */
socket.on('offer', async ({ from, offer }) => {
  try {
    // If camera not initialized yet, queue this offer to handle after initialization
    if (!localStream) {
      console.log('⏳ Camera not ready, queuing offer from', from);
      pendingOffers.push({ from, offer });
      return;
    }
    
    console.log('📨 Received offer from', from);
    console.log('  🔍 Existing PC:', !!peerConnections[from], 'localStream:', !!localStream);
    
    // Check for offer collision - if we have higher socketId, we should be polite and accept their offer
    const existingPc = peerConnections[from];
    const isPolite = mySocketId > from;
    
    // During initial connection (have-local-offer with no remote description), use politeness
    // But once connection is established, always accept offers for renegotiation/recovery
    const isInitialHandshake = existingPc && existingPc.signalingState === 'have-local-offer' && !existingPc.remoteDescription;
    
    console.log('  PC state:', existingPc?.signalingState, 'isPolite:', isPolite, 'isInitialHandshake:', isInitialHandshake);
    
    if (isInitialHandshake && !isPolite) {
      console.log('⚠️ Initial offer collision with', from, '- ignoring (we are impolite)');
      return;
    }
    
    const pc = await createPeerConnection(from);
    console.log('  ✅ PC ready, signaling state:', pc.signalingState);
    
    // Check if we're missing video from this peer
    const isMissingVideoFromPeer = !lastRenegotiationAttempt[from] || lastRenegotiationAttempt[from] !== 'complete';
    
    // If we already have a remote description AND signaling state is not stable, skip UNLESS we're missing video from this peer
    if (pc.remoteDescription && pc.signalingState !== 'stable' && !isMissingVideoFromPeer) {
      console.log('⏭️  Skipping offer from', from, '- signaling in progress and video confirmed');
      return;
    }
    
    // Handle offer collision (glare) - if we're in have-local-offer state and we're polite, roll back
    if (pc.signalingState === 'have-local-offer') {
      if (isPolite) {
        console.log('⚠️ Offer collision detected with', from, '- rolling back (we are polite)');
        await pc.setLocalDescription({ type: 'rollback' });
      } else {
        console.log('⚠️ Offer collision detected with', from, '- ignoring (we are impolite)');
        return;
      }
    }
    
    console.log('  🔗 About to set remote description for', from);
    await pc.setRemoteDescription(offer);
    console.log('  🔗 Remote description set');
    
    // ⚠️ ESSENTIAL: This section ensures three-player video works!
    // When setRemoteDescription() is called, browser creates recvonly transceivers for incoming media.
    // We MUST change them to sendrecv BEFORE createAnswer() is called, otherwise the answer
    // will have disabled media (port 9, 0.0.0.0) and video won't display for peer pairs.
    // See git commit 3e292d7 and /memories/repo/WebRTC_3Player_Video_Solution.md
    // 🚨 DO NOT REMOVE OR MODIFY THIS SECTION 🚨
    
    // CRITICAL FIX: When offer arrives, browser creates recvonly transceivers for incoming media
    // We need to change ALL recvonly transceivers to sendrecv so answer includes our sending tracks
    let transceivers = pc.getTransceivers();
    console.log('  🎬 Checking transceivers after setRemoteDescription - total:', transceivers.length);
    
    try {
      for (let i = 0; i < transceivers.length; i++) {
        const t = transceivers[i];
        if (t.direction === 'recvonly') {
          t.direction = 'sendrecv';
          console.log(`  🔄 Changed transceiver[${i}] from recvonly to sendrecv`);
        }
      }
      console.log('✅ All recvonly transceivers changed to sendrecv');
    } catch (err) {
      console.warn('  ⚠️ Error updating transceiver directions:', err.message);
    }
    
    // Process any queued ICE candidates
    if (pc.pendingIceCandidates && pc.pendingIceCandidates.length > 0) {
      console.log('📥 Processing', pc.pendingIceCandidates.length, 'queued ICE candidates for', from);
      for (const candidate of pc.pendingIceCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('❌ Error adding queued ICE candidate:', err);
        }
      }
      pc.pendingIceCandidates = [];
    }
    
    // Debug: Check transceiver state before creating answer
    console.log('🔍 Transceiver state before answer for', from, ':');
    transceivers.forEach((t, i) => {
      console.log(`  [${i}] direction: ${t.direction}, sender.track: ${t.sender.track ? '✅ ' + t.sender.track.kind : '❌ null'}`);
    });
    
    console.log('📝 Creating answer for', from);
    const answer = await pc.createAnswer();
    console.log('  📦 Answer created, answer object keys:', Object.keys(answer));
    
    // Log SDP to verify tracks are included
    const answerSDP = answer.sdp;
    const hasAudioM = answerSDP.includes('m=audio');
    const hasVideoM = answerSDP.includes('m=video');
    const audioRecvLines = (answerSDP.match(/a=recvonly|a=sendrecv/g) || []).length;
    const audioPortMatch = answerSDP.match(/^m=audio ([0-9]+)/m);
    const audioPort = audioPortMatch ? audioPortMatch[1] : 'unknown';
    const videoPortMatch = answerSDP.match(/^m=video ([0-9]+)/m);
    const videoPort = videoPortMatch ? videoPortMatch[1] : 'unknown';
    
    console.log(`  📋 Answer SDP: audio=${hasAudioM}(port:${audioPort}) video=${hasVideoM}(port:${videoPort}) recv-capable lines=${audioRecvLines}`);
    console.log('  📋 SDP media lines:', (answerSDP.match(/^m=/gm) || []).length, 'lines');
    console.log('  📋 First 200 chars of SDP:', answerSDP.substring(0, 200));
    console.log('  Answer object type:', answer.type, 'SDP length:', answer.sdp?.length);
    
    // SAFETY CHECK: If audio port is disabled (port 9), log warning
    if (audioPort === '9') {
      console.warn('🚨 WARNING: Answer SDP has DISABLED audio port (9)! This will break video for', from);
      console.warn('   Transceivers before answer:', transceivers.map((t, i) => `[${i}]=${t.direction}(sender:${t.sender.track?.kind || 'none'})`).join(' '));
    }
    
    await pc.setLocalDescription(answer);
    console.log('  ✅ Local description set');
    
    console.log('📤 Sending answer to', from, 'answer object structure: type=' + answer.type + ' sdp.length=' + answer.sdp.length);
    socket.emit('answer', { to: from, answer });
    console.log('  ✅ Answer emitted via socket');
  } catch (err) {
    console.error('❌ Error handling offer from', from, ':', err);
  }
});

socket.on('answer', async ({ from, answer }) => {
  console.log('📨 Received answer from', from, 'answer object:', answer);
  try {
    const pc = peerConnections[from];
    console.log('  PC exists?', !!pc, 'Answer type?', answer?.type, 'Answer SDP length?', answer?.sdp?.length);
    
    if (!pc) {
      console.warn('❌ ANSWER FAILED: No peer connection found for', from);
      return;
    }
    
    if (!answer) {
      console.warn('❌ ANSWER FAILED: No answer data from', from);
      return;
    }
    
    if (!answer.type || !answer.sdp) {
      console.warn('❌ ANSWER FAILED: Invalid answer structure from', from, 'type:', answer.type, 'has SDP?', !!answer.sdp);
      return;
    }
    
    console.log('  Current signaling state:', pc.signalingState);
    
    // Only accept answers when we're expecting one (have a pending offer)
    // The state machine handles renegotiation: even after prior remote description,
    // if we send a new offer, state becomes 'have-local-offer' again and we accept the new answer
    if (pc.signalingState !== 'have-local-offer') {
      console.log('⏭️ Skipping answer from', from, '- not expecting answer (signaling state:', pc.signalingState + ')');
      return;
    }
    
    console.log('  ✅ Proceeding to setRemoteDescription for', from);
    try {
      console.log('  About to call setRemoteDescription with answer type:', answer.type);
      await pc.setRemoteDescription(answer);
      console.log('✅ Remote description set for', from, 'new signaling state:', pc.signalingState);
    } catch (err) {
      console.error('❌ SETREMOTEDESCRIPTION FAILED for', from, 'error:', err.message, 'error name:', err.name, 'signaling state was:', pc.signalingState);
      return;
    }
    
    // Process any queued ICE candidates
    if (pc.pendingIceCandidates && pc.pendingIceCandidates.length > 0) {
      console.log('📥 Processing', pc.pendingIceCandidates.length, 'queued ICE candidates for', from);
      for (const candidate of pc.pendingIceCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('❌ Error adding queued ICE candidate:', err);
        }
      }
      pc.pendingIceCandidates = [];
    }
  } catch (err) {
    console.error('❌ OUTER TRY/CATCH ERROR handling answer from', from, ':', err, 'error name:', err.name);
  }
});

socket.on('requestOffer', async ({ from }) => {
  try {
    console.log('📨 Received offer request from', from);
    const pc = peerConnections[from];
    if (!pc) {
      console.warn('⚠️ No peer connection with', from, 'to send offer');
      return;
    }
    
    console.log('  PC signaling state:', pc.signalingState, 'remoteDescription exists?', !!pc.remoteDescription);
    
    // Only respond to requestOffer if we're in a stable state
    // Don't try to create offers while negotiation is happening
    if (pc.signalingState !== 'stable') {
      console.log('⏭️ Skipping requestOffer from', from, '- not in stable state');
      return;
    }
    
    // Only send offer if we have local stream
    if (localStream) {
      console.log('📝 Creating offer in response to request from', from);
      try {
        const offer = await pc.createOffer();
        
        // Double-check state before setting local description (state may have changed during createOffer)
        if (pc.signalingState !== 'stable') {
          console.log('⏭️ State changed during createOffer for', from, '- now:', pc.signalingState, '- aborting');
          return;
        }
        
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: from, offer: pc.localDescription });
        console.log('📤 Sent requested offer to', from);
      } catch (err) {
        console.error('❌ Error creating/sending requested offer to', from, ':', err.message);
      }
    } else {
      console.warn('⚠️ Cannot send offer to', from, '- no local stream');
    }
  } catch (err) {
    console.error('❌ Error handling offer request from', from, ':', err);
  }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  try {
    const pc = peerConnections[from];
    if (pc && candidate) {
      // Check if remote description is set before adding ICE candidate
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Added ICE candidate from', from);
      } else {
        console.log('⏳ Queuing ICE candidate from', from, '(remote description not set yet)');
        // Queue the candidate to be added after remote description is set
        if (!pc.pendingIceCandidates) {
          pc.pendingIceCandidates = [];
        }
        pc.pendingIceCandidates.push(candidate);
      }
    } else if (!pc) {
      // PC doesn't exist yet - queue this candidate to add when PC is created
      console.log('⏳ Queuing ICE candidate from', from, '(peer connection not created yet)');
      if (!pendingIceCandidates[from]) {
        pendingIceCandidates[from] = [];
      }
      pendingIceCandidates[from].push(candidate);
    }
  } catch (err) {
    console.error('❌ Error adding ICE candidate from', from, ':', err);
  }
});

socket.on('playerStats', ({ playerName, stats }) => {
  // Find the socket ID for this player name from local tracking
  const socketId = Object.keys(playerNames).find(id => playerNames[id] === playerName);
  if (socketId) {
    updatePlayerFeedStats(socketId, stats);
  }
});

// Handle player disconnection - clean up their feed and connection
socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  
  // Stop monitoring feeds
  stopFeedMonitor();
  
  // Close all peer connections
  Object.keys(peerConnections).forEach(socketId => {
    if (peerConnections[socketId]) {
      peerConnections[socketId].close();
      delete peerConnections[socketId];
    }
  });
  
  // Clear all feeds when disconnected
  Object.keys(playerFeeds).forEach(socketId => {
    removePlayerFeed(socketId);
  });
  
  // Clear all tracking data
  Object.keys(playerNames).forEach(socketId => {
    if (socketId !== mySocketId) {
      delete playerNames[socketId];
    }
  });
});
