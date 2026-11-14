// ========================================
// TEXAS HOLD EM UI CLIENT
// ========================================

/**
 * Initialize Texas Hold Em specific UI elements
 * This is called when a player joins a Texas Hold Em game
 */
function initializeTexasHoldEmUI() {
  console.log('🤠 Initializing Texas Hold Em UI');
  
  // Clear existing table area
  const tableArea = document.getElementById('tableArea');
  tableArea.innerHTML = '';
  
  // Create Hold Em specific UI
  const holdEmContainer = document.createElement('div');
  holdEmContainer.id = 'holdEmContainer';
  holdEmContainer.className = 'holdem-container';
  
  // Community cards area
  const communityArea = document.createElement('div');
  communityArea.id = 'communityCards';
  communityArea.className = 'community-cards';
  communityArea.innerHTML = `
    <h3>Community Cards</h3>
    <div id="communityCardsList" class="card-list"></div>
  `;
  
  // Pot area
  const potArea = document.createElement('div');
  potArea.id = 'potDisplay';
  potArea.className = 'pot-display';
  potArea.innerHTML = `
    <div class="pot-label">Pot</div>
    <div id="potAmount" class="pot-amount">$0.00</div>
  `;
  
  // Player seating positions (will be dynamically populated)
  const seatingArea = document.createElement('div');
  seatingArea.id = 'seatingArea';
  seatingArea.className = 'seating-area';
  
  // Betting controls area
  const bettingArea = document.createElement('div');
  bettingArea.id = 'bettingControls';
  bettingArea.className = 'betting-controls';
  bettingArea.innerHTML = `
    <div class="action-buttons">
      <button id="checkBtn" class="action-btn check-btn" style="display:none;">Check</button>
      <button id="callBtn" class="action-btn call-btn" style="display:none;">Call</button>
      <button id="foldBtn" class="action-btn fold-btn" style="display:none;">Fold</button>
    </div>
    <div class="bet-options" id="betOptions" style="display:none;">
      <div class="bet-size-buttons">
        <button id="betMinBtn" class="bet-size-btn" data-bet-type="min" style="display:none;">Min</button>
        <button id="bet1_4Btn" class="bet-size-btn" data-bet-type="1/4" style="display:none;">1/4 Pot</button>
        <button id="bet1_3Btn" class="bet-size-btn" data-bet-type="1/3" style="display:none;">1/3 Pot</button>
        <button id="bet1_2Btn" class="bet-size-btn" data-bet-type="1/2" style="display:none;">1/2 Pot</button>
        <button id="betPotBtn" class="bet-size-btn" data-bet-type="pot" style="display:none;">Pot</button>
        <button id="bet2xBtn" class="bet-size-btn" data-bet-type="2x" style="display:none;">2x Pot</button>
        <button id="betAllInBtn" class="bet-size-btn" data-bet-type="allin" style="display:none;">All-In</button>
      </div>
      <div class="custom-bet-area">
        <input type="number" id="customBetAmount" placeholder="Custom amount" min="0" step="0.01" style="display:none;">
        <button id="customBetBtn" class="bet-size-btn" data-bet-type="custom" style="display:none;">Custom</button>
        <button id="confirmCustomBetBtn" style="display:none;">Confirm</button>
        <button id="cancelBetBtn" class="cancel-btn" style="display:none;">Cancel</button>
      </div>
    </div>
  `;
  
  holdEmContainer.appendChild(communityArea);
  holdEmContainer.appendChild(potArea);
  holdEmContainer.appendChild(seatingArea);
  holdEmContainer.appendChild(bettingArea);
  
  tableArea.appendChild(holdEmContainer);
  
  // Attach event listeners
  attachTexasHoldEmListeners();
  
  // Add CSS if not already present
  if (!document.getElementById('holdemStyles')) {
    addTexasHoldEmStyles();
  }
}

/**
 * Display community cards
 */
function displayCommunityCards(cards) {
  const cardsList = document.getElementById('communityCardsList');
  if (!cardsList) return;
  
  cardsList.innerHTML = '';
  
  cards.forEach(card => {
    const cardEl = createCardElement(card);
    cardEl.classList.add('community-card');
    cardsList.appendChild(cardEl);
  });
}

/**
 * Update pot display
 */
function updatePotDisplay(potAmount) {
  const potDisplay = document.getElementById('potAmount');
  if (potDisplay) {
    potDisplay.textContent = '$' + potAmount.toFixed(2);
  }
}

