/* =========================================================
   TEXAS HOLD 'EM: SIT 'N GO
   - Info panel: who's registered / ready before the start, then the blind
     clock (level, blinds, countdown), players left and prizes
   - Buy-in prompt for the first player
   - Knockout notices and the final standings
   Uses globals from app.js (socket, roomId, mySocketId, readyBtn, selectedGame)
   and texasHoldEm.js (fmtChips, ordinal, displayGameMessage, hideBettingControls),
   so it loads after app.js.
========================================================= */

const SNG = {
  lobby: null,        // last sngLobby payload
  clock: null,        // last sngClock payload
  clockDeadline: 0,   // local time when the current level ends
  clockTimer: null,
  myFinish: null      // { place, prize } once I'm knocked out
};

const isSngTable = () => selectedGame === 'texasHoldEm' && window.holdemChipMode;
const dollars = (x) => `$${Number(x || 0).toFixed(2)}`;

function sngPanel() {
  let panel = document.getElementById('sngPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'sngPanel';
    document.body.appendChild(panel);
    addSitAndGoStyles();
  }
  return panel;
}

function prizeLine(prizes, buyIn) {
  if (!buyIn) return 'Just for fun (no buy-in)';
  return prizes.map((p, i) => `${ordinal(i + 1)} ${dollars(p)}`).join(' · ');
}

