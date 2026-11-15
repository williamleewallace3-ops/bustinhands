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
  
  // Top section: Community cards (centered)
  const topSection = document.createElement('div');
  topSection.className = 'top-section';
  
  const communityArea = document.createElement('div');
  communityArea.id = 'communityCards';
  communityArea.className = 'community-cards';
  communityArea.innerHTML = `
    <div id="communityCardsList" class="card-list"></div>
  `;
  topSection.appendChild(communityArea);
  
  // Pot area
  const potArea = document.createElement('div');
  potArea.id = 'potDisplay';
  potArea.className = 'pot-display';
  potArea.innerHTML = `
    <div class="pot-label">Pot</div>
    <div id="potAmount" class="pot-amount">$0.00</div>
  `;
  topSection.appendChild(potArea);
  
  // Player seating positions (will be dynamically populated)
  const seatingArea = document.createElement('div');
  seatingArea.id = 'seatingArea';
  seatingArea.className = 'seating-area';
  
  // Bottom section: Betting controls and player hole cards
  const bottomSection = document.createElement('div');
  bottomSection.className = 'bottom-section';
  
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
  
  // Player's hole cards area (below betting controls)
  const playerHoleCardsArea = document.createElement('div');
  playerHoleCardsArea.id = 'playerHoleCardsArea';
  playerHoleCardsArea.className = 'player-hole-cards-area';
  playerHoleCardsArea.innerHTML = `
    <div id="playerHoleCardsList" class="player-hole-cards"></div>
  `;
  
  bottomSection.appendChild(bettingArea);
  bottomSection.appendChild(playerHoleCardsArea);
  
  holdEmContainer.appendChild(topSection);
  holdEmContainer.appendChild(seatingArea);
  holdEmContainer.appendChild(bottomSection);
  
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
 * Current player (mySocketId) is always at 6 o'clock (bottom center)
 * Other players positioned around table based on their relative order
 */
function displayPlayerAtSeat(seatNumber, playerInfo, totalPlayers = 2, allPlayers = []) {
  let seatingArea = document.getElementById('seatingArea');
  if (!seatingArea) return;
  
  // Determine position based on whether this is the current player
  let position = '6'; // Default for current player (6 o'clock)
  
  // If this is not the current player, position them around the table
  if (playerInfo.id !== mySocketId) {
    // Find the current player's position in the array
    const myIndex = allPlayers.findIndex(p => p.id === mySocketId);
    
    // Calculate this player's offset from current player (clockwise)
    let offset = (seatNumber - myIndex + totalPlayers) % totalPlayers;
    
    // Seating chart: map offset positions to clock positions
    // This ensures each player sees themselves at 6, and others positioned accordingly
    const seatingCharts = {
      2: [6, 9],                          // offset 0 @ 6, offset 1 @ 9
      3: [6, 9, 3],                       // offset 0 @ 6, offset 1 @ 9, offset 2 @ 3
      4: [6, 8, 10, 3],                   // offset 0 @ 6, offset 1 @ 8, offset 2 @ 10, offset 3 @ 3
      5: [6, 8, 10, 2, 4],                // offset 0 @ 6, offset 1 @ 8, offset 2 @ 10, offset 3 @ 2, offset 4 @ 4
      6: [6, 8, 9, 10, 2, 4],             // etc.
      7: [6, 8, 9, 10, 2, 3, 4],
      8: [6, 7, 8, 9, 10, 2, 3, 4],
      9: [6, 7, 8, 9, 10, 2, 3, 4, 5]
    };
    
    const chart = seatingCharts[totalPlayers] || seatingCharts[2];
    position = chart[offset] ? String(chart[offset]) : '6';
  }
  
  // Create seat element
  const seatDiv = document.createElement('div');
  seatDiv.className = `player-seat seat-${position}-oclock`;
  seatDiv.id = `seat-${seatNumber}`;
  
  // Only create seat-table-cards for OTHER players
  const tableCardsHTML = playerInfo.id !== mySocketId ? `
    <div class="seat-table-cards" id="table-cards-${playerInfo.id}" data-position="${position}">
      <div class="table-card"></div>
      <div class="table-card"></div>
    </div>
  ` : '';
  
  seatDiv.innerHTML = `
    <div class="seat-info">
      <div class="player-name">${playerInfo.name}</div>
      <div class="player-stack">$${playerInfo.stack.toFixed(2)}</div>
      <div class="player-current-bet" id="bet-${playerInfo.id}" style="display:none;">
        Bet: $<span>0</span>
      </div>
      ${tableCardsHTML}
    </div>
  `;
  
  // Set card back image on table cards for OTHER players only
  if (playerInfo.id !== mySocketId) {
    const cardBackImage = `/cards/card_back${window.selectedDeck === '2' ? '2' : ''}.png`;
    const tableCards = seatDiv.querySelectorAll('.table-card');
    tableCards.forEach(card => {
      card.style.backgroundImage = `url('${cardBackImage}')`;
    });
  }
  
  // Highlight if it's their turn
  if (playerInfo.isCurrentBettor) {
    seatDiv.classList.add('current-bettor');
  }
  
  seatingArea.appendChild(seatDiv);
}

