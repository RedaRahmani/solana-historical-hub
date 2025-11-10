;(function(){
  const hasWindow = typeof window !== 'undefined';
  const w = hasWindow ? window : {};

  const UI = {};
  const state = (w.UIState = w.UIState || {
    wallet: null,
    connection: null,
    pendingPayment: null,
    pendingRequest: null,
    splToken: null,
    DEVNET_RPC: 'https://api.devnet.solana.com',
    USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  });

  // Toast helpers (graceful fallback)
  function toast(text, type) {
    try {
      if (w.Toastify) {
        w.Toastify({
          text,
          duration: 3500,
          gravity: 'top', position: 'right',
          style: type === 'error' ? { background: '#ef4444' } : { background: '#10b981' },
        }).showToast();
        return;
      }
    } catch(_) {}
    try { w.alert(text); } catch(_) {}
  }

  // Theme
  UI.initTheme = function initTheme(){
    const root = document.documentElement;
    const saved = w.localStorage && w.localStorage.getItem('theme');
    if (saved === 'dark') {
      root.classList.add('dark');
    } else if (!saved) {
      // Respect OS preference on first load
      try { if (w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark'); } catch(_){}
    }
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        root.classList.toggle('dark');
        const mode = root.classList.contains('dark') ? 'dark' : 'light';
        try { w.localStorage && w.localStorage.setItem('theme', mode); } catch(_){}
      });
    }
  };

  // Wallet
  UI.updateWalletUI = function updateWalletUI(){
    const statusDiv = document.getElementById('walletStatus');
    const text = document.getElementById('walletText');
    const btn = document.getElementById('connectWallet');
    const mText = document.getElementById('modalWalletText');
    const connected = state.wallet && state.wallet.isConnected;
    if (connected){
      const addr = state.wallet.publicKey.toString();
      if (text) text.textContent = '✅ Wallet: ' + addr.slice(0,8) + '...' + addr.slice(-8);
      if (mText) mText.textContent = '✅ Wallet connected';
      if (btn) {
        btn.textContent = 'Disconnect';
        btn.onclick = () => { try { state.wallet.disconnect(); } catch(_){} };
      }
      if (statusDiv) statusDiv.className = statusDiv.className.replace('bg-yellow-100','bg-green-100');
    } else {
      if (text) text.textContent = '🦊 Wallet: Not connected';
      if (mText) mText.textContent = 'Connect wallet to process payment';
      if (btn) {
        btn.textContent = 'Connect Phantom';
        btn.onclick = UI.connectWallet;
      }
    }
  };

  UI.connectWallet = async function connectWallet(){
    try {
      if (!w.solana) { toast('Install Phantom from phantom.app', 'error'); return; }
      await w.solana.connect(); state.wallet = w.solana; UI.updateWalletUI();
    } catch(e){ toast('Failed to connect wallet: ' + e.message, 'error'); }
  };

  function ensureConnection(){
    try { if (!state.connection && w.solanaWeb3) state.connection = new w.solanaWeb3.Connection(state.DEVNET_RPC, 'confirmed'); } catch(_){}
    try { if (!state.splToken) state.splToken = w.splToken || w.solanaToken || null; } catch(_){}
  }

  // Modal helpers
  UI.setActiveStep = function setActiveStep(stepId){
    ['step-connect','step-sign','step-confirm','step-retry'].forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      if (id === stepId) el.classList.add('step--active'); else el.classList.remove('step--active');
    });
  };

  UI.openPaymentModal = function openPaymentModal(resp402, method, params){
    try {
      if (!resp402 || !resp402.accepts || !resp402.accepts[0]) { toast('Invalid payment response', 'error'); return; }
      const p = resp402.accepts[0];
      state.pendingPayment = p; state.pendingRequest = { method, params };
      const map = {
        paymentAmount: (p.amount||'N/A') + ' ' + (p.asset||'USDC'),
        paymentAsset: (p.asset||'USDC') + ' (' + (p.chain||'solana-devnet') + ')',
        paymentAddress: p.paymentAddress || 'N/A',
        paymentId: p.paymentId || 'N/A',
        paymentMethod: p.method || method || 'unknown'
      };
      Object.keys(map).forEach(id=>{ const el=document.getElementById(id); if (el) el.textContent = map[id]; });
      const modal = document.getElementById('paymentModal');
      if (modal){ modal.classList.add('modal--show'); }
      const pp = document.getElementById('paymentProgress'); if (pp) pp.classList.add('hidden');
      const payBtn = document.getElementById('payButton'); if (payBtn){ payBtn.disabled=false; payBtn.textContent='Pay with Phantom'; payBtn.focus(); }
      UI.setActiveStep('step-connect');
    } catch(e){ toast('Failed to prepare payment modal: ' + e.message, 'error'); }
  };

  UI.closePaymentModal = function closePaymentModal(){
    const modal = document.getElementById('paymentModal'); if (modal) modal.classList.remove('modal--show');
    const pp = document.getElementById('paymentProgress'); if (pp) pp.classList.add('hidden');
    const btn = document.getElementById('payButton'); if (btn){ btn.disabled=false; btn.textContent='Pay with Phantom'; }
    state.pendingPayment = null; state.pendingRequest = null;
  };

  UI.retryWithPayment = async function retryWithPayment(txSignature, paymentId){
    const progress = document.getElementById('paymentProgress');
    try {
      const proof = w.btoa(JSON.stringify({ txSignature, paymentId }));
      const response = await w.fetch('/', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Payment': proof }, body: JSON.stringify({ jsonrpc:'2.0', id:1, method: state.pendingRequest.method, params: state.pendingRequest.params }) });
      const data = await response.json();
      if (response.ok){ UI.renderResult(data); UI.closePaymentModal(); try { w.confetti && w.confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } }); } catch(_){} }
      else { UI.renderError(data); toast('Request error after payment', 'error'); }
    } catch(e){ UI.renderError({ error: { message: 'Retry failed: ' + e.message } }); toast('Retry failed: '+e.message, 'error'); }
  };

  UI.processPayment = async function processPayment(){
    ensureConnection();
    if (!(state.wallet && state.wallet.isConnected)) { toast('Connect your wallet first', 'error'); return; }
    if (!state.pendingPayment || !state.pendingRequest) { toast('No pending payment', 'error'); return; }
    if (!w.Buffer) { toast('Buffer not available in browser', 'error'); return; }
    if (!state.splToken) { toast('SPL Token library not loaded', 'error'); return; }
    const progress = document.getElementById('paymentProgress'); const payBtn = document.getElementById('payButton');
    try {
      if (progress){ progress.classList.remove('hidden'); progress.textContent='Processing payment...'; }
      if (payBtn){ payBtn.disabled = true; payBtn.textContent='Processing...'; }
      UI.setActiveStep('step-sign');

      const usdcMint = new w.solanaWeb3.PublicKey(state.USDC_MINT);
      const recipient = new w.solanaWeb3.PublicKey(state.pendingPayment.paymentAddress);
      const sender = state.wallet.publicKey;

      const senderATA = await state.splToken.getAssociatedTokenAddress(usdcMint, sender);
      const recipientATA = await state.splToken.getAssociatedTokenAddress(usdcMint, recipient);

      const amount = Math.floor(parseFloat(state.pendingPayment.amount) * 1e6);

      const acctInfo = await state.connection.getAccountInfo(senderATA);
      if (!acctInfo) { throw new Error('You do not have a USDC token account yet.'); }
      const bal = await state.connection.getTokenAccountBalance(senderATA);
      const have = parseInt(bal.value.amount);
      if (have < amount) { throw new Error('Insufficient USDC. Need ' + (amount/1e6).toFixed(6)); }

      const tx = new w.solanaWeb3.Transaction().add(
        state.splToken.createTransferInstruction(senderATA, recipientATA, sender, amount, [], state.splToken.TOKEN_PROGRAM_ID)
      );
      const bh = await state.connection.getLatestBlockhash(); tx.recentBlockhash = bh.blockhash; tx.feePayer = sender;

      if (progress) progress.textContent = 'Waiting for signature...';
      const signed = await state.wallet.signTransaction(tx);
      UI.setActiveStep('step-confirm');
      if (progress) progress.textContent = 'Sending transaction...';
      const sig = await state.connection.sendRawTransaction(signed.serialize());
      if (progress) progress.textContent = 'Confirming... ' + sig.slice(0,16) + '...';
      await state.connection.confirmTransaction(sig, 'confirmed');

      UI.setActiveStep('step-retry');
      if (progress) progress.textContent = 'Payment confirmed. Retrying request...';
      await new Promise((r)=> setTimeout(r, 1000));
      await UI.retryWithPayment(sig, state.pendingPayment.paymentId);
    } catch(e){
      if (progress) progress.textContent = 'Payment failed: ' + e.message;
      if (payBtn){ payBtn.disabled=false; payBtn.textContent='Retry Payment'; }
      toast('Payment failed: ' + e.message, 'error');
    }
  };

  // Results rendering
  UI.renderResult = function renderResult(data){
    const r = document.getElementById('queryResult');
    const jsonWrap = document.getElementById('resultJson');
    const loading = document.getElementById('resultLoading');
    if (loading) loading.classList.add('hidden');
    if (r) {
      // Pretty-print JSON
      r.textContent = JSON.stringify(data, null, 2);
      // Syntax highlight if Prism is available
      try { if (window.Prism && r) window.Prism.highlightElement(r); } catch(_){}
    }
    if (jsonWrap) jsonWrap.classList.remove('hidden');
    UI.tryRenderTxTable(data);
  };

  UI.renderError = function renderError(data){
    UI.renderResult(data);
  };

  UI.tryRenderTxTable = function tryRenderTxTable(data){
    try {
      const wrap = document.getElementById('txTableWrap');
      const body = document.getElementById('txTable');
      if (!wrap || !body) return;
      body.innerHTML='';
      const txs = (data && data.result && (data.result.transactions || data.result)) || [];
      if (!Array.isArray(txs) || txs.length === 0) { wrap.classList.add('hidden'); return; }
      txs.slice(0, 200).forEach((t)=>{
        const sig = t.transaction && t.transaction.signatures ? t.transaction.signatures[0] : (t.signature || 'n/a');
        const status = (t.meta && t.meta.err) ? 'error' : 'ok';
        const fee = t.meta && typeof t.meta.fee === 'number' ? t.meta.fee : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = '<td class="px-3 py-2">' + (sig ? (sig.slice(0,10)+'...') : '-') + '</td>'
          + '<td class="px-3 py-2">' + status + '</td>'
          + '<td class="px-3 py-2">' + fee + '</td>';
        body.appendChild(tr);
      });
      wrap.classList.remove('hidden');
      const sortBtn = document.getElementById('sortTxBtn');
      if (sortBtn) {
        sortBtn.onclick = () => {
          const rows = Array.from(body.querySelectorAll('tr'));
          rows.sort((a,b)=> parseInt(b.children[2].textContent) - parseInt(a.children[2].textContent));
          body.innerHTML=''; rows.forEach(r=>body.appendChild(r));
        };
      }
    } catch(_){}
  };

  // Metrics
  UI.loadMetrics = async function loadMetrics(){
    try {
      const res = await w.fetch('/metrics/json');
      const d = await res.json();
      const ctxReq = document.getElementById('requestsChart');
      const ctxRev = document.getElementById('revenueChart');
      if (w.Chart && ctxReq && ctxRev){
        // Adjust chart text colors for dark mode
        try {
          const isDark = document.documentElement.classList.contains('dark');
          w.Chart.defaults.color = isDark ? '#e5e7eb' : '#0f172a';
          w.Chart.defaults.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.2)';
        } catch(_){}
        try {
          const reqs = (d.requests && d.requests.byMinute) || [];
          const labels = reqs.map((_,i)=> i+1);
          const dataReq = reqs.map(x=> x);
          new w.Chart(ctxReq, { type:'line', data:{ labels, datasets:[{ label:'Requests', data:dataReq, borderColor:'#6366f1' }]}, options:{ responsive: true, plugins:{ legend:{ display:false, labels: { color: w.Chart.defaults.color } } }, scales:{ x:{ ticks:{ color:w.Chart.defaults.color }, grid:{ color:w.Chart.defaults.borderColor } }, y:{ ticks:{ color:w.Chart.defaults.color }, grid:{ color:w.Chart.defaults.borderColor } } } } });
        } catch(_){}
        try {
          const gateway = (d.revenue && d.revenue.gateway) || 0;
          const provider = (d.revenue && d.revenue.dataProvider) || 0;
          new w.Chart(ctxRev, { type:'pie', data:{ labels:['Gateway','Providers'], datasets:[{ data:[gateway, provider], backgroundColor:['#8b5cf6','#10b981'] }] }, options:{ responsive:true, plugins:{ legend: { labels: { color: w.Chart.defaults.color } } } } });
        } catch(_){}
      } else {
        const fb = document.getElementById('metricsFallback'); if (fb){ fb.classList.remove('hidden'); fb.textContent = 'Requests: ' + (d.requests && d.requests.total || 0) + ', Payments: ' + (d.payments && d.payments.total || 0) + ', Revenue: ' + (d.revenue && d.revenue.total || 0) + ' USDC'; }
      }
    } catch(e){ toast('Failed to load metrics', 'error'); }
  };

  // Providers
  let providersCache = [];
  UI.loadProviders = async function loadProviders(){
    try {
      const res = await w.fetch('/providers');
      const d = await res.json();
      providersCache = Array.isArray(d.providers) ? d.providers.slice() : [];
      UI.renderProviders(providersCache);
    } catch(e){ toast('Failed to load providers', 'error'); }
  };

  UI.renderProviders = function renderProviders(list){
    const body = document.getElementById('providersTable');
    const empty = document.getElementById('providersEmpty');
    if (!body) return;
    body.innerHTML = '';
    if (!list || list.length === 0){ if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    list.forEach(p=>{
      const rep = parseInt(p.reputation||0);
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="px-3 py-2">' + (p.name||'-') + '</td>'
        + '<td class="px-3 py-2">' + (p.type||'-') + '</td>'
        + '<td class="px-3 py-2">' + (p.pricing||'-') + '</td>'
        + '<td class="px-3 py-2"><div class="h-2 w-32 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden"><div style="width:'+rep+'%" class="h-full '+ (rep>70? 'bg-green-500':'bg-red-500') +'"></div></div></td>';
      body.appendChild(tr);
    });
  };

  UI.sortProvidersBy = function sortProvidersBy(field){
    const copy = providersCache.slice();
    copy.sort((a,b)=> {
      const va = parseFloat(a[field]||0), vb = parseFloat(b[field]||0);
      return vb - va;
    });
    UI.renderProviders(copy);
  };

  // Agent simulator
  UI.runAgent = async function runAgent(){
    const q = (document.getElementById('agentInput')||{}).value || 'Analyze: slot 419899999';
    const depth = parseInt((document.getElementById('agentDepth')||{}).value || '2');
    const stepsEl = document.getElementById('agentSteps');
    const spin = document.getElementById('agentSpin');
    const outWrap = document.getElementById('agentResult');
    const out = document.getElementById('agentOutput');
    if (spin) spin.classList.remove('hidden');
    if (stepsEl) stepsEl.innerHTML = '';
    const steps = [
      'Parse query and detect entities',
      'Fetch historical data (devnet-safe)',
      'Aggregate and compute metrics',
      'Summarize and format output'
    ].slice(0, Math.max(2, depth+1));
    for (let i=0;i<steps.length;i++){
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 text-sm';
      row.innerHTML = '<span class="spinner" style="border-color:#6366f180;border-top-color:#6366f1"></span><span>'+steps[i]+'</span>';
      stepsEl.appendChild(row);
      // simulate work
      /* eslint-disable no-await-in-loop */
      await new Promise((r)=> setTimeout(r, 300 + i*200));
      row.firstChild.remove();
      row.innerHTML = '✅ ' + steps[i];
    }
    if (spin) spin.classList.add('hidden');
    if (out) {
      out.textContent = JSON.stringify({ query: q, depth, estimatedCostUSDC: (0.001*depth).toFixed(4), result: 'This is a simulated agent output for demonstration. Devnet-safe.' }, null, 2);
      if (outWrap) outWrap.classList.remove('hidden');
    }
    try { w.confetti && w.confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } }); } catch(_){}
  };

  // Query form
  UI.handleQuerySubmit = async function handleQuerySubmit(e){
    e.preventDefault();
    const method = document.getElementById('method').value;
    const paramsText = document.getElementById('params').value.trim();
    const loading = document.getElementById('queryLoading');
    const resultSpin = document.getElementById('resultLoading');
    const jsonWrap = document.getElementById('resultJson');
    try {
      let params = [];
      if (paramsText){ params = JSON.parse(paramsText); }
      if (loading){ loading.classList.remove('hidden'); loading.classList.add('flex'); }
      if (resultSpin){ resultSpin.classList.remove('hidden'); }
      if (jsonWrap) jsonWrap.classList.add('hidden');
      const response = await w.fetch('/', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) });
      const data = await response.json();
      if (loading){ loading.classList.add('hidden'); loading.classList.remove('flex'); }
      if (resultSpin){ resultSpin.classList.add('hidden'); }
      if (response.status === 402){ toast('Payment required', 'error'); UI.openPaymentModal(data, method, params); }
      else if (response.ok){ UI.renderResult(data); toast('Query succeeded', 'success'); }
      else { UI.renderError(data); toast('Query error', 'error'); }
    } catch(e){
      if (loading){ loading.classList.add('hidden'); loading.classList.remove('flex'); }
      if (resultSpin){ resultSpin.classList.add('hidden'); }
      toast('Invalid params or request failed: ' + e.message, 'error');
    }
  };

  // Lazy load sections
  UI.initLazy = function initLazy(){
    const load = () => { UI.loadMetrics(); UI.loadProviders(); };
    try {
      const sentinel = document.createElement('div');
      sentinel.className = 'visually-hidden';
      document.body.appendChild(sentinel);
      const obs = new IntersectionObserver((entries)=>{
        if (entries.some(e=> e.isIntersecting)) { load(); obs.disconnect(); }
      });
      obs.observe(sentinel);
    } catch(_) { load(); }
  };

  // Wire up events
  function bindEvents(){
    const close = document.getElementById('paymentClose');
    const cancel = document.getElementById('paymentCancel');
    const pay = document.getElementById('payButton');
    const connectBtn = document.getElementById('connectWallet');
    const clearBtn = document.getElementById('clearBtn');
    const form = document.getElementById('queryForm');
    const sortPrice = document.getElementById('sortProvidersByPrice');
    const sortRep = document.getElementById('sortProvidersByRep');
    const runAgent = document.getElementById('runAgent');
    if (close) close.addEventListener('click', UI.closePaymentModal);
    if (cancel) cancel.addEventListener('click', UI.closePaymentModal);
    if (pay) pay.addEventListener('click', UI.processPayment);
    if (connectBtn) connectBtn.addEventListener('click', UI.connectWallet);
    if (clearBtn) clearBtn.addEventListener('click', ()=>{
      const r = document.getElementById('queryResult'); const j = document.getElementById('resultJson'); const t = document.getElementById('txTableWrap');
      if (r) r.textContent=''; if (j) j.classList.add('hidden'); if (t) t.classList.add('hidden');
    });
    if (form) form.addEventListener('submit', UI.handleQuerySubmit);
    if (sortPrice) sortPrice.addEventListener('click', ()=> UI.sortProvidersBy('pricing'));
    if (sortRep) sortRep.addEventListener('click', ()=> UI.sortProvidersBy('reputation'));
    if (runAgent) runAgent.addEventListener('click', UI.runAgent);
    const copyBtn = document.getElementById('copyResultBtn');
    const toggleBtn = document.getElementById('resultToggleBtn');
    if (copyBtn) copyBtn.addEventListener('click', UI.copyResult);
    if (toggleBtn) toggleBtn.addEventListener('click', UI.toggleResult);

    // Escape closes modal
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') UI.closePaymentModal(); });
  }

  UI.copyResult = async function copyResult(){
    try {
      const r = document.getElementById('queryResult');
      const text = r ? r.textContent : '';
      if (!text) { toast('No result to copy', 'error'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast('JSON copied to clipboard', 'success');
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        toast('JSON copied', 'success');
      }
    } catch(e){ toast('Failed to copy: ' + e.message, 'error'); }
  };

  UI.toggleResult = function toggleResult(){
    const det = document.getElementById('resultDetails');
    const btn = document.getElementById('resultToggleBtn');
    if (!det || !btn) return;
    det.open = !det.open;
    btn.textContent = det.open ? 'Collapse' : 'Expand';
  };

  function initWallet(){
    if (w.solana && w.solana.isPhantom){
      try {
        w.solana.on('connect', ()=>{ state.wallet = w.solana; UI.updateWalletUI(); });
        w.solana.on('disconnect', ()=>{ state.wallet = w.solana; UI.updateWalletUI(); });
        if (w.solana.isConnected) state.wallet = w.solana;
      } catch(_){}
      UI.updateWalletUI();
    } else {
      const text = document.getElementById('walletText');
      const btn = document.getElementById('connectWallet');
      if (text) text.textContent = '⚠️ Phantom wallet not detected';
      if (btn) { btn.textContent = 'Install Phantom'; btn.onclick = function(){ try{ w.open('https://phantom.app/','_blank'); }catch(_){} }; }
    }
  }

  function init(){
    try { UI.initTheme(); ensureConnection(); bindEvents(); initWallet(); UI.initLazy(); } catch(_){}
  }

  if (hasWindow) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    w.UI = UI; // expose for debugging
  }

  if (typeof module !== 'undefined') module.exports = UI;
})();
