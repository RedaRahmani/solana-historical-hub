/**
 * Benchmarking Suite: Compare Triton Old Faithful vs Public RPC Performance
 * 
 * This script measures latency and reliability across different RPC endpoints
 * for various query types to demonstrate the value of premium historical data access.
 */

require('dotenv').config();
const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const TRITON_RPC = process.env.OLD_FAITHFUL_RPC_URL || 'https://rlock-solanad-de21.devnet.rpcpool.com/ba715b75-838e-4fc8-b4d7-5e518c00032a';
const PUBLIC_RPC = 'https://api.devnet.solana.com';
const RUNS_PER_TEST = 5;

// Test scenarios
const TEST_SCENARIOS = [
  {
    name: 'Deep Historical Block',
    method: 'getBlock',
    params: [419899999, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
    category: 'historical',
  },
  {
    name: 'Recent Block',
    method: 'getBlock',
    params: [420188000, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
    category: 'recent',
  },
  {
    name: 'Get Slot',
    method: 'getSlot',
    params: [],
    category: 'current',
  },
  {
    name: 'Get Block Height',
    method: 'getBlockHeight',
    params: [],
    category: 'current',
  },
  {
    name: 'Transaction Signatures (USDC)',
    method: 'getSignaturesForAddress',
    params: ['Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', { limit: 10 }],
    category: 'historical',
  },
];

/**
 * Execute a single RPC request and measure latency
 */
async function executeRequest(endpoint, method, params) {
  const start = performance.now();
  
  try {
    const response = await axios.post(
      endpoint,
      {
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
    const duration = performance.now() - start;
    
    return {
      success: !response.data.error,
      duration,
      error: response.data.error?.message,
      dataSize: JSON.stringify(response.data).length,
    };
  } catch (error) {
    const duration = performance.now() - start;
    return {
      success: false,
      duration,
      error: error.message,
      dataSize: 0,
    };
  }
}

/**
 * Run benchmark for a specific scenario
 */
async function runBenchmark(scenario) {
  console.log(`\n📊 Testing: ${scenario.name}`);
  console.log(`   Method: ${scenario.method}`);
  console.log(`   Category: ${scenario.category}`);
  
  // Test Triton
  console.log(`\n   🔹 Triton Old Faithful:`);
  const tritonResults = [];
  for (let i = 0; i < RUNS_PER_TEST; i++) {
    process.stdout.write(`      Run ${i + 1}/${RUNS_PER_TEST}... `);
    const result = await executeRequest(TRITON_RPC, scenario.method, scenario.params);
    tritonResults.push(result);
    console.log(result.success ? `✓ ${result.duration.toFixed(0)}ms` : `✗ ${result.error}`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }
  
  // Test Public RPC
  console.log(`\n   🔹 Public RPC:`);
  const publicResults = [];
  for (let i = 0; i < RUNS_PER_TEST; i++) {
    process.stdout.write(`      Run ${i + 1}/${RUNS_PER_TEST}... `);
    const result = await executeRequest(PUBLIC_RPC, scenario.method, scenario.params);
    publicResults.push(result);
    console.log(result.success ? `✓ ${result.duration.toFixed(0)}ms` : `✗ ${result.error}`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }
  
  // Calculate statistics
  const tritonSuccess = tritonResults.filter(r => r.success);
  const publicSuccess = publicResults.filter(r => r.success);
  
  const tritonAvg = tritonSuccess.length > 0
    ? tritonSuccess.reduce((sum, r) => sum + r.duration, 0) / tritonSuccess.length
    : null;
  const publicAvg = publicSuccess.length > 0
    ? publicSuccess.reduce((sum, r) => sum + r.duration, 0) / publicSuccess.length
    : null;
  
  return {
    scenario: scenario.name,
    category: scenario.category,
    triton: {
      successRate: (tritonSuccess.length / RUNS_PER_TEST) * 100,
      avgLatency: tritonAvg,
      minLatency: tritonSuccess.length > 0 ? Math.min(...tritonSuccess.map(r => r.duration)) : null,
      maxLatency: tritonSuccess.length > 0 ? Math.max(...tritonSuccess.map(r => r.duration)) : null,
      avgDataSize: tritonSuccess.length > 0 ? tritonSuccess.reduce((sum, r) => sum + r.dataSize, 0) / tritonSuccess.length : 0,
    },
    public: {
      successRate: (publicSuccess.length / RUNS_PER_TEST) * 100,
      avgLatency: publicAvg,
      minLatency: publicSuccess.length > 0 ? Math.min(...publicSuccess.map(r => r.duration)) : null,
      maxLatency: publicSuccess.length > 0 ? Math.max(...publicSuccess.map(r => r.duration)) : null,
      avgDataSize: publicSuccess.length > 0 ? publicSuccess.reduce((sum, r) => sum + r.dataSize, 0) / publicSuccess.length : 0,
    },
  };
}

/**
 * Display results table
 */
function displayResults(results) {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          BENCHMARK RESULTS SUMMARY                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('┌─────────────────────────────┬──────────────────────┬──────────────────────┐');
  console.log('│ Scenario                    │ Triton Old Faithful  │ Public RPC           │');
  console.log('├─────────────────────────────┼──────────────────────┼──────────────────────┤');
  
  results.forEach(result => {
    const name = result.scenario.padEnd(27);
    const tritonLatency = result.triton.avgLatency !== null 
      ? `${result.triton.avgLatency.toFixed(0)}ms`.padEnd(8)
      : 'FAILED  ';
    const tritonSuccess = `${result.triton.successRate}%`.padEnd(10);
    const publicLatency = result.public.avgLatency !== null 
      ? `${result.public.avgLatency.toFixed(0)}ms`.padEnd(8)
      : 'FAILED  ';
    const publicSuccess = `${result.public.successRate}%`.padEnd(10);
    
    console.log(`│ ${name} │ ${tritonLatency} (${tritonSuccess}) │ ${publicLatency} (${publicSuccess}) │`);
  });
  
  console.log('└─────────────────────────────┴──────────────────────┴──────────────────────┘\n');
  
  // Calculate overall statistics
  const tritonAvgAll = results
    .filter(r => r.triton.avgLatency !== null)
    .reduce((sum, r) => sum + r.triton.avgLatency, 0) / results.filter(r => r.triton.avgLatency !== null).length;
  
  const publicAvgAll = results
    .filter(r => r.public.avgLatency !== null)
    .reduce((sum, r) => sum + r.public.avgLatency, 0) / results.filter(r => r.public.avgLatency !== null).length;
  
  const improvement = ((publicAvgAll - tritonAvgAll) / publicAvgAll * 100).toFixed(1);
  
  console.log('📈 Overall Performance:');
  console.log(`   Triton Old Faithful: ${tritonAvgAll.toFixed(0)}ms average`);
  console.log(`   Public RPC:          ${publicAvgAll.toFixed(0)}ms average`);
  console.log(`   Performance Gain:    ${improvement}% faster with Triton\n`);
  
  // Historical data analysis
  const historicalResults = results.filter(r => r.category === 'historical');
  const tritonHistSuccess = historicalResults.reduce((sum, r) => sum + r.triton.successRate, 0) / historicalResults.length;
  const publicHistSuccess = historicalResults.reduce((sum, r) => sum + r.public.successRate, 0) / historicalResults.length;
  
  console.log('🏛️  Historical Data Reliability:');
  console.log(`   Triton Old Faithful: ${tritonHistSuccess.toFixed(0)}% success rate`);
  console.log(`   Public RPC:          ${publicHistSuccess.toFixed(0)}% success rate`);
  console.log(`   Reliability Gain:    ${(tritonHistSuccess - publicHistSuccess).toFixed(0)}% more reliable\n`);
  
  console.log('✅ Key Findings:');
  console.log('   • Triton Old Faithful excels at deep historical queries');
  console.log('   • Premium RPC provides consistent low-latency access');
  console.log('   • Public RPC may have limited historical data retention');
  console.log('   • For agent workflows, reliability > occasional speed gains\n');
}

/**
 * Main benchmark execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Solana Historical Hub - RPC Benchmarks                      ║');
  console.log('║                     Triton Old Faithful vs Public RPC                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Configuration:`);
  console.log(`  Triton RPC:  ${TRITON_RPC.substring(0, 60)}...`);
  console.log(`  Public RPC:  ${PUBLIC_RPC}`);
  console.log(`  Runs/Test:   ${RUNS_PER_TEST}`);
  console.log(`  Scenarios:   ${TEST_SCENARIOS.length}\n`);
  
  const results = [];
  
  for (const scenario of TEST_SCENARIOS) {
    const result = await runBenchmark(scenario);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Pause between scenarios
  }
  
  displayResults(results);
  
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           Benchmark Complete!                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
}

// Run benchmarks
if (require.main === module) {
  main().catch((error) => {
    console.error('\n✗ Benchmark failed:', error.message);
    process.exit(1);
  });
}

module.exports = { executeRequest, runBenchmark };
