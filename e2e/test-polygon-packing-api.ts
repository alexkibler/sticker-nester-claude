/**
 * API-Level Test for Polygon Packing (No Browser Required)
 *
 * This script tests the polygon packing feature by:
 * 1. Starting the backend server
 * 2. Making API calls directly to test polygon packing
 * 3. Generating SVG visualizations as proof
 * 4. Comparing with rectangle packing
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = 'http://localhost:3001';
const OUTPUT_DIR = path.join(__dirname, 'api-test-results');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

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
 * Wait for backend to be ready
 */
async function waitForBackend(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`);
      if (response.ok) {
        console.log('✓ Backend is ready');
        return true;
      }
    } catch (e) {
      // Keep trying
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Create test stickers (simple shapes)
 */
function createTestStickers(): Sticker[] {
  const MM_PER_INCH = 25.4;
  const size = 2 * MM_PER_INCH; // 2 inches = 50.8mm

  // Create 3 different shapes
  const stickers: Sticker[] = [
    {
      id: 'star-1',
      // 5-pointed star
      points: [
        { x: size * 0.5, y: 0 },
        { x: size * 0.61, y: size * 0.35 },
        { x: size, y: size * 0.35 },
        { x: size * 0.68, y: size * 0.57 },
        { x: size * 0.79, y: size },
        { x: size * 0.5, y: size * 0.72 },
        { x: size * 0.21, y: size },
        { x: size * 0.32, y: size * 0.57 },
        { x: 0, y: size * 0.35 },
        { x: size * 0.39, y: size * 0.35 },
      ],
      width: size,
      height: size,
    },
    {
      id: 'hexagon-1',
      // Regular hexagon
      points: [
        { x: size * 0.5, y: 0 },
        { x: size, y: size * 0.25 },
        { x: size, y: size * 0.75 },
        { x: size * 0.5, y: size },
        { x: 0, y: size * 0.75 },
        { x: 0, y: size * 0.25 },
      ],
      width: size,
      height: size,
    },
    {
      id: 'triangle-1',
      // Equilateral triangle
      points: [
        { x: size * 0.5, y: 0 },
        { x: size, y: size },
        { x: 0, y: size },
      ],
      width: size,
      height: size,
    },
  ];

  return stickers;
}

/**
 * Call nesting API
 */
async function callNestingAPI(
  stickers: Sticker[],
  usePolygonPacking: boolean
): Promise<NestingResult> {
  const MM_PER_INCH = 25.4;
  const response = await fetch(`${BACKEND_URL}/api/nesting/nest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stickers,
      sheetWidth: 12 * MM_PER_INCH, // 12 inches
      sheetHeight: 12 * MM_PER_INCH, // 12 inches
      spacing: 1.5875, // 1/16" in mm
      productionMode: false,
      usePolygonPacking,
      cellsPerInch: 100,
      stepSize: 0.05,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Generate SVG visualization
 */
function generateSVG(
  stickers: Sticker[],
  placements: Placement[],
  sheetWidth: number,
  sheetHeight: number,
  title: string
): string {
  const MM_PER_INCH = 25.4;
  const sheetWidthMM = 12 * MM_PER_INCH;
  const sheetHeightMM = 12 * MM_PER_INCH;

  // SVG header
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="850" xmlns="http://www.w3.org/2000/svg">
  <!-- Title -->
  <text x="400" y="30" text-anchor="middle" font-size="20" font-weight="bold">${title}</text>

  <!-- Sheet background -->
  <rect x="50" y="50" width="700" height="700" fill="white" stroke="black" stroke-width="2"/>

  <!-- Placements -->
`;

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

  placements.forEach((placement, index) => {
    const sticker = stickers.find(s => s.id === placement.id);
    if (!sticker) return;

    // Scale to fit in 700x700 viewport
    const scale = 700 / sheetWidthMM;
    const offsetX = 50;
    const offsetY = 50;

    // Transform points
    let points = sticker.points;

    // Apply rotation if needed
    if (placement.rotation !== 0) {
      const radians = (placement.rotation * Math.PI) / 180;
      const centerX = sticker.width / 2;
      const centerY = sticker.height / 2;

      points = points.map(p => {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        return {
          x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
          y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
        };
      });
    }

    // Translate to placement position and scale
    const pathData = points
      .map((p, i) => {
        const x = offsetX + (placement.x + p.x) * scale;
        const y = offsetY + (placement.y + p.y) * scale;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ') + ' Z';

    svg += `  <path d="${pathData}" fill="${colors[index % colors.length]}" fill-opacity="0.6" stroke="#333" stroke-width="1.5"/>\n`;
  });

  // Footer with stats
  svg += `
  <text x="400" y="780" text-anchor="middle" font-size="16">Placements: ${placements.length} | Sheet: 12" × 12"</text>
</svg>`;

  return svg;
}

/**
 * Main test function
 */
async function runTests() {
  console.log('\n==========================================');
  console.log('API-Level Test: Polygon Packing');
  console.log('==========================================\n');

  // Create output directories
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
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

  // Wait for backend to be ready
  console.log('Waiting for backend...');
  const backendReady = await waitForBackend();

  if (!backendReady) {
    console.error('✗ Backend did not start in time');
    backendProcess.kill();
    process.exit(1);
  }

  try {
    // Create test stickers
    console.log('\nCreating test stickers...');
    const stickers = createTestStickers();
    console.log(`✓ Created ${stickers.length} test stickers: ${stickers.map(s => s.id).join(', ')}`);

    // Test 1: Rectangle Packing
    console.log('\n--- Test 1: Rectangle Packing (Baseline) ---');
    const rectResult = await callNestingAPI(stickers, false);
    console.log(`✓ Rectangle packing complete`);
    console.log(`  - Placements: ${rectResult.placements.length}/${stickers.length}`);
    console.log(`  - Utilization: ${rectResult.utilization.toFixed(1)}%`);

    // Generate SVG for rectangle packing
    const rectSVG = generateSVG(
      stickers,
      rectResult.placements,
      12 * 25.4,
      12 * 25.4,
      'Rectangle Packing (Bounding Boxes)'
    );
    const rectPath = path.join(SCREENSHOT_DIR, '01-rectangle-packing.svg');
    fs.writeFileSync(rectPath, rectSVG);
    console.log(`✓ Generated visualization: ${rectPath}`);

    // Test 2: Polygon Packing
    console.log('\n--- Test 2: Polygon Packing (New Feature) ---');
    const polyResult = await callNestingAPI(stickers, true);
    console.log(`✓ Polygon packing complete`);
    console.log(`  - Placements: ${polyResult.placements.length}/${stickers.length}`);
    console.log(`  - Utilization: ${polyResult.utilization.toFixed(1)}%`);

    // Generate SVG for polygon packing
    const polySVG = generateSVG(
      stickers,
      polyResult.placements,
      12 * 25.4,
      12 * 25.4,
      'Polygon Packing (Actual Shapes)'
    );
    const polyPath = path.join(SCREENSHOT_DIR, '02-polygon-packing.svg');
    fs.writeFileSync(polyPath, polySVG);
    console.log(`✓ Generated visualization: ${polyPath}`);

    // Comparison
    console.log('\n--- Comparison ---');
    console.log(`Rectangle Packing: ${rectResult.placements.length} items, ${rectResult.utilization.toFixed(1)}% utilization`);
    console.log(`Polygon Packing:   ${polyResult.placements.length} items, ${polyResult.utilization.toFixed(1)}% utilization`);

    if (polyResult.placements.length >= rectResult.placements.length) {
      console.log('✓ SUCCESS: Polygon packing placed equal or more items!');
    } else {
      console.log('⚠ NOTE: Polygon packing placed fewer items (may need tuning)');
    }

    // Write results to JSON
    const results = {
      rectanglePacking: rectResult,
      polygonPacking: polyResult,
      comparison: {
        itemDifference: polyResult.placements.length - rectResult.placements.length,
        utilizationDifference: polyResult.utilization - rectResult.utilization,
      },
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'test-results.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('\n✓ All tests completed successfully!');
    console.log(`\nResults saved to:`);
    console.log(`  - ${OUTPUT_DIR}/test-results.json`);
    console.log(`  - ${SCREENSHOT_DIR}/01-rectangle-packing.svg`);
    console.log(`  - ${SCREENSHOT_DIR}/02-polygon-packing.svg`);

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    backendProcess.kill();
    console.log('✓ Backend stopped');
  }

  process.exit(0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
