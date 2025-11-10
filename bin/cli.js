#!/usr/bin/env node
'use strict';

// solana-history CLI (devnet-safe)
// Commands:
//  - solana-history query getSignaturesForAddress <address> --limit 10 [--api http://localhost:3000]
//  - solana-history agent "Analyze address <addr> in last 10 slots" [--api ...]
//  - solana-history metrics [--api ...]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const PKG_ROOT = path.join(__dirname, '..');

function missingModuleMessage(name) {
  return (
    `Missing dependency: ${name}.\n` +
    `Fix: run \`npm install\` in the package directory (${PKG_ROOT}) or reinstall globally with \`npm install -g .\`\n`
  );
}

const AUTO_DEPS = new Set([
  '@solana/spl-token',
  '@solana/web3.js',
  'commander',
  'dotenv',
  'axios',
]);

function autoInstall(names) {
  try {
    const list = Array.isArray(names) ? names : [names];
    console.error(`Missing deps - running auto-install: ${list.join(' ')}`);
    execSync(`npm install ${list.join(' ')} --production --no-audit --no-fund --silent`, {
      stdio: 'inherit',
      cwd: PKG_ROOT,
      env: process.env,
    });
  } catch (e) {
    console.error('Auto-install failed:', e?.message || e);
  }
}

function safeRequire(name) {
  try {
    return require(name);
  } catch (e) {
    if (AUTO_DEPS.has(name)) {
      autoInstall(name);
      try { return require(name); } catch (e2) {
        console.error(missingModuleMessage(name));
        process.exit(1);
      }
    } else {
      console.error(missingModuleMessage(name));
      process.exit(1);
    }
  }
}

// Load dotenv if present (optional)
try { safeRequire('dotenv').config(); } catch(_) {}

const { Command } = safeRequire('commander');
const axios = safeRequire('axios');

let Keypair; // set lazily

const DEFAULT_API = process.env.API_URL || 'http://localhost:3000';
const DEVNET_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const USDC_MINT = process.env.USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEFAULT_WALLET_DIR = path.join(os.homedir(), '.solana-history');
const DEFAULT_WALLET_PATH = process.env.WALLET_PATH || path.join(DEFAULT_WALLET_DIR, 'wallet.json');

function log(...a){ console.log(...a); }
function err(...a){ console.error(...a); }

