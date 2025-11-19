/**
 * Rotation Strategy Comparison Test
 *
 * This test answers the question: How helpful or hurtful is it to allow
 * arbitrary rotation angles instead of limiting to 90° multiples?
 *
 * Tests different rotation strategies:
 * 1. 90° only (0°, 90°, 180°, 270°) - 4 rotations [BASELINE]
 * 2. 45° increments (0°, 45°, 90°, ..., 315°) - 8 rotations
 * 3. 30° increments (0°, 30°, 60°, ..., 330°) - 12 rotations
 * 4. 15° increments (0°, 15°, 30°, ..., 345°) - 24 rotations
 * 5. No rotation (0° only) - 1 rotation [CONTROL]
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = 'http://localhost:3001';
const OUTPUT_DIR = path.join(__dirname, 'screenshots', 'rotation-comparison');

interface Point {
  x: number;
  y: number;
}

interface Sticker {
  id: string;
  points: Point[];
  width: number;
  height: number;
}

interface Placement {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

interface NestingResult {
  placements: Placement[];
  utilization: number;
  fitness: number;
}

/**
 * Wait for backend
 */
async function waitForBackend(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
      if (response.ok) return true;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Create test stickers with irregular shapes
 */
function createTestStickers(): Sticker[] {
  const MM_PER_INCH = 25.4;
  const stickers: Sticker[] = [];

  // Create irregular star shapes that benefit from rotation
  const createStar = (id: string, size: number, points: number): Sticker => {
    const starPoints: Point[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
      const radius = i % 2 === 0 ? size : size * 0.4;
      starPoints.push({
        x: size + Math.cos(angle) * radius,
        y: size + Math.sin(angle) * radius,
      });
    }
    return { id, points: starPoints, width: size * 2, height: size * 2 };
  };

  // Create elongated hexagons (benefit from rotation)
  const createElongatedHex = (id: string, width: number, height: number): Sticker => {
    const points: Point[] = [
      { x: width * 0.25, y: 0 },
      { x: width * 0.75, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width * 0.75, y: height },
      { x: width * 0.25, y: height },
      { x: 0, y: height * 0.5 },
    ];
    return { id, points, width, height };
  };

  // Create L-shapes (highly benefit from rotation)
  const createLShape = (id: string, size: number): Sticker => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: size * 0.4, y: 0 },
      { x: size * 0.4, y: size * 0.6 },
      { x: size, y: size * 0.6 },
      { x: size, y: size },
      { x: 0, y: size },
    ];
    return { id, points, width: size, height: size };
  };

  const size1 = 0.9 * MM_PER_INCH;
  const size2 = 1.0 * MM_PER_INCH;
  const size3 = 1.1 * MM_PER_INCH;

  // 5 five-pointed stars
  stickers.push(createStar('star-5pt-1', size1, 5));
  stickers.push(createStar('star-5pt-2', size2, 5));
  stickers.push(createStar('star-5pt-3', size3, 5));

  // 3 elongated hexagons (these benefit from 30° rotations)
  stickers.push(createElongatedHex('hex-1', size1 * 1.5, size1));
  stickers.push(createElongatedHex('hex-2', size2 * 1.5, size2));

  // 3 L-shapes (these benefit from any rotation)
  stickers.push(createLShape('L-shape-1', size1));
  stickers.push(createLShape('L-shape-2', size2));

  console.log(`Created ${stickers.length} test stickers for rotation testing`);

  return stickers;
}

/**
 * Call nesting API with specific rotation angles
 */
