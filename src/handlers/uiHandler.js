const { getRevenueMetrics } = require('../services/paymentService');
const { paymentStore } = require('../stores/paymentStore');

/**
 * Serve the main UI page with progressive enhancement.
 * - Uses Tailwind CDN, Chart.js, Toastify, and canvas-confetti when available.
 * - Degrades gracefully to basic HTML/CSS if any CDN fails.
 */
function uiHandler(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solana Historical Hub — Web Interface</title>

  <!-- Tailwind CSS (CDN) with dark mode support; gracefully degrades if blocked -->
  <script>
    window.tailwind = { config: { darkMode: 'class' } };
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link rel="preconnect" href="https://unpkg.com" />

  <!-- Toastify (toasts) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
  <!-- Chart.js (charts) -->
  <script defer src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <!-- Canvas confetti (success effects) -->
  <script defer src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <!-- Lucide icons (optional) -->
  <script defer src="https://cdn.jsdelivr.net/npm/lucide@latest"></script>

  <!-- Custom UI styles (small overrides) -->
  <link rel="stylesheet" href="/ui.css" />
  <!-- Prism.js for JSON syntax highlighting (optional) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>

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
    /* Small CSS augmentations for progressive enhancement */
    .visually-hidden { position: absolute !important; height: 1px; width: 1px; overflow: hidden; clip: rect(1px, 1px, 1px, 1px); white-space: nowrap; }
    .card { /* Tailwind utilities inlined via CDN at runtime */ }
    .badge { /* via Tailwind classes */ }
    .btn-primary { /* via Tailwind classes */ }
    .btn-secondary { /* via Tailwind classes */ }
    .btn-ghost { /* via Tailwind classes */ }
    .modal { display:none; position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 1000; }
    .modal--show { display:block; }
    .modal-content { width: 92%; max-width: 560px; margin: 5% auto; }
    .step { display:flex; align-items:center; gap:8px; font-size: 0.9rem; }
    .step-dot { height:8px; width:8px; border-radius:9999px; background: #cbd5e1; }
    .step--active .step-dot { background: #6366f1; }
    .spinner { display:inline-block; height:20px; width:20px; border-radius:9999px; border:2px solid rgba(255,255,255,0.6); border-top-color:#fff; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body class="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-900 dark:to-slate-950 min-h-screen text-slate-800 dark:text-slate-100">
  <div class="max-w-7xl mx-auto px-4 py-6">
    <header class="rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-indigo-700 dark:text-indigo-300">Solana Historical Hub</h1>
        <p class="text-slate-600 dark:text-slate-300 text-sm">x402-powered, pay-per-query archive gateway (Devnet-safe)</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="themeToggle" class="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="Toggle dark mode">🌓</button>
        <div id="walletStatus" class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" aria-live="polite">
          <span id="walletText">Wallet: Not connected</span>
        </div>
        <button id="connectWallet" class="inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold shadow hover:bg-indigo-500 active:scale-[.98] transition">Connect Phantom</button>
      </div>
    </header>

    <main class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <!-- Query + Result -->
      <section class="rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 xl:col-span-2">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">🔎 JSON-RPC Query</h2>
          <span class="text-xs text-slate-500">Tooltips describe methods</span>
        </div>
        <form id="queryForm" class="mt-3 space-y-3" aria-label="JSON-RPC Query Form">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label for="method" class="block text-sm font-medium">Method</label>
              <select id="method" name="method" class="w-full mt-1 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-slate-800 dark:text-slate-100" aria-describedby="methodHelp">
                <option value="getBlock" title="getBlock: Historical block data" data-example='[419899999, {"encoding":"json", "maxSupportedTransactionVersion": 0}]'>getBlock</option>
                <option value="getBlockHeight" title="getBlockHeight: Latest block height" data-example='[]'>getBlockHeight</option>
                <option value="getBalance" title="getBalance: Balance for an address" data-example='["11111111111111111111111111111111", {"commitment":"confirmed"}]'>getBalance</option>
                <option value="getTransaction" title="getTransaction: Fetch transaction by signature" data-example='["5j7s...signature", {"maxSupportedTransactionVersion":0}]'>getTransaction</option>
                <option value="getSignaturesForAddress" title="getSignaturesForAddress: Recent signatures for address" data-example='["11111111111111111111111111111111", {"limit": 10}]'>getSignaturesForAddress</option>
                <option value="getTokenAccountsByOwner" title="getTokenAccountsByOwner: Token accounts owned by wallet" data-example='["Fht...ownerPubkey", {"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}, {"encoding":"jsonParsed"}]'>getTokenAccountsByOwner</option>
                <option value="getTokenAccountBalance" title="getTokenAccountBalance: SPL token account balance" data-example='["9xQeWvG816bUx9EPfS2G9UaT6QxG7GSMcRjG7V9fJUSC"]'>getTokenAccountBalance</option>
                <option value="getProgramAccounts" title="getProgramAccounts: Scan accounts owned by a program (use filters)" data-example='["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", {"encoding":"jsonParsed", "filters":[{"dataSize":165}]}]'>getProgramAccounts</option>
                <option value="getAccountInfo" title="getAccountInfo: Single account info by pubkey" data-example='["11111111111111111111111111111111", {"encoding":"base64"}]'>getAccountInfo</option>
                <option value="getMultipleAccounts" title="getMultipleAccounts: Batch account infos" data-example='[["11111111111111111111111111111111","SysvarRent111111111111111111111111111111111"], {"encoding":"base64"}]'>getMultipleAccounts</option>
                <option value="getLatestBlockhash" title="getLatestBlockhash: Latest blockhash for transactions" data-example='[]'>getLatestBlockhash</option>
                <option value="getSlot" title="getSlot: Current slot" data-example='[]'>getSlot</option>
                <option value="getVersion" title="getVersion: RPC node version" data-example='[]'>getVersion</option>
                <option value="getConfirmedSignaturesForAddress2" title="getConfirmedSignaturesForAddress2: Legacy signatures list (deprecated)" data-example='["11111111111111111111111111111111", {"limit": 20}]'>getConfirmedSignaturesForAddress2</option>
                <option value="getTokenLargestAccounts" title="getTokenLargestAccounts: Largest token holders for a mint" data-example='["4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"]'>getTokenLargestAccounts</option>
                <option value="getInflationReward" title="getInflationReward: Inflation rewards for addresses (optional epoch)" data-example='[["11111111111111111111111111111111"], {"epoch": 500}]'>getInflationReward</option>
              </select>
              <p id="methodHelp" class="text-xs text-slate-500 mt-1">Tip: Select a method to see parameter template and description.</p>
            </div>
            <div class="md:col-span-2">
              <label for="params" class="block text-sm font-medium">Parameters (JSON array)</label>
              <textarea id="params" rows="4" class="w-full mt-1 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 font-mono text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400">[419899999, {"encoding": "json", "maxSupportedTransactionVersion": 0}]</textarea>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="submit" id="runBtn" class="inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold shadow hover:bg-indigo-500 active:scale-[.98] transition">
              <span class="inline-flex items-center gap-2">🚀 Execute</span>
            </button>
            <button type="button" id="clearBtn" class="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Clear</button>
          </div>
        </form>

        <div id="resultContainer" class="mt-4">
          <div id="queryLoading" class="hidden items-center gap-2 text-indigo-600"><span class="spinner"></span> <span>Loading...</span></div>
          <div id="resultJson" class="hidden">
            <details id="resultDetails" open class="rounded-xl shadow-lg p-4 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
              <summary class="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">JSON Result</summary>
              <div class="flex items-center justify-end gap-2 mt-2">
                <button id="resultToggleBtn" type="button" class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs">Collapse</button>
                <button id="copyResultBtn" type="button" class="px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-xs">Copy JSON</button>
              </div>
              <div id="resultLoading" class="hidden mt-2 text-indigo-600 flex items-center gap-2"><span class="spinner" style="border-color:#6366f180;border-top-color:#6366f1"></span> <span>Loading result...</span></div>
              <div class="result-container mt-2">
                <pre id="queryResult" class="language-json text-xs"></pre>
              </div>
            </details>
          </div>
          <div id="txTableWrap" class="hidden rounded-xl shadow-lg p-4 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 mt-3">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Transactions</h3>
              <button id="sortTxBtn" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs">Sort by Fee</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-slate-800 dark:text-slate-100" aria-label="Transactions Table">
                <thead class="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th class="px-3 py-2 text-left">Signature</th>
                    <th class="px-3 py-2 text-left">Status</th>
                    <th class="px-3 py-2 text-left">Fee</th>
                  </tr>
                </thead>
                <tbody id="txTable"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <!-- Metrics + Providers -->
      <section class="space-y-4">
        <div class="rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">📊 Metrics</h2>
            <button id="refreshMetrics" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs">Refresh</button>
          </div>
          <div id="metrics" class="mt-2 grid grid-cols-2 gap-3">
            <div>
              <canvas id="requestsChart" height="140" aria-label="Requests Over Time" role="img"></canvas>
            </div>
            <div>
              <canvas id="revenueChart" height="140" aria-label="Revenue Split" role="img"></canvas>
            </div>
          </div>
          <div id="metricsFallback" class="hidden text-sm text-slate-500">Charts unavailable. Basic metrics will appear here.</div>
        </div>

        <div class="rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">🌐 Providers</h2>
            <div class="flex gap-2">
              <button id="sortProvidersByPrice" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs">Sort by Price</button>
              <button id="sortProvidersByRep" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs">Sort by Rep</button>
            </div>
          </div>
          <div id="providersWrap" class="mt-2 overflow-x-auto">
            <table class="w-full text-sm text-slate-800 dark:text-slate-100" aria-label="Providers Table">
              <thead class="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="px-3 py-2 text-left">Name</th>
                  <th class="px-3 py-2 text-left">Type</th>
                  <th class="px-3 py-2 text-left">Price×</th>
                  <th class="px-3 py-2 text-left">Reputation</th>
                </tr>
              </thead>
              <tbody id="providersTable"></tbody>
            </table>
          </div>
          <div id="providersEmpty" class="hidden text-sm text-slate-500">No providers found</div>
        </div>
      </section>

      <!-- Agent Simulator -->
      <section class="rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 xl:col-span-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">🤖 Agent Simulator</h2>
          <button id="runAgent" class="inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold shadow hover:bg-indigo-500 active:scale-[.98] transition">
            <span class="inline-flex items-center gap-2"><span class="spinner hidden" id="agentSpin"></span> Run</span>
          </button>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input id="agentInput" aria-label="Agent Query" class="md:col-span-2 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2" placeholder="Analyze address Hc...X: summarize activity and fees" />
          <select id="agentDepth" class="rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
            <option value="1">Shallow</option>
            <option value="2" selected>Medium</option>
            <option value="3">Deep</option>
          </select>
        </div>
        <div id="agentSteps" class="mt-3 space-y-2" aria-live="polite"></div>
        <div id="agentResult" class="mt-3 hidden">
          <details class="rounded-xl shadow-lg p-4 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
            <summary class="cursor-pointer text-sm font-semibold">Agent Output</summary>
            <pre id="agentOutput" class="mt-2 whitespace-pre-wrap text-xs"></pre>
          </details>
        </div>
      </section>
    </main>
  </div>

  <!-- Payment Modal -->
  <div id="paymentModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="paymentTitle">
    <div class="modal-content rounded-xl shadow-lg p-5 border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div class="flex items-center justify-between">
        <h3 id="paymentTitle" class="text-lg font-semibold">💳 Payment Required</h3>
        <button class="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition" id="paymentClose" aria-label="Close payment modal">✕</button>
      </div>
      <div id="modalWalletStatus" class="mt-2 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
        <span id="modalWalletText">Connect wallet to process payment</span>
      </div>
      <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div class="flex justify-between"><span>Amount</span><span id="paymentAmount">-</span></div>
          <div class="flex justify-between"><span>Asset</span><span id="paymentAsset">-</span></div>
          <div class="flex justify-between"><span>Method</span><span id="paymentMethod">-</span></div>
        </div>
        <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div class="flex justify-between"><span>Recipient</span><span id="paymentAddress" class="text-[10px] break-all">-</span></div>
          <div class="flex justify-between"><span>Payment ID</span><span id="paymentId" class="text-[10px] break-all">-</span></div>
        </div>
      </div>
      <div class="mt-3 space-y-2" aria-label="Payment Progress">
        <div class="step" id="step-connect"><span class="step-dot"></span><span>Connecting Wallet</span></div>
        <div class="step" id="step-sign"><span class="step-dot"></span><span>Signing</span></div>
        <div class="step" id="step-confirm"><span class="step-dot"></span><span>Confirming</span></div>
        <div class="step" id="step-retry"><span class="step-dot"></span><span>Retrying Request</span></div>
      </div>
      <div id="paymentProgress" class="hidden mt-2 text-sm text-indigo-700 dark:text-indigo-300">Processing payment...</div>
      <div class="mt-3 flex gap-2">
        <button class="inline-flex items-center justify-center rounded-lg bg-slate-600 text-white px-3 py-2 font-semibold shadow hover:bg-slate-500 active:scale-[.98] transition" id="paymentCancel">Cancel</button>
        <button id="payButton" class="inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-4 py-2 font-semibold shadow hover:bg-indigo-500 active:scale-[.98] transition">Pay with Phantom</button>
      </div>
      <p class="mt-2 text-xs text-slate-500">Dev tip: <code>node examples/client.js</code></p>
    </div>
  </div>

  <script>
    // Wallet + RPC state are shared with /ui.js via window.UIState
    const DEVNET_RPC = 'https://api.devnet.solana.com';
    const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    window.UIState = { wallet: null, connection: null, pendingPayment: null, pendingRequest: null, splToken: null, DEVNET_RPC, USDC_MINT };
  </script>
  <!-- App UI logic (progressive enhancement) -->
  <script defer src="/ui.js"></script>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

module.exports = { uiHandler };
