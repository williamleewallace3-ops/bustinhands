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
    <div id="potAmount" class="pot-amount">${fmtChips(0)}</div>
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
        <input type="number" id="customBetAmount" placeholder="Amount" min="0" step="0.01" style="display:none;">
        <button id="customBetBtn" class="bet-size-btn" style="display:none;">Bet</button>
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

  // Re-buy button: shown while busted or watching, until the re-buy goes through
  if (!document.getElementById('rebuyBtn')) {
    const rebuyBtn = document.createElement('button');
    rebuyBtn.id = 'rebuyBtn';
    rebuyBtn.className = 'rebuy-btn';
    rebuyBtn.textContent = '💵 Re-buy';
    rebuyBtn.style.display = 'none';
    rebuyBtn.addEventListener('click', promptRebuy);
    document.body.appendChild(rebuyBtn);
  }

  // Show / Muck choice for a winner when everyone else folded
  if (!document.getElementById('showMuckControls')) {
    const box = document.createElement('div');
    box.id = 'showMuckControls';
    box.className = 'show-muck-controls';
    box.style.display = 'none';
    box.innerHTML = `
      <div class="show-muck-label">You won! Show your cards?</div>
      <div class="show-muck-buttons">
        <button id="showCardsBtn" class="action-btn show-cards-btn">Show</button>
        <button id="muckCardsBtn" class="action-btn muck-cards-btn">Muck</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector('#showCardsBtn').addEventListener('click', () => chooseShowOrMuck(true));
    box.querySelector('#muckCardsBtn').addEventListener('click', () => chooseShowOrMuck(false));
  }

  // Attach event listeners
  attachTexasHoldEmListeners();
  
  // Add CSS if not already present
  if (!document.getElementById('holdemStyles')) {
    addTexasHoldEmStyles();
  }
}

/* ===============================
   MONEY OR TOURNAMENT CHIPS
================================ */
// Cash game: dollars and cents. Sit 'N Go: whole tournament chips, no $.
window.holdemChipMode = false;

function setHoldemChipMode(on) {
  window.holdemChipMode = !!on;
  const input = document.getElementById('customBetAmount');
  if (input) input.step = on ? '1' : '0.01';
}

/** "$1.50" in a cash game, "1,500" in a Sit 'N Go */
function fmtChips(x) {
  const n = Number(x) || 0;
  return window.holdemChipMode
    ? Math.round(n).toLocaleString('en-US')
    : `$${n.toFixed(2)}`;
}

/** 1 -> "1st", 2 -> "2nd" ... */
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/* ===============================
   RE-BUY (after busting / while watching)
================================ */
const REBUY_LIMITS = { min: 1.00, max: 1000.00, suggested: 10.00 };

function showRebuyButton() {
  const btn = document.getElementById('rebuyBtn');
  if (btn) btn.style.display = 'block';
}

function hideRebuyButton() {
  const btn = document.getElementById('rebuyBtn');
  if (btn) btn.style.display = 'none';
}

/** Ask for a re-buy amount; you're dealt back in when the next hand starts. */
function promptRebuy() {
  const input = prompt(
    `Re-buy amount?\n(Minimum: $${REBUY_LIMITS.min.toFixed(2)}, Maximum: $${REBUY_LIMITS.max.toFixed(2)})\n\nYou'll be dealt in when the next hand starts.`,
    REBUY_LIMITS.suggested.toFixed(2)
  );
  if (input === null) return; // cancelled: keep watching, button stays

  const amount = Math.round((parseFloat(input) || 0) * 100) / 100;
  if (amount < REBUY_LIMITS.min || amount > REBUY_LIMITS.max) {
    alert(`Invalid amount. Must be between $${REBUY_LIMITS.min.toFixed(2)} and $${REBUY_LIMITS.max.toFixed(2)}`);
    return;
  }
  socket.emit('rejoinGame', { roomId, buyInAmount: amount });
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
    potDisplay.textContent = fmtChips(potAmount);
  }
}

/**
 * Display player at seat
 * Current player (mySocketId) is always at the bottom, next to their hole cards.
 * Other players sit clockwise from them: up the left side (7 -> 10 o'clock),
 * then down the right side (2 -> 5 o'clock). The top of the table
 * (11, 12, 1 o'clock) is never used so the dealer in the background stays visible.
 */
