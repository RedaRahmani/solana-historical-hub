/**
 * Enhanced Agent Demo: Multi-Query Chain with Cost Tracking
 * 
 * Demonstrates:
 * - Multi-step query chains (getSignaturesForAddress → getTransaction)
 * - Cumulative cost tracking across multiple API calls
 * - Real USDC address for guaranteed results
 * - Rich data analysis and summary
 */

require('dotenv').config();
const axios = require('axios');
const { Connection } = require('@solana/web3.js');
const { loadOrCreateWallet, sendUsdcPayment } = require('./client');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// USDC Mint address on devnet - guaranteed to have transactions
const USDC_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Make an RPC request with automatic x402 payment handling
 */
async function makeRpcRequestWithPayment(connection, wallet, method, params, costTracker) {
  log(`\n🔹 Executing: ${method}`, 'cyan');
  log(`   Params: ${JSON.stringify(params).substring(0, 100)}...`, 'blue');

  // Step 1: Initial request
  const initialResponse = await axios.post(
    API_URL,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params || [],
    },
    {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    }
  );

  // If not 402, return result
  if (initialResponse.status === 200) {
    log(`   ✓ Data received (cached/free)`, 'green');
    return initialResponse.data.result;
  }

  if (initialResponse.status !== 402) {
    throw new Error(`Unexpected status: ${initialResponse.status}`);
  }

  // Step 2: Handle payment
  const paymentInfo = initialResponse.data.accepts[0];
  const cost = parseFloat(paymentInfo.amount);
  
  log(`   💸 Payment required: ${cost} USDC`, 'yellow');
  costTracker.addCost(method, cost);

  // Step 3: Send payment
  const txSignature = await sendUsdcPayment(connection, wallet, paymentInfo);
  log(`   ✓ Payment sent: ${txSignature.substring(0, 16)}...`, 'green');

  // Wait for confirmation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 4: Retry with proof
  const paymentProof = {
    txSignature,
    paymentId: paymentInfo.paymentId,
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');

  const paidResponse = await axios.post(
    API_URL,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params || [],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
      },
    }
  );

  if (paidResponse.status !== 200) {
    throw new Error(`Payment verification failed: ${paidResponse.status}`);
  }

  log(`   ✓ Data received`, 'green');
  return paidResponse.data.result;
}

/**
 * Cost tracker to monitor spending across queries
 */
class CostTracker {
  constructor() {
    this.costs = [];
    this.totalCost = 0;
  }

  addCost(method, amount) {
    this.costs.push({ method, amount, timestamp: new Date() });
    this.totalCost += amount;
  }

  getSummary() {
    const byMethod = {};
    for (const cost of this.costs) {
      if (!byMethod[cost.method]) {
        byMethod[cost.method] = { count: 0, total: 0 };
      }
      byMethod[cost.method].count++;
      byMethod[cost.method].total += cost.amount;
    }
    return { byMethod, totalCost: this.totalCost, queryCount: this.costs.length };
  }

