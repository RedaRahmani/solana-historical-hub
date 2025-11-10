# Solana Historical Hub Example Scripts

This directory contains example scripts demonstrating how to interact with the Solana Historical Hub x402 API gateway.

## 📁 Files

### `client.js`
**Auto-pay client script** - Shows the complete x402 payment flow:
1. Make initial request → receive 402 Payment Required
2. Parse payment requirements (USDC amount, recipient, payment ID)
3. Send USDC payment on Solana devnet
4. Retry request with payment proof
5. Receive historical data from Old Faithful

**Usage:**
```bash
# Install dependencies (if not already done)
npm install

# Set up environment
cp ../.env.example ../.env
# Edit .env with your configuration

# Run the client example
node examples/client.js
```

**Prerequisites:**
- Funded Solana devnet wallet with:
  - SOL for transaction fees (~0.01 SOL)
  - USDC devnet tokens (get from https://spl-token-faucet.com)
- Wallet will be auto-created at `./wallet.json` if it doesn't exist

### `agent.js`
**AI Agent with LangChain** - Demonstrates autonomous agent interaction:
- Agent receives natural language queries about Solana history
- Uses custom "solana-history" tool that handles x402 payments automatically
- Agent processes and summarizes data without human intervention

This showcases the **agent economy vision**: AI agents autonomously paying for services using micropayments, no credit cards or API keys required.

**Usage:**
```bash
# Set OpenAI API key
export OPENAI_API_KEY=your-openai-api-key

# Run the agent example
node examples/agent.js
```

**Prerequisites:**
- Same wallet requirements as `client.js`
- OpenAI API key (or modify to use other LLM providers)

## 🔧 Configuration

Set these environment variables in your `.env` file:

```bash
# API Gateway
API_URL=http://localhost:3000

# Solana Network
SOLANA_RPC_URL=https://api.devnet.solana.com
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Wallet (optional, will be auto-created)
WALLET_PATH=./wallet.json

# For agent.js only
OPENAI_API_KEY=your-openai-api-key
```

## 🎯 Example Output

### Client Script
```
╔════════════════════════════════════════════════════════╗
║   Solana Historical Hub - Auto-Pay Client Example   ║
╚════════════════════════════════════════════════════════╝

✓ Loaded wallet from ./wallet.json
  Wallet: 7xK8...9mP4

✓ Connected to Solana devnet
  SOL balance: 0.5 SOL

📊 Requesting historical data: getBlock(14000000)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: Initial Request (Unpaid)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Received 402 Payment Required

Payment Details:
  Asset: USDC
  Amount: 0.001
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: Send USDC Payment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Payment sent!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: Retry with Payment Proof
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ SUCCESS! Payment accepted, data received

Block Data:
  Blockhash: abc123...
  Transactions: 1234
```

### Agent Script
```
╔════════════════════════════════════════════════════════╗
║     Solana Historical Hub - AI Agent Example        ║
╚════════════════════════════════════════════════════════╝

🧠 Initializing AI agent...
🤖 Creating agent executor...

Query: Using the solana-history tool, fetch block 14000000 
       and tell me how many transactions it contains.

🤖 Agent invoking solana-history tool...
💸 Payment required - processing...
✓ Payment sent
✓ Data received after payment

📊 Agent Response:
Block 14000000 contains 1,234 transactions.
```

## 🚀 Use Cases

1. **Developers**: Programmatically access Solana historical data with automatic micropayments
2. **Data Analytics**: Build tools that fetch historical data without managing API keys
3. **AI Agents**: Enable autonomous agents to purchase data services
4. **Research**: Access archived blockchain data for analysis
5. **Marketplaces**: Build agent-to-service marketplaces with x402

## 📚 Further Reading

- [x402 Protocol Specification](https://gitbook.io/x402)
- [Old Faithful Documentation](https://github.com/rpcpool/yellowstone-faithful)
- [LangChain Documentation](https://js.langchain.com/docs/)
- [Solana Web3.js Guide](https://solana-labs.github.io/solana-web3.js/)

## 💡 Tips

- **Low USDC?** Get unlimited devnet USDC from https://spl-token-faucet.com
- **Low SOL?** Get devnet SOL from https://faucet.solana.com
- **Testing**: Use small amounts (0.001 USDC per query)
- **Production**: Adjust pricing in `.env` (`PRICE_PER_QUERY`)

## 🐛 Troubleshooting

**"Insufficient USDC balance"**
→ Get devnet USDC from the faucet

**"Transaction not found"**
→ Wait a few seconds for transaction confirmation

**"Payment verification failed"**
→ Ensure you're using devnet USDC (correct mint address)

**"Connection refused"**
→ Make sure the API gateway is running (`npm start`)
