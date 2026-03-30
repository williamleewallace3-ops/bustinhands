/**
 * ENHANCEMENT FEATURES
 * Emoji Picker, @Mentions, Stats Dashboard
 */

// ================================
// EMOJI PICKER - SIMPLE VERSION
// ================================

const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const chatInput = document.getElementById('chatInput');
const emojiSpans = document.querySelectorAll('.emoji');

console.log('=== EMOJI PICKER INIT ===');
console.log('emojiBtn:', emojiBtn ? 'FOUND' : 'MISSING');
console.log('emojiPicker:', emojiPicker ? 'FOUND' : 'MISSING');
console.log('chatInput:', chatInput ? 'FOUND' : 'MISSING');
console.log('emoji spans:', emojiSpans.length, 'found');

// Toggle emoji picker when button is clicked
if (emojiBtn && emojiPicker) {
  emojiBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    console.log('🎯 EMOJI BUTTON CLICKED');
    const hasActive = emojiPicker.classList.contains('active');
    emojiPicker.classList.toggle('active');
    console.log('Active class toggled:', hasActive, '->', !hasActive);
    console.log('Picker display:', window.getComputedStyle(emojiPicker).display);
  });
  console.log('✓ Emoji button click listener attached');
} else {
  console.error('❌ Cannot attach emoji button listener - missing elements');
}

// Close emoji picker when clicking outside
document.addEventListener('click', function(e) {
  if (emojiPicker && emojiBtn && !emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
    if (emojiPicker.classList.contains('active')) {
      emojiPicker.classList.remove('active');
      console.log('Closed emoji picker by outside click');
    }
  }
});

// Handle emoji clicks
emojiSpans.forEach(function(el, index) {
  el.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    const emoji = el.getAttribute('data-emoji');
    console.log('Emoji clicked:', emoji);
    if (chatInput) {
      chatInput.value += emoji;
      chatInput.focus();
      emojiPicker.classList.remove('active');
      console.log('Emoji inserted and picker closed');
    }
  });
});
console.log('✓ Emoji span click listeners attached to', emojiSpans.length, 'emojis');

// ================================
// @MENTION SYSTEM
// ================================

let playerListForMentions = [];
let mentionActive = false;

// Update player list for mention autocomplete
function updatePlayerListForMentions(players) {
  playerListForMentions = players.map(p => p.name);
}

// Initialize mention system
function initializeMentions() {
  const input = document.getElementById('chatInput');
  if (!input) {
    console.warn('Chat input not found for mentions');
    return;
  }

  input.addEventListener('input', (e) => {
    const text = input.value;
    const lastAtIndex = text.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1);
      
      // Only show suggestions if we're typing after @
      if (textAfterAt.length > 0 && !textAfterAt.includes(' ')) {
        const filteredPlayers = playerListForMentions.filter(name =>
          name.toLowerCase().startsWith(textAfterAt.toLowerCase())
        );
        
        if (filteredPlayers.length > 0) {
          showMentionSuggestions(filteredPlayers, lastAtIndex);
          mentionActive = true;
        } else {
          hideMentionSuggestions();
          mentionActive = false;
        }
      } else if (textAfterAt.length === 0) {
        showMentionSuggestions(playerListForMentions, lastAtIndex);
        mentionActive = true;
      } else {
        hideMentionSuggestions();
        mentionActive = false;
      }
    } else {
      hideMentionSuggestions();
      mentionActive = false;
    }
  });

  // Handle escape key to close mentions
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mentionActive) {
      hideMentionSuggestions();
      mentionActive = false;
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMentions);
} else {
  initializeMentions();
}

