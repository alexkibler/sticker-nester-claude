/**
 * E2E Integration Test: Polygon Packing vs Rectangle Packing
 *
 * This test verifies that the polygon packing feature works correctly
 * by comparing it to the default rectangle packing.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

// Configuration
const FRONTEND_URL = 'http://localhost:4201';
const BACKEND_URL = 'http://localhost:3001';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TEST_IMAGES_DIR = path.join(__dirname, '..', 'test-images');

// Timeouts
const PAGE_LOAD_TIMEOUT = 30000;
const NESTING_TIMEOUT = 60000;
const UPLOAD_TIMEOUT = 30000;

interface TestResult {
  name: string;
  success: boolean;
  screenshotPath?: string;
  error?: string;
  utilization?: number;
  placementCount?: number;
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
      // Backend not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error('✗ Backend failed to start');
  return false;
}

/**
 * Wait for frontend to be ready
 */
async function waitForFrontend(page: Page, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2', timeout: 5000 });
      console.log('✓ Frontend is ready');
      return true;
    } catch (e) {
      // Frontend not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error('✗ Frontend failed to start');
  return false;
}

/**
 * Upload test images
 */
async function uploadTestImages(page: Page): Promise<void> {
  console.log('Uploading test images...');

  // Get test image files
  const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
    .filter(f => f.match(/\.(png|jpg|jpeg)$/i))
    .slice(0, 3) // Use first 3 images
    .map(f => path.join(TEST_IMAGES_DIR, f));

  if (imageFiles.length === 0) {
    throw new Error('No test images found in test-images directory');
  }

  console.log(`Found ${imageFiles.length} test images:`, imageFiles.map(f => path.basename(f)));

  // Find file input element
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    throw new Error('File input not found');
  }

  // Upload files
  await fileInput.uploadFile(...imageFiles);

  // Wait for upload progress to complete
  console.log('Waiting for upload to complete...');
  await page.waitForFunction(
    () => {
      const progressBar = document.querySelector('.progress-bar');
      return !progressBar || progressBar.textContent?.includes('100%');
    },
    { timeout: UPLOAD_TIMEOUT }
  );

  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('✓ Images uploaded successfully');
}

/**
 * Enable or disable polygon packing
 */
async function setPolygonPacking(page: Page, enabled: boolean): Promise<void> {
  const checkboxSelector = 'input[type="checkbox"][ng-reflect-name="usePolygonPacking"]';

  // Wait for checkbox to be available
  await page.waitForSelector(checkboxSelector, { timeout: 5000 });

  const checkbox = await page.$(checkboxSelector);
  if (!checkbox) {
    throw new Error('Polygon packing checkbox not found');
  }

  const isChecked = await page.$eval(checkboxSelector, (el: any) => el.checked);

  if (isChecked !== enabled) {
    await checkbox.click();
    console.log(`✓ Polygon packing ${enabled ? 'enabled' : 'disabled'}`);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Run nesting algorithm
 */
async function runNesting(page: Page): Promise<{ utilization: number; placementCount: number }> {
  console.log('Running nesting algorithm...');

  // Click "Start Nesting" button
  const nestButton = await page.waitForSelector('button:has-text("Start Nesting"):not(:disabled)', {
    timeout: 5000
  });

  if (!nestButton) {
    throw new Error('Start Nesting button not found or disabled');
  }

  await nestButton.click();

  // Wait for nesting to complete
  console.log('Waiting for nesting to complete...');
  await page.waitForFunction(
    () => {
      const button = document.querySelector('button');
      return button && !button.textContent?.includes('Nesting...');
    },
    { timeout: NESTING_TIMEOUT }
  );

  // Wait a bit for UI to update
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Extract results
  const utilization = await page.$eval('.status-info', (el: Element) => {
    const utilizationText = el.textContent?.match(/Utilization:\s*([\d.]+)%/);
    return utilizationText ? parseFloat(utilizationText[1]) : 0;
  }).catch(() => 0);

  // Count placements on canvas (rough estimate by looking for rendered items)
  const placementCount = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas ? 1 : 0; // Simplified - just check if canvas exists
  });

  console.log(`✓ Nesting complete: ${utilization.toFixed(1)}% utilization`);

  return { utilization, placementCount };
}

/**
 * Take screenshot
 */
async function takeScreenshot(page: Page, filename: string): Promise<string> {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({
    path: filepath,
    fullPage: true
  });
  console.log(`✓ Screenshot saved: ${filename}`);
  return filepath;
}

/**
 * Reset the application
 */
