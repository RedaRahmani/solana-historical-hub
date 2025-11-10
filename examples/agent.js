/**
 * Example AI Agent: LangChain agent with Solana Historical Hub tool
 * 
 * This script demonstrates autonomous agent interaction with the x402 API:
 * 1. Agent receives a natural language query about Solana history
 * 2. Agent uses custom "solana-history" tool
 * 3. Tool handles 402 payment automatically
 * 4. Agent processes and summarizes the data
 * 
 * This showcases the "agent economy" vision: AI agents autonomously
 * paying for services without credit cards or API keys.
 * 
 * Prerequisites:
 * - OpenAI API key (or other LLM provider)
 * - Funded devnet wallet (same as client.js)
 * 
 * Usage:
 *   OPENAI_API_KEY=your-key node examples/agent.js
 */

require('dotenv').config();
const { OpenAI } = require('@langchain/openai');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { DynamicTool } = require('@langchain/core/tools');
const axios = require('axios');
const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Import helper functions from client.js
const { loadOrCreateWallet, sendUsdcPayment } = require('./client');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Colors for console output
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
 * Custom tool for accessing Solana historical data
 * Handles x402 payment flow automatically
 */
class SolanaHistoryTool extends DynamicTool {
  constructor(connection, wallet) {
    super({
      name: 'solana-history',
      description: `Access Solana blockchain historical data via Old Faithful archive.
Supports methods like:
- getBlock(slot) - Get block data for a specific slot
- getTransaction(signature) - Get transaction details
- getSignaturesForAddress(address, options) - Get signatures for an address
- getBlockTime(slot) - Get block time for a specific slot

Input should be a JSON string like: {"method": "getBlock", "params": [14000000]}
The tool automatically handles micropayments via x402 protocol.`,
      func: async (input) => {
        try {
          log(`\n🤖 Agent invoking solana-history tool...`, 'cyan');
          log(`   Input: ${input}`, 'blue');

          // Parse input
          let request;
          try {
            request = JSON.parse(input);
          } catch (e) {
            return JSON.stringify({ error: 'Invalid input format. Expected JSON with method and params.' });
          }

          const { method, params } = request;

          if (!method) {
            return JSON.stringify({ error: 'Missing required field: method' });
          }

          // Step 1: Make initial request
          log(`   Making request: ${method}(${JSON.stringify(params)})`, 'blue');
          
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

          // If not 402, return result directly
          if (initialResponse.status === 200) {
            log(`   ✓ Data received (no payment required)`, 'green');
            return JSON.stringify(initialResponse.data.result || initialResponse.data);
          }

          // Handle 402 - payment required
          if (initialResponse.status !== 402) {
            log(`   ✗ Unexpected status: ${initialResponse.status}`, 'red');
            return JSON.stringify({
              error: `Unexpected response status: ${initialResponse.status}`,
              data: initialResponse.data,
            });
          }

          // Step 2: Extract payment info
          log(`   💸 Payment required - processing...`, 'yellow');
          const paymentInfo = initialResponse.data.accepts[0];
          log(`   Amount: ${paymentInfo.amount} ${paymentInfo.asset}`, 'yellow');

          // Step 3: Send payment
          const txSignature = await sendUsdcPayment(connection, wallet, paymentInfo);
          log(`   ✓ Payment sent: ${txSignature.substring(0, 20)}...`, 'green');

          // Wait for confirmation
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Step 4: Retry with payment proof
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
              validateStatus: () => true,
            }
          );

          if (paidResponse.status === 200) {
            log(`   ✓ Data received after payment`, 'green');
            return JSON.stringify(paidResponse.data.result || paidResponse.data);
          } else {
            log(`   ✗ Request failed: ${paidResponse.status}`, 'red');
            return JSON.stringify({
              error: `Request failed with status ${paidResponse.status}`,
              data: paidResponse.data,
            });
          }
        } catch (error) {
          log(`   ✗ Tool error: ${error.message}`, 'red');
          return JSON.stringify({ error: error.message });
        }
      },
    });

    this.connection = connection;
    this.wallet = wallet;
  }
}

/**
 * Create and run the AI agent
 */
async function runAgent() {
  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║     Solana Historical Hub - AI Agent Example        ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝\n', 'bright');

  // Check for OpenAI API key
  if (!OPENAI_API_KEY) {
    log('✗ OPENAI_API_KEY environment variable not set', 'red');
    log('  Set it with: export OPENAI_API_KEY=your-key', 'yellow');
    log('  Or add it to your .env file', 'yellow');
    process.exit(1);
  }

  // Load wallet
  log('🔑 Setting up wallet...', 'cyan');
  const wallet = loadOrCreateWallet();
  log(`   Wallet: ${wallet.publicKey.toBase58()}`, 'blue');

  // Connect to Solana
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  log(`   SOL balance: ${balance / 1e9} SOL\n`, 'blue');

  // Initialize LLM
  log('🧠 Initializing AI agent with OpenAI...', 'cyan');
  const llm = new OpenAI({
    openAIApiKey: OPENAI_API_KEY,
    modelName: 'gpt-4',
    temperature: 0,
  });

  // Create custom tool
  const solanaHistoryTool = new SolanaHistoryTool(connection, wallet);

  // Initialize agent
  log('🤖 Creating agent executor...\n', 'cyan');
  const executor = await initializeAgentExecutorWithOptions([solanaHistoryTool], llm, {
    agentType: 'zero-shot-react-description',
    verbose: true,
    maxIterations: 5,
  });

  // Example queries
  const queries = [
    'Using the solana-history tool, fetch block 14000000 and tell me how many transactions it contains.',
    // Add more queries as needed
    // 'Using the solana-history tool, get the block time for slot 14000000 and tell me the date.',
    // 'Using the solana-history tool, fetch block 14000001 and compare its transaction count to block 14000000.',
  ];

  for (const [index, query] of queries.entries()) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
    log(`Query ${index + 1}: ${query}`, 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'magenta');

    try {
      const result = await executor.invoke({ input: query });

      log('\n📊 Agent Response:', 'green');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');
      log(result.output, 'bright');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'green');
    } catch (error) {
      log(`\n✗ Agent error: ${error.message}`, 'red');
    }

    // Wait between queries
    if (index < queries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║           AI Agent Demo Complete!                    ║', 'bright');
  log('║                                                        ║', 'bright');
  log('║  The agent autonomously:                              ║', 'bright');
  log('║  • Received natural language queries                  ║', 'bright');
  log('║  • Identified the need for historical data            ║', 'bright');
  log('║  • Handled 402 payment automatically                  ║', 'bright');
  log('║  • Processed and summarized the results               ║', 'bright');
  log('║                                                        ║', 'bright');
  log('║  This is the agent economy in action! 🚀              ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝\n', 'bright');
}

// Run the agent
if (require.main === module) {
  runAgent().catch((error) => {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { SolanaHistoryTool, runAgent };