function showMentionSuggestions(playerNames, atIndex) {
  const suggestions = document.getElementById('mentionSuggestions');
  if (!suggestions) return;
  
  suggestions.innerHTML = '';
  suggestions.classList.add('active');
  
  playerNames.slice(0, 5).forEach(name => {
    const item = document.createElement('div');
    item.className = 'mention-item';
    item.textContent = name;
    
    item.addEventListener('click', () => {
      insertMention(name, atIndex);
      hideMentionSuggestions();
      mentionActive = false;
    });
    
    suggestions.appendChild(item);
  });
}

function hideMentionSuggestions() {
  const suggestions = document.getElementById('mentionSuggestions');
  if (suggestions) {
    suggestions.classList.remove('active');
  }
}

function insertMention(playerName, atIndex) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  
  const text = input.value;
  const beforeAt = text.substring(0, atIndex);
  const afterAt = text.substring(atIndex);
  const endOfMention = afterAt.indexOf(' ') === -1 ? afterAt.length : afterAt.indexOf(' ');
  const afterMention = afterAt.substring(endOfMention);
  
  input.value = beforeAt + '@' + playerName + afterMention;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// ================================
// STATS DASHBOARD
// ================================

function initializeStatsModal() {
  const btn = document.getElementById('statsBtn');
  const modal = document.getElementById('statsModal');
  const closeBtn = document.getElementById('closeStatsBtn');
  
  if (!btn || !modal || !closeBtn) {
    // Stats button may not exist if removed from UI
    return;
  }
  
  // Open stats modal
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.classList.add('show');
    populateStatsModal();
  });

  // Close stats modal
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.classList.remove('show');
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStatsModal);
} else {
  initializeStatsModal();
}

function populateStatsModal() {
  const statsBody = document.getElementById('statsBody');
  if (!statsBody || !window.playerListData) return;
  
  statsBody.innerHTML = '';
  
  // Assume playerListData exists from main app.js
  const players = window.playerListData || [];
  
  players.forEach(player => {
    const winPercent = player.gamesPlayed > 0
      ? Math.round((player.wins / player.gamesPlayed) * 100)
      : 0;
    
    const row = document.createElement('div');
    row.className = 'stats-player-row';
    row.innerHTML = `
      <div class="stats-player-name">${player.name}</div>
      <div class="stats-item">
        <span class="stats-item-label">Wins:</span>
        <span class="stats-item-value">${player.wins || 0}</span>
      </div>
      <div class="stats-item">
        <span class="stats-item-label">Games:</span>
        <span class="stats-item-value">${player.gamesPlayed || 0}</span>
      </div>
      <div class="stats-item">
        <span class="stats-item-label">Win %:</span>
        <span class="stats-item-value">${winPercent}%</span>
      </div>
      <div class="stats-item">
        <span class="stats-item-label">Cards:</span>
        <span class="stats-item-value">${player.cardsRemaining || 0}</span>
      </div>
    `;
    statsBody.appendChild(row);
  });
}

// ================================
// CHAT NOTIFICATIONS
// ================================

let unreadMessageCount = 0;
let chatHasFocus = true;
const originalTitle = document.title;

// Track if the user is looking at the chat panel
document.addEventListener('focusin', (e) => {
  if (e.target.closest('#chatPanel')) {
    chatHasFocus = true;
    unreadMessageCount = 0;
    document.title = originalTitle;
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.closest('#chatPanel')) {
    chatHasFocus = false;
  }
});

// Custom notification function (called when new message arrives)
function notifyNewMessage(playerName) {
  if (chatHasFocus) return; // Don't notify if chat is in focus
  
  unreadMessageCount++;
  document.title = `(${unreadMessageCount}) ${originalTitle}`;
  
  // Play notification sound if available
  playNotificationSound();
  
  // Pulse the chat panel for visual feedback
  if (chatPanel) {
    chatPanel.classList.add('notification-pulse');
    setTimeout(() => {
      chatPanel.classList.remove('notification-pulse');
    }, 2000);
  }
}

function playNotificationSound() {
  try {
    // Simple beep using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (e) {
    // Audio context not available in this browser
    console.log('Audio notifications not available');
  }
}