async function callNestingWithRotations(
  stickers: Sticker[],
  rotations: number[]
): Promise<{ result: NestingResult; timeMs: number }> {
  const MM_PER_INCH = 25.4;

  const startTime = Date.now();

  const response = await fetch(`${BACKEND_URL}/api/nesting/nest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stickers,
      sheetWidth: 12 * MM_PER_INCH,
      sheetHeight: 12 * MM_PER_INCH,
      spacing: 1.5875,
      productionMode: false,
      usePolygonPacking: true,
      cellsPerInch: 100,
      stepSize: 0.05,
      rotations, // Custom rotation angles
    }),
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }

  const result = await response.json();
  const timeMs = Date.now() - startTime;

  return { result, timeMs };
}

/**
 * Main test function
 */
async function runRotationComparison() {
  console.log('\n==========================================');
  console.log('Rotation Strategy Comparison Test');
  console.log('==========================================\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Start backend
  console.log('Starting backend server...');
  const backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..', 'server'),
    stdio: 'pipe',
  });

  backendProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Server running') || output.includes('listening')) {
      console.log(`✓ Backend: ${output.trim()}`);
    }
  });

  console.log('Waiting for backend...');
  const backendReady = await waitForBackend();

  if (!backendReady) {
    console.error('✗ Backend did not start in time');
    backendProcess.kill();
    process.exit(1);
  }

  try {
    // Create test stickers
    const stickers = createTestStickers();

    // Define rotation strategies to test
    const strategies = [
      {
        name: 'No Rotation',
        rotations: [0],
        description: 'Control - no rotation allowed',
      },
      {
        name: '90° Increments',
        rotations: [0, 90, 180, 270],
        description: 'Baseline - standard approach',
      },
      {
        name: '45° Increments',
        rotations: [0, 45, 90, 135, 180, 225, 270, 315],
        description: '2x more rotations',
      },
      {
        name: '30° Increments',
        rotations: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
        description: '3x more rotations',
      },
      {
        name: '15° Increments',
        rotations: Array.from({ length: 24 }, (_, i) => i * 15),
        description: '6x more rotations - very fine-grained',
      },
    ];

    const results: any[] = [];

    console.log(`\nTesting ${strategies.length} rotation strategies...\n`);

    for (const strategy of strategies) {
      console.log(`\n=== ${strategy.name} ===`);
      console.log(`Rotations: ${strategy.rotations.join(', ')}° (${strategy.rotations.length} total)`);
      console.log(`${strategy.description}`);

      const { result, timeMs } = await callNestingWithRotations(stickers, strategy.rotations);

      console.log(`✓ Complete in ${timeMs}ms (${(timeMs / 1000).toFixed(1)}s)`);
      console.log(`  Items placed: ${result.placements.length}/${stickers.length}`);
      console.log(`  Utilization: ${result.utilization.toFixed(1)}%`);

      // Analyze rotation usage
      const rotationCounts: { [key: number]: number } = {};
      result.placements.forEach(p => {
        rotationCounts[p.rotation] = (rotationCounts[p.rotation] || 0) + 1;
      });

      console.log(`  Rotations used:`);
      Object.entries(rotationCounts)
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .forEach(([rot, count]) => {
          console.log(`    ${rot}°: ${count} items`);
        });

      results.push({
        name: strategy.name,
        rotationCount: strategy.rotations.length,
        rotations: strategy.rotations,
        itemsPlaced: result.placements.length,
        utilization: result.utilization,
        timeMs,
        rotationCounts,
      });
    }

    // Analysis
    console.log('\n\n==========================================');
    console.log('ANALYSIS: Rotation Strategy Impact');
    console.log('==========================================\n');

    const baseline = results.find(r => r.name === '90° Increments');

    console.log('Comparison vs Baseline (90° increments):\n');

    results.forEach(r => {
      const itemsDiff = r.itemsPlaced - baseline.itemsPlaced;
      const utilizationDiff = r.utilization - baseline.utilization;
      const timeDiff = r.timeMs - baseline.timeMs;
      const timeRatio = r.timeMs / baseline.timeMs;

      console.log(`${r.name}:`);
      console.log(`  Rotations: ${r.rotationCount} (${timeRatio.toFixed(1)}x slower)`);
      console.log(`  Items: ${r.itemsPlaced} (${itemsDiff >= 0 ? '+' : ''}${itemsDiff})`);
      console.log(`  Utilization: ${r.utilization.toFixed(1)}% (${utilizationDiff >= 0 ? '+' : ''}${utilizationDiff.toFixed(1)}%)`);
      console.log(`  Time: ${(r.timeMs / 1000).toFixed(1)}s (${timeDiff >= 0 ? '+' : ''}${(timeDiff / 1000).toFixed(1)}s)`);
      console.log('');
    });

    // Recommendations
    console.log('==========================================');
    console.log('RECOMMENDATIONS');
    console.log('==========================================\n');

    // Find best efficiency (items per second)
    const efficiencyScores = results.map(r => ({
      name: r.name,
      efficiency: r.itemsPlaced / (r.timeMs / 1000),
      utilizationPerSec: r.utilization / (r.timeMs / 1000),
    }));

    const bestEfficiency = efficiencyScores.reduce((best, current) =>
      current.efficiency > best.efficiency ? current : best
    );

    const bestUtilization = results.reduce((best, current) =>
      current.utilization > best.utilization ? current : best
    );

    const fastestTime = results.reduce((best, current) =>
      current.timeMs < best.timeMs ? current : best
    );

    console.log(`Best overall efficiency: ${bestEfficiency.name}`);
    console.log(`  (${bestEfficiency.efficiency.toFixed(2)} items/sec)\n`);

    console.log(`Best utilization: ${bestUtilization.name}`);
    console.log(`  (${bestUtilization.utilization.toFixed(1)}% in ${(bestUtilization.timeMs / 1000).toFixed(1)}s)\n`);

    console.log(`Fastest: ${fastestTime.name}`);
    console.log(`  (${(fastestTime.timeMs / 1000).toFixed(1)}s)\n`);

    // Sweet spot analysis
    const sweetSpot = results.find(r => {
      const timeOk = r.timeMs / baseline.timeMs < 3; // Less than 3x slower
      const utilizationGood = r.utilization >= baseline.utilization * 0.95; // Within 5% of baseline
      return timeOk && utilizationGood && r.name !== baseline.name;
    });

    if (sweetSpot) {
      console.log(`Recommended "sweet spot": ${sweetSpot.name}`);
      console.log(`  Balances time (${(sweetSpot.timeMs / 1000).toFixed(1)}s) and utilization (${sweetSpot.utilization.toFixed(1)}%)`);
    }

    // Save results
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'rotation-comparison.json'),
      JSON.stringify(results, null, 2)
    );

    console.log(`\n✓ Results saved to ${OUTPUT_DIR}/rotation-comparison.json`);

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  } finally {
    console.log('\nCleaning up...');
    backendProcess.kill();
    console.log('✓ Backend stopped');
  }

  process.exit(0);
}

// Run test
runRotationComparison().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
