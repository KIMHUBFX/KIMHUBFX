// app.js — OAuth flow + Deriv WebSocket (read-only)
// App ID must match the one registered on Deriv (112604)
const APP_ID = 112604;
const WS_URL = `wss://ws.deriv.com/websockets/v3?app_id=${APP_ID}`;

let ws = null;
let token = null;
const historyEl = document.getElementById ? document.getElementById('history') : null;
const balanceBox = document.getElementById ? document.getElementById('balanceBox') : null;
const tickBox = document.getElementById ? document.getElementById('tickBox') : null;
const statusEl = document.getElementById ? document.getElementById('status') : null;
const tickTime = document.getElementById ? document.getElementById('tickTime') : null;

// extract token from hash fragment (token or access_token)
function extractTokenFromHash() {
  const h = window.location.hash || '';
  if (!h) return null;
  const frag = h.startsWith('#') ? h.slice(1) : h;
  const parts = frag.split('&');
  for (const p of parts) {
    const [k,v] = p.split('=');
    if (!k || !v) continue;
    if (['token','access_token','accessToken','oauth_token'].includes(k)) return decodeURIComponent(v);
  }
  return null;
}

// capture token after OAuth redirect
(function captureOAuthToken() {
  const t = extractTokenFromHash();
  if (t) {
    localStorage.setItem('deriv_token', t);
    // remove fragment so token doesn't remain in URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    // if not on dashboard, go there
    if (!window.location.pathname.endsWith('dashboard.html')) {
      window.location.href = 'dashboard.html';
    }
  }
})();

token = localStorage.getItem('deriv_token');

// If on dashboard and no token -> prompt to login
if (!token && window.location.pathname.endsWith('dashboard.html')) {
  if (statusEl) statusEl.innerText = 'No token found — please login via Login page.';
  if (historyEl) historyEl.innerHTML = '<div>Please click Login and authorize the app.</div>';
}

// helpers
function appendHistory(text) {
  if (!historyEl) return;
  const now = new Date().toLocaleTimeString();
  const el = document.createElement('div');
  el.textContent = `[${now}] ${text}`;
  historyEl.prepend(el);
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(obj));
}

// connect and authorize
function connectDeriv() {
  if (!token) {
    appendHistory('No token — cannot connect.');
    if (statusEl) statusEl.innerText = 'No token. Please login.';
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    appendHistory('WebSocket open — authorizing.');
    if (statusEl) { statusEl.className = 'status waiting'; statusEl.innerText = 'Authorizing...'; }
    send({ authorize: token });
  };

  ws.onmessage = (evt) => {
    let d;
    try { d = JSON.parse(evt.data); } catch (e) { appendHistory('Invalid JSON'); return; }
    handleMessage(d);
  };

  ws.onerror = () => {
    appendHistory('WebSocket error.');
    if (statusEl) { statusEl.className = 'status waiting'; statusEl.innerText = 'Connection error'; }
  };

  ws.onclose = () => {
    appendHistory('WebSocket closed.');
    if (statusEl) { statusEl.className = 'status waiting'; statusEl.innerText = 'Disconnected'; }
    // try reconnect after delay if token still present
    setTimeout(()=>{ if (localStorage.getItem('deriv_token')) connectDeriv(); }, 5000);
  };
}

function handleMessage(msg) {
  if (!msg) return;
  if (msg.msg_type === 'authorize') {
    if (msg.error) {
      appendHistory('Authorize failed: ' + (msg.error.message || JSON.stringify(msg.error)));
      if (statusEl) { statusEl.className = 'status waiting'; statusEl.innerText = 'Auth failed — login again'; }
      return;
    }
    appendHistory('Authorized successfully.');
    if (statusEl) { statusEl.className = 'status connected'; statusEl.innerText = 'Connected'; }
    // request balance and ticks
    send({ balance: 1, subscribe: 1 });
    send({ ticks: 'R_100', subscribe: 1 });
    return;
  }

  if (msg.msg_type === 'balance') {
    if (msg.balance && msg.balance.balance !== undefined) {
      const b = Number(msg.balance.balance).toFixed(2);
      if (balanceBox) balanceBox.innerText = `$ ${b}`;
      appendHistory('Balance: $' + b);
    }
    return;
  }

  if (msg.msg_type === 'tick') {
    const quote = msg.tick && msg.tick.quote;
    const epoch = msg.tick && msg.tick.epoch;
    if (quote !== undefined) updateTick(quote, epoch);
    return;
  }

  // other messages
  appendHistory('Msg: ' + (msg.msg_type || JSON.stringify(msg)));
}

function updateTick(price, epoch) {
  if (!tickBox) return;
  const str = String(price);
  let display = str.indexOf('.') === -1 ? str + '.0' : str;
  const [intPart, decPart] = display.split('.');
  const middle = decPart.slice(0, -1) || '';
  const last = decPart.slice(-1);
  tickBox.innerHTML = `${intPart}.${middle}<b style="color:#ffeb3b">${last}</b>`;
  if (tickTime) tickTime.innerText = epoch ? `Updated: ${new Date(epoch*1000).toLocaleTimeString()}` : '';
}

// logout
function logout() {
  localStorage.removeItem('deriv_token');
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch(e){}
  window.location.href = 'login.html';
}

// auto connect if token exists and on dashboard
if (token && window.location.pathname.endsWith('dashboard.html')) {
  if (statusEl) { statusEl.className = 'status waiting'; statusEl.innerText = 'Connecting...'; }
  connectDeriv();
}

// expose logout to global scope
window.logout = logout;