/**
 * Test Fixed-Pages Mode (Fail-Fast)
 *
 * This test demonstrates the smart packing mode where the algorithm
 * detects early if items won't fit in the requested number of pages
 * and fails fast to avoid wasting time.
 *
 * Scenario:
 * - User uploads 30 stickers
 * - User requests 1 page (intentionally insufficient)
 * - System detects insufficient space upfront
 * - Throws error BEFORE attempting expensive packing
 *
 * Expected behavior:
 * - Space estimation detects insufficient pages
 * - Error thrown immediately with helpful message
 * - No time wasted on futile packing attempts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = 'http://localhost:3001';
const OUTPUT_DIR = path.join(__dirname, 'screenshots', 'fixed-pages');

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

interface SheetPlacement {
  sheetIndex: number;
  placements: Placement[];
  utilization: number;
}

interface MultiSheetResult {
  sheets: SheetPlacement[];
  totalUtilization: number;
  quantities: { [stickerId: string]: number };
  message?: string;
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
 * Create test stickers - 30 diverse shapes
 */
function createTestStickers(): Sticker[] {
  const MM_PER_INCH = 25.4;
  const stickers: Sticker[] = [];

  // Create 5-pointed stars
  const createStar = (id: string, size: number): Sticker => {
    const starPoints: Point[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
      const radius = i % 2 === 0 ? size : size * 0.4;
      starPoints.push({
        x: size + Math.cos(angle) * radius,
        y: size + Math.sin(angle) * radius,
      });
    }
    return { id, points: starPoints, width: size * 2, height: size * 2 };
  };

  // Create hexagons
  const createHexagon = (id: string, size: number): Sticker => {
    const hexPoints: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      hexPoints.push({
        x: size + Math.cos(angle) * size,
        y: size + Math.sin(angle) * size,
      });
    }
    return { id, points: hexPoints, width: size * 2, height: size * 2 };
  };

  // Create pentagons
  const createPentagon = (id: string, size: number): Sticker => {
    const pentPoints: Point[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      pentPoints.push({
        x: size + Math.cos(angle) * size,
        y: size + Math.sin(angle) * size,
      });
    }
    return { id, points: pentPoints, width: size * 2, height: size * 2 };
  };

  // Create 30 stickers with varying sizes (0.75" - 1.0")
  const sizes = [0.75, 0.85, 0.95, 1.0];

  // 10 stars
  for (let i = 0; i < 10; i++) {
    const size = sizes[i % sizes.length] * MM_PER_INCH;
    stickers.push(createStar(`star-${i + 1}`, size));
  }

  // 10 hexagons
  for (let i = 0; i < 10; i++) {
    const size = sizes[i % sizes.length] * MM_PER_INCH;
    stickers.push(createHexagon(`hexagon-${i + 1}`, size));
  }

  // 10 pentagons
  for (let i = 0; i < 10; i++) {
    const size = sizes[i % sizes.length] * MM_PER_INCH;
    stickers.push(createPentagon(`pentagon-${i + 1}`, size));
  }

  console.log(`Created ${stickers.length} test stickers`);

  return stickers;
}

/**
 * Call nesting API with fixed-pages mode
 */
async function callFixedPages(
  stickers: Sticker[],
  requestedPages: number
): Promise<{ result?: MultiSheetResult; error?: string; timeMs: number }> {
  const MM_PER_INCH = 25.4;

  const startTime = Date.now();

  try {
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
        productionMode: true,
        sheetCount: requestedPages,
        usePolygonPacking: true,
        cellsPerInch: 100,
        stepSize: 0.05,
        rotations: [0, 45, 90, 135, 180, 225, 270, 315], // 45° for better packing
        packAllItems: false, // FIXED PAGES MODE (fail-fast)
      }),
    });

    const timeMs = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.error, timeMs };
    }

    const result = await response.json();
    return { result, timeMs };
  } catch (error: any) {
    const timeMs = Date.now() - startTime;
    return { error: error.message, timeMs };
  }
}

/**
 * Generate SVG visualization (if partial packing succeeded)
 */