function displayPlayerAtSeat(seatNumber, playerInfo, totalPlayers = 2, allPlayers = []) {
  let seatingArea = document.getElementById('seatingArea');
  if (!seatingArea) return;

  const isSelf = playerInfo.id === mySocketId;
  const myIndex = allPlayers.findIndex(p => p.id === mySocketId);
  // Clockwise distance from the current player (0 = me)
  const offset = isSelf ? 0 : (seatNumber - Math.max(myIndex, 0) + totalPlayers) % totalPlayers;

  // Create seat element (layoutSeats() positions and sizes it)
  const seatDiv = document.createElement('div');
  seatDiv.className = 'player-seat';
  seatDiv.id = `seat-${seatNumber}`;
  seatDiv.dataset.offset = String(offset);
  seatDiv.dataset.self = isSelf ? 'true' : 'false';
  seatDiv.dataset.playerId = playerInfo.id; // used to place chips and the dealer button

  // Only create seat-table-cards for OTHER players
  const tableCardsHTML = !isSelf ? `
    <div class="seat-table-cards" id="table-cards-${playerInfo.id}">
      <div class="table-card"></div>
      <div class="table-card"></div>
    </div>
  ` : '';

  seatDiv.innerHTML = `
    <div class="seat-info">
      <div class="seat-header">
        <span class="player-name">${playerInfo.name}</span>
        <span class="seat-badges"></span>
      </div>
      <div class="player-stack">${fmtChips(playerInfo.stack)}</div>
      <div class="player-last-action" style="visibility:hidden;">&nbsp;</div>
      <div class="player-to-call" style="visibility:hidden;">&nbsp;</div>
      ${tableCardsHTML}
    </div>
  `;

  // Set card back image on table cards for OTHER players only
  if (!isSelf) {
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
  layoutSeats();
}

/**
 * Position and size every seat so none overlap each other, the board,
 * the betting controls, or the dealer at the top of the table.
 * Fewer players -> bigger windows; more players -> smaller windows.
 */
function layoutSeats() {
  const seatingArea = document.getElementById('seatingArea');
  if (!seatingArea) return;
  const seats = [...seatingArea.querySelectorAll('.player-seat')];
  if (seats.length === 0) return;

  // Work in screen coordinates: the seating area can start slightly off-screen
  // (container padding), so convert when positioning.
  const areaRect = seatingArea.getBoundingClientRect();
  const offsetX = -areaRect.left;
  const offsetY = -areaRect.top;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const margin = 12;
  const MAX_SCALE = 1.6;   // biggest a window gets (few players)

  const me = seats.find(s => s.dataset.self === 'true');
  const others = seats
    .filter(s => s.dataset.self !== 'true')
    .sort((a, b) => Number(a.dataset.offset) - Number(b.dataset.offset));

  // Measure natural (unscaled) sizes
  seats.forEach(s => { s.style.transform = 'none'; s.style.left = '0px'; s.style.top = '0px'; });
  const natW = Math.max(...others.map(s => s.offsetWidth), 1);
  const natH = Math.max(...others.map(s => s.offsetHeight), 1);

  // Side columns: from just below the top edge down to above the betting controls
  const topY = margin;
  const bottomY = H - Math.max(260, H * 0.32);
  const columnWidth = Math.min(W * 0.22, 280);
  const leftCount = Math.ceil(others.length / 2);
  const rightCount = others.length - leftCount;
  const perSide = Math.max(leftCount, rightCount, 1);
  const slotH = (bottomY - topY) / perSide;
  let scale = Math.max(0.5, Math.min(MAX_SCALE, (slotH - 8) / natH, columnWidth / natW));

  const place = (seat, centerX, centerY, s, clock) => {
    seat.style.left = `${centerX + offsetX}px`;
    seat.style.top = `${centerY + offsetY}px`;
    seat.style.transform = `translate(-50%, -50%) scale(${s})`;
    if (clock) {
      const cards = seat.querySelector('.seat-table-cards');
      if (cards) cards.dataset.position = String(clock); // used by the fold animation
    }
  };

  const placeOthers = () => {
    const seatW = natW * scale;
    const curve = Math.min(W * 0.04, 50) * Math.min(scale, 1);

    const placeSide = (sideSeats, side) => {
      const count = sideSeats.length;
      const sideSlot = (bottomY - topY) / Math.max(count, 1);
      sideSeats.forEach((seat, i) => {
        // t: 0 at the bottom of the column, 1 at the top
        const t = count === 1 ? 0.5 : i / (count - 1);
        const centerY = bottomY - sideSlot * (i + 0.5);
        // Bow the column outward in the middle, like the edge of the table
        const inset = curve * Math.abs(2 * t - 1);
        const centerX = side === 'left'
          ? margin + seatW / 2 + inset
          : W - margin - seatW / 2 - inset;
        const clock = side === 'left'
          ? Math.round(7 + 3 * t)          // 7 .. 10
          : Math.round(2 + 3 * (1 - t));   // 2 .. 5
        place(seat, centerX, centerY, scale, clock);
      });
    };

    // Clockwise from me: up the left side, then down the right side
    placeSide(others.slice(0, leftCount), 'left');
    placeSide(others.slice(leftCount).reverse(), 'right');
  };
  placeOthers();

  // Second pass: if the real rendered size is bigger than planned, shrink to fit
  const tallest = Math.max(...others.map(s => s.getBoundingClientRect().height), 0);
  const widest = Math.max(...others.map(s => s.getBoundingClientRect().width), 0);
  const shrink = Math.min(1, (slotH - 8) / (tallest || 1), columnWidth / (widest || 1));
  if (shrink < 1) {
    scale *= shrink;
    placeOthers();
  }

  // Me: bottom row, just left of my hole cards
  if (me) {
    const meNatW = me.offsetWidth || natW;
    const meNatH = me.offsetHeight || 60;
    // Sit in the same row as my hole cards, no taller than they are
    const holeCards = document.getElementById('playerHoleCardsList');
    const holeRect = holeCards && holeCards.offsetWidth > 0 ? holeCards.getBoundingClientRect() : null;
    const rowH = holeRect ? holeRect.height : 80;
    const meScale = Math.max(0.6, Math.min(1.2, rowH / meNatH));
    const holeLeft = holeRect ? holeRect.left : W / 2 - 65;
    const centerX = holeLeft - 20 - (meNatW * meScale) / 2;
    const centerY = holeRect ? holeRect.top + holeRect.height / 2 : H - 20 - rowH / 2;
    place(me, centerX, centerY, meScale, null);
  }
  
  // Chips and the dealer button follow their seats
  if (typeof repositionTableFx === 'function') repositionTableFx();
}

// Keep seats laid out when the window size changes
window.addEventListener('resize', () => layoutSeats());

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
  layoutSeats();
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
  const cardBackImage = `/cards/card_back${window.selectedDeck === '2' ? '2' : ''}.png`;
  const tableCards = tableCardsContainer.querySelectorAll('.table-card');
  tableCards.forEach(card => {
    // Remove all position-specific fold animation classes
    card.classList.remove('fold-2-oclock', 'fold-3-oclock', 'fold-4-oclock',
                           'fold-5-oclock', 'fold-6-oclock', 'fold-7-oclock',
                           'fold-8-oclock', 'fold-9-oclock', 'fold-10-oclock');
    // Turn any cards shown last hand face down again
    card.classList.remove('face-up');
    card.style.backgroundImage = `url('${cardBackImage}')`;
  });
}

