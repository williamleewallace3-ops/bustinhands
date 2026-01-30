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

socket.on('gameOver', ({ winner, loser }) => {
  showWinnerDisplay(winner, loser);
});

/* ===============================
   WINNER DISPLAY
================================ */
function showWinnerDisplay(winner, loser) {
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
  
  // Reset game after 4 seconds
  setTimeout(() => {
    overlay.remove();
    resetGame();
  }, 4000);
}

/* ===============================
   RESET GAME
================================ */
  // Reset game state
  function resetGame() {
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
  
  // Reset buttons
  readyBtn.style.display = 'inline-block';
  bustBtn.style.display = 'none';
  passBtn.style.display = 'none';
  
  // Hide turn indicator
  if (turnIndicator) {
    turnIndicator.style.display = 'none';
  }
  
  // Reset turn state
  lastTurnPlayerId = null;
  
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

/* ===============================
   WEBRTC & VIDEO STATE
================================ */
let localStream = null;
let peerConnections = {}; // socketId -> RTCPeerConnection
let dataChannels = {}; // socketId -> RTCDataChannel
let playerLayout = {}; // socketId -> window position (topLeft, topRight, bottomLeft, bottomRight)
let playerStats = {}; // socketId -> { name, wins, gamesPlayed, winPercent, cardsRemaining }
let activePlayer = null; // socketId of player whose turn it is

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};


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
    startGame('vampire-bar');
});

highRollerBtn.addEventListener('click', () => {
    selectedScene = 'high-roller';
    startGame('high-roller');
});

const beachPartyBtn = document.getElementById('beachPartyBtn');
const templeBtn = document.getElementById('templeBtn');
const tailgateBtn = document.getElementById('tailgateBtn');

beachPartyBtn.addEventListener('click', () => {
  selectedScene = 'beach-party';
  startGame('beach-party');
});

templeBtn.addEventListener('click', () => {
  selectedScene = 'japanese-temple';
  startGame('japanese-temple');
});

tailgateBtn.addEventListener('click', () => {
  selectedScene = 'gsu-tailgate';
  startGame('gsu-tailgate');
});

function startGame(scene) {
    const defaultRoomId = 'mainRoom';
    roomId = defaultRoomId;
    
    socket.emit('joinRoom', { playerName, roomId: defaultRoomId });

    // Set table background based on scene
    const sceneBackgrounds = {
        'vampire-bar': '/images/table_background.png',
        'high-roller': '/images/table_background1.png'
          ,
        'beach-party': '/images/table_background2.png',
      'japanese-temple': '/images/table_background3.png',
      'gsu-tailgate': '/images/table_background4.png'
    };
    
    tableArea.style.backgroundImage = `url('${sceneBackgrounds[scene]}')`;

    // Hide lobby and show game
    document.getElementById('lobby').style.display = 'none';
    gameDiv.style.display = 'block';
    if (roomLabel) roomLabel.textContent = 'Main Game';
    
    // Initialize camera/microphone - browser will prompt for permissions
    initializeCamera();
}