function renderSngPanel() {
  if (!isSngTable()) return;
  const panel = sngPanel();
  const lobby = SNG.lobby;
  const clock = SNG.clock;
  let html = `<div class="sng-title">🏆 Sit 'N Go</div>`;

  if (lobby && lobby.status === 'registering') {
    const readyCount = lobby.players.filter(p => p.ready).length;
    html += `<div class="sng-row">${lobby.buyIn === null
      ? `Waiting for ${lobby.buyInSetterName || 'the first player'} to set the buy-in`
      : (lobby.buyIn > 0 ? `Buy-in ${dollars(lobby.buyIn)}` : 'Just for fun (no buy-in)')}</div>`;
    const levelTime = lobby.levelMinutes >= 1
      ? `${Math.round(lobby.levelMinutes * 10) / 10} min`
      : `${Math.round(lobby.levelMinutes * 60)} sec`;
    html += `<div class="sng-row">${lobby.startingStack.toLocaleString('en-US')} chips each · blinds up every ${levelTime}</div>`;
    html += `<div class="sng-sub">Players ready: ${readyCount} / ${lobby.players.length}</div>`;
    html += `<ul class="sng-list">${lobby.players.map(p =>
      `<li>${p.ready ? '✅' : '⏳'} ${escapeHtml(p.name)}${p.id === mySocketId ? ' (you)' : ''}</li>`).join('')}</ul>`;
    html += `<div class="sng-hint">${lobby.players.length < 2
      ? 'Needs at least 2 players.'
      : 'Starts when everyone clicks Ready.'}</div>`;
    if (lobby.spectators) html += `<div class="sng-hint">${lobby.spectators} watching</div>`;
  } else if (clock) {
    const secs = Math.max(0, Math.ceil((SNG.clockDeadline - Date.now()) / 1000));
    const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const next = `${fmtChips(clock.nextSmallBlind)}/${fmtChips(clock.nextBigBlind)}`;
    html += `<div class="sng-row sng-blinds">Level ${clock.level} · Blinds ${fmtChips(clock.smallBlind)}/${fmtChips(clock.bigBlind)}</div>`;
    html += `<div class="sng-row">${clock.pending || secs === 0
      ? `Blinds go up to ${next} next hand`
      : `Next: ${next} in <span class="sng-countdown">${mmss}</span>`}</div>`;
    html += `<div class="sng-row">Players left: ${clock.playersLeft} of ${clock.entrants}</div>`;
    html += `<div class="sng-sub">${prizeLine(clock.prizes, clock.buyIn)}</div>`;
  }
  if (SNG.myFinish) {
    html += `<div class="sng-me">You finished ${ordinal(SNG.myFinish.place)}` +
      `${SNG.myFinish.prize ? ` · won ${dollars(SNG.myFinish.prize)}` : ''}</div>`;
  }
  panel.innerHTML = html;
  panel.style.display = 'block';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Ready button: only for registered players who haven't readied up yet. */
function updateSngReadyButton() {
  if (!isSngTable() || typeof readyBtn === 'undefined') return;
  const lobby = SNG.lobby;
  const me = lobby && lobby.status === 'registering' && lobby.players.find(p => p.id === mySocketId);
  readyBtn.style.display = me && !me.ready ? 'inline-block' : 'none';
}

/* ---------- socket events ---------- */

socket.on('sngPromptBuyIn', () => {
  if (selectedGame !== 'texasHoldEm') return;
  const amount = prompt(
    "You're setting up this Sit 'N Go.\n\nBuy-in per player in dollars? The prize pool is paid to the top finishers.\n(Enter 0 to play just for fun.)",
    '10'
  );
  socket.emit('sngSetBuyIn', { roomId, amount: amount === null ? 0 : amount });
});

socket.on('sngLobby', (lobby) => {
  if (selectedGame !== 'texasHoldEm') return;
  SNG.lobby = lobby;
  if (lobby.status === 'registering') {
    SNG.clock = null;
    SNG.myFinish = null;
  }
  renderSngPanel();
  updateSngReadyButton();
});

socket.on('sngStarted', () => {
  if (selectedGame !== 'texasHoldEm') return;
  hideSngStandings();
  SNG.myFinish = null;
  updateSngReadyButton();
});

socket.on('sngClock', (clock) => {
  if (selectedGame !== 'texasHoldEm') return;
  SNG.clock = clock;
  SNG.clockDeadline = Date.now() + clock.msToNextLevel;
  renderSngPanel();
  clearInterval(SNG.clockTimer);
  SNG.clockTimer = setInterval(renderSngPanel, 1000);
});

socket.on('sngLevelUp', ({ level, smallBlind, bigBlind }) => {
  if (selectedGame !== 'texasHoldEm') return;
  displayGameMessage(`Level ${level}: blinds are now ${fmtChips(smallBlind)}/${fmtChips(bigBlind)}`, 'info', 2500);
});

socket.on('sngEliminated', ({ place, prize }) => {
  if (selectedGame !== 'texasHoldEm') return;
  SNG.myFinish = { place, prize };
  hideBettingControls();
  renderSngPanel();
  // After the hand's result has been on screen for a moment
  setTimeout(() => {
    displayGameMessage(
      `You finished ${ordinal(place)}${prize ? ` and won ${dollars(prize)}` : ''}.\nYou can keep watching; you'll be entered in the next Sit 'N Go.`,
      'info', 6000);
  }, 4000);
});

socket.on('sngPlayerLeft', ({ name, place }) => {
  if (selectedGame !== 'texasHoldEm') return;
  displayGameMessage(`${name} left the table and finished ${ordinal(place)}`, 'info', 3000);
});

socket.on('sngFinished', ({ standings, buyIn, prizePool }) => {
  if (selectedGame !== 'texasHoldEm') return;
  clearInterval(SNG.clockTimer);
  SNG.clock = null;
  hideBettingControls();
  const myCards = document.getElementById('playerHoleCardsList');
  if (myCards) myCards.innerHTML = '';
  showSngStandings(standings, buyIn, prizePool);
});

/* ---------- final standings ---------- */

function showSngStandings(standings, buyIn, prizePool) {
  hideSngStandings();
  const overlay = document.createElement('div');
  overlay.id = 'sngStandings';
  const winner = standings.find(s => s.place === 1);
  overlay.innerHTML = `
    <div class="sng-standings-box">
      <h2>🏆 ${winner ? `${escapeHtml(winner.name)} wins!` : "Sit 'N Go over"}</h2>
      ${buyIn ? `<div class="sng-sub">Prize pool ${dollars(prizePool)}</div>` : ''}
      <table>
        ${standings.map(s => `
          <tr class="${s.id === mySocketId ? 'me' : ''}">
            <td>${ordinal(s.place)}</td>
            <td>${escapeHtml(s.name)}</td>
            <td>${s.prize ? dollars(s.prize) : ''}</td>
          </tr>`).join('')}
      </table>
      <div class="sng-hint">Click Ready to play another Sit 'N Go.</div>
      <button id="sngStandingsClose">Close</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('sngStandingsClose').addEventListener('click', hideSngStandings);
}

function hideSngStandings() {
  if (!document.getElementById('sngStandings')) return;
  document.getElementById('sngStandings').remove();
  clearSngTable();
}

/** Empty the table between tournaments (seats, board, pot, chips). */
function clearSngTable() {
  const seating = document.getElementById('seatingArea');
  if (seating) seating.innerHTML = '';
  const board = document.getElementById('communityCardsList');
  if (board) board.innerHTML = '';
  const myCards = document.getElementById('playerHoleCardsList');
  if (myCards) myCards.innerHTML = '';
  if (typeof updatePotDisplay === 'function') updatePotDisplay(0);
  if (typeof tableFxNewHand === 'function') tableFxNewHand();
  hideBettingControls();
}

/* ---------- styles ---------- */

function addSitAndGoStyles() {
  if (document.getElementById('sngStyles')) return;
  const style = document.createElement('style');
  style.id = 'sngStyles';
  style.textContent = `
    #sngPanel {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 900;
      min-width: 220px;
      max-width: 280px;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.72);
      border: 1px solid rgba(255, 215, 0, 0.5);
      color: #fff;
      font-size: 13px;
      line-height: 1.45;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    }
    #sngPanel .sng-title { font-weight: 700; font-size: 15px; color: #ffd700; margin-bottom: 4px; }
    #sngPanel .sng-blinds { font-weight: 700; font-size: 14px; }
    #sngPanel .sng-countdown { font-variant-numeric: tabular-nums; font-weight: 700; }
    #sngPanel .sng-sub { color: #ddd; margin-top: 4px; }
    #sngPanel .sng-hint { color: #aaa; font-size: 12px; margin-top: 4px; }
    #sngPanel .sng-me { margin-top: 6px; color: #ffd700; font-weight: 600; }
    #sngPanel .sng-list { list-style: none; margin: 4px 0 0; padding: 0; }
    #sngPanel .sng-list li { padding: 1px 0; }

    #sngStandings {
      position: fixed;
      inset: 0;
      z-index: 6000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
    }
    #sngStandings .sng-standings-box {
      min-width: 300px;
      padding: 24px 30px;
      border-radius: 14px;
      background: #1b1b1b;
      border: 2px solid #ffd700;
      color: #fff;
      text-align: center;
    }
    #sngStandings h2 { margin: 0 0 8px; color: #ffd700; }
    #sngStandings table { margin: 12px auto; border-collapse: collapse; font-size: 15px; }
    #sngStandings td { padding: 4px 12px; text-align: left; }
    #sngStandings tr.me td { color: #ffd700; font-weight: 700; }
    #sngStandings .sng-sub { color: #ddd; }
    #sngStandings .sng-hint { color: #aaa; font-size: 13px; margin: 6px 0 12px; }
    #sngStandings button {
      padding: 8px 22px;
      border: none;
      border-radius: 6px;
      background: #1f7a3d;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}
