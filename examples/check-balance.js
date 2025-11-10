/**
 * Check wallet balances (SOL and USDC)
 */

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAccount } = require('@solana/spl-token');
const fs = require('fs');

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const USDC_MINT = process.env.USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';

async function checkBalance() {
  try {
    // Load wallet
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
    const { Keypair } = require('@solana/web3.js');
    const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    
    console.log('\n🔍 Checking wallet balances...\n');
    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Network: Solana Devnet\n`);

    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Check SOL balance
    const solBalance = await connection.getBalance(wallet.publicKey);
    console.log(`💎 SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);

    // Check USDC balance
    try {
      const { getAssociatedTokenAddress } = require('@solana/spl-token');
      const mintAddress = new PublicKey(USDC_MINT);
      const tokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        wallet.publicKey
      );

      try {
        const accountInfo = await getAccount(connection, tokenAccount);
        const usdcBalance = Number(accountInfo.amount) / 1e6; // USDC has 6 decimals
        console.log(`💵 USDC Balance: ${usdcBalance.toFixed(3)} USDC`);

        // Check if ready for payment
        console.log('\n' + '='.repeat(50));
        if (solBalance >= 0.01 * 1e9 && usdcBalance >= 0.001) {
          console.log('✅ Wallet is funded and ready!');
          console.log('\nYou can now run: node client.js');
        } else {
          console.log('⚠️  Wallet needs funding:');
          if (solBalance < 0.01 * 1e9) {
            console.log('   - Need at least 0.01 SOL for transaction fees');
            console.log('   - Get SOL: solana airdrop 1 ' + wallet.publicKey.toBase58() + ' --url devnet');
          }
          if (usdcBalance < 0.001) {
            console.log('   - Need at least 0.001 USDC for payment');
            console.log('   - Get USDC: https://spl-token-faucet.com/?token-name=USDC-Dev');
          }
        }
        console.log('='.repeat(50) + '\n');
      } catch (accountError) {
        console.log('💵 USDC Balance: 0 USDC (no token account yet)');
        console.log('\n' + '='.repeat(50));
        console.log('⚠️  Get USDC from: https://spl-token-faucet.com/?token-name=USDC-Dev');
        console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);
        console.log('='.repeat(50) + '\n');
      }

    } catch (error) {
      console.log('💵 USDC Balance: 0 USDC');
      console.log('\n' + '='.repeat(50));
      console.log('⚠️  Get USDC from: https://spl-token-faucet.com/?token-name=USDC-Dev');
      console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);
      console.log('='.repeat(50) + '\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkBalance();
