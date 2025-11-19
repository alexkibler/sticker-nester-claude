#!/usr/bin/env tsx

import { readdir, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EPSILON = 0.001; // 0.001 inches tolerance
const API_URL = 'http://localhost:3001/api';
const TEST_IMAGES_DIR = resolve(join(__dirname, '../test-images'));
const SHEET_COUNT = 5;
const SHEET_WIDTH = 12;
const SHEET_HEIGHT = 12;
const SPACING = 0.0625;

interface Sticker {
  id: string;
  path: Array<{ x: number; y: number }>;
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

interface PlacementWithSize extends Placement {
  width: number;
  height: number;
}

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  placement: PlacementWithSize;
}

interface OverlapReport {
  sheetIndex: number;
  placement1: PlacementWithSize;
  placement2: PlacementWithSize;
  overlapArea: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Convert placement to Axis-Aligned Bounding Box
 */
function getAABB(placement: PlacementWithSize): AABB {
  const { x, y, width, height, rotation } = placement;

  // For 90° and 270° rotations, width and height are swapped
  const isRotated90or270 = rotation === 90 || rotation === 270;
  const effectiveWidth = isRotated90or270 ? height : width;
  const effectiveHeight = isRotated90or270 ? width : height;

  return {
    minX: x,
    minY: y,
    maxX: x + effectiveWidth,
    maxY: y + effectiveHeight,
    placement
  };
}

/**
 * Check if two AABBs overlap with epsilon tolerance
 */
function checkOverlap(aabb1: AABB, aabb2: AABB): boolean {
  const noOverlapX = aabb1.maxX <= aabb2.minX + EPSILON || aabb2.maxX <= aabb1.minX + EPSILON;
  const noOverlapY = aabb1.maxY <= aabb2.minY + EPSILON || aabb2.maxY <= aabb1.minY + EPSILON;

  return !(noOverlapX || noOverlapY);
}

/**
 * Get overlap area for reporting
 */
function getOverlapArea(aabb1: AABB, aabb2: AABB): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.max(aabb1.minX, aabb2.minX),
    minY: Math.max(aabb1.minY, aabb2.minY),
    maxX: Math.min(aabb1.maxX, aabb2.maxX),
    maxY: Math.min(aabb1.maxY, aabb2.maxY)
  };
}

/**
 * Detect overlaps in a sheet's placements
 */
function detectOverlaps(sheet: SheetPlacement, stickers: Sticker[]): OverlapReport[] {
  const overlaps: OverlapReport[] = [];

  // Create a map for quick sticker lookup
  const stickerMap = new Map<string, Sticker>();
  stickers.forEach(s => stickerMap.set(s.id, s));

  // Add dimensions to placements
  const placementsWithSize: PlacementWithSize[] = sheet.placements.map(p => {
    // Strip instance suffix (_0, _1, etc) to get original sticker ID
    const originalId = p.id.replace(/_\d+$/, '');
    const sticker = stickerMap.get(originalId);

    if (!sticker) {
      throw new Error(`Could not find sticker data for placement ID: ${p.id} (original: ${originalId})`);
    }

    return {
      ...p,
      width: sticker.width,
      height: sticker.height
    };
  });

  const aabbs = placementsWithSize.map(getAABB);

  // Check all pairs
  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      if (checkOverlap(aabbs[i], aabbs[j])) {
        overlaps.push({
          sheetIndex: sheet.sheetIndex,
          placement1: aabbs[i].placement,
          placement2: aabbs[j].placement,
          overlapArea: getOverlapArea(aabbs[i], aabbs[j])
        });
      }
    }
  }

  return overlaps;
}

/**
 * Upload images to the backend API
 */