/**
 * Display player at seat
 * Current player (mySocketId) is always at bottom center
 * Other players positioned around relative to them
 */
function displayPlayerAtSeat(seatNumber, playerInfo) {
  let seatingArea = document.getElementById('seatingArea');
  if (!seatingArea) return;
  
  // Determine position based on whether this is the current player
  let position = 'bottom'; // Default for current player
  
  // If this is not the current player, position them around the table in a circle
  // Only use positions that don't overlap with dealer/table center (avoid 11, 12, 1 o'clock)
  if (playerInfo.id !== mySocketId) {
    // Create circular positions around the table (current player is at bottom center)
    // Positions: bottom-right, right, bottom-left, left (avoiding top)
    const positions = [
      'bottom-right',   // 0 - 4-5 o'clock
      'right',          // 1 - 3 o'clock
      'bottom-left',    // 2 - 7-8 o'clock
      'left',           // 3 - 9 o'clock
    ];
    position = positions[seatNumber % 4];
  }
  
  // Create seat element
  const seatDiv = document.createElement('div');
  seatDiv.className = `player-seat seat-${position}`;
  seatDiv.id = `seat-${seatNumber}`;
  seatDiv.innerHTML = `
    <div class="seat-info">
      <div class="player-name">${playerInfo.name}</div>
      <div class="player-stack">$${playerInfo.stack.toFixed(2)}</div>
      <div class="player-current-bet" id="bet-${playerInfo.id}" style="display:none;">
        Bet: $<span>0</span>
      </div>
      <div class="player-hole-cards" id="hole-cards-${playerInfo.id}"></div>
    </div>
  `;
  
  // Highlight if it's their turn
  if (playerInfo.isCurrentBettor) {
    seatDiv.classList.add('current-bettor');
  }
  
  seatingArea.appendChild(seatDiv);
}

/**
 * Display player's hole cards (only for self)
 */
function displayPlayerHoleCards(playerId, cards) {
  const holesCardsDiv = document.getElementById(`hole-cards-${playerId}`);
  if (!holesCardsDiv) {
    console.warn(`Hole cards container not found for player ${playerId}`);
    return;
  }
  
  console.log(`Displaying ${cards?.length || 0} hole cards for player ${playerId}:`, cards);
  holesCardsDiv.innerHTML = '';
  
  if (!cards || !Array.isArray(cards)) {
    console.warn('Invalid cards data:', cards);
    return;
  }
  
  cards.forEach((card, index) => {
    const cardEl = createCardElement(card);
    cardEl.classList.add('hole-card');
    console.log(`Added card ${index}:`, card, '-> Element text:', cardEl.textContent);
    holesCardsDiv.appendChild(cardEl);
  });
}

/**
 * Create a card element (visual representation)
 */
function createCardElement(card) {
  const suitMap = { 'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠' };
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  
  // Handle both string and object card formats
  let suit, rank;
  if (typeof card === 'string') {
    suit = card.slice(-1).toUpperCase();
    rank = card.slice(0, -1);
  } else if (card && typeof card === 'object') {
    suit = (card.suit || '').toUpperCase();
    rank = card.rank || '?';
  } else {
    rank = '?';
    suit = '?';
  }
  
  const suitSymbol = suitMap[suit] || suit;
  const displayText = `${rank}${suitSymbol}`;
  
  cardDiv.textContent = displayText;
  cardDiv.setAttribute('data-rank', rank);
  cardDiv.setAttribute('data-suit', suit);
  
  return cardDiv;
}

/**
 * Show betting controls for current player
 */
function showBettingControls(gameState) {
  const checkBtn = document.getElementById('checkBtn');
  const callBtn = document.getElementById('callBtn');
  const foldBtn = document.getElementById('foldBtn');
  const betOptions = document.getElementById('betOptions');
  
  // Hide all by default
  checkBtn.style.display = 'none';
  callBtn.style.display = 'none';
  foldBtn.style.display = 'none';
  betOptions.style.display = 'none';
  
  // Calculate amount to call
  const amountToCall = gameState.highestBet - (gameState.playerCurrentBet || 0);
  
  if (gameState.highestBet === 0) {
    // No bet yet (first to act or at start of round) - show check or bet options
    // Hide fold for first to act (nothing to fold to)
    checkBtn.style.display = 'inline-block';
    showBetSizingOptions(gameState, 'bet');
  } else {
    // There's a bet - show call, fold, and raise options
    // Only show fold if there's actually a bet to fold to
    foldBtn.style.display = 'inline-block';
    callBtn.style.display = 'inline-block';
    callBtn.textContent = `Call $${amountToCall.toFixed(2)}`;
    callBtn.dataset.amount = amountToCall.toFixed(2);
    showBetSizingOptions(gameState, 'raise');
  }
}

