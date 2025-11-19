/**
 * Comprehensive Multi-Sheet Packing Test
 *
 * This test demonstrates:
 * - Packing dozens of stickers across multiple sheets
 * - What happens when a sheet fills up
 * - Utilization comparison between rectangle and polygon packing
 * - Visual proof via SVG screenshots for each sheet
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'multi-sheet');

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
 * Create a variety of test stickers with different shapes and sizes
 */
function createDiverseStickers(): Sticker[] {
  const MM_PER_INCH = 25.4;
  const stickers: Sticker[] = [];

  // Helper to create a star shape
  const createStar = (id: string, size: number, points: number = 5): Sticker => {
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

  // Helper to create a regular polygon
  const createPolygon = (id: string, size: number, sides: number): Sticker => {
    const polyPoints: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      polyPoints.push({
        x: size + Math.cos(angle) * size,
        y: size + Math.sin(angle) * size,
      });
    }
    return { id, points: polyPoints, width: size * 2, height: size * 2 };
  };

  // Helper to create a heart shape
  const createHeart = (id: string, size: number): Sticker => {
    const heartPoints: Point[] = [];
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x = size * (16 * Math.pow(Math.sin(t), 3));
      const y = size * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      heartPoints.push({ x: x + size * 16, y: -y + size * 13 });
    }
    return { id, points: heartPoints, width: size * 32, height: size * 26 };
  };

  // Create a diverse set of small stickers (0.75" - 1.25")
  // These sizes ensure we can pack many per sheet for good demonstration
  const sizes = [0.75, 0.875, 1.0, 1.125]; // inches

  // 10 five-pointed stars
  sizes.forEach((size, i) => {
    stickers.push(createStar(`star-5pt-${i + 1}`, size * MM_PER_INCH, 5));
  });
  stickers.push(createStar(`star-5pt-5`, 0.85 * MM_PER_INCH, 5));
  stickers.push(createStar(`star-5pt-6`, 0.95 * MM_PER_INCH, 5));

  // 6 six-pointed stars
  [0.75, 0.875, 1.0].forEach((size, i) => {
    stickers.push(createStar(`star-6pt-${i + 1}`, size * MM_PER_INCH, 6));
  });

  // 8 hexagons
  [0.75, 0.875, 1.0, 1.125].forEach((size, i) => {
    stickers.push(createPolygon(`hexagon-${i + 1}`, size * MM_PER_INCH, 6));
  });

  // 6 pentagons
  [0.75, 0.875, 1.0].forEach((size, i) => {
    stickers.push(createPolygon(`pentagon-${i + 1}`, size * MM_PER_INCH, 5));
  });

  // 6 octagons
  [0.75, 0.875, 1.0].forEach((size, i) => {
    stickers.push(createPolygon(`octagon-${i + 1}`, size * MM_PER_INCH, 8));
  });

  // 8 triangles
  [0.75, 0.875, 1.0, 1.125].forEach((size, i) => {
    stickers.push(createPolygon(`triangle-${i + 1}`, size * MM_PER_INCH, 3));
  });

  // 6 hearts
  [0.4, 0.45, 0.5].forEach((size, i) => {
    stickers.push(createHeart(`heart-${i + 1}`, size * MM_PER_INCH));
  });

  console.log(`Created ${stickers.length} diverse stickers:`);
  console.log(`  - 6 five-pointed stars (0.75" - 1.125")`);
  console.log(`  - 3 six-pointed stars (0.75" - 1.0")`);
  console.log(`  - 4 hexagons (0.75" - 1.125")`);
  console.log(`  - 3 pentagons (0.75" - 1.0")`);
  console.log(`  - 3 octagons (0.75" - 1.0")`);
  console.log(`  - 4 triangles (0.75" - 1.125")`);
  console.log(`  - 3 hearts (0.8" - 1.0")`);
  console.log(`  Total: ${stickers.length} unique designs`);
  console.log(`  Size range: 0.75" - 1.125" (good for multi-sheet packing)`);

  return stickers;
}

/**
 * Call multi-sheet nesting API
 */
