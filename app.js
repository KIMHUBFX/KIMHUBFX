// app.js — Deriv dashboard (read-only)
const APP_ID = 112604; // your Deriv App ID
const WS_URL = `wss://ws.deriv.com/websockets/v3?app_id=${APP_ID}`;
let ws = null;
let token = null;
const historyEl = document.getElementById ? document.getElementById('history') : null;
const balanceBox = document.getElementById ? document.getElementById('balanceBox') : null;
const tickBox = document.getElementById ? document.getElementById('tickBox') : null;
const statusEl = document.getElementById ? document.getElementById('status') : null;
const tickTime = document.getElementById ? document.getElementById('tickTime') : null;

function appendHistory(text) {
  if (!historyEl) return;
  const now = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.textContent = `[${now}] ${text}`;
  historyEl.prepend(line);
}

// ---- Token capture: support several fragment names (token, access_token) ----
function getTokenFromFragment() {
  const hash = window.location.hash || '';
  if (!hash) return null;
  // strip leading '#'
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = fragment.split('&');
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (!k || !v) continue;
    if (k === 'token' || k === 'access_token' || k === 'accessToken' || k === 'oauth_token') {
      return decodeURIComponent(v);
    }
  }
  return null;
}

// If current page contains token (after OAuth) capture it and store
(function captureTokenOnRedirect() {
  const tok = getTokenFromFragment();
  if (tok) {
    localStorage.setItem('deriv_token', tok);
    // remove fragment to avoid leaking token in URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    // if not on dashboard, redirect to dashboard
    if (!window.location.pathname.endsWith('dashboard.html')) {
      window.location.href = 'dashboard.html';
    }
  }
})();

token = localStorage.getItem('deriv_token');

// Show logged-out state if on dashboard without token
if (!token && window.location.pathname.endsWith('dashboard.html')) {
  if (statusEl) statusEl.innerText = 'No token found — please login.';
  appendHistory('No token available. User should log in via login.html');
}

// Connect function
function connectDeriv() {
  if (!token) {
    appendHistory('No token — cannot connect.');
    if (statusEl) statusEl.innerText = 'No token. Please login.';
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      appendHistory('WS connection opened.');
      if (statusEl) {
        statusEl.className = 'status connected';
        statusEl.innerText = 'Connected';
      }
      authorize();
    };

    ws.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        handleMessage(d);
      } catch (err) {
        appendHistory('Invalid JSON message');
      }
    };

    ws.onerror = (err) => {
      appendHistory('WebSocket error.');
      if (statusEl) {
        statusEl.className = 'status waiting';
        statusEl.innerText = 'Connection error';
      }
    };

    ws.onclose = () => {
      appendHistory('WebSocket closed.');
      if (statusEl) {
        statusEl.className = 'status waiting';
        statusEl.innerText = 'Disconnected';
      }
      // attempt reconnect after short delay
      setTimeout(() => {
        if (token) connectDeriv();
      }, 5000);
    };
  } catch (err) {
    appendHistory('Failed to create WebSocket: ' + err.message);
  }
}

function sendMessage(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(obj));
}

// Authorize with token
function authorize() {
  sendMessage({ authorize: token });
  appendHistory('Sent authorize request.');
}

// Handle incoming messages
function handleMessage(msg) {
  if (!msg) return;

  if (msg.msg_type === 'authorize') {
    if (msg.error) {
      appendHistory('Authorize error: ' + (msg.error.message || JSON.stringify(msg.error)));
      if (statusEl) {
        statusEl.className = 'status waiting';
        statusEl.innerText = 'Auth failed — login again';
      }
      return;
    }
    appendHistory('Authorized successfully.');
    // request balance and ticks
    getBalance();
    subscribeTicks();
    return;
  }

  if (msg.msg_type === 'balance') {
    if (msg.balance && msg.balance.balance !== undefined) {
      const b = Number(msg.balance.balance).toFixed(2);
      if (balanceBox) balanceBox.innerText = `$ ${b}`;
      appendHistory('Balance updated: $' + b);
    }
    return;
  }

  if (msg.msg_type === 'tick') {
    const quote = msg.tick && msg.tick.quote;
    const epoch = msg.tick && msg.tick.epoch;
    if (quote !== undefined) {
      updateTick(quote, epoch);
    }
    return;
  }

  // debug other messages
  appendHistory('Msg: ' + (msg.msg_type || JSON.stringify(msg)).toString());
}

// Subscribe to balance updates
function getBalance() {
  sendMessage({ balance: 1, subscribe: 1 });
  appendHistory('Requested balance subscription.');
}

// Subscribe to R_100 ticks
function subscribeTicks() {
  sendMessage({ ticks: 'R_100', subscribe: 1 });
  appendHistory('Subscribed to R_100 ticks.');
}

// Update tick display and highlight last digit (bold yellow)
function updateTick(price, epoch) {
  if (!tickBox) return;
  const str = String(price);
  // ensure decimal part exists
  let display = str;
  if (str.indexOf('.') === -1) display = str + '.0';
  const parts = display.split('.');
  const integer = parts[0];
  const frac = parts[1] || '0';
  const lastDigit = frac.slice(-1);
  const middle = frac.slice(0, -1);
  tickBox.innerHTML = `${integer}.${middle}<b style="color: #ffeb3b">${lastDigit}</b>`;
  if (tickTime) tickTime.innerText = epoch ? `Updated: ${new Date(epoch*1000).toLocaleTimeString()}` : '';
}

// Logout helper
function logout() {
  localStorage.removeItem('deriv_token');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  window.location.href = 'login.html';
}

// Auto-connect when token exists and we are on dashboard
if (token && window.location.pathname.endsWith('dashboard.html')) {
  if (statusEl) {
    statusEl.className = 'status waiting';
    statusEl.innerText = 'Connecting...';
  }
  connectDeriv();
}

// Expose logout for UI
window.logout = logout;
