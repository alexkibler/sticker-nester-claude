# E2E Integration Tests

End-to-end tests for the Mosaic sticker nesting application, specifically testing the polygon packing feature.

## Overview

These tests verify that the polygon packing algorithm works correctly in the full application stack (frontend + backend) by:

1. Starting both frontend (Angular) and backend (Node.js) servers
2. Uploading test images via the UI
3. Running rectangle packing (default mode)
4. Running polygon packing (with checkbox enabled)
5. Running multi-sheet polygon packing (production mode)
6. Capturing screenshots at each step
7. Comparing results between packing methods

## Prerequisites

- Node.js 18+ installed
- All npm dependencies installed (`npm install` in both root and `server/` directories)
- Chromium browser installed (for Puppeteer)
- Test images in `test-images/` directory

## Running the Tests

### Automated (Recommended)

The easiest way to run the tests is using the automated script:

```bash
./e2e/run-e2e-tests.sh
```

This script will:
- Start the backend server on port 3001
- Start the frontend dev server on port 4200
- Wait for both to be ready
- Run the E2E tests
- Clean up servers when done

### Manual

If you prefer to run services manually:

1. **Start Backend:**
   ```bash
   cd server
   npm run dev
   ```

2. **Start Frontend** (in another terminal):
   ```bash
   npm start
   ```

3. **Run Tests** (in a third terminal):
   ```bash
   npx ts-node e2e/polygon-packing.e2e.ts
   ```

## Test Scenarios

### Test 1: Rectangle Packing (Default)
- Upload 3 test images
- Leave "Use Polygon Packing" checkbox unchecked
- Run nesting
- Capture screenshot: `03-rectangle-packing-result.png`

### Test 2: Polygon Packing
- Upload same 3 test images
- Enable "Use Polygon Packing" checkbox
- Run nesting
- Capture screenshot: `05-polygon-packing-result.png`

### Test 3: Multi-Sheet Polygon Packing
- Upload 3 test images
- Enable "Production Mode"
- Set sheet count to 2
- Enable "Use Polygon Packing"
- Run nesting
- Capture screenshot: `07-multisheet-polygon-result.png`

## Screenshot Locations

All screenshots are saved to `e2e/screenshots/`:

- `01-initial-load.png` - Application loaded
- `02-images-uploaded.png` - After images uploaded
- `03-rectangle-packing-result.png` - Rectangle packing results
- `04-polygon-packing-enabled.png` - Polygon checkbox enabled
- `05-polygon-packing-result.png` - Polygon packing results
- `06-multisheet-polygon-enabled.png` - Multi-sheet + polygon enabled
- `07-multisheet-polygon-result.png` - Multi-sheet polygon results

## Expected Results

**Success Criteria:**
- All 3 tests pass without errors
- Screenshots show proper UI rendering
- Nesting algorithms complete successfully
- Utilization percentages are calculated correctly
- Polygon packing may achieve better utilization for irregular shapes

**Comparison:**
The test output includes a comparison between rectangle and polygon packing utilization. For irregular shapes (circles, stars, custom die-cuts), polygon packing should achieve better utilization.

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:
```bash
# Kill processes on ports
lsof -ti:3001 | xargs kill -9
lsof -ti:4200 | xargs kill -9
```

### Chromium Not Found
If Puppeteer can't find Chromium:
```bash
# Install Chromium
sudo apt-get install chromium-browser

# Or on Mac
brew install chromium
```

### Frontend Takes Too Long to Start
Angular's dev server can be slow to compile. The script waits up to 60 seconds, but you may need to increase this timeout in `run-e2e-tests.sh` if running on a slower machine.

### Screenshots Not Generated
Ensure the `e2e/screenshots/` directory exists and has write permissions:
```bash
mkdir -p e2e/screenshots
chmod 755 e2e/screenshots
```

## Test Output

Example successful test output:

```
==========================================
E2E Test: Polygon Packing Integration
==========================================

✓ Backend is ready
✓ Frontend is ready
Uploading test images...
✓ Images uploaded successfully

--- Test 1: Rectangle Packing (Default) ---
✓ Polygon packing disabled
Running nesting algorithm...
✓ Nesting complete: 65.3% utilization

--- Test 2: Polygon Packing ---
✓ Polygon packing enabled
Running nesting algorithm...
✓ Nesting complete: 72.1% utilization

--- Test 3: Multi-Sheet Polygon Packing ---
Running nesting algorithm...
✓ Nesting complete: 68.5% utilization

==========================================
Test Results
==========================================

✓ PASS Rectangle Packing
  Utilization: 65.3%
  Screenshot: 03-rectangle-packing-result.png

✓ PASS Polygon Packing
  Utilization: 72.1%
  Screenshot: 05-polygon-packing-result.png

✓ PASS Multi-Sheet Polygon Packing
  Utilization: 68.5%
  Screenshot: 07-multisheet-polygon-result.png

==========================================
Total: 3 | Pass: 3 | Fail: 0
==========================================

Comparison:
  Rectangle Packing: 65.3% utilization
  Polygon Packing:   72.1% utilization
  → Polygon packing achieved 6.8% better utilization! 🎉
```

## CI/CD Integration

To integrate with CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run E2E Tests
  run: |
    npm install
    cd server && npm install && cd ..
    ./e2e/run-e2e-tests.sh

- name: Upload Screenshots
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: e2e-screenshots
    path: e2e/screenshots/
```

## Maintenance

### Updating Tests
The E2E test suite is defined in `e2e/polygon-packing.e2e.ts`. Key areas to update:

- **Selectors**: If UI element selectors change, update the selector strings
- **Timeouts**: Adjust timeout constants at the top of the file
- **Test Scenarios**: Add new test scenarios by adding functions similar to the existing tests
- **Screenshots**: Add new screenshot captures by calling `takeScreenshot(page, 'filename.png')`

### Adding New Test Images
Place new test images in the `test-images/` directory. The test will automatically use the first 3 PNG/JPG images it finds.

## Architecture Notes

The E2E test uses Puppeteer to:
1. Control a headless Chromium browser
2. Navigate the Angular application
3. Interact with form elements (checkboxes, buttons, file uploads)
4. Wait for asynchronous operations (uploads, nesting)
5. Extract data from the DOM (utilization stats)
6. Capture screenshots

This provides real-world validation that the polygon packing feature works correctly in the full application stack, not just in isolated unit tests.
