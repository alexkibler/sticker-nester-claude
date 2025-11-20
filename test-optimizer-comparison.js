/**
 * Comprehensive comparison of all three optimization approaches:
 * 1. Greedy NFP (fast baseline)
 * 2. Simulated Annealing (medium speed, good results)
 * 3. Genetic Algorithm (slow, best results)
 */

const { execSync } = require('child_process');

console.log('Building TypeScript...');
try {
  execSync('cd server && npm run build', { stdio: 'inherit' });
} catch (e) {
  console.error('Build failed:', e.message);
  process.exit(1);
}

const { NFPNester, MultiSheetNFPNester } = require('./server/dist/services/nfp-nesting.service.js');
const { SimulatedAnnealingOptimizer } = require('./server/dist/services/simulated-annealing.service.js');
const { GeneticAlgorithmOptimizer } = require('./server/dist/services/genetic-algorithm.service.js');

// Test data: simple rectangles for reproducibility
const testData = {
  polygons: [
    { id: 'rect1', points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 3}, {x: 0, y: 3}], width: 2, height: 3, area: 6 },
    { id: 'rect2', points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 3}, {x: 0, y: 3}], width: 2, height: 3, area: 6 },
    { id: 'rect3', points: [{x: 0, y: 0}, {x: 3, y: 0}, {x: 3, y: 2}, {x: 0, y: 2}], width: 3, height: 2, area: 6 },
    { id: 'rect4', points: [{x: 0, y: 0}, {x: 3, y: 0}, {x: 3, y: 2}, {x: 0, y: 2}], width: 3, height: 2, area: 6 },
    { id: 'rect5', points: [{x: 0, y: 0}, {x: 1.5, y: 0}, {x: 1.5, y: 2}, {x: 0, y: 2}], width: 1.5, height: 2, area: 3 },
  ],
  sheetWidth: 8.5,
  sheetHeight: 11,
  spacing: 0.0625
};

async function runComparison() {
  console.log('\n' + '='.repeat(60));
  console.log('  OPTIMIZER COMPARISON TEST');
  console.log('='.repeat(60));
  console.log(`\nTest Setup:`);
  console.log(`  Items: ${testData.polygons.length} polygons`);
  console.log(`  Sheet: ${testData.sheetWidth}" × ${testData.sheetHeight}"`);
  console.log(`  Spacing: ${testData.spacing}"`);
  console.log(`  Total area: ${testData.polygons.reduce((s, p) => s + p.area, 0)} sq in`);
  console.log(`  Sheet area: ${testData.sheetWidth * testData.sheetHeight} sq in`);
  console.log(`  Theoretical max: ${(testData.polygons.reduce((s, p) => s + p.area, 0) / (testData.sheetWidth * testData.sheetHeight) * 100).toFixed(1)}%\n`);

  const results = [];

  // ============================================================
  // TEST 1: Greedy NFP (Baseline)
  // ============================================================
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: GREEDY NFP (Optimized Baseline)');
  console.log('─'.repeat(60));

  const greedyStart = Date.now();
  const nester = new NFPNester(testData.sheetWidth, testData.sheetHeight, testData.spacing);
  const greedyResult = await nester.nest(testData.polygons);
  const greedyTime = Date.now() - greedyStart;

  results.push({
    name: 'Greedy NFP',
    utilization: greedyResult.utilization,
    itemsPlaced: greedyResult.placements.length,
    time: greedyTime
  });

  console.log(`\n✓ Greedy Complete:`);
  console.log(`  Utilization: ${greedyResult.utilization.toFixed(1)}%`);
  console.log(`  Items placed: ${greedyResult.placements.length}/${testData.polygons.length}`);
  console.log(`  Time: ${greedyTime}ms`);

  // ============================================================
  // TEST 2: Simulated Annealing
  // ============================================================
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: SIMULATED ANNEALING');
  console.log('─'.repeat(60));

  const saStart = Date.now();
  const saOptimizer = new SimulatedAnnealingOptimizer(
    testData.polygons,
    testData.sheetWidth,
    testData.sheetHeight,
    testData.spacing
  );

  const saResult = await saOptimizer.optimize({
    initialTemperature: 100,
    coolingRate: 0.95,
    iterations: 200,  // Fast test
    neighbourhoodSize: 3
  });
  const saTime = Date.now() - saStart;

  results.push({
    name: 'Simulated Annealing',
    utilization: saResult.utilization,
    itemsPlaced: saResult.placements.length,
    time: saTime,
    improvements: saResult.improvements
  });

  console.log(`\n✓ SA Complete:`);
  console.log(`  Utilization: ${saResult.utilization.toFixed(1)}%`);
  console.log(`  Items placed: ${saResult.placements.length}/${testData.polygons.length}`);
  console.log(`  Improvements: ${saResult.improvements}`);
  console.log(`  Time: ${saTime}ms`);

  // ============================================================
  // TEST 3: Genetic Algorithm
  // ============================================================
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: GENETIC ALGORITHM');
  console.log('─'.repeat(60));

  const gaStart = Date.now();
  const gaOptimizer = new GeneticAlgorithmOptimizer(
    testData.polygons,
    testData.sheetWidth,
    testData.sheetHeight,
    testData.spacing
  );

  const gaResult = await gaOptimizer.optimize({
    populationSize: 20,  // Small for testing
    generations: 50,     // Fast test
    mutationRate: 0.15,
    eliteCount: 2,
    tournamentSize: 5
  });
  const gaTime = Date.now() - gaStart;

  results.push({
    name: 'Genetic Algorithm',
    utilization: gaResult.utilization,
    itemsPlaced: gaResult.placements.length,
    time: gaTime,
    improvements: gaResult.improvements
  });

  console.log(`\n✓ GA Complete:`);
  console.log(`  Utilization: ${gaResult.utilization.toFixed(1)}%`);
  console.log(`  Items placed: ${gaResult.placements.length}/${testData.polygons.length}`);
  console.log(`  Improvements: ${gaResult.improvements}`);
  console.log(`  Time: ${gaTime}ms`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('  FINAL RESULTS');
  console.log('='.repeat(60));
  console.log();

  // Sort by utilization
  results.sort((a, b) => b.utilization - a.utilization);

  console.log('Ranking by Utilization:');
  results.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    console.log(`  ${medal} ${r.name.padEnd(25)} ${r.utilization.toFixed(1)}%  (${r.itemsPlaced} items, ${r.time}ms)`);
  });

  console.log();
  console.log('Speed Comparison:');
  const fastest = Math.min(...results.map(r => r.time));
  results.sort((a, b) => a.time - b.time);
  results.forEach(r => {
    const speedup = r.time / fastest;
    console.log(`  ${r.name.padEnd(25)} ${r.time.toString().padStart(6)}ms  (${speedup.toFixed(1)}x)`);
  });

  console.log();
  console.log('Best Overall:');
  results.sort((a, b) => {
    // Score: utilization / log(time)
    const scoreA = a.utilization / Math.log10(a.time + 1);
    const scoreB = b.utilization / Math.log10(b.time + 1);
    return scoreB - scoreA;
  });
  console.log(`  ⭐ ${results[0].name}: Best balance of quality (${results[0].utilization.toFixed(1)}%) and speed (${results[0].time}ms)`);

  console.log('\n' + '='.repeat(60) + '\n');
}

runComparison().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