/**
 * Show betting size options
 */
function showBetSizingOptions(gameState, betType) {
  const betOptions = document.getElementById('betOptions');
  const pot = gameState.pot || 0;
  const playerStack = gameState.playerStack || 0;
  const smallBlind = gameState.smallBlind || 0.05;
  const bigBlind = gameState.bigBlind || 0.10;
  const minBet = bigBlind;
  
  // Calculate bet sizes
  const betSizes = {
    min: minBet,
    '1/4': pot / 4,
    '1/3': pot / 3,
    '1/2': pot / 2,
    pot: pot,
    '2x': pot * 2,
    allin: playerStack
  };
  
  // Show bet sizing options
  const betMinBtn = document.getElementById('betMinBtn');
  const bet1_4Btn = document.getElementById('bet1_4Btn');
  const bet1_3Btn = document.getElementById('bet1_3Btn');
  const bet1_2Btn = document.getElementById('bet1_2Btn');
  const betPotBtn = document.getElementById('betPotBtn');
  const bet2xBtn = document.getElementById('bet2xBtn');
  const betAllInBtn = document.getElementById('betAllInBtn');
  const customBetBtn = document.getElementById('customBetBtn');
  const customBetAmount = document.getElementById('customBetAmount');
  
  // Show Min button
  if (betMinBtn) {
    betMinBtn.style.display = 'inline-block';
    betMinBtn.textContent = `Min ($${minBet.toFixed(2)})`;
    betMinBtn.dataset.amount = minBet.toFixed(2);
  }
  
  // Show 1/4 pot
  if (bet1_4Btn && betSizes['1/4'] > 0) {
    bet1_4Btn.style.display = 'inline-block';
    bet1_4Btn.textContent = `1/4 Pot ($${betSizes['1/4'].toFixed(2)})`;
    bet1_4Btn.dataset.amount = betSizes['1/4'].toFixed(2);
  } else if (bet1_4Btn) {
    bet1_4Btn.style.display = 'none';
  }
  
  // Show 1/3 pot
  if (bet1_3Btn && betSizes['1/3'] > 0) {
    bet1_3Btn.style.display = 'inline-block';
    bet1_3Btn.textContent = `1/3 Pot ($${betSizes['1/3'].toFixed(2)})`;
    bet1_3Btn.dataset.amount = betSizes['1/3'].toFixed(2);
  } else if (bet1_3Btn) {
    bet1_3Btn.style.display = 'none';
  }
  
  // Show 1/2 pot
  if (bet1_2Btn && betSizes['1/2'] > 0) {
    bet1_2Btn.style.display = 'inline-block';
    bet1_2Btn.textContent = `1/2 Pot ($${betSizes['1/2'].toFixed(2)})`;
    bet1_2Btn.dataset.amount = betSizes['1/2'].toFixed(2);
  } else if (bet1_2Btn) {
    bet1_2Btn.style.display = 'none';
  }
  
  // Show pot
  if (betPotBtn && betSizes.pot > 0) {
    betPotBtn.style.display = 'inline-block';
    betPotBtn.textContent = `Pot ($${betSizes.pot.toFixed(2)})`;
    betPotBtn.dataset.amount = betSizes.pot.toFixed(2);
  } else if (betPotBtn) {
    betPotBtn.style.display = 'none';
  }
  
  // Show 2x pot
  if (bet2xBtn && betSizes['2x'] > 0) {
    bet2xBtn.style.display = 'inline-block';
    bet2xBtn.textContent = `2x Pot ($${betSizes['2x'].toFixed(2)})`;
    bet2xBtn.dataset.amount = betSizes['2x'].toFixed(2);
  } else if (bet2xBtn) {
    bet2xBtn.style.display = 'none';
  }
  
  // Show all-in
  if (betAllInBtn && playerStack > 0) {
    betAllInBtn.style.display = 'inline-block';
    betAllInBtn.textContent = `All-In ($${playerStack.toFixed(2)})`;
    betAllInBtn.dataset.amount = playerStack.toFixed(2);
  } else if (betAllInBtn) {
    betAllInBtn.style.display = 'none';
  }
  
  // Show custom bet option
  if (customBetBtn) {
    customBetBtn.style.display = 'inline-block';
    customBetAmount.style.display = 'inline-block';
    customBetAmount.value = '';
  }
  
  // Show confirm and cancel buttons for custom
  const confirmCustomBetBtn = document.getElementById('confirmCustomBetBtn');
  const cancelBetBtn = document.getElementById('cancelBetBtn');
  if (confirmCustomBetBtn) confirmCustomBetBtn.style.display = 'inline-block';
  if (cancelBetBtn) cancelBetBtn.style.display = 'inline-block';
  
  // Show bet options container
  betOptions.style.display = 'flex';
  betOptions.dataset.actionType = betType;
}

