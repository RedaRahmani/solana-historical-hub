/**
 * Example Client: Auto-pay script for Solana Historical Hub
 * 
 * This script demonstrates how to interact with the x402-powered API gateway:
 * 1. Make an initial request (receive 402 Payment Required)
 * 2. Parse payment requirements
 * 3. Send USDC payment on Solana devnet
 * 4. Retry request with payment proof
 * 5. Receive historical data
 * 
 * Prerequisites:
 * - Node.js 20+
 * - Funded devnet wallet with SOL for fees and USDC for payment
 * - USDC devnet tokens from https://spl-token-faucet.com
 * 
 * Usage:
 *   node examples/client.js
 */

require('dotenv').config();
const axios = require('axios');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Load wallet keypair from file
 * If wallet doesn't exist, create a new one and save it
 */
function loadOrCreateWallet() {
  try {
    if (fs.existsSync(WALLET_PATH)) {
      const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
      log(`✓ Loaded wallet from ${WALLET_PATH}`, 'green');
      return Keypair.fromSecretKey(Uint8Array.from(secretKey));
    }
  } catch (error) {
    log(`⚠ Could not load wallet: ${error.message}`, 'yellow');
  }

  // Create new wallet
  const keypair = Keypair.generate();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(keypair.secretKey)));
  log(`✓ Created new wallet: ${keypair.publicKey.toBase58()}`, 'green');
  log(`  Saved to ${WALLET_PATH}`, 'cyan');
  log(`  Fund it with SOL and USDC devnet tokens!`, 'yellow');
  return keypair;
}

/**
 * Make JSON-RPC request to the API gateway
 */
async function makeRpcRequest(method, params, paymentHeader = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (paymentHeader) {
    headers['X-Payment'] = paymentHeader;
  }

  const response = await axios.post(
    API_URL,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    },
    {
      headers,
      validateStatus: () => true, // Don't throw on 402
    }
  );

  return response;
}

/**
 * Send USDC payment on Solana devnet
 */