/**
 * Turn a player's two cards face up in their seat window
 * (showdown, or a winner who chose to show).
 */
function revealSeatCards(playerId, cards) {
  const tableCardsContainer = document.getElementById(`table-cards-${playerId}`);
  if (!tableCardsContainer || !Array.isArray(cards)) return;
  tableCardsContainer.style.display = 'flex';
  const tableCards = tableCardsContainer.querySelectorAll('.table-card');
  tableCards.forEach((cardDiv, i) => {
    const card = cards[i];
    if (!card) return;
    cardDiv.classList.add('face-up');
    cardDiv.style.backgroundImage = `url('/cards/${cardFileName(card)}')`;
  });
}

/* ===============================
   SHOW OR MUCK (winner when everyone else folded)
================================ */
let showMuckTimer = null;

function showShowMuckChoice(decisionSeconds = 6) {
  const box = document.getElementById('showMuckControls');
  if (!box) return;
  let remaining = decisionSeconds;
  const label = box.querySelector('.show-muck-label');
  const update = () => { label.textContent = `You won! Show your cards? (${remaining}s)`; };
  update();
  box.style.display = 'flex';
  clearInterval(showMuckTimer);
  showMuckTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) hideShowMuckChoice(); // no answer = muck
    else update();
  }, 1000);
}

function hideShowMuckChoice() {
  clearInterval(showMuckTimer);
  showMuckTimer = null;
  const box = document.getElementById('showMuckControls');
  if (box) box.style.display = 'none';
}