/**
 * Hide betting controls
 */
function hideBettingControls() {
  const bettingControls = document.getElementById('bettingControls');
  if (bettingControls) {
    bettingControls.style.display = 'none';
  }
}

/**
 * Update display of current bettor
 */
function updateCurrentBettor(playerId) {
  // Remove highlighting from all seats
  document.querySelectorAll('.player-seat.current-bettor').forEach(seat => {
    seat.classList.remove('current-bettor');
  });
}

/**
 * Update player's current bet display
 */
function updatePlayerBetDisplay(playerId, betAmount) {
  const betDisplay = document.getElementById(`bet-${playerId}`);
  if (betDisplay && betAmount > 0) {
    betDisplay.style.display = 'block';
    betDisplay.querySelector('span').textContent = betAmount.toFixed(2);
  } else if (betDisplay) {
    betDisplay.style.display = 'none';
  }
}

/**
 * Display game message (flop revealed, turn revealed, etc.)
 */
function displayGameMessage(message, type = 'info') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `game-message message-${type}`;
  messageDiv.textContent = message;
  
  const tableArea = document.getElementById('tableArea');
  tableArea.appendChild(messageDiv);
  
  // Auto-remove after 3 seconds
  setTimeout(() => messageDiv.remove(), 3000);
}

/**
 * Attach event listeners for Texas Hold Em actions
 */
function attachTexasHoldEmListeners() {
  const checkBtn = document.getElementById('checkBtn');
  const callBtn = document.getElementById('callBtn');
  const foldBtn = document.getElementById('foldBtn');
  const betMinBtn = document.getElementById('betMinBtn');
  const bet1_4Btn = document.getElementById('bet1_4Btn');
  const bet1_3Btn = document.getElementById('bet1_3Btn');
  const bet1_2Btn = document.getElementById('bet1_2Btn');
  const betPotBtn = document.getElementById('betPotBtn');
  const bet2xBtn = document.getElementById('bet2xBtn');
  const betAllInBtn = document.getElementById('betAllInBtn');
  const customBetBtn = document.getElementById('customBetBtn');
  const confirmCustomBetBtn = document.getElementById('confirmCustomBetBtn');
  const cancelBetBtn = document.getElementById('cancelBetBtn');
  
  // Action buttons
  if (checkBtn) checkBtn.addEventListener('click', () => playerAction('check'));
  if (callBtn) callBtn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    playerAction('call', amount);
  });
  if (foldBtn) foldBtn.addEventListener('click', () => playerAction('fold'));
  
  // Bet sizing buttons
  if (betMinBtn) betMinBtn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (bet1_4Btn) bet1_4Btn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (bet1_3Btn) bet1_3Btn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (bet1_2Btn) bet1_2Btn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (betPotBtn) betPotBtn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (bet2xBtn) bet2xBtn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (betAllInBtn) betAllInBtn.addEventListener('click', (e) => {
    const amount = parseFloat(e.target.dataset.amount);
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    playerAction(actionType, amount);
  });
  
  if (customBetBtn) customBetBtn.addEventListener('click', () => {
    const customInput = document.getElementById('customBetAmount');
    customInput.focus();
  });
  
  if (confirmCustomBetBtn) confirmCustomBetBtn.addEventListener('click', () => {
    const customInput = document.getElementById('customBetAmount');
    const amount = parseFloat(customInput.value) || 0;
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    
    if (amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    playerAction(actionType, amount);
  });
  
  if (cancelBetBtn) cancelBetBtn.addEventListener('click', () => {
    const betOptions = document.getElementById('betOptions');
    betOptions.style.display = 'none';
  });
}

/**
 * Player action - send to server
 */
function playerAction(action, amount = 0) {
  if (!mySocketId) return;
  
  console.log(`🎯 Action: ${action}`, amount > 0 ? `$${amount.toFixed(2)}` : '');
  
  // Hide betting options after action
  const betOptions = document.getElementById('betOptions');
  if (betOptions) betOptions.style.display = 'none';
  
  socket.emit('pokerAction', {
    roomId,
    gameType: 'texasHoldEm',
    action,
    amount
  });
}