// ================================
// CHAT HISTORY PERSISTENCE
// ================================

const STORAGE_KEY = 'chinesePokerChat_history';
const MAX_STORED_MESSAGES = 100;

function loadChatHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error loading chat history:', e);
    return [];
  }
}

function saveChatHistory(messages) {
  try {
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.error('Error saving chat history:', e);
  }
}

function displayChatHistory() {
  const history = loadChatHistory();
  if (!chatMessagesEl) return;
  
  history.forEach(msg => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    
    const playerColor = getPlayerColor(msg.playerName);
    
    msgEl.innerHTML = `
      <div class="chat-message-name" style="color: ${playerColor};">${msg.playerName}</div>
      <div class="chat-message-text">${escapeHtml(msg.message)}</div>
      <div class="chat-message-time">${formatTime(msg.timestamp)}</div>
    `;
    
    chatMessagesEl.appendChild(msgEl);
  });
  
  // Auto-scroll to bottom
  if (chatMessagesEl) {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

function addMessageToHistory(playerName, message) {
  const history = loadChatHistory();
  history.push({
    playerName,
    message,
    timestamp: new Date().toISOString()
  });
  saveChatHistory(history);
}

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ================================
// CUSTOM PLAYER COLORS
// ================================

const PLAYER_COLORS = [
  '#FFD700', // Gold
  '#FF6B9D', // Pink
  '#00D9FF', // Cyan
  '#FFA500', // Orange
  '#98FB98', // Pale Green
  '#FF69B4', // Hot Pink
  '#87CEEB', // Sky Blue
  '#FF4500', // Orange Red
];

const playerColorMap = {}; // Map playerName -> color

function getPlayerColor(playerName) {
  if (!playerColorMap[playerName]) {
    const index = Object.keys(playerColorMap).length % PLAYER_COLORS.length;
    playerColorMap[playerName] = PLAYER_COLORS[index];
  }
  return playerColorMap[playerName];
}

function assignPlayerColors(players) {
  players.forEach((player, index) => {
    if (!playerColorMap[player.name]) {
      playerColorMap[player.name] = PLAYER_COLORS[index % PLAYER_COLORS.length];
    }
  });
}

// Apply custom color to player item in list
function applyPlayerColor(playerEl, playerName) {
  if (!playerEl) return;
  const color = getPlayerColor(playerName);
  const nameEl = playerEl.querySelector('.player-name');
  if (nameEl) {
    const badgeEl = nameEl.querySelector('.play-order-badge');
    if (badgeEl) {
      nameEl.style.color = color;
      badgeEl.style.background = color;
    }
  }
}

// ================================
// INTEGRATION HOOKS
// ================================

// Load chat history immediately or when ready
function initializeEnhancements() {
  displayChatHistory();
}

// Try to load immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
  // DOM is already loaded
  initializeEnhancements();
}

// Hook into display message to persist and notify
const originalDisplayMessage = window.displayChatMessage;
if (originalDisplayMessage) {
  window.displayChatMessage = function(playerName, message) {
    // Call original function
    originalDisplayMessage.call(this, playerName, message);
    
    // Add to persistent history
    addMessageToHistory(playerName, message);
    
    // Send notification
    notifyNewMessage(playerName);
    
    // Apply color styling
    const latestMsg = chatMessagesEl?.lastElementChild;
    if (latestMsg) {
      const color = getPlayerColor(playerName);
      const nameEl = latestMsg.querySelector('.chat-message-name');
      if (nameEl) {
        nameEl.style.color = color;
      }
    }
  };
}

// Export function to sync player list data (called from main app.js)
window.updatePlayerListForMentions = updatePlayerListForMentions;
window.populateStatsModal = populateStatsModal;
window.assignPlayerColors = assignPlayerColors;
window.getPlayerColor = getPlayerColor;
window.applyPlayerColor = applyPlayerColor;