function chooseShowOrMuck(show) {
  hideShowMuckChoice();
  socket.emit('showOrMuck', { roomId, show });
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
  // Size and margin come from the .community-card / .hole-card styles
  cardDiv.style.backgroundImage = `url('${imagePath}')`;

  cardDiv.setAttribute('data-rank', rank);
  cardDiv.setAttribute('data-suit', suit);
  
  console.log(`Card image: ${imagePath}`);
  
  return cardDiv;
}

/**
 * Show betting controls for current player.
 * gameState: { highestBet, playerCurrentBet, playerStack, pot, bigBlind, minRaiseTo }
 * All bet/raise amounts are "raise to" totals for this street.
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

  const amountToCall = toMoney((gameState.highestBet || 0) - (gameState.playerCurrentBet || 0));
  const playerStack = gameState.playerStack || 0;

  if (amountToCall <= 0) {
    // Nothing to call - show check or bet options
    checkBtn.style.display = 'inline-block';
    showBetSizingOptions(gameState, 'bet');
  } else {
    // There's a bet to call - show call, fold, and raise options
    foldBtn.style.display = 'inline-block';
    callBtn.style.display = 'inline-block';
    const callAmount = Math.min(amountToCall, playerStack);
    callBtn.textContent = callAmount < amountToCall
      ? `Call All-In ${fmtChips(callAmount)}`
      : `Call ${fmtChips(callAmount)}`;
    callBtn.dataset.amount = callAmount.toFixed(2);
    // Can only raise if the player has more than enough to call
    if (playerStack > amountToCall) {
      showBetSizingOptions(gameState, 'raise');
    }
  }
}

/** Round to whole cents */
function toMoney(x) {
  if (window.holdemChipMode) return Math.round(Number(x) || 0); // whole tournament chips
  return Math.round((Number(x) || 0) * 100) / 100;
}

/**
 * Legal "raise to" range for the current player:
 *   min: smallest legal bet/raise (server sends minRaiseTo)
 *   max: everything the player has (stack + what they've already bet this street)
 */
function getRaiseLimits(gameState) {
  const highestBet = gameState.highestBet || 0;
  const bigBlind = gameState.bigBlind || 0.10;
  const fallbackMin = highestBet > 0 ? highestBet + bigBlind : bigBlind;
  const max = toMoney((gameState.playerStack || 0) + (gameState.playerCurrentBet || 0));
  const min = Math.min(toMoney(gameState.minRaiseTo || fallbackMin), max);
  return { min, max };
}

/**
 * Show betting size options
 */