async function callMultiSheetAPI(
  stickers: Sticker[],
  sheetCount: number,
  usePolygonPacking: boolean
): Promise<MultiSheetResult> {
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
      productionMode: true,
      sheetCount,
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
 * Generate SVG visualization for a single sheet
 */
function generateSheetSVG(
  stickers: Sticker[],
  placements: Placement[],
  sheetIndex: number,
  utilization: number,
  title: string,
  totalSheets: number
): string {
  const MM_PER_INCH = 25.4;
  const sheetWidthMM = 12 * MM_PER_INCH;
  const sheetHeightMM = 12 * MM_PER_INCH;

  // SVG header
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="900" xmlns="http://www.w3.org/2000/svg">
  <!-- Title -->
  <text x="400" y="30" text-anchor="middle" font-size="24" font-weight="bold">${title}</text>
  <text x="400" y="55" text-anchor="middle" font-size="18">Sheet ${sheetIndex + 1} of ${totalSheets}</text>

  <!-- Sheet background -->
  <rect x="50" y="80" width="700" height="700" fill="white" stroke="black" stroke-width="2"/>

  <!-- Placements -->
`;

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
    '#E07A5F', '#81B29A', '#F2CC8F', '#3D5A80', '#EE6C4D',
  ];

  placements.forEach((placement, index) => {
    // Extract original sticker ID (remove instance suffix like _0, _1)
    const originalId = placement.id.replace(/_\d+$/, '');
    const sticker = stickers.find(s => s.id === originalId);
    if (!sticker) return;

    // Scale to fit in 700x700 viewport
    const scale = 700 / sheetWidthMM;
    const offsetX = 50;
    const offsetY = 80;

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

    svg += `  <path d="${pathData}" fill="${colors[index % colors.length]}" fill-opacity="0.7" stroke="#333" stroke-width="1"/>\n`;
  });

  // Footer with stats
  svg += `
  <!-- Stats -->
  <text x="400" y="810" text-anchor="middle" font-size="18" font-weight="bold">Sheet Statistics</text>
  <text x="400" y="835" text-anchor="middle" font-size="16">Stickers: ${placements.length} | Utilization: ${utilization.toFixed(1)}%</text>
  <text x="400" y="860" text-anchor="middle" font-size="14">Sheet Size: 12" × 12" (304.8mm × 304.8mm)</text>
</svg>`;

  return svg;
}

/**
 * Generate comparison summary SVG
 */
function generateComparisonSVG(
  rectResult: MultiSheetResult,
  polyResult: MultiSheetResult,
  stickers: Sticker[]
): string {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1000" height="800" xmlns="http://www.w3.org/2000/svg">
  <text x="500" y="40" text-anchor="middle" font-size="28" font-weight="bold">Multi-Sheet Packing Comparison</text>
  <text x="500" y="70" text-anchor="middle" font-size="18">${stickers.length} Unique Designs</text>

  <!-- Rectangle Packing Summary -->
  <rect x="50" y="100" width="400" height="300" fill="#FFF9E6" stroke="#333" stroke-width="2"/>
  <text x="250" y="130" text-anchor="middle" font-size="22" font-weight="bold">Rectangle Packing</text>
  <text x="250" y="160" text-anchor="middle" font-size="16">(Bounding Boxes)</text>

  <text x="80" y="200" font-size="16">Sheets Used: ${rectResult.sheets.length}</text>
  <text x="80" y="230" font-size="16">Total Utilization: ${rectResult.totalUtilization.toFixed(1)}%</text>
  <text x="80" y="260" font-size="16">Total Items Packed:</text>
`;

  let rectY = 280;
  const rectQuantities = Object.entries(rectResult.quantities);
  const totalRectItems = rectQuantities.reduce((sum, [_, count]) => sum + count, 0);
  svg += `  <text x="100" y="${rectY}" font-size="14" font-weight="bold">${totalRectItems} stickers</text>\n`;
  rectY += 25;

  // Per-sheet utilization
  svg += `  <text x="80" y="${rectY}" font-size="14" font-weight="bold">Per Sheet:</text>\n`;
  rectY += 20;
  rectResult.sheets.forEach((sheet, i) => {
    svg += `  <text x="100" y="${rectY}" font-size="13">Sheet ${i + 1}: ${sheet.placements.length} items, ${sheet.utilization.toFixed(1)}%</text>\n`;
    rectY += 20;
  });

  // Polygon Packing Summary
  svg += `
  <rect x="550" y="100" width="400" height="300" fill="#E6F7FF" stroke="#333" stroke-width="2"/>
  <text x="750" y="130" text-anchor="middle" font-size="22" font-weight="bold">Polygon Packing</text>
  <text x="750" y="160" text-anchor="middle" font-size="16">(Actual Shapes)</text>

  <text x="580" y="200" font-size="16">Sheets Used: ${polyResult.sheets.length}</text>
  <text x="580" y="230" font-size="16">Total Utilization: ${polyResult.totalUtilization.toFixed(1)}%</text>
  <text x="580" y="260" font-size="16">Total Items Packed:</text>
`;

  let polyY = 280;
  const polyQuantities = Object.entries(polyResult.quantities);
  const totalPolyItems = polyQuantities.reduce((sum, [_, count]) => sum + count, 0);
  svg += `  <text x="600" y="${polyY}" font-size="14" font-weight="bold">${totalPolyItems} stickers</text>\n`;
  polyY += 25;

  // Per-sheet utilization
  svg += `  <text x="580" y="${polyY}" font-size="14" font-weight="bold">Per Sheet:</text>\n`;
  polyY += 20;
  polyResult.sheets.forEach((sheet, i) => {
    svg += `  <text x="600" y="${polyY}" font-size="13">Sheet ${i + 1}: ${sheet.placements.length} items, ${sheet.utilization.toFixed(1)}%</text>\n`;
    polyY += 20;
  });

  // Winner analysis
  const winner = totalPolyItems > totalRectItems ? 'Polygon' :
                 totalPolyItems < totalRectItems ? 'Rectangle' : 'Tie';
  const utilizationWinner = polyResult.totalUtilization > rectResult.totalUtilization ? 'Polygon' :
                            polyResult.totalUtilization < rectResult.totalUtilization ? 'Rectangle' : 'Tie';

  svg += `
  <rect x="150" y="450" width="700" height="150" fill="#F0F0F0" stroke="#333" stroke-width="2"/>
  <text x="500" y="480" text-anchor="middle" font-size="20" font-weight="bold">Analysis</text>
  <text x="500" y="510" text-anchor="middle" font-size="16">Items Packed: ${totalPolyItems} vs ${totalRectItems} (Winner: ${winner})</text>
  <text x="500" y="535" text-anchor="middle" font-size="16">Utilization: ${polyResult.totalUtilization.toFixed(1)}% vs ${rectResult.totalUtilization.toFixed(1)}% (Winner: ${utilizationWinner})</text>
  <text x="500" y="560" text-anchor="middle" font-size="16">Difference: ${Math.abs(totalPolyItems - totalRectItems)} items (${((Math.abs(totalPolyItems - totalRectItems) / totalRectItems) * 100).toFixed(1)}%)</text>
  <text x="500" y="585" text-anchor="middle" font-size="14" font-style="italic">Polygon packing uses actual shapes for better space efficiency</text>
</svg>`;

  return svg;
}

/**
 * Main test function
 */
async function runMultiSheetTest() {
  console.log('\n==========================================');
  console.log('Multi-Sheet Packing: Comprehensive Test');
  console.log('==========================================\n');

  // Create output directory
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

  // Wait for backend
  console.log('Waiting for backend...');
  const backendReady = await waitForBackend();

  if (!backendReady) {
    console.error('✗ Backend did not start in time');
    backendProcess.kill();
    process.exit(1);
  }

  try {
    // Create diverse stickers
    console.log('\nCreating diverse test stickers...');
    const stickers = createDiverseStickers();

    const SHEET_COUNT = 3;
    console.log(`\nTarget: Fill ${SHEET_COUNT} sheets (12" × 12" each)\n`);

    // Test 1: Rectangle Packing
    console.log('=== Test 1: Rectangle Packing (Baseline) ===');
    const startRect = Date.now();
    const rectResult = await callMultiSheetAPI(stickers, SHEET_COUNT, false);
    const rectTime = Date.now() - startRect;

    console.log(`✓ Rectangle packing complete (${rectTime}ms)`);
    console.log(`  Sheets used: ${rectResult.sheets.length}/${SHEET_COUNT}`);
    console.log(`  Total utilization: ${rectResult.totalUtilization.toFixed(1)}%`);

    const totalRectItems = Object.values(rectResult.quantities).reduce((sum, count) => sum + count, 0);
    console.log(`  Total items packed: ${totalRectItems}`);

    console.log(`  Per-sheet breakdown:`);
    rectResult.sheets.forEach((sheet, i) => {
      console.log(`    Sheet ${i + 1}: ${sheet.placements.length} items, ${sheet.utilization.toFixed(1)}% utilization`);
    });

    // Generate SVG for each rectangle-packed sheet
    rectResult.sheets.forEach((sheet, i) => {
      const svg = generateSheetSVG(
        stickers,
        sheet.placements,
        i,
        sheet.utilization,
        'Rectangle Packing (Bounding Boxes)',
        rectResult.sheets.length
      );
      const filename = `rect-sheet-${i + 1}.svg`;
      fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), svg);
      console.log(`  ✓ Generated: ${filename}`);
    });

    // Test 2: Polygon Packing
    console.log('\n=== Test 2: Polygon Packing (New Feature) ===');
    const startPoly = Date.now();
    const polyResult = await callMultiSheetAPI(stickers, SHEET_COUNT, true);
    const polyTime = Date.now() - startPoly;

    console.log(`✓ Polygon packing complete (${polyTime}ms)`);
    console.log(`  Sheets used: ${polyResult.sheets.length}/${SHEET_COUNT}`);
    console.log(`  Total utilization: ${polyResult.totalUtilization.toFixed(1)}%`);

    const totalPolyItems = Object.values(polyResult.quantities).reduce((sum, count) => sum + count, 0);
    console.log(`  Total items packed: ${totalPolyItems}`);

    console.log(`  Per-sheet breakdown:`);
    polyResult.sheets.forEach((sheet, i) => {
      console.log(`    Sheet ${i + 1}: ${sheet.placements.length} items, ${sheet.utilization.toFixed(1)}% utilization`);
    });

    // Generate SVG for each polygon-packed sheet
    polyResult.sheets.forEach((sheet, i) => {
      const svg = generateSheetSVG(
        stickers,
        sheet.placements,
        i,
        sheet.utilization,
        'Polygon Packing (Actual Shapes)',
        polyResult.sheets.length
      );
      const filename = `poly-sheet-${i + 1}.svg`;
      fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), svg);
      console.log(`  ✓ Generated: ${filename}`);
    });

    // Generate comparison summary
    console.log('\n=== Comparison Summary ===');
    const comparisonSVG = generateComparisonSVG(rectResult, polyResult, stickers);
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'comparison-summary.svg'), comparisonSVG);
    console.log('✓ Generated: comparison-summary.svg');

    // Detailed comparison
    console.log('\n--- Rectangle Packing ---');
    console.log(`  Sheets: ${rectResult.sheets.length}`);
    console.log(`  Items: ${totalRectItems}`);
    console.log(`  Avg utilization: ${rectResult.totalUtilization.toFixed(1)}%`);
    console.log(`  Time: ${rectTime}ms`);

    console.log('\n--- Polygon Packing ---');
    console.log(`  Sheets: ${polyResult.sheets.length}`);
    console.log(`  Items: ${totalPolyItems}`);
    console.log(`  Avg utilization: ${polyResult.totalUtilization.toFixed(1)}%`);
    console.log(`  Time: ${polyTime}ms`);

    console.log('\n--- Difference ---');
    console.log(`  Items: ${totalPolyItems - totalRectItems} (${totalPolyItems > totalRectItems ? '+' : ''}${((totalPolyItems - totalRectItems) / totalRectItems * 100).toFixed(1)}%)`);
    console.log(`  Utilization: ${(polyResult.totalUtilization - rectResult.totalUtilization).toFixed(1)}% ${polyResult.totalUtilization > rectResult.totalUtilization ? 'better' : 'worse'}`);

    // Write detailed results
    const results = {
      testDate: new Date().toISOString(),
      stickerCount: stickers.length,
      targetSheets: SHEET_COUNT,
      rectanglePacking: {
        sheets: rectResult.sheets.length,
        totalItems: totalRectItems,
        totalUtilization: rectResult.totalUtilization,
        quantities: rectResult.quantities,
        perSheet: rectResult.sheets.map((s, i) => ({
          sheet: i + 1,
          items: s.placements.length,
          utilization: s.utilization,
        })),
        timeMs: rectTime,
      },
      polygonPacking: {
        sheets: polyResult.sheets.length,
        totalItems: totalPolyItems,
        totalUtilization: polyResult.totalUtilization,
        quantities: polyResult.quantities,
        perSheet: polyResult.sheets.map((s, i) => ({
          sheet: i + 1,
          items: s.placements.length,
          utilization: s.utilization,
        })),
        timeMs: polyTime,
      },
    };

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'test-results.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('\n✓ All tests completed successfully!');
    console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
    console.log(`  - ${rectResult.sheets.length} rectangle packing sheets`);
    console.log(`  - ${polyResult.sheets.length} polygon packing sheets`);
    console.log(`  - 1 comparison summary`);
    console.log(`  - test-results.json with detailed data`);

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
runMultiSheetTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
