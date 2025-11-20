/**
 * Direct NFP test - bypasses worker threads to see console output
 */

const fs = require('fs');
const path = require('path');

// We'll need to compile the TypeScript first
const { execSync } = require('child_process');

console.log('Building TypeScript...');
try {
  execSync('cd server && npm run build', { stdio: 'inherit' });
} catch (e) {
  console.error('Build failed:', e.message);
  process.exit(1);
}

// Now import the compiled JS
const { MultiSheetNFPNester } = require('./server/dist/services/nfp-nesting.service.js');

// Load test data from previous test run
const testData = {
  polygons: [
    { id: 'test1', points: [{x: 0, y: 0}, {x: 3, y: 0}, {x: 3, y: 3}, {x: 0, y: 3}], width: 3, height: 3, area: 9 },
    { id: 'test2', points: [{x: 0, y: 0}, {x: 3, y: 0}, {x: 3, y: 3}, {x: 0, y: 3}], width: 3, height: 3, area: 9 },
  ],
  pageCount: 2,
  sheetWidth: 8.5,
  sheetHeight: 11,
  spacing: 0.0625,
  rotations: [0, 90, 180, 270]
};

console.log('\n=== Running Direct NFP Test ===\n');

Multi SheetNFPNester.nestMultiSheet(
  testData.polygons,
  testData.pageCount,
  testData.sheetWidth,
  testData.sheetHeight,
  testData.spacing,
  testData.rotations,
  false // packAllItems
).then(result => {
  console.log('\n=== RESULTS ===');
  console.log(`Sheets: ${result.sheets.length}`);
  console.log(`Total Utilization: ${result.totalUtilization.toFixed(1)}%`);
  console.log('Quantities:', result.quantities);

  result.sheets.forEach((sheet, idx) => {
    console.log(`\nSheet ${idx + 1}:`);
    console.log(`  Placements: ${sheet.placements.length}`);
    console.log(`  Utilization: ${sheet.utilization.toFixed(1)}%`);
  });

  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