function showBetSizingOptions(gameState, betType) {
  const betOptions = document.getElementById('betOptions');
  const pot = gameState.pot || 0;
  const highestBet = gameState.highestBet || 0;
  const { min: minBet, max: maxBet } = getRaiseLimits(gameState);
  // Any bet on top of an existing one (e.g. the big blind's option) is a raise
  const verb = (betType === 'raise' || highestBet > 0) ? 'Raise to' : 'Bet';

  // Pot-sized options: match the current bet, then add a fraction of the pot
  const betSizes = {
    '1/4': toMoney(highestBet + pot / 4),
    '1/3': toMoney(highestBet + pot / 3),
    '1/2': toMoney(highestBet + pot / 2),
    pot: toMoney(highestBet + pot),
    '2x': toMoney(highestBet + pot * 2)
  };

  const setButton = (btn, label, amount) => {
    if (!btn) return;
    // Hide sizes below the minimum, or that would be all-in anyway (All-In button covers that)
    if (amount >= minBet && amount < maxBet && amount > 0) {
      btn.style.display = 'inline-block';
      btn.textContent = `${label} (${fmtChips(amount)})`;
      btn.dataset.amount = amount.toFixed(2);
    } else {
      btn.style.display = 'none';
    }
  };

  setButton(document.getElementById('betMinBtn'), `Min ${verb}`, minBet);
  setButton(document.getElementById('bet1_4Btn'), '1/4 Pot', betSizes['1/4']);
  setButton(document.getElementById('bet1_3Btn'), '1/3 Pot', betSizes['1/3']);
  setButton(document.getElementById('bet1_2Btn'), '1/2 Pot', betSizes['1/2']);
  setButton(document.getElementById('betPotBtn'), 'Pot', betSizes.pot);
  setButton(document.getElementById('bet2xBtn'), '2x Pot', betSizes['2x']);

  // All-in: everything the player has (always legal)
  const betAllInBtn = document.getElementById('betAllInBtn');
  if (betAllInBtn) {
    if (maxBet > highestBet) {
      betAllInBtn.style.display = 'inline-block';
      betAllInBtn.textContent = `All-In (${fmtChips(maxBet)})`;
      betAllInBtn.dataset.amount = maxBet.toFixed(2);
    } else {
      betAllInBtn.style.display = 'none';
    }
  }

  // Typed amount + one Bet / Raise button
  const customBetBtn = document.getElementById('customBetBtn');
  const customBetAmount = document.getElementById('customBetAmount');
  if (customBetBtn) {
    customBetBtn.style.display = 'inline-block';
    customBetBtn.textContent = verb === 'Bet' ? 'Bet' : 'Raise';
    customBetAmount.style.display = 'inline-block';
    customBetAmount.value = '';
    customBetAmount.placeholder = `${fmtChips(minBet)} - ${fmtChips(maxBet)}`;
  }

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
/**
 * Refresh everything a seat window shows besides name and stack:
 *   badges (dealer button, SB, BB, ALL-IN), last action, "To call $X",
 *   whose turn it is, and the dimmed look for folded players.
 * Every line keeps its space when empty, so windows never change size.
 */
function updateSeatStatus(seatDiv, player, table) {
  if (!seatDiv || !player) return;
  const money = fmtChips;
  const bettingOpen = ['preflop', 'flop', 'turn', 'river'].includes(table.state) && !!table.currentBettor;

  seatDiv.classList.toggle('folded', !!player.folded);
  seatDiv.classList.toggle('all-in', !!player.allIn && !player.folded);
  seatDiv.classList.toggle('current-bettor', player.id === table.currentBettor);

  // Stack
  const stackDiv = seatDiv.querySelector('.player-stack');
  if (stackDiv) stackDiv.textContent = money(player.stack);

  // Badges: D (dealer), SB, BB, ALL-IN
  const badges = [];
  // (The dealer is shown by the dealer button on the table - see holdemTableFx.js)
  if (player.id === table.smallBlindId) badges.push('<span class="seat-badge blind-badge" title="Small blind">SB</span>');
  if (player.id === table.bigBlindId) badges.push('<span class="seat-badge blind-badge" title="Big blind">BB</span>');
  if (player.allIn && !player.folded) badges.push('<span class="seat-badge allin-badge">ALL-IN</span>');
  const badgesDiv = seatDiv.querySelector('.seat-badges');
  if (badgesDiv) badgesDiv.innerHTML = badges.join('');

  // Last action ("Call $2.00", "Raise to $6.00", "Fold", ...)
  const actionDiv = seatDiv.querySelector('.player-last-action');
  if (actionDiv) {
    actionDiv.textContent = player.lastAction || ' ';
    actionDiv.style.visibility = player.lastAction ? 'visible' : 'hidden';
  }

  // What they're facing: "To call $2.00" (or all-in if they can't cover it)
  const toCallDiv = seatDiv.querySelector('.player-to-call');
  if (toCallDiv) {
    const toCall = toMoney((table.highestBet || 0) - (player.currentBet || 0));
    const canAct = !player.folded && !player.allIn && player.stack > 0;
    if (bettingOpen && canAct && toCall > 0) {
      toCallDiv.textContent = toCall >= player.stack
        ? `To call ${money(player.stack)} (all-in)`
        : `To call ${money(toCall)}`;
      toCallDiv.style.visibility = 'visible';
    } else {
      toCallDiv.textContent = ' ';
      toCallDiv.style.visibility = 'hidden';
    }
  }
}

/**
 * Display game message (flop revealed, turn revealed, etc.)
 */
function displayGameMessage(message, type = 'info', durationMs = 3000) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `game-message message-${type}`;
  messageDiv.textContent = message;

  const tableArea = document.getElementById('tableArea');
  tableArea.appendChild(messageDiv);

  // Auto-remove after a few seconds (3 by default)
  setTimeout(() => messageDiv.remove(), durationMs);
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
  const customBetAmount = document.getElementById('customBetAmount');

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
  
  // Enter in the amount field works like clicking Bet / Raise
  if (customBetAmount) customBetAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') customBetBtn?.click();
  });

  if (customBetBtn) customBetBtn.addEventListener('click', () => {
    const customInput = document.getElementById('customBetAmount');
    const amount = parseFloat(customInput.value) || 0;
    const actionType = document.getElementById('betOptions').dataset.actionType || 'bet';
    const gameState = window.currentGameState;
    
    if (!gameState) {
      alert('Game state not available');
      return;
    }
    
    // Validate the bet amount (a "raise to" total; all-in is always allowed)
    const { min: minBet, max: maxBet } = getRaiseLimits(gameState);

    if (amount <= 0) {
      alert('Please enter a valid amount');
      customInput.focus();
      return;
    }

    if (amount < minBet && amount < maxBet) {
      alert(`Minimum is ${fmtChips(minBet)}`);
      customInput.focus();
      return;
    }

    if (amount > maxBet) {
      alert(`Maximum (all-in) is ${fmtChips(maxBet)}`);
      customInput.focus();
      return;
    }

    playerAction(actionType, amount);
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
      gap: 14px;
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

    /* Board and hole cards: draw the whole card image inside a white margin
       so the corner numbers aren't cropped */
    .community-card,
    .hole-card {
      background-color: #fff;
      background-size: auto 90%;
      background-repeat: no-repeat;
      background-position: center;
    }
    
    .community-card {
      width: 66px;   /* 10% larger than a standard card */
      height: 88px;
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
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      perspective: 1000px;
      pointer-events: none; /* don't block clicks on the controls underneath */
    }

    /* Position and scale are set by layoutSeats() */
    .player-seat {
      position: absolute;
      width: 120px;
      text-align: center;
      color: white;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(50, 50, 60, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.2);
      transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
      transform-origin: center center;
      font-size: 12px;
      pointer-events: auto;
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
    
    .player-last-action {
      font-size: 11px;
      color: #ddd;
      font-style: italic;
      white-space: nowrap;
    }

    .player-to-call {
      font-size: 11px;
      font-weight: bold;
      color: #ffaa00;
      white-space: nowrap;
    }

    /* Name with D / SB / BB / ALL-IN badges beside it */
    .seat-header {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      min-height: 16px;
    }

    .seat-badges {
      display: inline-flex;
      gap: 3px;
    }

    .seat-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: bold;
      line-height: 14px;
      padding: 0 5px;
      border-radius: 7px;
    }

    .dealer-badge {
      background: #fff;
      color: #111;
      min-width: 14px;
      padding: 0;
    }

    .blind-badge {
      background: #2d6cdf;
      color: #fff;
    }

    .allin-badge {
      background: #c62828;
      color: #fff;
    }

    /* My own window sits beside my hole cards: lay it out in two short
       columns so it stays readable at hole-card height */
    .player-seat[data-self="true"] {
      width: 190px;
    }
    .player-seat[data-self="true"] .seat-info {
      display: grid;
      grid-template-columns: auto auto;
      column-gap: 8px;
      row-gap: 2px;
      align-items: center;
    }
    .player-seat[data-self="true"] .seat-header {
      justify-content: flex-start;
    }
    .player-seat[data-self="true"] .player-last-action {
      text-align: left;
    }
    .player-seat[data-self="true"] .player-stack {
      text-align: right;
    }
    .player-seat[data-self="true"] .player-to-call {
      text-align: right;
    }

    /* Folded players fade out until the next hand */
    .player-seat.folded {
      opacity: 0.45;
    }

    /* All-in players get a red outline */
    .player-seat.all-in {
      border-color: #e53935;
    }
    
    /* Face-down cards displayed at player's seat */
    .seat-table-cards {
      display: flex;
      justify-content: center;
      gap: 3px;
      margin-top: 5px;
    }
    
    .table-card {
      width: 33px;
      height: 44px;
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
      width: 66px;
      height: 88px;
      margin: 0 2px;
    }
    
    /* Cards turned face up in a seat window (showdown / shown) */
    .table-card.face-up {
      background-color: #fff;
      background-size: auto 88%;
      background-position: center;
      border-color: #fff;
    }

    /* Show / Muck choice for a fold-win winner */
    .show-muck-controls {
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3000;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid #ffd700;
      border-radius: 10px;
      color: white;
      font-weight: bold;
    }

    .show-muck-buttons {
      display: flex;
      gap: 10px;
    }

    .show-cards-btn {
      background: #1f7a3d;
      color: white;
    }

    .muck-cards-btn {
      background: #555;
      color: white;
    }

    /* Re-buy button for busted / watching players (stays until they re-buy) */
    .rebuy-btn {
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3000;
      padding: 14px 34px;
      font-size: 20px;
      font-weight: bold;
      color: #1a1a1a;
      background: #ffd700;
      border: none;
      border-radius: 10px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }

    .rebuy-btn:hover {
      background: #ffe44d;
    }

    .game-message {
      white-space: pre-line;  /* one line per winner / knockout */
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
