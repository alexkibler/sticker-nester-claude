#!/usr/bin/env tsx

import puppeteer, { Page } from 'puppeteer';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';

const EPSILON = 0.001; // 0.001 inches tolerance for floating-point errors
const APP_URL = 'http://localhost:4201';
const TEST_IMAGES_DIR = resolve(join(import.meta.dirname || __dirname, '../test-images'));
const SHEET_COUNT = 5;

interface Placement {
  x: number;
  y: number;
  rotation: number;
  id: string;
}

interface StickerData {
  id: string;
  width: number;
  height: number;
}

interface PlacementWithSize extends Placement {
  width: number;
  height: number;
}

interface SheetPlacement {
  sheetIndex: number;
  placements: Placement[];
  utilization?: number;
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

  // For 0° and 180° rotations, AABB is straightforward
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
  // No overlap if one is completely to the left/right/above/below the other
  // Using epsilon tolerance to ignore floating-point errors
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
function detectOverlaps(sheet: SheetPlacement, stickers: StickerData[]): OverlapReport[] {
  const overlaps: OverlapReport[] = [];

  // Create a map for quick sticker lookup
  const stickerMap = new Map<string, StickerData>();
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
 * Upload files to the application
 */
async function uploadFiles(page: Page, files: string[]): Promise<void> {
  console.log(`📤 Uploading ${files.length} test images...`);

  // Find the file input element (it's hidden but we can interact with it)
  const fileInput = await page.$('input[type="file"][multiple]');

  if (!fileInput) {
    throw new Error('Could not find file input element');
  }

  // Upload all files at once
  await fileInput.uploadFile(...files);

  console.log('✅ Files uploaded, waiting for processing...');

  // Wait for processing to complete (look for the "Start Nesting" button to be enabled)
  await page.waitForFunction(
    () => {
      const button = document.querySelector('button.btn-primary') as HTMLButtonElement;
      return button && !button.disabled;
    },
    { timeout: 60000 }
  );

  console.log('✅ Image processing complete');
}

/**
 * Configure the application for production mode
 */
async function configureProductionMode(page: Page, sheetCount: number): Promise<void> {
  console.log(`⚙️  Configuring production mode with ${sheetCount} sheets...`);

  // Check the production mode checkbox
  const productionCheckbox = await page.$('input[type="checkbox"].checkbox-input');
  if (!productionCheckbox) {
    throw new Error('Could not find production mode checkbox');
  }

  // Check if it's already checked
  const isChecked = await page.evaluate(
    (el) => (el as HTMLInputElement).checked,
    productionCheckbox
  );

  if (!isChecked) {
    await productionCheckbox.click();
    // Wait a bit for the UI to update
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Set the sheet count
  const sheetCountInput = await page.$('input[type="number"][min="1"][max="100"]');
  if (!sheetCountInput) {
    throw new Error('Could not find sheet count input');
  }

  await sheetCountInput.click({ clickCount: 3 }); // Select all
  await sheetCountInput.type(sheetCount.toString());

  console.log('✅ Production mode configured');
}

/**
 * Start nesting and wait for completion
 */
async function startNesting(page: Page): Promise<void> {
  console.log('🎯 Starting nesting algorithm...');

  // Click the "Start Nesting" button
  const nestButton = await page.waitForSelector('button.btn-primary:not([disabled])');
  if (!nestButton) {
    throw new Error('Could not find enabled Start Nesting button');
  }

  await nestButton.click();

  console.log('⏳ Waiting for nesting to complete...');

  // Wait for the "Export PDF" button to be enabled (indicates nesting is done)
  await page.waitForFunction(
    () => {
      const exportButton = document.querySelector('button.btn-success') as HTMLButtonElement;
      return exportButton && !exportButton.disabled;
    },
    { timeout: 120000 } // 2 minutes timeout
  );

  // Give Angular a moment to update the component state
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('✅ Nesting complete');
}

/**
 * Extract placement data from the Angular app
 */
async function extractPlacements(page: Page): Promise<{ sheets: SheetPlacement[]; stickers: StickerData[] }> {
  console.log('📊 Extracting placement data from Angular app...');

  // First, let's debug what's available
  const debugInfo = await page.evaluate(() => {
    const appRoot = document.querySelector('app-root');
    const ng = (window as any).ng;

    return {
      hasAppRoot: !!appRoot,
      hasNg: !!ng,
      hasNgGetComponent: !!(ng && ng.getComponent),
      hasNgProbe: !!(ng && ng.probe),
      hasContext: !!(appRoot && (appRoot as any).__ngContext__),
      contextType: appRoot ? typeof (appRoot as any).__ngContext__ : 'N/A',
      contextIsArray: appRoot ? Array.isArray((appRoot as any).__ngContext__) : false
    };
  });

  console.log('Debug info:', debugInfo);

  const result = await page.evaluate(() => {
    // Access the Angular component instance
    const appRoot = document.querySelector('app-root');
    if (!appRoot) {
      throw new Error('Could not find app-root element');
    }

    // Try multiple methods to access the component
    let component;
    let methodUsed = 'none';

    // Method 1: Try ng.getComponent (modern Angular)
    const ng = (window as any).ng;
    if (ng && ng.getComponent) {
      try {
        component = ng.getComponent(appRoot);
        methodUsed = 'ng.getComponent';
      } catch (e) {
        // Continue to next method
      }
    }

    // Method 2: Try accessing via __ngContext__
    if (!component) {
      const context = (appRoot as any).__ngContext__;
      if (Array.isArray(context)) {
        // Try to find the component in the context array
        for (let i = 0; i < context.length; i++) {
          const item = context[i];
          if (item && typeof item === 'object' && 'sheets' in item) {
            component = item;
            methodUsed = `__ngContext__[${i}]`;
            break;
          }
        }
      }
    }

    // Method 3: Try ng.probe (older Angular versions)
    if (!component && ng && ng.probe) {
      try {
        const debugElement = ng.probe(appRoot);
        component = debugElement?.componentInstance;
        methodUsed = 'ng.probe';
      } catch (e) {
        // Continue
      }
    }

    if (!component) {
      throw new Error('Could not access Angular component using any method');
    }

    // Extract sticker dimensions
    const stickers = (component.stickers || []).map((s: any) => ({
      id: s.id || s.file?.name,
      width: s.inputDimensions?.width || s.width,
      height: s.inputDimensions?.height || s.height
    }));

    // Return diagnostic info
    return {
      methodUsed,
      componentKeys: Object.keys(component),
      hasSheets: 'sheets' in component,
      sheetsType: typeof component.sheets,
      sheetsIsArray: Array.isArray(component.sheets),
      sheetsLength: component.sheets?.length,
      stickersLength: stickers.length,
      sheets: component.sheets,
      stickers
    };
  });

  console.log('Component extraction result:');
  console.log(`  Method: ${result.methodUsed}`);
  console.log(`  Has sheets: ${result.hasSheets}`);
  console.log(`  Sheets type: ${result.sheetsType}`);
  console.log(`  Is array: ${result.sheetsIsArray}`);
  console.log(`  Sheets: ${result.sheetsLength}, Stickers: ${result.stickersLength}`);

  const sheets = result.sheets;
  const stickers = result.stickers;

  if (!sheets || !Array.isArray(sheets)) {
    console.log('⚠️  Warning: sheets data is not available');
    console.log(`  Available component keys: ${result.componentKeys.join(', ')}`);
    return { sheets: [], stickers: [] };
  }

  console.log(`✅ Extracted ${sheets.length} sheets and ${stickers.length} stickers`);

  return { sheets, stickers };
}

/**
 * Take screenshots of each sheet
 */
async function takeScreenshots(page: Page, sheetCount: number): Promise<void> {
  console.log('📸 Taking screenshots...');

  // For now, just take a screenshot of the current view
  // In the future, we could navigate through sheets if there's pagination
  await page.screenshot({
    path: 'layout-debug-full.png',
    fullPage: true
  });

  console.log('✅ Screenshot saved as layout-debug-full.png');
}

/**
 * Main verification function
 */
async function verifyLayout(): Promise<void> {
  console.log('🚀 Starting Mosaic Layout Verification\n');
  console.log(`Configuration:`);
  console.log(`  - App URL: ${APP_URL}`);
  console.log(`  - Test Images: ${TEST_IMAGES_DIR}`);
  console.log(`  - Sheet Count: ${SHEET_COUNT}`);
  console.log(`  - Epsilon Tolerance: ${EPSILON} inches\n`);

  // Get test image files
  const imageFiles = (await readdir(TEST_IMAGES_DIR))
    .filter(file => file.match(/\.(png|jpg|jpeg)$/i))
    .map(file => join(TEST_IMAGES_DIR, file));

  console.log(`Found ${imageFiles.length} test images\n`);

  if (imageFiles.length === 0) {
    throw new Error('No test images found in test-images directory');
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });

  try {
    const page = await browser.newPage();

    // Navigate to app
    console.log('🌐 Navigating to application...');
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    console.log('✅ Application loaded\n');

    // Upload files
    await uploadFiles(page, imageFiles);
    console.log('');

    // Configure production mode
    await configureProductionMode(page, SHEET_COUNT);
    console.log('');

    // Start nesting
    await startNesting(page);
    console.log('');

    // Extract placements
    const { sheets, stickers } = await extractPlacements(page);
    console.log('');

    // Take screenshots
    await takeScreenshots(page, SHEET_COUNT);
    console.log('');

    // Analyze for overlaps
    console.log('🔍 Analyzing placements for overlaps...\n');

    let totalOverlaps = 0;
    const allOverlaps: OverlapReport[] = [];

    for (const sheet of sheets) {
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
    console.log(`  Total Sheets: ${sheets.length}`);
    console.log(`  Total Placements: ${sheets.reduce((sum, s) => sum + s.placements.length, 0)}`);
    console.log(`  Total Overlaps: ${totalOverlaps}`);
    console.log(`  Epsilon Tolerance: ${EPSILON} inches`);

    if (totalOverlaps === 0) {
      console.log(`\n✅ MATH CHECK PASSED: No overlaps detected!`);
      console.log(`📸 Visual verification: Check layout-debug-full.png`);
    } else {
      console.log(`\n❌ MATH CHECK FAILED: ${totalOverlaps} overlap(s) detected!`);
      console.log(`📸 Visual evidence: Check layout-debug-full.png`);
      console.log(`\n🔧 This indicates a BUG in the packing algorithm`);
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } finally {
    await browser.close();
  }
}

// Run verification
verifyLayout().catch((error) => {
  console.error('\n❌ Verification failed:', error);
  process.exit(1);
});
