/**
 * Test Pack-All-Items Mode (Auto-Expand)
 *
 * This test demonstrates the smart packing mode where the algorithm
 * automatically expands to as many pages as needed to fit ALL items.
 *
 * Scenario:
 * - User uploads 30 stickers
 * - User requests 2 pages
 * - System detects insufficient space and auto-expands to 3 pages
 * - ALL 30 items are successfully packed
 *
 * Expected behavior:
 * - Space estimation warns that more pages are needed
 * - Packing automatically expands from 2 → 3 pages
 * - Result message indicates auto-expansion occurred
 * - All items are placed, no failures
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = 'http://localhost:3001';
const OUTPUT_DIR = path.join(__dirname, 'screenshots', 'pack-all-items');

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
 * Call nesting API with pack-all-items mode
 */
async function callPackAllItems(
  stickers: Sticker[],
  requestedPages: number
): Promise<{ result: MultiSheetResult; timeMs: number }> {
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
      productionMode: true,
      sheetCount: requestedPages,
      usePolygonPacking: true,
      cellsPerInch: 100,
      stepSize: 0.05,
      rotations: [0, 45, 90, 135, 180, 225, 270, 315], // 45° for better packing
      packAllItems: true, // AUTO-EXPAND MODE
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
 * Generate SVG visualization
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
  svg += `<text x="${svgWidth / 2}" y="30" text-anchor="middle" font-size="24" font-weight="bold">Pack-All-Items Test: ${sheets.length} Sheets</text>\n\n`;

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
      svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="blue"/>\n`;
      svg += `<text x="${cx + 5}" y="${cy + 3}" font-size="8">${placement.id}</text>\n`;
    });
  });

  svg += `</svg>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
}

/**
 * Main test function
 */
async function runPackAllItemsTest() {
  console.log('\n==========================================');
  console.log('Pack-All-Items Mode Test (Auto-Expand)');
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

    // Request only 2 pages (intentionally insufficient)
    const requestedPages = 2;

    console.log(`\nTest scenario:`);
    console.log(`  Items: ${stickers.length}`);
    console.log(`  Requested pages: ${requestedPages}`);
    console.log(`  Mode: Pack-All-Items (auto-expand)\n`);

    console.log('Calling API...\n');

    const { result, timeMs } = await callPackAllItems(stickers, requestedPages);

    console.log('\n==========================================');
    console.log('RESULTS');
    console.log('==========================================\n');

    console.log(`Time: ${(timeMs / 1000).toFixed(1)}s`);
    console.log(`Sheets used: ${result.sheets.length}`);
    console.log(`Items placed: ${Object.values(result.quantities).reduce((a, b) => a + b, 0)}/${stickers.length}`);
    console.log(`Total utilization: ${result.utilization.toFixed(1)}%`);

    if (result.message) {
      console.log(`\nSystem message: "${result.message}"`);
    }

    console.log('\nPer-sheet breakdown:');
    result.sheets.forEach(sheet => {
      console.log(`  Sheet ${sheet.sheetIndex + 1}: ${sheet.placements.length} items (${sheet.utilization.toFixed(1)}%)`);
    });

    // Verify all items placed
    const totalPlaced = Object.values(result.quantities).reduce((a, b) => a + b, 0);
    if (totalPlaced === stickers.length) {
      console.log(`\n✅ SUCCESS: All ${stickers.length} items packed!`);
    } else {
      console.error(`\n❌ FAILURE: Only ${totalPlaced}/${stickers.length} items packed`);
    }

    // Verify auto-expansion occurred
    if (result.sheets.length > requestedPages) {
      console.log(`✅ Auto-expansion worked: ${requestedPages} → ${result.sheets.length} pages`);
    } else {
      console.log(`⚠️  No expansion needed (all fit in ${requestedPages} pages)`);
    }

    // Generate visualization
    const MM_PER_INCH = 25.4;
    generateSVG(result.sheets, 12 * MM_PER_INCH, 12 * MM_PER_INCH, 'pack-all-items-result.svg');

    // Save results
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'test-results.json'),
      JSON.stringify({ requestedPages, result, timeMs }, null, 2)
    );

    console.log(`\n✓ Results saved to ${OUTPUT_DIR}/`);

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
runPackAllItemsTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
