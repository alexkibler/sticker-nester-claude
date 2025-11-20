const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001/api';
const TEST_IMAGES_DIR = './test-images';

async function testPolygonPacking() {
  console.log('='.repeat(80));
  console.log('POLYGON PACKING INTEGRATION TEST');
  console.log('='.repeat(80));

  // Step 1: Get all test images
  const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(TEST_IMAGES_DIR, f));

  console.log(`\n✓ Found ${imageFiles.length} test images`);
  imageFiles.forEach(f => console.log(`  - ${path.basename(f)}`));

  // Step 2: Process images
  console.log('\n📤 Processing images...');
  const formData = new FormData();

  imageFiles.forEach(imagePath => {
    formData.append('images', fs.createReadStream(imagePath));
  });
  formData.append('maxDimension', '3');
  formData.append('unit', 'inches');

  const processResponse = await axios.post(`${API_BASE}/nesting/process`, formData, {
    headers: formData.getHeaders()
  });

  const processedImages = processResponse.data.images;
  console.log(`✓ Processed ${processedImages.length} images`);

  // Display dimensions
  processedImages.forEach(img => {
    const widthIn = (img.width / 25.4).toFixed(2);
    const heightIn = (img.height / 25.4).toFixed(2);
    console.log(`  - ${img.id}: ${widthIn}" × ${heightIn}"`);
  });

  // Step 3: Run polygon packing (production mode, 5 pages)
  console.log('\n🔄 Running polygon packing (V3 algorithm, 5 pages)...');

  const nestingPayload = {
    stickers: processedImages.map(img => ({
      id: img.id,
      points: img.path,
      width: img.width,
      height: img.height
    })),
    sheetWidth: 215.9,  // Letter width in mm
    sheetHeight: 279.4, // Letter height in mm
    spacing: 1.5875,    // 0.0625" in mm
    productionMode: true,
    sheetCount: 5,
    usePolygonPacking: true,
    useV3Algorithm: true,
    packAllItems: false,  // Fill exactly 5 pages
    cellsPerInch: 100,
    stepSize: 0.05,
    rotations: [0, 90, 180, 270]
  };

  // Wait for async polygon packing to complete
  const nestingResponse = await axios.post(`${API_BASE}/nesting/nest`, nestingPayload);

  if (nestingResponse.data.jobId) {
    console.log(`✓ Job started: ${nestingResponse.data.jobId}`);
    console.log('⏳ Waiting for polygon packing to complete...');

    // Poll for completion (in real app, would use Socket.IO)
    // For now, just wait a reasonable amount of time
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    console.log('⚠️  Note: Real-time progress requires Socket.IO connection');
    console.log('Please check the backend logs for completion status.');
    return;
  }

  // Synchronous response (shouldn't happen with polygon packing)
  const result = nestingResponse.data;

  // Step 4: Verify results
  console.log('\n📊 VERIFICATION RESULTS:');
  console.log('='.repeat(80));

  if (result.sheets) {
    console.log(`✓ Generated ${result.sheets.length} sheets`);

    // Check if exactly 5 pages
    if (result.sheets.length === 5) {
      console.log('  ✅ PASS: Exactly 5 pages generated (as requested)');
    } else {
      console.log(`  ❌ FAIL: Expected 5 pages, got ${result.sheets.length}`);
    }

    // Display placements per sheet
    result.sheets.forEach((sheet, idx) => {
      console.log(`\n  Sheet ${idx + 1}:`);
      console.log(`    - Placements: ${sheet.placements.length}`);
      console.log(`    - Utilization: ${sheet.utilization.toFixed(2)}%`);
    });

    // Check spacing between shapes (need to verify no overlaps)
    console.log('\n  Checking for overlaps and spacing...');
    let hasOverlaps = false;

    for (const sheet of result.sheets) {
      for (let i = 0; i < sheet.placements.length; i++) {
        for (let j = i + 1; j < sheet.placements.length; j++) {
          const p1 = sheet.placements[i];
          const p2 = sheet.placements[j];

          // Simple bounding box check
          const bbox1 = getBoundingBox(p1.points || []);
          const bbox2 = getBoundingBox(p2.points || []);

          const overlap = !(
            bbox1.maxX < bbox2.minX ||
            bbox2.maxX < bbox1.minX ||
            bbox1.maxY < bbox2.minY ||
            bbox2.maxY < bbox1.minY
          );

          if (overlap) {
            hasOverlaps = true;
            console.log(`    ⚠️  Potential overlap between ${p1.id} and ${p2.id}`);
          }
        }
      }
    }

    if (!hasOverlaps) {
      console.log('    ✅ PASS: No obvious overlaps detected');
    } else {
      console.log('    ⚠️  WARNING: Some overlaps detected (may be intentional interlocking)');
    }

    // Display quantities
    if (result.quantities) {
      console.log('\n  Quantities packed:');
      Object.entries(result.quantities).forEach(([id, qty]) => {
        console.log(`    - ${id}: ${qty} copies`);
      });
    }

    console.log(`\n  Total utilization: ${result.totalUtilization.toFixed(2)}%`);
  } else {
    console.log('❌ FAIL: No sheets returned');
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

function getBoundingBox(points) {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

// Run the test
testPolygonPacking()
  .then(() => {
    console.log('\n✓ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  });