/* ===============================
   VIDEO PANEL STATE
================================ */
const playerFeeds = {}; // socketId -> { videoElement, controls, enabled }
const playerNames = {}; // socketId -> playerName (local tracking)
let feedsOrderedThisGame = false; // Track if feeds have been ordered for current game
let cameraEnabled = true;
let micEnabled = true;

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
        createPlayerFeed(mySocketId, playerName, localStream, true);
        
        // Apply own stats if they were received earlier
        if (myOwnStats) {
            updatePlayerFeedStats(mySocketId, myOwnStats);
        }
        
        // Create peer connections with players who joined before camera was ready
        const existingPlayerIds = Object.keys(playerNames).filter(id => id !== mySocketId);
        for (const playerId of existingPlayerIds) {
            if (!peerConnections[playerId]) {
                await createPeerConnectionAndOffer(playerId);
            }
        }
        
        // Add tracks to ALL existing peer connections and renegotiate if needed
        for (const socketId of Object.keys(peerConnections)) {
            const pc = peerConnections[socketId];
            const senders = pc.getSenders();
            
            // Check if we have any senders with actual tracks
            const hasActiveTracks = senders.some(sender => sender.track !== null);
            
            if (!hasActiveTracks && localStream) {
                console.log('🔄 Adding tracks to peer connection:', socketId);
                
                // Add all tracks from local stream
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                    console.log('  Added', track.kind, 'track');
                });
                
                // Renegotiate - create new offer regardless of who initiated originally
                try {
                    console.log('🔄 Renegotiating with', socketId, 'after adding tracks');
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('offer', { to: socketId, offer });
                } catch (err) {
                    console.error('❌ Error renegotiating:', err);
                }
            } else if (hasActiveTracks) {
                console.log('✅ Peer connection', socketId, 'already has active tracks');
            }
        }
    } catch (err) {
        console.error('❌ Error accessing camera/mic:', err);
        alert('Could not access camera or microphone. Video features disabled.');
    }
}

/* ===============================
   VIDEO PANEL FUNCTIONS
================================ */
function createPlayerFeed(socketId, playerName, stream, isLocal = false) {
    // Remove existing feed if it exists
    if (playerFeeds[socketId]) {
        playerFeeds[socketId].container.remove();
    }
    
    const panelContent = document.getElementById('videoPanelContent');
    
    // Create feed container
    const feedContainer = document.createElement('div');
    feedContainer.className = 'player-feed';
    feedContainer.id = `feed-${socketId}`;
    
    // Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.muted = isLocal; // Mute own feed to prevent echo
    video.srcObject = stream;
    
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
        isLocal
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
    
    // Update position badges and reorder
    playersArray.forEach((player, index) => {
        const feed = playerFeeds[player.socketId];
        if (feed) {
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
function initializeVideoPanelDrag() {
    const panel = document.getElementById('videoPanel');
    const header = document.getElementById('videoPanelHeader');
    
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        initialX = e.clientX - panel.offsetLeft;
        initialY = e.clientY - panel.offsetTop;
        panel.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        panel.style.left = currentX + 'px';
        panel.style.top = currentY + 'px';
        panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'default';
    });
}

// Initialize drag on page load
window.addEventListener('DOMContentLoaded', () => {
    initializeVideoPanelDrag();
});

/* ===============================
   WEBRTC HELPERS
================================ */
async function createPeerConnection(remoteSocketId) {
    if (peerConnections[remoteSocketId]) {
        return peerConnections[remoteSocketId];
    }
    
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[remoteSocketId] = peerConnection;
    
    // Add local stream tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
        console.log('✅ Received remote track from', remoteSocketId, '- kind:', event.track.kind);
        console.log('Remote streams:', event.streams);
        if (event.streams && event.streams.length > 0) {
            displayRemoteStream(remoteSocketId, event.streams[0]);
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state for', remoteSocketId, ':', peerConnection.connectionState);
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state for', remoteSocketId, ':', peerConnection.iceConnectionState);
    };
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: remoteSocketId,
                candidate: event.candidate
            });
        }
    };
    
    return peerConnection;
}

