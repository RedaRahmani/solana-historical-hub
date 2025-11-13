# 🚀 Solana Historical Hub

Fast, sustainable access to Solana’s historical data via x402 “Payment Required” — with a polished Web UI, real agent flow, and a global CLI. Devnet‑safe, Docker‑ready, and battle‑tested for hackathon demos.

<!-- Badges -->
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Coverage](https://img.shields.io/badge/coverage-%E2%89%A570%25-brightgreen)
![Stars](https://img.shields.io/github/stars/RedaRahmani/solana-historical-hub?style=social)

---

## ⚡ TL;DR

- Pay‑per‑query Solana archive gateway powered by HTTP 402 (x402) and USDC micropayments on devnet.
- 0.001 USDC/query by default; real payment → real data. No API keys. No accounts.
- Web UI with payment stepper, agent simulator, charts, and provider marketplace.
- Global CLI (`solana-history`) that self‑heals deps, auto‑creates USDC ATAs, and pays on demand.
- Sustainable model for archive providers; fast path to monetized access without subscriptions.

> Short on time? Skip to One‑Click Deploy, run the demo, and see real data in minutes.

---

## ✅ What You Get

- x402 payment flow end‑to‑end: 402 challenge, proof, on‑chain verification, settlement headers
- Devnet‑safe payment UX (Phantom) and CLI auto‑payment (USDC)
- Web UI with:
  - Dark/light theme, responsive grid, accessible modals
  - Payment stepper (Connecting → Signing → Confirming → Retrying)
  - Metrics (Chart.js), provider marketplace, result JSON viewer
  - Agent simulator (real payment before real data; no mock output)
  - Scrollable results with copy + syntax highlight (Prism.js, graceful fallback)
- Global CLI (`solana-history`) that:
  - Handles 402 → pays → retries automatically
  - Self‑installs missing deps on first use
  - Auto‑creates USDC ATA if missing; hints for SOL/USDC funding
  - Prints full signatures with explorer links
- Docker Compose (gateway + Redis) and Vercel configuration

---

## 🚀 One‑Click Deploy

### Docker Compose (recommended for local demo)

```bash
git clone https://github.com/RedaRahmani/solana-historical-hub
cd solana-historical-hub
docker compose up --build
# UI: http://localhost:3000/ui
```

Environment defaults (devnet) are baked in. Set `PAYMENT_WALLET_ADDRESS` if you want a custom devnet recipient.

### Vercel (serverless)

Deploy to Vercel (Node serverless):

[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/RedaRahmani/solana-historical-hub)

Set the following environment variables in the Vercel dashboard (no localhost values):

- `PAYMENT_WALLET_ADDRESS` — devnet recipient wallet (required)
- `USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- `SOLANA_RPC_URL=https://api.devnet.solana.com`
- `OLD_FAITHFUL_RPC_URL=https://rlock-solanad-de21.devnet.rpcpool.com/ba715b75-838e-4fc8-b2d7-5e518c00032a`
- (Optional) `REDIS_URL` — leave empty on Vercel to use in‑memory store

Notes
- The app auto‑forces remote RPC if `SOLANA_RPC_URL` contains localhost.
- Redis is disabled automatically on Vercel if `REDIS_URL` is empty/local.
- Health check: `https://<app>.vercel.app/health` → should return JSON without 500.

---

## ⚙️ Quick Start (Local)

```bash
git clone https://github.com/RedaRahmani/solana-historical-hub
cd solana-historical-hub
npm install
cp .env.example .env
npm start
# UI → http://localhost:3000/ui
```

Funding (Devnet)
- SOL for fees (0.01 SOL is plenty):
  - `solana airdrop 1 <yourPubkey> --url devnet`
- USDC for payment (~0.003 USDC per query is plenty):
  - Faucet: https://spl-token-faucet.com  
  - USDC Devnet mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

---

## 🖥️ Web UI at a Glance

- JSON‑RPC Query form with method hints and parameter templates
- Result viewer with collapsible JSON, copy button, Prism highlighting
- Independent scroll for very large results (no layout breakage)
- Metrics panel (requests, revenue split) and Providers table (sortable)
- Agent Simulator (real payment required) that runs a signatures→transactions chain and renders a real results table

Open: `http://localhost:3000/ui`  
Flow: Execute unpaid query → 402 → payment modal → confirm in Phantom → auto‑retry → data + confetti.

---

## 🔧 Global CLI (Self‑healing)

Install globally (runs a small postinstall to ensure CLI deps are present):

```bash
npm install -g .
```

Commands (devnet, paid automatically when required):

| Command | Description |
|---|---|
| `solana-history query getSlot --api http://localhost:3000` | Returns current slot (no args) |
| `solana-history query getBlock 419899999 --api http://localhost:3000` | Returns rich block summary (or latest if no slot) |
| `solana-history query getSignaturesForAddress <address> --limit 5 --api http://localhost:3000` | Prints full signatures table with explorer links |
| `solana-history agent "Analyze address <addr> in last 10 slots" --api http://localhost:3000` | Real agent: 402 → pay USDC → signatures table |
| `solana-history metrics --api http://localhost:3000` | Prints JSON metrics |

CLI niceties
- Detects method type and arg requirements (getSlot: no arg; getBlock: optional slot; address‑based methods: require address)
- Auto‑creates USDC ATA if missing (sender/recipient)
- SOL/USDC pre‑checks and helpful hints (airdrop and faucet)
- Full signatures by default, short form on narrow terminals

> Explorer links are included for every signature (devnet cluster).

---

## 🧠 Architecture (High Level)

```
Client / CLI / Agent
   │  JSON-RPC (unpaid)
   ▼
Gateway (Express)
   ├─ x402 402-challenge (amount, address, paymentId)
   ├─ Payment proof parsing (X-Payment header)
   ├─ On-chain verification + optional facilitator
   ├─ Idempotency (paymentStore with Redis fallback)
   └─ Proxy to Old Faithful / fallback RPC
```

Key modules
- `src/handlers/rpcHandler.js` – 402 challenge, payment proof, proxy
- `src/stores/paymentStore.js` – Redis‑backed (with in‑memory fallback), TTL cleanup
- `src/services/*` – blockchain verifier, provider service, proxy
- `src/handlers/uiHandler.js` – progressive‑enhanced UI with Tailwind CDN

---

## 🔒 x402 Flow (Server)

1. Unpaid request → respond `402 Payment Required` with `accepts` details (chain, asset, amount, paymentId)
2. Client pays USDC on Devnet
3. Client retries with header `X-Payment: base64({ txSignature, paymentId })`
4. Gateway verifies on‑chain; settles; proxies to provider
5. Response includes `X-Payment-Response` header (settlement info)

Protection
- Replay protection via `paymentId`
- TTL expiry (15 minutes)
- Rate limiting (100 req/min/IP)
- Strict validation (Joi)

---

## 💰 Sustainability Model

Monetize archive access without accounts or subscriptions. Example projections below use the default price `0.001 USDC/query` and a 60/30/10 split (Provider/Gateway/Facilitator).

| Monthly Queries | Gross USDC | Provider (60%) | Gateway (30%) | Facilitator (10%) |
|---:|---:|---:|---:|---:|
| 100,000 | 100 | 60 | 30 | 10 |
| 1,000,000 | 1,000 | 600 | 300 | 100 |
| 5,000,000 | 5,000 | 3,000 | 1,500 | 500 |

At modest scale (≥1M queries/month), a single provider could earn ~$600/month at 0.001 USDC/query; gateways earn ~$300/month. Prices are configurable by env.

---

## 🎯 Bounty Fit (Why This Project)

- Sustainable access to premium historical RPC via x402 (HTTP‑native, no keys)
- Real payments integrated in Web UI, CLI, and agent flow (no mocks)
- Provider marketplace and metrics for transparency
- Progressive enhancement, accessibility, responsive UX, and graceful fallbacks
- One‑click deploy and global CLI for fast demos and adoption

---

## 🧪 Testing & Coverage

- Jest unit + E2E tests (Node.js environment)
- UI tests leverage jsdom for components and interactions
- Coverage thresholds: ≥70% lines/branches (see `package.json`)

Run locally:

```bash
npm test
```

---

## 🔌 Configuration (Env)

Copy `.env.example` → `.env` and tweak:

```ini
PORT=3000
LOG_LEVEL=info

# x402 pricing (USDC/devnet)
PRICE_PER_QUERY=0.001
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SOLANA_RPC_URL=https://api.devnet.solana.com

# Old Faithful (local or managed)
OLD_FAITHFUL_RPC_URL=http://localhost:8899
USE_FALLBACK=true
FALLBACK_RPC_URL=https://api.devnet.solana.com

# Redis (optional; in-memory fallback enabled)
REDIS_URL=redis://localhost:6379
```

---

## 🧭 CLI Reference (Quick)

```bash
# current slot (no arg)
solana-history query getSlot --api http://localhost:3000

# get block (slot optional)
solana-history query getBlock 419899999 --api http://localhost:3000
solana-history query getBlock --api http://localhost:3000  # latest

# signatures for address (full table, explorer links)
solana-history query getSignaturesForAddress <address> --limit 10 --api http://localhost:3000

# agent flow (pays if needed)
solana-history agent "Analyze address <addr> in last 10 slots" --api http://localhost:3000

# metrics
solana-history metrics --api http://localhost:3000
```

Troubleshooting
- “Insufficient SOL” → `solana airdrop 1 <wallet> --url devnet`
- “Insufficient USDC” → https://spl-token-faucet.com
- Missing deps on global install → CLI auto‑installs; rerun the command

---

## 🐳 Docker

```bash
docker compose up --build
# UI http://localhost:3000/ui
```

Compose spins up Redis + gateway with sensible devnet defaults. Override via env vars in `docker-compose.yml`.

---

## 🧩 Tech Stack

- Backend: Node 20+, Express, Winston, Joi, prom-client
- Solana: @solana/web3.js, @solana/spl-token, Devnet
- x402 Plumbing: HTTP 402, payment proof header, on‑chain verify
- UI: Tailwind CDN, Chart.js, Prism.js, Toastify, canvas‑confetti
- Storage: Redis (optional), in‑memory fallback
- Tests: Jest, Supertest, jsdom

---

## 🤝 Contributing

We welcome PRs! Ideas that help the agent economy:
- New provider adapters and pricing strategies
- Smarter agent workflows and UX polish
- Additional methods in CLI (more JSON‑RPC coverage)
- Stability, performance, and test coverage improvements

Quick dev loop

```bash
npm run dev
# edit code → server reloads; open http://localhost:3000/ui
```

---

## 📜 License

MIT — see `LICENSE`.

---

## 🙌 Call to Action

Fork it, run the one‑click demo, and help build sustainable access to Solana’s historical data.  
Open issues, propose features, and ship improvements — let’s accelerate the agent economy together. LFGGGG! 🚀