async function sendUsdcPayment(connection, payer, paymentInfo) {
  const { amount, paymentAddress, paymentId } = paymentInfo;

  log('\n💸 Preparing USDC payment...', 'cyan');
  log(`  Amount: ${amount} USDC`, 'cyan');
  log(`  Recipient: ${paymentAddress}`, 'cyan');
  log(`  Payment ID: ${paymentId}`, 'cyan');

  try {
    const mintAddress = new PublicKey(process.env.USDC_MINT);
    const recipientAddress = new PublicKey(paymentAddress);

    // Get or create token accounts
    log('\n📝 Getting token accounts...', 'blue');
    
    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintAddress,
      payer.publicKey
    );

    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintAddress,
      recipientAddress
    );

    log(`  Sender token account: ${senderTokenAccount.address.toBase58()}`, 'blue');
    log(`  Recipient token account: ${recipientTokenAccount.address.toBase58()}`, 'blue');

    // Check balance
    const balance = await connection.getTokenAccountBalance(senderTokenAccount.address);
    log(`  Your USDC balance: ${balance.value.uiAmount} USDC`, 'blue');

    const amountLamports = parseFloat(amount) * 1_000_000; // USDC has 6 decimals

    if (parseFloat(balance.value.amount) < amountLamports) {
      throw new Error(
        `Insufficient USDC balance. Need ${amount} USDC, have ${balance.value.uiAmount} USDC`
      );
    }

    // Create transfer instruction
    log('\n🔨 Building transaction...', 'blue');
    const transaction = new Transaction().add(
      createTransferInstruction(
        senderTokenAccount.address,
        recipientTokenAccount.address,
        payer.publicKey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // TODO: Add memo instruction with paymentId for better verification
    // For now, we rely on amount + recipient verification

    // Send transaction
    log('\n📤 Sending transaction...', 'yellow');
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: 'confirmed',
    });

    log(`✓ Payment sent!`, 'green');
    log(`  Transaction: ${signature}`, 'green');

    return signature;
  } catch (error) {
    log(`✗ Payment failed: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Main execution flow
 */
async function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║   Solana Historical Hub - Auto-Pay Client Example   ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝\n', 'bright');

  // Load wallet
  const wallet = loadOrCreateWallet();
  log(`  Wallet: ${wallet.publicKey.toBase58()}\n`, 'cyan');

  // Connect to Solana
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  log(`✓ Connected to Solana devnet`, 'green');

  // Check SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  log(`  SOL balance: ${solBalance / 1e9} SOL\n`, 'cyan');

  if (solBalance < 0.01 * 1e9) {
    log('⚠ Warning: Low SOL balance. Get devnet SOL from https://faucet.solana.com', 'yellow');
  }

  // Example: Fetch rich historical block data with transactions and rewards
  const blockSlot = 419899999; // Deep historical slot with guaranteed rich data
  log(`\n📊 Requesting rich historical data: getBlock(${blockSlot})`, 'bright');
  log(`  Target: ${API_URL}`, 'cyan');
  log(`  Note: Deep historical slot demonstrating premium data access\n`, 'yellow');

  // Step 1: Make initial request (expect 402)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('STEP 1: Initial Request (Unpaid)', 'bright');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const initialResponse = await makeRpcRequest('getBlock', [
    blockSlot,
    {
      encoding: 'json',
      maxSupportedTransactionVersion: 0,
      transactionDetails: 'full',
      rewards: true, // Include rewards for richer data
    },
  ]);

  if (initialResponse.status !== 402) {
    log(`✗ Unexpected response status: ${initialResponse.status}`, 'red');
    log(`  Expected: 402 Payment Required`, 'red');
    process.exit(1);
  }

  log(`✓ Received 402 Payment Required`, 'green');
  log(`\nPayment Details:`, 'cyan');
  
  const paymentInfo = initialResponse.data.accepts[0];
  log(`  Asset: ${paymentInfo.asset}`, 'cyan');
  log(`  Chain: ${paymentInfo.chain}`, 'cyan');
  log(`  Amount: ${paymentInfo.amount}`, 'cyan');
  log(`  Address: ${paymentInfo.paymentAddress}`, 'cyan');
  log(`  Payment ID: ${paymentInfo.paymentId}`, 'cyan');
  log(`  Scheme: ${paymentInfo.scheme}`, 'cyan');

  // Step 2: Send payment
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('STEP 2: Send USDC Payment', 'bright');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  const txSignature = await sendUsdcPayment(connection, wallet, paymentInfo);

  // Wait a bit for transaction to propagate
  log('\n⏳ Waiting for transaction confirmation...', 'yellow');
  await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds for confirmation

  // Step 3: Retry with payment proof
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('STEP 3: Retry with Payment Proof', 'bright');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const paymentProof = {
    txSignature,
    paymentId: paymentInfo.paymentId,
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');
  log(`  Encoded payment proof (X-Payment header)`, 'blue');
  log(`  ${paymentHeader.substring(0, 50)}...\n`, 'blue');

  const paidResponse = await makeRpcRequest(
    'getBlock',
    [
      blockSlot,
      {
        encoding: 'json',
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
        rewards: false,
      },
    ],
    paymentHeader
  );

  // Step 4: Check response
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('STEP 4: Response', 'bright');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  if (paidResponse.status === 200) {
    log(`✓ SUCCESS! Payment accepted, data received`, 'green');
    
    if (paidResponse.headers['x-payment-response']) {
      const paymentResponse = JSON.parse(
        Buffer.from(paidResponse.headers['x-payment-response'], 'base64').toString('utf8')
      );
      log(`\nPayment Response:`, 'cyan');
      log(`  Transaction: ${paymentResponse.txSignature}`, 'cyan');
      log(`  Payment ID: ${paymentResponse.paymentId}`, 'cyan');
      log(`  Settled: ${paymentResponse.settled}`, 'cyan');
    }

    log(`\nBlock Data (Rich Historical Content):`, 'cyan');
    const result = paidResponse.data.result;
    if (result) {
      log(`  Blockhash: ${result.blockhash || 'N/A'}`, 'cyan');
      log(`  Parent Slot: ${result.parentSlot || 'N/A'}`, 'cyan');
      log(`  Block Height: ${result.blockHeight || 'N/A'}`, 'cyan');
      log(`  Block Time: ${result.blockTime ? new Date(result.blockTime * 1000).toISOString() : 'N/A'}`, 'cyan');
      log(`  Transactions: ${result.transactions?.length || 0}`, 'cyan');
      log(`  Rewards: ${result.rewards?.length || 0}`, 'cyan');
      
      // Show sample transaction details if available
      if (result.transactions && result.transactions.length > 0) {
        log(`\n  Sample Transaction Details:`, 'yellow');
        const tx = result.transactions[0];
        const sig0 = tx.transaction?.signatures?.[0] || 'N/A';
        const link = sig0 && sig0 !== 'N/A' ? `https://explorer.solana.com/tx/${sig0}?cluster=devnet` : '';
        log(`    Signature: ${sig0}${link ? `  (${link})` : ''}`, 'yellow');
        log(`    Fee: ${tx.meta?.fee || 0} lamports`, 'yellow');
        log(`    Success: ${tx.meta?.err === null ? 'Yes' : 'No'}`, 'yellow');
      }
      
      // Show sample rewards if available
      if (result.rewards && result.rewards.length > 0) {
        log(`\n  Sample Rewards:`, 'yellow');
        const reward = result.rewards[0];
        log(`    Pubkey: ${reward.pubkey || 'N/A'}`, 'yellow');
        log(`    Lamports: ${reward.lamports || 0}`, 'yellow');
        log(`    Type: ${reward.rewardType || 'N/A'}`, 'yellow');
      }
    } else if (paidResponse.data.error) {
      log(`  RPC Error: ${paidResponse.data.error.message}`, 'yellow');
    }

    log(`\n✓ Demo completed successfully!`, 'green');
  } else {
    log(`✗ Request failed with status ${paidResponse.status}`, 'red');
    log(`  Response: ${JSON.stringify(paidResponse.data, null, 2)}`, 'red');
    process.exit(1);
  }

  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║              x402 Payment Flow Complete!              ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝\n', 'bright');
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { loadOrCreateWallet, makeRpcRequest, sendUsdcPayment };