function displayRemoteStream(remoteSocketId, stream) {
    console.log('Displaying remote stream from', remoteSocketId);
    
    // Use locally tracked player name or placeholder
    const playerName = playerNames[remoteSocketId] || `Player ${remoteSocketId.substring(0, 4)}`;
    
    // Check if feed already exists
    if (playerFeeds[remoteSocketId]) {
        // Update existing feed with new stream
        const feed = playerFeeds[remoteSocketId];
        if (feed.video) {
            feed.video.srcObject = stream;
        }
        // Update name if we now have it
        if (playerNames[remoteSocketId] && feed.nameDiv) {
            feed.nameDiv.textContent = playerNames[remoteSocketId];
        }
        console.log('Updated existing feed for', remoteSocketId, 'with name:', playerName);
    } else {
        // Create new feed
        console.log('Creating new feed for', remoteSocketId, 'with name:', playerName);
        createPlayerFeed(remoteSocketId, playerName, stream, false);
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

        // Select card
        div.addEventListener('click', () => div.classList.toggle('selected'));
        // Drag & Drop
        div.draggable = true;
        div.addEventListener('dragstart', dragStartHandler);
        div.addEventListener('dragend', dragEndHandler);
        div.addEventListener('dragover', dragOverHandler);
        div.addEventListener('drop', dropHandler);

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
        img.src = '/cards/card_back.png';
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

            // Re-enable drag & click
            div.addEventListener('click', () => div.classList.toggle('selected'));
            div.draggable = true;
            div.addEventListener('dragstart', dragStartHandler);
            div.addEventListener('dragend', dragEndHandler);
            div.addEventListener('dragover', dragOverHandler);
            div.addEventListener('drop', dropHandler);

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
   UPDATE TABLE AREA
================================ */
socket.on('updateTable', (table) => {
  tableArea.innerHTML = '';

  const maxHandRotation = 5;
  const maxCardRotation = 3;

  table.forEach((play) => {
    const handDiv = document.createElement('div');
    handDiv.classList.add('table-hand');

    // Center (CSS can shift this if you want later)
    handDiv.style.position = 'absolute';
    handDiv.style.left = '50%';
    handDiv.style.top = '50%';
    handDiv.style.transform =
      `translate(-50%, -50%) rotate(${(Math.random() * maxHandRotation * 2) - maxHandRotation}deg)`;

    // Ensure multi-card plays go left-to-right
    handDiv.style.display = 'flex';
    handDiv.style.flexDirection = 'row';
    handDiv.style.gap = '8px';
    handDiv.style.justifyContent = 'center';
    handDiv.style.alignItems = 'center';

    play.cards.forEach((c) => {
      const cardDiv = document.createElement('div');
      cardDiv.classList.add('table-card');

      // Keep table cards non-transparent
      cardDiv.style.backgroundColor = 'white';

      const cardRotate = (Math.random() * maxCardRotation * 2) - maxCardRotation;
      cardDiv.style.transform = `rotate(${cardRotate}deg)`;

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
  const isMyTurn = (mySocketId && playerId === mySocketId);

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
      reorderFeedsByPlayOrder(players);
      feedsOrderedThisGame = true;
    }
  }
});

// Waiting list handler: all players are already in side panel
socket.on('waitingList', (waiting) => {
  console.log('📋 Received waitingList:', waiting);
  
  // Track waiting players' names
  if (Array.isArray(waiting)) {
    waiting.forEach(player => {
      if (player && player.socketId && player.name) {
        playerNames[player.socketId] = player.name;
        // Update feed name if it exists
        updatePlayerFeedName(player.socketId, player.name);
      }
    });
  }
});

// Handle existing players when joining room
socket.on('existingPlayers', async (players) => {
  console.log('📋 Existing players in room:', players);
  
  // Track their names
  players.forEach(p => {
    if (p.socketId && p.name) {
      playerNames[p.socketId] = p.name;
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
      socket.emit('offer', { to: remoteSocketId, offer });
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
    console.log('Received offer from', from);
    const pc = await createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    console.log('Creating answer for', from);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    console.log('Sending answer to', from);
    socket.emit('answer', { to: from, answer });
  } catch (err) {
    console.error('❌ Error handling offer:', err);
  }
});

socket.on('answer', async ({ from, answer }) => {
  try {
    console.log('Received answer from', from);
    const pc = peerConnections[from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Remote description set for', from);
    } else {
      console.warn('⚠️ No peer connection for', from);
    }
  } catch (err) {
    console.error('❌ Error handling answer:', err);
  }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  try {
    const pc = peerConnections[from];
    if (pc && candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
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