/**
 * Add CSS styles for Texas Hold Em UI
 */
function addTexasHoldEmStyles() {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'holdemStyles';
  styleSheet.textContent = `
    /* Texas Hold Em Styles */
    .holdem-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      position: relative;
    }
    
    .community-cards {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .community-cards h3 {
      color: white;
      font-size: 18px;
      margin: 0 0 10px 0;
    }
    
    .card-list {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    
    .card {
      width: 60px;
      height: 80px;
      background: white;
      border: 2px solid #333;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      cursor: default;
    }
    
    .community-card {
      transform: scale(1.1);
    }
    
    .hole-card {
      width: 50px;
      height: 70px;
      margin: 0 2px;
    }
    
    .pot-display {
      text-align: center;
      background: rgba(0, 0, 0, 0.5);
      padding: 15px 30px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    
    .pot-label {
      color: #aaa;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .pot-amount {
      color: #ffd700;
      font-size: 28px;
      font-weight: bold;
      margin-top: 5px;
    }
    
    .seating-area {
      position: relative;
      width: 100%;
      height: 300px;
      margin: 20px 0;
    }
    
    .player-seat {
      position: absolute;
      width: 110px;
      text-align: center;
      color: white;
      padding: 10px;
      border-radius: 8px;
      background: rgba(50, 50, 60, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.2);
      transition: all 0.3s ease;
      font-size: 12px;
    }
    
    .player-seat.current-bettor {
      border-color: #ffd700;
      box-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
      background: rgba(80, 80, 90, 0.9);
    }
    
    /* Current player - bottom center */
    .player-seat.seat-bottom { 
      bottom: 10px; 
      left: 50%; 
      transform: translateX(-50%); 
    }
    
    /* Side positions only - avoid top where dealer image is */
    .player-seat.seat-bottom-right { 
      bottom: 60px; 
      right: 40px; 
    }
    
    .player-seat.seat-right { 
      right: 10px; 
      top: 50%; 
      transform: translateY(-50%); 
    }
    
    .player-seat.seat-bottom-left { 
      bottom: 60px; 
      left: 40px; 
    }
    
    .player-seat.seat-left { 
      left: 10px; 
      top: 50%; 
      transform: translateY(-50%); 
    }
    
    .player-name {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .player-stack {
      font-size: 11px;
      color: #90EE90;
    }
    
    .player-current-bet {
      font-size: 10px;
      color: #ffaa00;
      margin-top: 3px;
    }
    
    .player-hole-cards {
      display: flex;
      justify-content: center;
      gap: 2px;
      margin-top: 5px;
    }
    
    .betting-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    
    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .action-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #1f7a3d;
      color: white;
    }
    
    .action-btn:hover {
      background: #145c2e;
      transform: scale(1.05);
    }
    
    .action-btn:active {
      transform: scale(0.95);
    }
    
    .check-btn {
      background: #1f7a1f;
    }
    
    .check-btn:hover {
      background: #146614;
    }
    
    .call-btn {
      background: #1f7a4f;
    }
    
    .call-btn:hover {
      background: #14663a;
    }
    
    .fold-btn {
      background: #7a1f1f;
    }
    
    .fold-btn:hover {
      background: #5c1414;
    }
    
    .bet-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
      justify-content: center;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
    }
    
    .bet-size-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .bet-size-btn {
      padding: 8px 14px;
      border: 1px solid #fff;
      border-radius: 4px;
      background: #2d5a3d;
      color: white;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;
    }
    
    .bet-size-btn:hover {
      background: #3d7a4d;
      transform: scale(1.05);
    }
    
    .bet-size-btn:active {
      transform: scale(0.95);
    }
    
    .custom-bet-area {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .custom-bet-area input {
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      width: 120px;
      font-size: 13px;
    }
    
    .cancel-btn {
      padding: 8px 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #555;
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;
    }
    
    .cancel-btn:hover {
      background: #777;
    }
    
    .game-message {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px 40px;
      border-radius: 10px;
      font-size: 18px;
      font-weight: bold;
      z-index: 5000;
      text-align: center;
      max-width: 500px;
    }
    
    .message-info {
      border: 2px solid #1f7a3d;
    }
    
    .message-warning {
      border: 2px solid #ffaa00;
    }
    
    .message-error {
      border: 2px solid #ff4444;
    }
  `;
  
  document.head.appendChild(styleSheet);
}
