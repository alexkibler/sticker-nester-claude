/**
 * Benchmark: C++ Packer vs JavaScript Packer
 *
 * Run with: npm run test:benchmark
 */

import { CppPackerService } from '../services/cpp-packer.service';
import { NestingService, Sticker } from '../services/nesting.service';

// Generate test stickers
function generateTestStickers(count: number): Sticker[] {
  const stickers: Sticker[] = [];

  for (let i = 0; i < count; i++) {
    // Create various shapes for realistic testing
    const shapeType = i % 4;
    let points;
    let width, height;

    switch (shapeType) {
      case 0: // Rectangle
        width = 1.0 + Math.random() * 2.0;
        height = 0.5 + Math.random() * 1.5;
        points = [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ];
        break;

      case 1: // Triangle
        width = 1.0 + Math.random() * 2.0;
        height = 1.0 + Math.random() * 2.0;
        points = [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width / 2, y: height },
        ];
        break;

      case 2: // Pentagon
        width = 1.5 + Math.random() * 1.5;
        height = 1.5 + Math.random() * 1.5;
        const r = Math.min(width, height) / 2;
        points = [];
        for (let j = 0; j < 5; j++) {
          const angle = (j * 2 * Math.PI) / 5 - Math.PI / 2;
          points.push({
            x: width / 2 + r * Math.cos(angle),
            y: height / 2 + r * Math.sin(angle),
          });
        }
        break;

      case 3: // Hexagon
        width = 1.0 + Math.random() * 1.5;
        height = 1.0 + Math.random() * 1.5;
        const hexR = Math.min(width, height) / 2;
        points = [];
        for (let j = 0; j < 6; j++) {
          const angle = (j * 2 * Math.PI) / 6;
          points.push({
            x: width / 2 + hexR * Math.cos(angle),
            y: height / 2 + hexR * Math.sin(angle),
          });
        }
        break;

      default:
        width = 1.0;
        height = 1.0;
        points = [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];
    }

    stickers.push({
      id: `sticker_${i}`,
      points,
      width,
      height,
    });
  }

  return stickers;
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

// Run benchmark
async function runBenchmark() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  C++ PACKER BENCHMARK vs JavaScript              ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const cppPacker = new CppPackerService();
  const jsPacker = new NestingService();

  if (!cppPacker.isAvailable()) {
    console.error('❌ C++ packer not available!');
    console.error('   Run: cd server/cpp-packer && ./build.sh');
    process.exit(1);
  }

  console.log('✅ C++ packer available\n');

  const testCases = [
    { name: 'Small (10 stickers)', count: 10, sheets: 1 },
    { name: 'Medium (20 stickers)', count: 20, sheets: 2 },
    { name: 'Large (50 stickers)', count: 50, sheets: 4 },
  ];

  const results: any[] = [];

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${testCase.name}`);
    console.log(`${'='.repeat(60)}\n`);

    const stickers = generateTestStickers(testCase.count);
    const sheetWidth = 12.0;
    const sheetHeight = 12.0;
    const spacing = 0.0625;

    // Warm up (first run may be slower)
    console.log('Warming up...');
    try {
      await cppPacker.packStickers(stickers, {
        sheetWidth,
        sheetHeight,
        spacing,
        allowRotation: true,
      });
    } catch (e) {
      console.warn('Warm-up failed (may be expected):', e);
    }

    // Run JavaScript implementation
    console.log('\n🟨 JavaScript Implementation:');
    const jsStart = Date.now();
    let jsResult;
    try {
      jsResult = jsPacker.nestStickersPolygon(
        stickers,
        sheetWidth * 25.4, // Convert to mm (JS expects mm)
        sheetHeight * 25.4,
        spacing * 25.4,
        100, // cellsPerInch
        0.05, // stepSize
        [0, 90, 180, 270] // rotations
      );
    } catch (e: any) {
      console.error('   ❌ Failed:', e.message);
      continue;
    }
    const jsDuration = Date.now() - jsStart;

    console.log(`   Duration: ${formatDuration(jsDuration)}`);
    console.log(`   Placed: ${jsResult.placements.length}/${stickers.length}`);
    console.log(`   Utilization: ${jsResult.utilization.toFixed(1)}%`);

    // Run C++ implementation
    console.log('\n🟦 C++ Implementation:');
    const cppStart = Date.now();
    let cppResult;
    try {
      cppResult = await cppPacker.packStickers(stickers, {
        sheetWidth,
        sheetHeight,
        spacing,
        allowRotation: true,
        timeout: 60000,
      });
    } catch (e: any) {
      console.error('   ❌ Failed:', e.message);
      continue;
    }
    const cppDuration = Date.now() - cppStart;

    console.log(`   Duration: ${formatDuration(cppDuration)}`);
    console.log(`   Placed: ${cppResult.placements.length}/${stickers.length}`);
    console.log(`   Utilization: ${cppResult.utilization.toFixed(1)}%`);

    // Calculate speedup
    const speedup = jsDuration / cppDuration;
    console.log(`\n🚀 Speedup: ${speedup.toFixed(2)}× faster`);

    if (speedup > 1) {
      console.log(`   Time saved: ${formatDuration(jsDuration - cppDuration)}`);
    }

    results.push({
      testCase: testCase.name,
      stickerCount: testCase.count,
      jsDuration,
      cppDuration,
      speedup,
      jsPlaced: jsResult.placements.length,
      cppPlaced: cppResult.placements.length,
      jsUtilization: jsResult.utilization,
      cppUtilization: cppResult.utilization,
    });
  }

  // Summary table
  console.log('\n\n╔═══════════════════════════════════════════════════╗');
  console.log('║  BENCHMARK SUMMARY                                ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  console.log('┌────────────────────┬──────────┬──────────┬──────────┐');
  console.log('│ Test Case          │ JS Time  │ C++ Time │ Speedup  │');
  console.log('├────────────────────┼──────────┼──────────┼──────────┤');

  for (const result of results) {
    console.log(
      `│ ${result.testCase.padEnd(18)} │ ${formatDuration(result.jsDuration).padStart(8)} │ ${formatDuration(result.cppDuration).padStart(8)} │ ${(result.speedup.toFixed(2) + '×').padStart(8)} │`
    );
  }

  console.log('└────────────────────┴──────────┴──────────┴──────────┘\n');

  // Average speedup
  const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
  console.log(`Average speedup: ${avgSpeedup.toFixed(2)}× faster\n`);

  // Recommendations
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  RECOMMENDATIONS                                  ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  if (avgSpeedup >= 5) {
    console.log('✅ Excellent performance gain!');
    console.log('   Recommend using C++ packer for all production workloads.\n');
  } else if (avgSpeedup >= 2) {
    console.log('✅ Good performance gain.');
    console.log('   Recommend using C++ packer for medium-large jobs.\n');
  } else {
    console.log('⚠️  Modest performance gain.');
    console.log('   Consider if deployment complexity is worth the speedup.\n');
  }

  console.log('Next steps:');
  console.log('  1. Test with real sticker data');
  console.log('  2. Verify packing quality matches JS implementation');
  console.log('  3. Monitor memory usage in production');
  console.log('  4. Consider Option 2 (N-API) if even faster performance needed\n');
}

// Run if executed directly
if (require.main === module) {
  runBenchmark()
    .then(() => {
      console.log('✅ Benchmark complete!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark failed:', error);
      process.exit(1);
    });
}

export { runBenchmark };