function generateSVG(
  sheets: SheetPlacement[],
  sheetWidth: number,
  sheetHeight: number,
  filename: string
): void {
  const MM_PER_INCH = 25.4;
  const sheetWidthMM = 12 * MM_PER_INCH;
  const sheetHeightMM = 12 * MM_PER_INCH;

  // Create one SVG with all sheets side-by-side
  const svgWidth = sheets.length * (sheetWidthMM + 20) + 20;
  const svgHeight = sheetHeightMM + 100;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `<text x="${svgWidth / 2}" y="30" text-anchor="middle" font-size="24" font-weight="bold">Fixed-Pages Test: ${sheets.length} Sheets</text>\n\n`;

  sheets.forEach((sheet, idx) => {
    const offsetX = 20 + idx * (sheetWidthMM + 20);
    const offsetY = 60;

    // Draw sheet boundary
    svg += `<rect x="${offsetX}" y="${offsetY}" width="${sheetWidthMM}" height="${sheetHeightMM}" fill="white" stroke="black" stroke-width="2"/>\n`;
    svg += `<text x="${offsetX + sheetWidthMM / 2}" y="${offsetY - 10}" text-anchor="middle" font-size="14">Sheet ${idx + 1} (${sheet.utilization.toFixed(1)}%)</text>\n`;

    // Draw placements
    sheet.placements.forEach(placement => {
      const cx = offsetX + placement.x;
      const cy = offsetY + placement.y;
      svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="red"/>\n`;
      svg += `<text x="${cx + 5}" y="${cy + 3}" font-size="8">${placement.id}</text>\n`;
    });
  });

  svg += `</svg>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
}

/**
 * Main test function
 */
async function runFixedPagesTest() {
  console.log('\n==========================================');
  console.log('Fixed-Pages Mode Test (Fail-Fast)');
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
    // Create 30 stickers
    const stickers = createTestStickers();

    // TEST 1: Insufficient pages (should fail fast)
    console.log('\n==========================================');
    console.log('TEST 1: Insufficient Pages (Fail-Fast)');
    console.log('==========================================\n');

    const insufficientPages = 1;
    console.log(`Test scenario:`);
    console.log(`  Items: ${stickers.length}`);
    console.log(`  Requested pages: ${insufficientPages}`);
    console.log(`  Mode: Fixed-Pages (fail-fast)\n`);

    console.log('Calling API...\n');

    const { result: result1, error: error1, timeMs: timeMs1 } = await callFixedPages(stickers, insufficientPages);

    if (error1) {
      console.log(`✅ EXPECTED: Fail-fast detected insufficient space`);
      console.log(`   Error message: "${error1}"`);
      console.log(`   Time to fail: ${timeMs1}ms (very fast!)`);
    } else {
      console.error(`❌ UNEXPECTED: Should have failed but succeeded`);
    }

    // TEST 2: Sufficient pages (should succeed and pack what fits)
    console.log('\n==========================================');
    console.log('TEST 2: Sufficient Pages (Should Succeed)');
    console.log('==========================================\n');

    const sufficientPages = 3;
    console.log(`Test scenario:`);
    console.log(`  Items: ${stickers.length}`);
    console.log(`  Requested pages: ${sufficientPages}`);
    console.log(`  Mode: Fixed-Pages (no auto-expand)\n`);

    console.log('Calling API...\n');

    const { result: result2, error: error2, timeMs: timeMs2 } = await callFixedPages(stickers, sufficientPages);

    if (result2) {
      console.log(`\n✅ SUCCESS: Packing completed`);
      console.log(`   Time: ${(timeMs2 / 1000).toFixed(1)}s`);
      console.log(`   Sheets used: ${result2.sheets.length}/${sufficientPages}`);
      console.log(`   Items placed: ${Object.values(result2.quantities).reduce((a, b) => a + b, 0)}/${stickers.length}`);
      console.log(`   Total utilization: ${result2.utilization.toFixed(1)}%`);

      if (result2.message) {
        console.log(`   Message: "${result2.message}"`);
      }

      console.log('\n   Per-sheet breakdown:');
      result2.sheets.forEach(sheet => {
        console.log(`     Sheet ${sheet.sheetIndex + 1}: ${sheet.placements.length} items (${sheet.utilization.toFixed(1)}%)`);
      });

      // Verify no auto-expansion
      if (result2.sheets.length <= sufficientPages) {
        console.log(`\n   ✅ No auto-expansion (stayed within ${sufficientPages} pages as requested)`);
      } else {
        console.error(`\n   ❌ Unexpected: pages expanded beyond requested count`);
      }

      // Generate visualization
      const MM_PER_INCH = 25.4;
      generateSVG(result2.sheets, 12 * MM_PER_INCH, 12 * MM_PER_INCH, 'fixed-pages-result.svg');

      // Save results
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'test-results.json'),
        JSON.stringify({ sufficientPages, result: result2, timeMs: timeMs2 }, null, 2)
      );

      console.log(`\n   ✓ Results saved to ${OUTPUT_DIR}/`);
    } else {
      console.error(`❌ UNEXPECTED: Failed when it should have succeeded`);
      console.error(`   Error: "${error2}"`);
    }

    console.log('\n==========================================');
    console.log('SUMMARY');
    console.log('==========================================\n');

    console.log(`Test 1 (Insufficient): ${error1 ? '✅ Fail-fast worked' : '❌ Failed to detect'}`);
    console.log(`Test 2 (Sufficient): ${result2 ? '✅ Packing succeeded' : '❌ Unexpected failure'}`);

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
runFixedPagesTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