  displaySummary() {
    const summary = this.getSummary();
    
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    log('📊 Cost Summary', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    
    for (const [method, stats] of Object.entries(summary.byMethod)) {
      log(`   ${method}:`, 'cyan');
      log(`     Queries: ${stats.count}`, 'blue');
      log(`     Cost: ${stats.total.toFixed(6)} USDC`, 'blue');
      log(`     Avg: ${(stats.total / stats.count).toFixed(6)} USDC`, 'blue');
    }
    
    log(`\n   Total Queries: ${summary.queryCount}`, 'bright');
    log(`   Total Cost: ${summary.totalCost.toFixed(6)} USDC`, 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'yellow');
  }
}

/**
 * Main demo: Multi-query chain with cost tracking
 */
async function main() {
  log('╔════════════════════════════════════════════════════════╗', 'bright');
  log('║  Enhanced Agent Demo: Multi-Query Chain Analysis     ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝\n', 'bright');

  // Load wallet
  log('🔑 Loading wallet...', 'cyan');
  const wallet = loadOrCreateWallet();
  log(`   Wallet: ${wallet.publicKey.toString()}`, 'green');

  // Connect to Solana
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  log(`   SOL balance: ${(balance / 1e9).toFixed(6)} SOL\n`, 'green');

  // Initialize cost tracker
  const costTracker = new CostTracker();

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
  log('📋 Query Chain: Analyze USDC Mint Activity', 'bright');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
  log(`\n🎯 Target: USDC Mint (${USDC_MINT})`, 'cyan');
  log('   Strategy: Fetch recent signatures → Analyze top 3 transactions\n', 'cyan');

  try {
    // Query 1: Get recent signatures for USDC mint
    log('━━━ Step 1: Fetch Recent Signatures ━━━', 'yellow');
    const signatures = await makeRpcRequestWithPayment(
      connection,
      wallet,
      'getSignaturesForAddress',
      [USDC_MINT, { limit: 5 }],
      costTracker
    );

    log(`\n   📝 Found ${signatures?.length || 0} recent signatures`, 'green');
    
    if (!signatures || signatures.length === 0) {
      throw new Error('No signatures found');
    }

    // Query 2-4: Get details for top 3 transactions
    log('\n━━━ Step 2: Fetch Transaction Details (Top 3) ━━━', 'yellow');
    const transactions = [];

    for (let i = 0; i < Math.min(3, signatures.length); i++) {
      const sig = signatures[i];
      log(`\n   Transaction ${i + 1}/${Math.min(3, signatures.length)}:`, 'cyan');
      log(`     Signature: ${sig.signature.substring(0, 16)}...`, 'blue');
      log(`     Slot: ${sig.slot}`, 'blue');
      log(`     Block Time: ${new Date(sig.blockTime * 1000).toISOString()}`, 'blue');

      const tx = await makeRpcRequestWithPayment(
        connection,
        wallet,
        'getTransaction',
        [sig.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
        costTracker
      );

      transactions.push({ signature: sig.signature, data: tx, metadata: sig });
    }

    // Analysis: Summarize results
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');
    log('📊 Analysis Results', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');

    for (let i = 0; i < transactions.length; i++) {
      const { signature, data, metadata } = transactions[i];
      
      log(`\n   Transaction ${i + 1}:`, 'cyan');
      log(`     Signature: ${signature.substring(0, 20)}...`, 'blue');
      log(`     Success: ${data?.meta?.err === null ? '✓ Yes' : '✗ No'}`, data?.meta?.err === null ? 'green' : 'red');
      log(`     Fee: ${data?.meta?.fee || 0} lamports`, 'blue');
      log(`     Accounts: ${data?.transaction?.message?.accountKeys?.length || 0}`, 'blue');
      log(`     Instructions: ${data?.transaction?.message?.instructions?.length || 0}`, 'blue');
      
      if (metadata.err) {
        log(`     Error: ${JSON.stringify(metadata.err)}`, 'red');
      }
    }

    // Display cost summary
    costTracker.displaySummary();

    log('╔════════════════════════════════════════════════════════╗', 'bright');
    log('║            Multi-Query Chain Complete!               ║', 'bright');
    log('║                                                        ║', 'bright');
    log('║  Demonstrated:                                         ║', 'bright');
    log('║  ✓ Multi-step query chains (4 total queries)          ║', 'bright');
    log('║  ✓ Automatic payment handling per query               ║', 'bright');
    log('║  ✓ Cumulative cost tracking and analysis              ║', 'bright');
    log('║  ✓ Rich data aggregation and summary                  ║', 'bright');
    log('║                                                        ║', 'bright');
    log('║  This showcases autonomous agent workflows! 🤖        ║', 'bright');
    log('╚════════════════════════════════════════════════════════╝\n', 'bright');

  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { main, CostTracker, makeRpcRequestWithPayment };