async function uploadImages(imageFiles: string[]): Promise<Sticker[]> {
  console.log(`📤 Uploading ${imageFiles.length} test images to backend API...`);

  const form = new FormData();

  for (const file of imageFiles) {
    const buffer = await readFile(file);
    const filename = file.split('/').pop()!;
    form.append('images', buffer, filename);
  }

  const response = await fetch(`${API_URL}/nesting/process`, {
    method: 'POST',
    body: form as any,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload images: ${response.statusText}`);
  }

  const data: any = await response.json();
  console.log(`✅ Processed ${data.images.length} images`);

  return data.images.map((img: any) => ({
    id: img.id,
    path: img.path,
    width: img.width,
    height: img.height
  }));
}

/**
 * Run nesting algorithm via backend API
 */
async function runNesting(stickers: Sticker[]): Promise<MultiSheetResult> {
  console.log(`🎯 Running nesting algorithm (${SHEET_COUNT} sheets)...`);

  const response = await fetch(`${API_URL}/nesting/nest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stickers,
      sheetWidth: SHEET_WIDTH,
      sheetHeight: SHEET_HEIGHT,
      spacing: SPACING,
      productionMode: true,
      sheetCount: SHEET_COUNT,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to run nesting: ${response.statusText}`);
  }

  const result: MultiSheetResult = await response.json() as MultiSheetResult;
  console.log(`✅ Nesting complete`);
  console.log(`   Total sheets: ${result.sheets.length}`);
  console.log(`   Total placements: ${result.sheets.reduce((sum, s) => sum + s.placements.length, 0)}`);
  console.log(`   Total utilization: ${result.totalUtilization.toFixed(1)}%`);

  return result;
}

/**
 * Main verification function
 */
async function verifyBackend(): Promise<void> {
  console.log('🚀 Starting Backend Collision Verification\n');
  console.log(`Configuration:`);
  console.log(`  - API URL: ${API_URL}`);
  console.log(`  - Test Images: ${TEST_IMAGES_DIR}`);
  console.log(`  - Sheet Count: ${SHEET_COUNT}`);
  console.log(`  - Sheet Size: ${SHEET_WIDTH}" × ${SHEET_HEIGHT}"`);
  console.log(`  - Spacing: ${SPACING}"`);
  console.log(`  - Epsilon Tolerance: ${EPSILON} inches\n`);

  // Get test image files
  const imageFiles = (await readdir(TEST_IMAGES_DIR))
    .filter(file => file.match(/\.(png|jpg|jpeg)$/i))
    .map(file => join(TEST_IMAGES_DIR, file));

  console.log(`Found ${imageFiles.length} test images\n`);

  if (imageFiles.length === 0) {
    throw new Error('No test images found in test-images directory');
  }

  try {
    // Upload images
    const stickers = await uploadImages(imageFiles);
    console.log('');

    // Run nesting
    const result = await runNesting(stickers);
    console.log('');

    // Analyze for overlaps
    console.log('🔍 Analyzing placements for overlaps...\n');

    let totalOverlaps = 0;
    const allOverlaps: OverlapReport[] = [];

    for (const sheet of result.sheets) {
      const overlaps = detectOverlaps(sheet, stickers);
      totalOverlaps += overlaps.length;
      allOverlaps.push(...overlaps);

      if (overlaps.length > 0) {
        console.log(`❌ Sheet ${sheet.sheetIndex}: Found ${overlaps.length} overlap(s)`);

        for (const overlap of overlaps) {
          console.log(`\n  Overlap Details:`);
          console.log(`    Placement 1: ${overlap.placement1.id}`);
          console.log(`      Position: (${overlap.placement1.x.toFixed(3)}", ${overlap.placement1.y.toFixed(3)}")`);
          console.log(`      Size: ${overlap.placement1.width.toFixed(3)}" × ${overlap.placement1.height.toFixed(3)}"`);
          console.log(`      Rotation: ${overlap.placement1.rotation}°`);

          console.log(`    Placement 2: ${overlap.placement2.id}`);
          console.log(`      Position: (${overlap.placement2.x.toFixed(3)}", ${overlap.placement2.y.toFixed(3)}")`);
          console.log(`      Size: ${overlap.placement2.width.toFixed(3)}" × ${overlap.placement2.height.toFixed(3)}"`);
          console.log(`      Rotation: ${overlap.placement2.rotation}°`);

          console.log(`    Overlap Area:`);
          console.log(`      X: ${overlap.overlapArea.minX.toFixed(3)}" to ${overlap.overlapArea.maxX.toFixed(3)}"`);
          console.log(`      Y: ${overlap.overlapArea.minY.toFixed(3)}" to ${overlap.overlapArea.maxY.toFixed(3)}"`);
          console.log(`      Width: ${(overlap.overlapArea.maxX - overlap.overlapArea.minX).toFixed(3)}"`);
          console.log(`      Height: ${(overlap.overlapArea.maxY - overlap.overlapArea.minY).toFixed(3)}"`);
        }
      } else {
        console.log(`✅ Sheet ${sheet.sheetIndex}: No overlaps detected`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📋 VERIFICATION SUMMARY`);
    console.log(`  Total Sheets: ${result.sheets.length}`);
    console.log(`  Total Placements: ${result.sheets.reduce((sum, s) => sum + s.placements.length, 0)}`);
    console.log(`  Total Overlaps: ${totalOverlaps}`);
    console.log(`  Epsilon Tolerance: ${EPSILON} inches`);

    if (totalOverlaps === 0) {
      console.log(`\n✅ COLLISION TEST PASSED: No overlaps detected!`);
      console.log(`\n🎉 The MaxRects packing algorithm with dimension inflation is working correctly!`);
    } else {
      console.log(`\n❌ COLLISION TEST FAILED: ${totalOverlaps} overlap(s) detected!`);
      console.log(`\n🔧 This indicates the collision bug is NOT fixed`);
      process.exit(1);
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    throw error;
  }
}

// Run verification
verifyBackend().catch((error) => {
  console.error('\n❌ Verification failed:', error);
  process.exit(1);
});