async function resetApp(page: Page): Promise<void> {
  const resetButton = await page.$('button:has-text("Reset")');
  if (resetButton) {
    await resetButton.click();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Main test execution
 */
async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let browser: Browser | null = null;

  try {
    console.log('==========================================');
    console.log('E2E Test: Polygon Packing Integration');
    console.log('==========================================\n');

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // Wait for backend
    console.log('Checking backend...');
    const backendReady = await waitForBackend();
    if (!backendReady) {
      throw new Error('Backend is not ready');
    }

    // Launch browser
    console.log('\nLaunching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      executablePath: '/usr/bin/chromium-browser'
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Wait for frontend
    console.log('Checking frontend...');
    const frontendReady = await waitForFrontend(page, 30);
    if (!frontendReady) {
      throw new Error('Frontend is not ready');
    }

    // Take initial screenshot
    await takeScreenshot(page, '01-initial-load.png');

    // Upload test images
    await uploadTestImages(page);
    await takeScreenshot(page, '02-images-uploaded.png');

    // Test 1: Rectangle Packing (Default)
    console.log('\n--- Test 1: Rectangle Packing (Default) ---');
    try {
      await setPolygonPacking(page, false);
      const rectResults = await runNesting(page);
      await takeScreenshot(page, '03-rectangle-packing-result.png');

      results.push({
        name: 'Rectangle Packing',
        success: true,
        screenshotPath: '03-rectangle-packing-result.png',
        utilization: rectResults.utilization,
        placementCount: rectResults.placementCount
      });
    } catch (error: any) {
      results.push({
        name: 'Rectangle Packing',
        success: false,
        error: error.message
      });
    }

    // Reset and upload images again
    await resetApp(page);
    await uploadTestImages(page);

    // Test 2: Polygon Packing
    console.log('\n--- Test 2: Polygon Packing ---');
    try {
      await setPolygonPacking(page, true);
      await takeScreenshot(page, '04-polygon-packing-enabled.png');

      const polyResults = await runNesting(page);
      await takeScreenshot(page, '05-polygon-packing-result.png');

      results.push({
        name: 'Polygon Packing',
        success: true,
        screenshotPath: '05-polygon-packing-result.png',
        utilization: polyResults.utilization,
        placementCount: polyResults.placementCount
      });
    } catch (error: any) {
      results.push({
        name: 'Polygon Packing',
        success: false,
        error: error.message
      });
    }

    // Test 3: Production Mode with Polygon Packing
    console.log('\n--- Test 3: Multi-Sheet Polygon Packing ---');
    try {
      await resetApp(page);
      await uploadTestImages(page);

      // Enable production mode
      const prodModeCheckbox = await page.$('input[type="checkbox"][ng-reflect-name="productionMode"]');
      if (prodModeCheckbox) {
        await prodModeCheckbox.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Set sheet count to 2
      const sheetCountInput = await page.$('input[type="number"][ng-reflect-name="sheetCount"]');
      if (sheetCountInput) {
        await sheetCountInput.click({ clickCount: 3 });
        await sheetCountInput.type('2');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await setPolygonPacking(page, true);
      await takeScreenshot(page, '06-multisheet-polygon-enabled.png');

      const multiResults = await runNesting(page);
      await takeScreenshot(page, '07-multisheet-polygon-result.png');

      results.push({
        name: 'Multi-Sheet Polygon Packing',
        success: true,
        screenshotPath: '07-multisheet-polygon-result.png',
        utilization: multiResults.utilization,
        placementCount: multiResults.placementCount
      });
    } catch (error: any) {
      results.push({
        name: 'Multi-Sheet Polygon Packing',
        success: false,
        error: error.message
      });
    }

  } catch (error: any) {
    console.error('\n✗ Test execution failed:', error.message);
    results.push({
      name: 'Test Execution',
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

/**
 * Print test results
 */
function printResults(results: TestResult[]): void {
  console.log('\n==========================================');
  console.log('Test Results');
  console.log('==========================================\n');

  results.forEach(result => {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} ${result.name}`);

    if (result.success) {
      if (result.utilization !== undefined) {
        console.log(`  Utilization: ${result.utilization.toFixed(1)}%`);
      }
      if (result.screenshotPath) {
        console.log(`  Screenshot: ${result.screenshotPath}`);
      }
    } else {
      console.log(`  Error: ${result.error}`);
    }
    console.log();
  });

  const passCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('==========================================');
  console.log(`Total: ${results.length} | Pass: ${passCount} | Fail: ${failCount}`);
  console.log('==========================================\n');

  // Compare rectangle vs polygon packing
  const rectTest = results.find(r => r.name === 'Rectangle Packing');
  const polyTest = results.find(r => r.name === 'Polygon Packing');

  if (rectTest?.success && polyTest?.success) {
    console.log('Comparison:');
    console.log(`  Rectangle Packing: ${rectTest.utilization?.toFixed(1)}% utilization`);
    console.log(`  Polygon Packing:   ${polyTest.utilization?.toFixed(1)}% utilization`);

    if (polyTest.utilization! > rectTest.utilization!) {
      console.log(`  → Polygon packing achieved ${(polyTest.utilization! - rectTest.utilization!).toFixed(1)}% better utilization! 🎉`);
    } else if (polyTest.utilization! < rectTest.utilization!) {
      console.log(`  → Rectangle packing was ${(rectTest.utilization! - polyTest.utilization!).toFixed(1)}% better (expected for some shapes)`);
    } else {
      console.log(`  → Both methods achieved similar utilization`);
    }
  }
}

// Run tests
runTests()
  .then(results => {
    printResults(results);
    const hasFailures = results.some(r => !r.success);
    process.exit(hasFailures ? 1 : 0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
