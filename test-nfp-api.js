#!/usr/bin/env node
/**
 * NFP Algorithm API Test
 * Tests the edge-sliding NFP implementation via the API
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001/api';
const TEST_IMAGES_DIR = './test-images';

async function testNFP() {
  console.log('================================================================================');
  console.log('NFP ALGORITHM API TEST');
  console.log('================================================================================');

  try {
    // Step 1: Get test images
    console.log('\n📁 Loading test images...');
    const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
      .filter(f => f.endsWith('.png'))
      .slice(0, 5) // Use first 5 images for faster testing
      .map(f => path.join(TEST_IMAGES_DIR, f));

    console.log(`✓ Found ${imageFiles.length} test images`);
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

    // Step 3: Request polygon packing with NFP
    console.log('\n🔄 Running NFP polygon packing (5 pages requested)...');

    const nestingPayload = {
      stickers: processedImages.map(img => ({
        id: img.id,
        points: img.path,
        width: img.width,
        height: img.height
      })),
      sheetWidth: 215.9,
      sheetHeight: 279.4,
      spacing: 1.5875,
      productionMode: true,
      sheetCount: 5,
      usePolygonPacking: true,
      useNFP: true,
      packAllItems: false,
      rotations: [0, 90, 180, 270]
    };

    const startTime = Date.now();
    const nestingResponse = await axios.post(`${API_BASE}/nesting/nest`, nestingPayload);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (nestingResponse.data.jobId) {
      console.log(`✓ Job started: ${nestingResponse.data.jobId}`);
      console.log('⏳ Waiting for async completion...');

      // Poll for results (since we don't have Socket.IO here)
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        // In a real implementation, we'd poll a status endpoint
        // For now, just wait a reasonable time
        if (attempts >= 30) break;
      }

      console.log('\n⚠️  Async job - check backend logs for results');
      console.log(`Duration: ${duration}s`);
      return;
    }

    // Synchronous response
    const result = nestingResponse.data;
    console.log(`✓ Completed in ${duration}s`);

    // Step 4: Analyze results
    console.log('\n📊 RESULTS ANALYSIS:');
    console.log('='.repeat(80));

    const sheets = result.sheets || [];
    console.log(`\n✓ Generated ${sheets.length} sheets`);

    // Verify page count
    if (sheets.length === 5) {
      console.log('  ✅ PASS: Exactly 5 pages generated');
    } else {
      console.log(`  ❌ FAIL: Expected 5 pages, got ${sheets.length}`);
    }

    // Analyze each sheet
    let totalPlacements = 0;
    sheets.forEach((sheet, idx) => {
      const placements = sheet.placements || [];
      totalPlacements += placements.length;

      console.log(`\nSheet ${idx + 1}:`);
      console.log(`  Placements: ${placements.length}`);
      console.log(`  Utilization: ${(sheet.utilization || 0).toFixed(1)}%`);

      // Show first few placements
      if (placements.length > 0) {
        console.log(`  First placement: ${placements[0].id} at (${(placements[0].x / 25.4).toFixed(2)}", ${(placements[0].y / 25.4).toFixed(2)}") rotation ${placements[0].rotation}°`);
      }
    });

    // Overall stats
    console.log(`\n📈 Overall Statistics:`);
    console.log(`  Total placements: ${totalPlacements}`);
    console.log(`  Average per sheet: ${(totalPlacements / sheets.length).toFixed(1)}`);
    console.log(`  Total utilization: ${(result.totalUtilization || 0).toFixed(1)}%`);

    // Quantities
    if (result.quantities) {
      console.log(`\n  Quantities packed:`);
      Object.entries(result.quantities).forEach(([id, qty]) => {
        console.log(`    - ${id}: ${qty} copies`);
      });
    }

    // Verification criteria
    console.log(`\n🎯 Verification:`);

    const criteriaMet = {
      pageCount: sheets.length === 5,
      hasPlacementssheet: sheets.every(s => (s.placements || []).length > 0),
      reasonableUtilization: (result.totalUtilization || 0) > 40,
      reasonablePlacements: totalPlacements >= 15 // At least 3 per sheet on average
    };

    Object.entries(criteriaMet).forEach(([criterion, met]) => {
      const status = met ? '✅' : '❌';
      const label = criterion.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`  ${status} ${label}`);
    });

    const allPassed = Object.values(criteriaMet).every(v => v);

    console.log('\n' + '='.repeat(80));
    if (allPassed) {
      console.log('✅ TEST PASSED - NFP Algorithm Working!');
    } else {
      console.log('❌ TEST FAILED - Issues detected');
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
testNFP();
