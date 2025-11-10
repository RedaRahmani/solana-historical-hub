const { getRevenueMetrics } = require('../services/paymentService');
const { paymentStore } = require('../stores/paymentStore');

/**
 * Serve the main UI page (stable, minimal UI without external UI libs)
 */
function uiHandler(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solana Historical Hub - Web Interface</title>

  <!-- Buffer polyfill for browser (required by Solana libraries) -->
  <script>
    (function() {
      if (typeof Buffer !== 'undefined') return;
      class BufferPolyfill extends Uint8Array {
        constructor(arg) {
          if (typeof arg === 'number') {
            super(arg);
          } else if (typeof arg === 'string') {
            const enc = new TextEncoder();
            super(enc.encode(arg));
          } else if (arg instanceof ArrayBuffer || ArrayBuffer.isView(arg)) {
            super(arg);
          } else if (Array.isArray(arg)) {
            super(arg);
          } else {
            super(0);
          }
        }
        static alloc(n, fill){ const b=new BufferPolyfill(n); if (fill!==undefined) b.fill(fill); return b; }
        static from(d){ return new BufferPolyfill(d); }
        writeUInt8(v,o=0){ this[o]=v&255; return o+1; }
        writeBigUInt64LE(v,o=0){ const view=new DataView(this.buffer,this.byteOffset,this.byteLength); view.setBigUint64(o, BigInt(v), true); return o+8; }
      }
      window.Buffer = BufferPolyfill;
    })();
  </script>

  <!-- Solana Web3.js and SPL Token -->
  <script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js"></script>
  <script src="https://unpkg.com/@solana/spl-token@0.3.8/lib/index.iife.min.js"></script>
  <script>
    // Minimal SPL-Token helpers for browser
    window.splToken = window.splToken || {
      TOKEN_PROGRAM_ID: new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      ASSOCIATED_TOKEN_PROGRAM_ID: new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      getAssociatedTokenAddress: async function(mint, owner){
        const seed = [ owner.toBuffer(), this.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer() ];
        const res = await solanaWeb3.PublicKey.findProgramAddress(seed, this.ASSOCIATED_TOKEN_PROGRAM_ID);
        return res[0];
      },
      createTransferInstruction: function(source, destination, owner, amount){
        const keys = [
          { pubkey: source, isSigner: false, isWritable: true },
          { pubkey: destination, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
        ];
        const data = Buffer.alloc(9);
        data.writeUInt8(3, 0);
        data.writeBigUInt64LE(BigInt(amount), 1);
        return new solanaWeb3.TransactionInstruction({ keys, programId: this.TOKEN_PROGRAM_ID, data });
      }
    };
  </script>

  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header, .card { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 6px 14px rgba(0,0,0,.08); margin-bottom: 16px; }
    .header h1 { margin: 0 0 6px; color: #4f46e5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    label { display: block; margin: 8px 0 4px; font-weight: 600; }
    select, textarea, input { width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 6px; font-family: monospace; }
    button { background: #4f46e5; color: #fff; border: 0; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    button:hover { background: #4338ca; }
    .btn-secondary { background: #6b7280; }
    .btn-secondary:hover { background: #4b5563; }
    .result { margin-top: 10px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; white-space: pre-wrap; font-family: monospace; max-height: 420px; overflow: auto; }
    .loading { text-align: center; padding: 16px; color: #4f46e5; }
    .provider-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    /* Modal */
    .modal { display:none; position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 1000; }
    .modal-content { width: 92%; max-width: 520px; margin: 6% auto; background:#fff; border-radius: 10px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,.25); }
    .modal-header { display:flex; align-items:center; justify-content: space-between; margin-bottom: 8px; }
    .close { cursor: pointer; font-size: 20px; }
    .payment-details { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin: 10px 0; }
    .row { display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
    .row:last-child { border-bottom: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ Solana Historical Hub</h1>
      <p>Pay-per-query RPC gateway (x402) • Devnet</p>
      <div id="walletStatus" style="margin-top:8px; padding:8px; background:#fff3cd; border-radius:6px;">
        <span id="walletText">🦊 Wallet: Not connected</span>
        <button id="connectWallet" onclick="connectWallet()" style="margin-left:8px;">Connect Phantom</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>📡 RPC Query</h2>
        <form id="queryForm">
          <label for="method">RPC Method</label>
          <select id="method" name="method">
            <option value="getSlot">getSlot</option>
            <option value="getBlockHeight">getBlockHeight</option>
            <option value="getBlock" selected>getBlock</option>
            <option value="getTransaction">getTransaction</option>
            <option value="getSignaturesForAddress">getSignaturesForAddress</option>
          </select>
          <label for="params">Parameters (JSON array)</label>
          <textarea id="params" rows="4">[419899999, {"encoding": "json", "maxSupportedTransactionVersion": 0}]</textarea>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button type="submit" id="runBtn">Execute Query</button>
            <button type="button" class="btn-secondary" onclick="clearResult()">Clear</button>
          </div>
        </form>
        <div id="queryResult" class="result"></div>
      </div>

      <div class="card">
        <h2>📊 Metrics</h2>
        <div id="metrics"><div class="loading">Loading metrics...</div></div>
        <div style="margin-top:8px;"><button class="btn-secondary" onclick="loadMetrics()">Refresh</button></div>
      </div>

      <div class="card">
        <h2>🌐 Data Providers</h2>
        <div id="providers"><div class="loading">Loading providers...</div></div>
        <div style="margin-top:8px;"><button class="btn-secondary" onclick="loadProviders()">Refresh</button></div>
      </div>
    </div>
  </div>

  <!-- Payment Modal -->
  <div id="paymentModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>💳 Payment Required</h3>
        <span class="close" onclick="closePaymentModal()">×</span>
      </div>
      <div id="modalWalletStatus" style="text-align:center; padding:8px; background:#fff3cd; border-radius:6px; margin-bottom:8px;">
        <span id="modalWalletText">Connect wallet to process payment</span>
      </div>
      <div class="payment-details">
        <div class="row"><span>Amount</span><span id="paymentAmount">-</span></div>
        <div class="row"><span>Asset</span><span id="paymentAsset">-</span></div>
        <div class="row"><span>Recipient</span><span id="paymentAddress" style="font-size:10px; word-break:break-all;">-</span></div>
        <div class="row"><span>Payment ID</span><span id="paymentId" style="font-size:10px; word-break:break-all;">-</span></div>
        <div class="row"><span>Method</span><span id="paymentMethod">-</span></div>
      </div>
      <div id="paymentProgress" style="display:none; padding:8px; background:#d1ecf1; color:#0c5460; border-radius:6px; margin-bottom:8px;">Processing payment...</div>
      <div style="display:flex; gap:8px;">
        <button class="btn-secondary" onclick="closePaymentModal()" style="flex:1;">Cancel</button>
        <button id="payButton" onclick="processPayment()" style="flex:1;">Pay with Phantom</button>
      </div>
      <div style="margin-top:10px; font-size:12px; color:#6b7280;">
        CLI alternative: <code>node examples/client.js</code>
      </div>
    </div>
  </div>

  <script>
    // Wallet and RPC state
    let wallet = null; let connection = null; let pendingPayment = null; let pendingRequest = null; let splToken = null;
    const DEVNET_RPC = 'https://api.devnet.solana.com';
    const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

    window.addEventListener('load', function(){
      connection = new solanaWeb3.Connection(DEVNET_RPC, 'confirmed');
      splToken = window.splToken || window.solanaToken || null;
      checkWalletConnection();
      loadMetrics(); loadProviders();
      setInterval(loadMetrics, 10000);
    });

    function checkWalletConnection(){
      if (window.solana && window.solana.isPhantom){
        window.solana.on('connect', updateWalletUI);
        window.solana.on('disconnect', updateWalletUI);
        if (window.solana.isConnected) { wallet = window.solana; }
        updateWalletUI();
      } else {
        document.getElementById('walletText').textContent = '⚠️ Phantom wallet not detected';
        const btn = document.getElementById('connectWallet');
        btn.textContent = 'Install Phantom';
        btn.onclick = function(){ window.open('https://phantom.app/', '_blank'); };
      }
    }

    async function connectWallet(){
      try { if (!window.solana) { alert('Install Phantom from phantom.app'); return; }
        await window.solana.connect(); wallet = window.solana; updateWalletUI();
      } catch(e){ alert('Failed to connect wallet: ' + e.message); }
    }

    function updateWalletUI(){
      const statusDiv = document.getElementById('walletStatus');
      const text = document.getElementById('walletText');
      const btn = document.getElementById('connectWallet');
      if (wallet && wallet.isConnected){
        const addr = wallet.publicKey.toString();
        text.textContent = '✅ Wallet: ' + addr.slice(0,8) + '...' + addr.slice(-8);
        btn.textContent = 'Disconnect';
        btn.onclick = function(){ wallet.disconnect(); };
        statusDiv.style.background = '#d4edda';
      } else {
        text.textContent = '🦊 Wallet: Not connected';
        btn.textContent = 'Connect Phantom';
        btn.onclick = connectWallet;
        statusDiv.style.background = '#fff3cd';
      }
    }

    function showPaymentModal(resp402, method, params){
      if (!resp402 || !resp402.accepts || !resp402.accepts[0]) { alert('Invalid payment response'); return; }
      const p = resp402.accepts[0];
      pendingPayment = p; pendingRequest = { method: method, params: params };
      document.getElementById('paymentAmount').textContent = (p.amount||'N/A') + ' ' + (p.asset||'USDC');
      document.getElementById('paymentAsset').textContent = (p.asset||'USDC') + ' (' + (p.chain||'solana-devnet') + ')';
      document.getElementById('paymentAddress').textContent = p.paymentAddress || 'N/A';
      document.getElementById('paymentId').textContent = p.paymentId || 'N/A';
      document.getElementById('paymentMethod').textContent = p.method || method || 'unknown';
      var modal = document.getElementById('paymentModal'); modal.style.display='block';
    }

    function closePaymentModal(){
      var modal = document.getElementById('paymentModal'); modal.style.display='none';
      var pp = document.getElementById('paymentProgress'); pp.style.display='none';
      var btn = document.getElementById('payButton'); btn.disabled=false; btn.textContent='Pay with Phantom';
      pendingPayment = null; pendingRequest = null;
    }

    async function processPayment(){
      if (!(wallet && wallet.isConnected)) { alert('Connect your wallet first'); return; }
      if (!pendingPayment || !pendingRequest) { alert('No pending payment'); return; }
      if (typeof Buffer === 'undefined') { alert('Buffer not available. Use CLI if issue persists.'); return; }
      if (!splToken) { alert('SPL Token library not loaded'); return; }
      var progress = document.getElementById('paymentProgress'); var payBtn = document.getElementById('payButton');
      try {
        progress.style.display='block'; progress.style.background='#d1ecf1'; progress.textContent='Processing payment...';
        payBtn.disabled = true; payBtn.textContent='Processing...';

        const usdcMint = new solanaWeb3.PublicKey(USDC_MINT);
        const recipient = new solanaWeb3.PublicKey(pendingPayment.paymentAddress);
        const sender = wallet.publicKey;

        const senderATA = await splToken.getAssociatedTokenAddress(usdcMint, sender);
        const recipientATA = await splToken.getAssociatedTokenAddress(usdcMint, recipient);

        const amount = Math.floor(parseFloat(pendingPayment.amount) * 1e6);

        const acctInfo = await connection.getAccountInfo(senderATA);
        if (!acctInfo) { throw new Error('You do not have a USDC token account yet.'); }
        const bal = await connection.getTokenAccountBalance(senderATA);
        const have = parseInt(bal.value.amount);
        if (have < amount) { throw new Error('Insufficient USDC. Need ' + (amount/1e6).toFixed(6)); }

        const tx = new solanaWeb3.Transaction().add(
          splToken.createTransferInstruction(senderATA, recipientATA, sender, amount, [], splToken.TOKEN_PROGRAM_ID)
        );
        const bh = await connection.getLatestBlockhash(); tx.recentBlockhash = bh.blockhash; tx.feePayer = sender;

        progress.textContent = 'Waiting for signature...';
        const signed = await wallet.signTransaction(tx);
        progress.textContent = 'Sending transaction...';
        const sig = await connection.sendRawTransaction(signed.serialize());
        progress.textContent = 'Confirming... ' + sig.slice(0,16) + '...';
        await connection.confirmTransaction(sig, 'confirmed');

        progress.textContent = 'Payment confirmed. Retrying request...';
        await new Promise(function(r){ setTimeout(r, 1200); });
        await retryWithPayment(sig, pendingPayment.paymentId);
      } catch(e){
        progress.style.background='#f8d7da'; progress.textContent = 'Payment failed: ' + e.message;
        payBtn.disabled=false; payBtn.textContent='Retry Payment';
      }
    }

    // Minimal render helpers
    function renderResult(data){
      var r = document.getElementById('queryResult');
      if (r) { r.textContent = JSON.stringify(data, null, 2); }
    }
    function renderError(data){
      var r = document.getElementById('queryResult');
      if (r) { r.textContent = JSON.stringify(data, null, 2); }
    }

    async function retryWithPayment(txSignature, paymentId){
      var progress = document.getElementById('paymentProgress');
      try {
        const proof = btoa(JSON.stringify({ txSignature: txSignature, paymentId: paymentId }));
        const response = await fetch('/', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Payment': proof }, body: JSON.stringify({ jsonrpc:'2.0', id:1, method: pendingRequest.method, params: pendingRequest.params }) });
        const data = await response.json();
        if (response.ok){ renderResult(data); closePaymentModal(); }
        else { renderError(data); }
      } catch(e){ renderError({ error: { message: 'Retry failed: ' + e.message } }); }
    }

    function clearResult(){ document.getElementById('queryResult').textContent=''; }

    async function loadMetrics(){
      const el = document.getElementById('metrics'); el.innerHTML='<div class="loading">Loading...</div>';
      try {
        const r = await fetch('/metrics/json'); const d = await r.json();
        el.innerHTML = ''
          + '<div class="row"><b>Total Requests</b><span>' + (d.requests && d.requests.total || 0) + '</span></div>'
          + '<div class="row"><b>Total Payments</b><span>' + (d.payments && d.payments.total || 0) + '</span></div>'
          + '<div class="row"><b>Total Revenue</b><span>' + (d.revenue && d.revenue.total || 0) + ' USDC</span></div>'
          + '<div class="row"><b>Gateway Share</b><span>' + (d.revenue && d.revenue.gateway || 0) + ' USDC</span></div>'
          + '<div class="row"><b>Provider Share</b><span>' + (d.revenue && d.revenue.dataProvider || 0) + ' USDC</span></div>'
          + '<div class="row"><b>Uptime</b><span>' + Math.floor((d.uptime||0)/60) + 'm ' + Math.floor((d.uptime||0)%60) + 's</span></div>';
      } catch(e){ el.innerHTML = '<div class="result">Failed to load metrics</div>'; }
    }

    async function loadProviders(){
      const el = document.getElementById('providers'); el.innerHTML = '<div class="loading">Loading...</div>';
      try {
        const r = await fetch('/providers'); const d = await r.json();
        el.innerHTML = (d.providers||[]).map(function(p){
          return '<div class="provider-card">'
            + '<div style="font-weight:600; color:#4f46e5;">' + p.name + '</div>'
            + '<div style="font-size:12px; color:#6b7280;">Type: ' + p.type + ' • Pricing: ' + p.pricing + 'x • Reputation: ' + p.reputation + '%</div>'
          + '</div>';
        }).join('');
      } catch(e){ el.innerHTML = '<div class="result">Failed to load providers</div>'; }
    }

    document.getElementById('queryForm').addEventListener('submit', async function(e){
      e.preventDefault();
      const method = document.getElementById('method').value;
      const paramsText = document.getElementById('params').value.trim();
      const resultDiv = document.getElementById('queryResult');
      var params = [];
      if (paramsText){ try { params = JSON.parse(paramsText); } catch(_){ resultDiv.textContent='Invalid JSON parameters'; return; } }
      resultDiv.innerHTML = '<div class="loading">Sending request...</div>';
      try {
        const response = await fetch('/', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ jsonrpc:'2.0', id:1, method: method, params: params }) });
        const data = await response.json();
        if (response.status === 402){ resultDiv.innerHTML = '<div class="result">Payment required - opening payment modal...</div>'; showPaymentModal(data, method, params); }
        else if (response.ok){ resultDiv.textContent = JSON.stringify(data, null, 2); }
        else { resultDiv.textContent = JSON.stringify(data, null, 2); }
      } catch(e){ resultDiv.textContent = 'Request failed: ' + e.message; }
    });
  </script>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

module.exports = { uiHandler };