/**
 * Display player's hole cards (only for self, displayed below betting controls)
 */
function displayPlayerHoleCards(playerId, cards) {
  const playerHoleCardsList = document.getElementById('playerHoleCardsList');
  if (!playerHoleCardsList) {
    console.warn(`Player hole cards container not found`);
    return;
  }
  
  console.log(`Displaying ${cards?.length || 0} hole cards for player ${playerId}:`, cards);
  playerHoleCardsList.innerHTML = '';
  
  if (!cards || !Array.isArray(cards)) {
    console.warn('Invalid cards data:', cards);
    return;
  }
  
  cards.forEach((card, index) => {
    const cardEl = createCardElement(card);
    cardEl.classList.add('hole-card');
    console.log(`Added card ${index}:`, card, '-> Element text:', cardEl.textContent);
    playerHoleCardsList.appendChild(cardEl);
  });
}

/**
 * Animate cards folding to center when player folds
 * Cards slide to center from their position around the table
 */
function animateFoldCards(playerId) {
  const tableCardsContainer = document.getElementById(`table-cards-${playerId}`);
  if (!tableCardsContainer) return;
  
  // Get the position of the folding player (2, 3, 4, 5, 6, 7, 8, 9, 10)
  const position = tableCardsContainer.getAttribute('data-position');
  
  const tableCards = tableCardsContainer.querySelectorAll('.table-card');
  tableCards.forEach(card => {
    // Add the position-specific animation class
    card.classList.add(`fold-${position}-oclock`);
  });
  
  // After animation completes, hide the container
  setTimeout(() => {
    tableCardsContainer.style.display = 'none';
  }, 800);
}

/**
 * Show table cards for players still in hand
 */
function showTableCards(playerId) {
  const tableCardsContainer = document.getElementById(`table-cards-${playerId}`);
  if (!tableCardsContainer) return;
  
  tableCardsContainer.style.display = 'flex';
  const tableCards = tableCardsContainer.querySelectorAll('.table-card');
  tableCards.forEach(card => {
    // Remove all position-specific fold animation classes
    card.classList.remove('fold-2-oclock', 'fold-3-oclock', 'fold-4-oclock', 
                           'fold-5-oclock', 'fold-6-oclock', 'fold-7-oclock', 
                           'fold-8-oclock', 'fold-9-oclock', 'fold-10-oclock');
  });
}

/**
 * Create a card element (visual representation)
 */
function createCardElement(card) {
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
  
  // Map suit letters to full names for image paths
  const suitNameMap = { 'C': 'clubs', 'D': 'diamonds', 'H': 'hearts', 'S': 'spades' };
  const suitName = suitNameMap[suit] || 'clubs';
  
  // Map rank letters/numbers to image filenames
  const rankNameMap = {
    'A': 'ace',
    'K': 'king',
    'Q': 'queen',
    'J': 'jack',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
  };
  const rankName = rankNameMap[rank] || rank;
  
  // Create image path
  const imagePath = `/cards/${rankName}_of_${suitName}.png`;
  
  // Set background image
  cardDiv.style.backgroundImage = `url('${imagePath}')`;
  cardDiv.style.backgroundSize = 'cover';
  cardDiv.style.backgroundPosition = 'center';
  
  cardDiv.setAttribute('data-rank', rank);
  cardDiv.setAttribute('data-suit', suit);
  
  console.log(`Card image: ${imagePath}`);
  
  return cardDiv;
}