function ensureWallet() {
  if (!Keypair) {
    const web3 = safeRequire('@solana/web3.js');
    Keypair = web3.Keypair;
  }
  if (!fs.existsSync(DEFAULT_WALLET_DIR)) fs.mkdirSync(DEFAULT_WALLET_DIR, { recursive: true });
  if (fs.existsSync(DEFAULT_WALLET_PATH)) {
    const sk = JSON.parse(fs.readFileSync(DEFAULT_WALLET_PATH, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(sk));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(DEFAULT_WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
  log(`Created wallet: ${kp.publicKey.toBase58()} @ ${DEFAULT_WALLET_PATH}`);
  log('Fund with devnet SOL and USDC');
  return kp;
}

async function rpc(api, method, params, paymentHeader){
  const headers = { 'Content-Type': 'application/json' };
  if (paymentHeader) headers['X-Payment'] = paymentHeader;
  const res = await axios.post(api, { jsonrpc:'2.0', id: Date.now(), method, params }, { validateStatus: () => true, headers });
  return res;
}

async function payUSDC(connection, payer, payment){
  const web3 = safeRequire('@solana/web3.js');
  const spl = safeRequire('@solana/spl-token');
  const { PublicKey, Transaction, sendAndConfirmTransaction } = web3;
  const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = spl;

  const mint = new PublicKey(USDC_MINT);
  const recipient = new PublicKey(payment.paymentAddress);

  // Check SOL balance for rent + fees upfront
  const solLamports = await connection.getBalance(payer.publicKey);
  const minSol = Math.floor(0.005 * 1e9);
  if (solLamports < minSol) {
    throw new Error(
      `Insufficient SOL for fees/rent (have ${(solLamports/1e9).toFixed(4)} SOL). ` +
      `Fund wallet: solana airdrop 1 ${payer.publicKey.toBase58()} --url devnet`
    );
  }

  // Helper: ensure ATA exists, create if missing
  async function ensureAta(ownerPk) {
    const ata = await getAssociatedTokenAddress(mint, ownerPk);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey, // payer
        ata,             // ata address
        ownerPk,         // owner of ATA
        mint             // mint
      );
      const createTx = new Transaction().add(ix);
      await sendAndConfirmTransaction(connection, createTx, [payer], { commitment: 'confirmed' });
    }
    return ata;
  }

  const senderATA = await ensureAta(payer.publicKey);
  const destATA = await ensureAta(recipient);

  // Amount in base units (USDC has 6 decimals)
  const amount = Math.floor(parseFloat(payment.amount) * 1e6);

  // USDC balance check with faucet hint
  try {
    const bal = await connection.getTokenAccountBalance(senderATA);
    const have = parseInt(bal.value.amount || '0', 10);
    if (have < amount) {
      throw new Error(
        `Insufficient USDC. Need ${(amount/1e6).toFixed(6)}, have ${(have/1e6).toFixed(6)}. ` +
        `Get devnet USDC: https://spl-token-faucet.com`
      );
    }
  } catch (e) {
    // Forward helpful message for TokenAccountNotFound or parse issues
    if (/TokenAccount/i.test(String(e)) || /Insufficient USDC/.test(String(e))) throw e;
  }

  const tx = new Transaction().add(
    createTransferInstruction(senderATA, destATA, payer.publicKey, amount, [], TOKEN_PROGRAM_ID)
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
  return sig;
}

async function withPayment(api, method, params){
  // Attempt unpaid request
  const initial = await rpc(api, method, params);
  if (initial.status !== 402) return initial;
  const info = initial.data && initial.data.accepts && initial.data.accepts[0];
  if (!info) throw new Error('No payment info in 402 response');
  log(`Payment required: ${info.amount} ${info.asset} → ${info.paymentAddress}`);
  const payer = ensureWallet();
  const web3 = safeRequire('@solana/web3.js');
  const { Connection } = web3;
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const sig = await payUSDC(connection, payer, info);
  log(`Payment signature: ${sig}`);
  const proof = Buffer.from(JSON.stringify({ txSignature: sig, paymentId: info.paymentId })).toString('base64');
  const paid = await rpc(api, method, params, proof);
  return paid;
}

function needAddress(method){
  return [
    'getSignaturesForAddress',
    'getTransaction',
    'getTokenAccountsByOwner',
    'getTokenAccountBalance',
    'getAccountInfo',
    'getProgramAccounts',
  ].includes(method);
}

function needSlot(method){
  return [ 'getBlock' ].includes(method);
}

function needsNoArg(method){
  return [ 'getSlot', 'getVersion', 'getLatestBlockhash', 'getBlockHeight' ].includes(method);
}

function fullOrShort(sig){
  const cols = process.stdout && process.stdout.columns ? process.stdout.columns : 80;
  if (!sig) return '';
  if (cols >= 120) return sig;
  if (sig.length <= 20) return sig;
  return sig.substring(0,8) + '…' + sig.substring(sig.length-8);
}

function printSigTable(list){
  const cols = process.stdout && process.stdout.columns ? process.stdout.columns : 120;
  const sigCol = Math.max(88, Math.min(100, cols - 20));
  log('Signature (Explorer link)'.padEnd(sigCol) + '  ' + 'Slot'.padEnd(10) + 'Status');
  list.forEach(it => {
    const sig = typeof it === 'string' ? it : (it.signature || it.signatures || '');
    const slot = (it.slot||'-').toString().padEnd(10);
    const st = it.err ? 'error' : (it.confirmationStatus || 'ok');
    const short = fullOrShort(sig);
    const link = sig ? ` https://explorer.solana.com/tx/${sig}?cluster=devnet` : '';
    const disp = (`${short}${link ? '  (' + link + ')' : ''}`).padEnd(sigCol);
    log(`${disp}  ${slot}${st}`);
  });
}

async function buildParamsAndExecute(api, method, arg, opts){
  const limit = parseInt(opts.limit || '10', 10);
  const TOKEN_PROGRAM_ID_STR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  // Validate arg requirements
  if (needAddress(method)){
    if (!arg) { err(`${method} requires an address/signature argument.`); process.exit(1); }
  } else if (needsNoArg(method)) {
    if (arg) { err(`${method} does not take any arguments. Try a method that needs an address like getSignaturesForAddress <address>.`); process.exit(1); }
  }

  let res;
  switch(method){
    case 'getSignaturesForAddress':
      res = await withPayment(api, method, [arg, { limit }]);
      if (res.status !== 200) { err('Request failed:', res.status, res.data); process.exit(1); }
      {
        const list = Array.isArray(res.data.result) ? res.data.result : (res.data.result && res.data.result.value) || [];
        printSigTable(list.slice(0, limit));
      }
      break;
    case 'getTransaction':
      res = await withPayment(api, method, [arg, { maxSupportedTransactionVersion: 0 }]);
      log(JSON.stringify(res.data, null, 2));
      break;
    case 'getTokenAccountsByOwner':
      res = await withPayment(api, method, [arg, { programId: TOKEN_PROGRAM_ID_STR }, { encoding: 'jsonParsed' }]);
      log(JSON.stringify(res.data, null, 2));
      break;
    case 'getTokenAccountBalance':
      res = await withPayment(api, method, [arg]);
      log(JSON.stringify(res.data, null, 2));
      break;
    case 'getAccountInfo':
      res = await withPayment(api, method, [arg, { encoding: 'base64' }]);
      log(JSON.stringify(res.data, null, 2));
      break;
    case 'getProgramAccounts':
      res = await withPayment(api, method, [arg, { encoding: 'jsonParsed' }]);
      log(JSON.stringify(res.data, null, 2));
      break;
    case 'getBlock': {
      let slot = arg ? parseInt(arg, 10) : NaN;
      if (!Number.isFinite(slot)) {
        const latest = await withPayment(api, 'getSlot', []);
        if (latest.status !== 200) { err('getSlot failed:', latest.status, latest.data); process.exit(1); }
        slot = latest.data.result;
      }
      res = await withPayment(api, method, [slot, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
      if (res.status !== 200) { err('getBlock failed:', res.status, res.data); process.exit(1); }
      const r = res.data.result || {};
      log(`Block ${slot}\n  blockhash: ${r.blockhash}\n  parentSlot: ${r.parentSlot}\n  transactions: ${(r.transactions||[]).length}`);
      break; }
    case 'getBlockHeight':
    case 'getSlot':
    case 'getVersion':
    case 'getLatestBlockhash':
      res = await withPayment(api, method, []);
      log(JSON.stringify(res.data, null, 2));
      break;
    default:
      err(`Unsupported method: ${method}`);
      process.exit(1);
  }
}

async function handleQuery(cmd){
  const api = cmd.parent.opts().api || DEFAULT_API;
  const method = cmd.method;
  const arg = cmd.arg;
  await buildParamsAndExecute(api, method, arg, cmd);
}

async function handleAgent(cmd){
  const api = cmd.parent.opts().api || DEFAULT_API;
  const text = cmd.prompt || '';
  const addrMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  const limitMatch = text.match(/(last|limit)\s+(\d{1,3})/i);
  const address = addrMatch ? addrMatch[0] : null;
  const limit = limitMatch ? Math.min(100, parseInt(limitMatch[2], 10)) : 10;
  if (!address) { err('No address found in prompt'); process.exit(1); }
  log(`Planning: address ${address}, limit ${limit}`);
  const res = await withPayment(api, 'getSignaturesForAddress', [address, { limit }]);
  if (res.status !== 200) { err('Agent request failed:', res.status, res.data); process.exit(1); }
  const list = Array.isArray(res.data.result) ? res.data.result : (res.data.result && res.data.result.value) || [];
  log(`Provider: Triton Old Faithful (devnet)`);
  log(`Results: ${list.length}`);
  log('Signature  Slot        Status');
  list.slice(0, 50).forEach(it => {
    const sig = (it.signature || '').slice(0, 16) + '…';
    const slot = (it.slot||'-').toString().padEnd(10);
    const st = it.err ? 'error' : (it.confirmationStatus || 'ok');
    log(`${sig} ${slot} ${st}`);
  });
}

async function handleMetrics(cmd){
  const api = cmd.parent.opts().api || DEFAULT_API;
  const url = api.replace(/\/$/, '') + '/metrics/json';
  const { data } = await axios.get(url);
  log(JSON.stringify(data, null, 2));
}

async function main(){
  const program = new Command();
  program
    .name('solana-history')
    .description('x402-powered Solana Historical Archive Gateway CLI (devnet)')
    .option('-a, --api <url>', 'Gateway base URL', DEFAULT_API);

  program
    .command('query')
    .description('Run a paid JSON-RPC query')
    .argument('<method>', 'RPC method (e.g., getSlot, getBlock, getSignaturesForAddress)')
    .argument('[arg]', 'Optional argument (address/signature/slot depending on method)')
    .option('-l, --limit <n>', 'Limit for signatures', '10')
    .action(async (method, arg, opts) => {
      await handleQuery({ method, arg, ...opts, parent: program });
    });

  program
    .command('agent')
    .description('Run agent flow that requires payment')
    .argument('<prompt>', 'Natural language prompt')
    .action(async (prompt) => { await handleAgent({ prompt, parent: program }); });

  program
    .command('metrics')
    .description('Fetch gateway metrics')
    .action(async () => { await handleMetrics({ parent: program }); });

  await program.parseAsync(process.argv);
}

main().catch(e => { err(e?.message || e); process.exit(1); });
