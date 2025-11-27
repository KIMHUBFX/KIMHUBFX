// dp-tool.js — DP Tool Engine (client-side)
// Saves tick history, computes digits distribution, streaks, spikes, signals.
// Uses Deriv public WS (app_id 1089). If WS fails or is blocked, demo playback is available.

(() => {
  // DOM refs
  const marketSelect = document.getElementById('marketSelect');
  const historySizeInput = document.getElementById('historySize');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const demoBtn = document.getElementById('demoBtn');
  const connStatus = document.getElementById('connStatus');
  const latestPrice = document.getElementById('latestPrice');
  const latestTime = document.getElementById('latestTime');
  const lastDigitEl = document.getElementById('lastDigit');
  const totalTicksEl = document.getElementById('totalTicks');
  const digitPills = document.getElementById('digitPills');
  const digitStream = document.getElementById('digitStream');
  const heatmap = document.getElementById('heatmap');
  const spikeBox = document.getElementById('spikeBox');
  const signalBox = document.getElementById('signalBox');
  const streakEl = document.getElementById('streak');
  const topDigitEl = document.getElementById('topDigit');
  const underCountEl = document.getElementById('underCount');
  const overCountEl = document.getElementById('overCount');
  const evenCountEl = document.getElementById('evenCount');
  const oddCountEl = document.getElementById('oddCount');
  const spikeThreshInput = document.getElementById('spikeThresh');
  const signalPctInput = document.getElementById('signalPct');

  // state
  let ws = null;
  let digits = []; // recent digits
  let historySize = parseInt(historySizeInput.value, 10) || 500;
  let demoInterval = null;
  let demoIndex = 0;
  let demoActive = false;

  // helpers
  function zeroCounts(){ return Array.from({length:10},()=>0); }
  let counts = zeroCounts();

  function renderDigitPills() {
    digitPills.innerHTML = '';
    const total = Math.max(1, digits.length);
    for (let d = 0; d <= 9; d++) {
      const pct = ((counts[d] / total) * 100) || 0;
      const pill = document.createElement('div');
      pill.className = 'digit-pill';
      pill.style.background = pct > 0 ? '#fff' : '#f4f6f8';
      pill.innerHTML = `<div style="font-size:14px">${d}</div><div style="font-size:12px;color:#6b7280">${pct.toFixed(1)}%</div>`;
      digitPills.appendChild(pill);
    }
  }

  function renderStream() {
    const last = digits.slice(-40).join(' ');
    digitStream.innerText = last;
  }

  function renderHeatmap(){
    heatmap.innerHTML = '';
    const max = Math.max(...counts,1);
    for(let d=0; d<=9; d++){
      const bar = document.createElement('div');
      bar.className = 'heatbar';
      const inner = document.createElement('div');
      const h = Math.max(6, Math.round((counts[d]/max)*100));
      inner.style.height = h + '%';
      if (counts[d] >= max*0.9) inner.style.background = 'linear-gradient(180deg,#16a34a,#047857)';
      else if (counts[d] >= max*0.6) inner.style.background = 'linear-gradient(180deg,#f59e0b,#b45309)';
      else inner.style.background = 'linear-gradient(180deg,#3b82f6,#1e40af)';
      inner.textContent = counts[d] || '';
      bar.appendChild(inner);
      heatmap.appendChild(bar);
    }
  }

  function computeSummary(){
    const total = Math.max(1, digits.length);
    const over = counts.slice(5).reduce((a,b)=>a+b,0);
    const under = counts.slice(0,5).reduce((a,b)=>a+b,0);
    const even = counts.reduce((a,b,i)=> a + ((i%2===0)?b:0), 0);
    const odd = total - even;
    overCountEl.innerText = `Over(5-9): ${over}`;
    underCountEl.innerText = `Under(0-4): ${under}`;
    evenCountEl.innerText = `Even: ${even}`;
    oddCountEl.innerText = `Odd: ${odd}`;
    topDigitEl.innerText = counts.indexOf(Math.max(...counts)) + ` (${Math.max(...counts)})`;
    // streak
    let st = 0;
    const last = digits[digits.length-1];
    if (last !== undefined) {
      for (let i = digits.length-1; i >= 0; i--) {
        if (digits[i] === last) st++; else break;
      }
    }
    streakEl.innerText = st;
  }

  function detectSpike(){
    // simple: if any digit count rises above spike threshold compared to average
    const total = Math.max(1, digits.length);
    const avg = total / 10;
    const spikeThresh = Math.max(1, parseInt(spikeThreshInput.value,10) || 5);
    let spikes = [];
    for(let d=0; d<=9; d++){
      if (counts[d] >= avg + spikeThresh) spikes.push({d,count:counts[d]});
    }
    if (spikes.length) {
      spikeBox.innerText = 'Spikes: ' + spikes.map(s => s.d + '('+s.count+')').join(', ');
      spikeBox.style.color = '#b45309';
    } else {
      spikeBox.innerText = 'No spikes';
      spikeBox.style.color = '#6b7280';
    }
  }

  function evaluateSignal(){
    // Simple rule-based signal:
    // If top digit pct >= signalPct → strong buy (buy digit as Over/Under example)
    const total = Math.max(1, digits.length);
    const signalMin = parseFloat(signalPctInput.value) || 20;
    const top = counts.indexOf(Math.max(...counts));
    const topPct = (counts[top] / total) * 100;
    // heuristics:
    if (topPct >= signalMin && digits.length >= 30) {
      signalBox.className = 'signal buy';
      signalBox.innerText = `HOT DIGIT ${top} — ${topPct.toFixed(1)}%`;
    } else {
      // check streak strong
      const st = parseInt(streakEl.innerText, 10) || 0;
      if (st >= 6) {
        signalBox.className = 'signal sell';
        signalBox.innerText = `STREAK ${digits[digits.length-1]} (${st}) — CAUTION`;
      } else {
        signalBox.className = 'signal wait';
        signalBox.innerText = 'NO SIGNAL';
      }
    }
  }

  // main update
  function updateAllUI() {
    renderDigitPills();
    renderStream();
    renderHeatmap();
    computeSummary();
    detectSpike();
    evaluateSignal();
    totalTicksEl.innerText = digits.length;
  }

  // process a new tick (price string or number)
  function processTick(price, epoch){
    // robust last digit extraction
    let s = String(price);
    // find last numeric char
    let last = null;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] >= '0' && s[i] <= '9') { last = Number(s[i]); break; }
    }
    if (last === null) return;
    digits.push(last);
    counts[last] = (counts[last] || 0) + 1;
    // trim history
    historySize = Math.max(50, Math.min(5000, parseInt(historySizeInput.value,10) || 500));
    while (digits.length > historySize) {
      const rem = digits.shift();
      counts[rem] = Math.max(0, counts[rem] - 1);
    }

    latestPrice.innerText = price;
    latestTime.innerText = new Date((epoch||Date.now()/1000)*1000).toLocaleTimeString();
    lastDigitEl.innerText = last;
    updateAllUI();
  }

  // WebSocket handling
  const APP_ID = 1089; // public
  let reconnectTimer = null;
  function connectWS(symbol){
    disconnectWS();
    connStatus.innerText = 'Connecting…';
    const url = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      connStatus.innerText = 'WS error';
      console.error(e);
      return;
    }

    ws.onopen = () => {
      connStatus.innerText = 'Connected';
      // subscribe ticks
      const req = { ticks: symbol, subscribe: 1 };
      ws.send(JSON.stringify(req));
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.error) {
          console.warn('API error', data.error);
          connStatus.innerText = 'API error';
          return;
        }
        // old style: msg_type tick OR data.tick
        if (data.msg_type === 'tick' || data.tick) {
          const t = data.tick || data;
          const quote = t.quote ?? t.bid ?? t.ask;
          const epoch = t.epoch ?? Math.floor(Date.now()/1000);
          processTick(String(quote), epoch);
        }
      } catch (err) {
        console.error('parse err', err);
      }
    };

    ws.onerror = (e) => {
      console.error('ws err', e);
      connStatus.innerText = 'WS error';
    };

    ws.onclose = (ev) => {
      connStatus.innerText = 'Disconnected';
      if (ev && ev.code !== 1000) {
        // reconnect
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(()=> connectWS(symbol), 1000 + Math.random()*2000);
      }
    };
  }

  function disconnectWS(){
    if (ws) try { ws.close(1000,'client'); } catch(e){}
    ws = null;
    connStatus.innerText = 'Disconnected';
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Demo playback (random or sample)
  const samplePrices = [
    // small realistic random-ish sample
    8723.102,8723.145,8723.178,8723.214,8723.242,8723.299,8723.342,8723.398,8723.411,8723.456,
    8723.502,8723.552,8723.599,8723.655,8723.692,8723.732,8723.789,8723.801,8723.855,8723.899
  ];

  function startDemo(){
    demoActive = true;
    disconnectWS();
    connStatus.innerText = 'Demo mode';
    digits = []; counts = zeroCounts();
    updateAllUI();
    demoIndex = 0;
    if (demoInterval) clearInterval(demoInterval);
    demoInterval = setInterval(()=>{
      const p = samplePrices[demoIndex % samplePrices.length] + (Math.random()*0.1);
      processTick(p.toFixed(3), Math.floor(Date.now()/1000));
      demoIndex++;
    }, 300);
  }

  function stopDemo(){
    demoActive = false;
    if (demoInterval) clearInterval(demoInterval);
    demoInterval = null;
    connStatus.innerText = 'Demo stopped';
  }

  // UI events
  connectBtn.addEventListener('click', ()=>{
    demoActive = false;
    if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
    digits = []; counts = zeroCounts();
    updateAllUI();
    connectWS(marketSelect.value);
  });

  disconnectBtn.addEventListener('click', ()=>{
    disconnectWS();
  });

  demoBtn.addEventListener('click', ()=>{
    if (demoActive) { stopDemo(); } else { startDemo(); }
  });

  // init render
  document.addEventListener('DOMContentLoaded', ()=>{
    // build initial pill elements
    digitPills.innerHTML = '';
    for(let i=0;i<10;i++){
      const pill = document.createElement('div');
      pill.className = 'digit-pill';
      pill.style.opacity = 0.9;
      pill.innerHTML = `<div style="font-size:14px">${i}</div><div style="font-size:12px;color:#6b7280">0.0%</div>`;
      digitPills.appendChild(pill);
    }
    // initial small state
    connStatus.innerText = 'Disconnected';
  });
})();