/**
 * Show betting controls for current player
 */
function showBettingControls(gameState) {
  const bettingControls = document.getElementById('bettingControls');
  const checkBtn = document.getElementById('checkBtn');
  const callBtn = document.getElementById('callBtn');
  const foldBtn = document.getElementById('foldBtn');
  const betOptions = document.getElementById('betOptions');
  
  // Show the betting controls container
  if (bettingControls) {
    bettingControls.style.display = 'block';
  }
  
  // Hide all buttons by default
  checkBtn.style.display = 'none';
  callBtn.style.display = 'none';
  foldBtn.style.display = 'none';
  betOptions.style.display = 'none';
  
  // Calculate amount to call
  const amountToCall = gameState.highestBet - (gameState.playerCurrentBet || 0);
  
  if (amountToCall === 0) {
    // Nothing to call - show check or bet options
    checkBtn.style.display = 'inline-block';
    showBetSizingOptions(gameState, 'bet');
  } else {
    // There's a bet to call - show call, fold, and raise options
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
  const playerCurrentBet = gameState.playerCurrentBet || 0;
  const highestBet = gameState.highestBet || 0;
  
  // For raises, minimum must be at least the previous bet amount
  let minBet;
  if (betType === 'raise') {
    // Minimum raise is the highest bet in the pot
    minBet = highestBet;
  } else {
    // For initial bets, minimum is big blind
    minBet = bigBlind;
  }
  
  // Maximum is player's remaining stack
  const maxBet = playerStack;
  
  // Calculate bet sizes (don't enforce minimums - just hide illegal ones)
  let betSizes;
  if (betType === 'raise') {
    // For raises, add highestBet to the bet sizes (since we're matching + raising)
    betSizes = {
      min: minBet,
      '1/4': highestBet + (pot / 4),
      '1/3': highestBet + (pot / 3),
      '1/2': highestBet + (pot / 2),
      pot: highestBet + pot,
      '2x': highestBet + (pot * 2),
      allin: playerStack + playerCurrentBet
    };
  } else {
    // For initial bets, bet sizes are just multiples of the pot
    betSizes = {
      min: minBet,
      '1/4': pot / 4,
      '1/3': pot / 3,
      '1/2': pot / 2,
      pot: pot,
      '2x': pot * 2,
      allin: playerStack
    };
  }
  
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
  
  // Show Min button (only if it's legal)
  if (betMinBtn) {
    if (minBet <= maxBet && minBet > 0) {
      betMinBtn.style.display = 'inline-block';
      betMinBtn.textContent = `Min ($${minBet.toFixed(2)})`;
      betMinBtn.dataset.amount = minBet.toFixed(2);
    } else {
      betMinBtn.style.display = 'none';
    }
  }
  
  // Show 1/4 pot (only if legal - must be >= minBet and <= maxBet)
  if (bet1_4Btn) {
    if (betSizes['1/4'] >= minBet && betSizes['1/4'] <= maxBet && betSizes['1/4'] > 0) {
      bet1_4Btn.style.display = 'inline-block';
      bet1_4Btn.textContent = `1/4 Pot ($${betSizes['1/4'].toFixed(2)})`;
      bet1_4Btn.dataset.amount = betSizes['1/4'].toFixed(2);
    } else {
      bet1_4Btn.style.display = 'none';
    }
  }
  
  // Show 1/3 pot (only if legal)
  if (bet1_3Btn) {
    if (betSizes['1/3'] >= minBet && betSizes['1/3'] <= maxBet && betSizes['1/3'] > 0) {
      bet1_3Btn.style.display = 'inline-block';
      bet1_3Btn.textContent = `1/3 Pot ($${betSizes['1/3'].toFixed(2)})`;
      bet1_3Btn.dataset.amount = betSizes['1/3'].toFixed(2);
    } else {
      bet1_3Btn.style.display = 'none';
    }
  }
  
  // Show 1/2 pot (only if legal)
  if (bet1_2Btn) {
    if (betSizes['1/2'] >= minBet && betSizes['1/2'] <= maxBet && betSizes['1/2'] > 0) {
      bet1_2Btn.style.display = 'inline-block';
      bet1_2Btn.textContent = `1/2 Pot ($${betSizes['1/2'].toFixed(2)})`;
      bet1_2Btn.dataset.amount = betSizes['1/2'].toFixed(2);
    } else {
      bet1_2Btn.style.display = 'none';
    }
  }
  
  // Show pot (only if legal)
  if (betPotBtn) {
    if (betSizes.pot >= minBet && betSizes.pot <= maxBet && betSizes.pot > 0) {
      betPotBtn.style.display = 'inline-block';
      betPotBtn.textContent = `Pot ($${betSizes.pot.toFixed(2)})`;
      betPotBtn.dataset.amount = betSizes.pot.toFixed(2);
    } else {
      betPotBtn.style.display = 'none';
    }
  }
  
  // Show 2x pot (only if legal)
  if (bet2xBtn) {
    if (betSizes['2x'] >= minBet && betSizes['2x'] <= maxBet && betSizes['2x'] > 0) {
      bet2xBtn.style.display = 'inline-block';
      bet2xBtn.textContent = `2x Pot ($${betSizes['2x'].toFixed(2)})`;
      bet2xBtn.dataset.amount = betSizes['2x'].toFixed(2);
    } else {
      bet2xBtn.style.display = 'none';
    }
  }
  
  // Show all-in (always available if player has chips and it's >= minBet)
  if (betAllInBtn) {
    if (playerStack >= minBet && playerStack > 0) {
      betAllInBtn.style.display = 'inline-block';
      betAllInBtn.textContent = `All-In ($${playerStack.toFixed(2)})`;
      betAllInBtn.dataset.amount = playerStack.toFixed(2);
    } else {
      betAllInBtn.style.display = 'none';
    }
  }
  
  // Show custom bet option with validation
  if (customBetBtn) {
    customBetBtn.style.display = 'inline-block';
    customBetAmount.style.display = 'inline-block';
    customBetAmount.value = '';
    customBetAmount.placeholder = `Min: $${minBet.toFixed(2)}, Max: $${maxBet.toFixed(2)}`;
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
    const gameState = window.currentGameState;
    
    if (!gameState) {
      alert('Game state not available');
      return;
    }
    
    // Validate the bet amount
    const playerStack = gameState.playerStack || 0;
    const highestBet = gameState.highestBet || 0;
    let minBet;
    
    if (actionType === 'raise') {
      minBet = highestBet;
    } else {
      minBet = gameState.bigBlind || 0.10;
    }
    
    const maxBet = playerStack;
    
    if (amount <= 0) {
      alert('Please enter a valid amount');
      customInput.focus();
      return;
    }
    
    if (amount < minBet) {
      alert(`Minimum bet is $${minBet.toFixed(2)}`);
      customInput.focus();
      return;
    }
    
    if (amount > maxBet) {
      alert(`Maximum bet is $${maxBet.toFixed(2)}`);
      customInput.focus();
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
  
  // Don't hide betting options immediately - let server response determine visibility
  // The server will send gameStateUpdated to update the UI
  
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
      justify-content: center;
      padding: 20px;
      position: relative;
    }
    
    /* Top section with community cards and pot - centered in middle */
    .top-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      justify-content: center;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    
    .community-cards {
      text-align: center;
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
      border: 1px solid #333;
      border-radius: 4px;
      cursor: default;
      background-size: cover;
      background-position: center;
    }
    
    .community-card {
      transform: scale(1.1);
    }
    
    .pot-display {
      text-align: center;
      background: rgba(0, 0, 0, 0.5);
      padding: 15px 30px;
      border-radius: 10px;
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
    
    /* Seating area in the middle */
    .seating-area {
      position: absolute;
      width: 100%;
      height: 400px;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      perspective: 1000px;
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
    
    .seat-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    
    .player-name {
      font-weight: bold;
    }
    
    .player-stack {
      font-size: 11px;
      color: #90EE90;
    }
    
    .player-current-bet {
      font-size: 10px;
      color: #ffaa00;
    }
    
    /* Face-down cards displayed at player's seat */
    .seat-table-cards {
      display: flex;
      justify-content: center;
      gap: 3px;
      margin-top: 5px;
    }
    
    .table-card {
      width: 30px;
      height: 40px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    
    /* Position-specific fold animations - cards slide from their seat to center */
    
    /* 2 o'clock position - top right, slide down-left to center */
    .table-card.fold-2-oclock {
      animation: cardFold2 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold2 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(-75px, 75px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(-150px, 150px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 3 o'clock position - right side, slide left to center */
    .table-card.fold-3-oclock {
      animation: cardFold3 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold3 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(-100px, 0) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(-200px, 0) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 4 o'clock position - bottom right, slide up-left to center */
    .table-card.fold-4-oclock {
      animation: cardFold4 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold4 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(-75px, -75px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(-150px, -150px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 5 o'clock position - bottom right near center, slide up-left to center */
    .table-card.fold-5-oclock {
      animation: cardFold5 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold5 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(-50px, -50px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(-100px, -100px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 6 o'clock position - bottom center, slide up to center (current player, typically hidden) */
    .table-card.fold-6-oclock {
      animation: cardFold6 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold6 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(0, -75px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(0, -150px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 7 o'clock position - bottom left near center, slide up-right to center */
    .table-card.fold-7-oclock {
      animation: cardFold7 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold7 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(50px, -50px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(100px, -100px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 8 o'clock position - bottom left, slide up-right to center */
    .table-card.fold-8-oclock {
      animation: cardFold8 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold8 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(75px, -75px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(150px, -150px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 9 o'clock position - left side, slide right to center */
    .table-card.fold-9-oclock {
      animation: cardFold9 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold9 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(100px, 0) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(200px, 0) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* 10 o'clock position - top left, slide down-right to center */
    .table-card.fold-10-oclock {
      animation: cardFold10 0.8s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes cardFold10 {
      0% {
        transform: translate(0, 0) scale(1) rotateY(0deg);
        opacity: 1;
      }
      50% {
        transform: translate(75px, 75px) scale(0.7) rotateY(90deg);
        opacity: 0.8;
      }
      100% {
        transform: translate(150px, 150px) scale(0.1) rotateY(180deg);
        opacity: 0;
      }
    }
    
    /* Bottom section with betting controls and player's hole cards */
    .bottom-section {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .betting-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
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
    
    /* Player's own hole cards - displayed below betting controls */
    .player-hole-cards-area {
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    
    .player-hole-cards {
      display: flex;
      justify-content: center;
      gap: 5px;
    }
    
    .hole-card {
      width: 60px;
      height: 80px;
      margin: 0 2px;
    }
    
    /* Clock-based player positioning around the table */
    /* Current player - 6 o'clock (bottom center) */
    .player-seat.seat-6-oclock { 
      bottom: 10px; 
      left: 50%; 
      transform: translateX(-50%); 
    }
    
    /* 2 o'clock - upper right */
    .player-seat.seat-2-oclock {
      top: 20px;
      right: 30px;
    }
    
    /* 3 o'clock - right */
    .player-seat.seat-3-oclock {
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
    }
    
    /* 4 o'clock - lower right */
    .player-seat.seat-4-oclock {
      bottom: 60px;
      right: 40px;
    }
    
    /* 5 o'clock - lower right near bottom */
    .player-seat.seat-5-oclock {
      bottom: 30px;
      right: 70px;
    }
    
    /* 7 o'clock - lower left near bottom */
    .player-seat.seat-7-oclock {
      bottom: 30px;
      left: 70px;
    }
    
    /* 8 o'clock - lower left */
    .player-seat.seat-8-oclock {
      bottom: 60px;
      left: 40px;
    }
    
    /* 9 o'clock - left */
    .player-seat.seat-9-oclock {
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
    }
    
    /* 10 o'clock - upper left */
    .player-seat.seat-10-oclock {
      top: 20px;
      left: 30px;
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
