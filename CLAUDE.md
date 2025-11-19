# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mosaic** is a full-stack sticker nesting and layout optimization application for small business print production. It minimizes material waste by efficiently packing irregular sticker shapes onto print sheets.

**Architecture**: Angular 20+ frontend + Node.js/Express backend with REST API

**Key Capabilities**:
- Upload images → Server traces to vector paths → Run packing algorithm → Generate production PDFs
- Supports both single-sheet preview mode and multi-sheet production mode
- Uses MaxRects packing algorithm with "Oversubscribe and Sort" strategy for balanced distribution

**User Workflow**:
1. User uploads sticker design images (up to 20 images)
2. User requests N pages to be filled (e.g., "3 pages of stickers")
3. System fills those pages densely with a **balanced mix** of all uploaded designs
4. System outputs quantities automatically based on what fit optimally

**Important**: Users do NOT specify "50 copies of design A, 30 copies of design B". Instead, they specify total page count and the algorithm determines optimal quantities for balanced distribution.

## Development Commands

### Frontend (Angular - Port 4200)
```bash
# From project root
npm install              # Install dependencies
npm start                # Run dev server with proxy to backend
npm run build            # Production build → dist/sticker-nesting/
npm test                 # Run Karma/Jasmine tests
npm run watch            # Build in watch mode
```

### Backend (Node.js - Port 3001)
```bash
cd server
npm install              # Install dependencies
npm run dev              # Run with nodemon + ts-node hot reload
npm run build            # Compile TypeScript → server/dist/
npm start                # Run production build (node dist/index.js)
npm test                 # Run all Jest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:verbose     # Detailed test output
```

### Docker Deployment
```bash
# Backend runs on port 3000 in production
docker-compose up -d     # Start on port 8084
docker build -t mosaic . # Manual build
```

**Important**: The dev proxy (`proxy.conf.json`) routes `/api/*` to `http://localhost:3001`. Production uses port 3000.

## Architecture & Key Concepts

### Request Flow
1. **Image Upload** → `POST /api/nesting/process`
   - Frontend sends image files via multipart/form-data
   - Backend processes with Sharp + ImageTracerJS (raster→vector)
   - Returns traced paths with auto-calculated dimensions (300 DPI, scaled to max 3" dimension)

2. **Nesting** → `POST /api/nesting/nest`
   - Frontend sends sticker data (paths, dimensions) + config (sheet size, spacing, production mode)
   - Backend runs MaxRects packing algorithm
   - Returns placements (x, y, rotation) OR multi-sheet results with quantities

3. **PDF Export** → `POST /api/pdf/generate`
   - Frontend sends images + placements/sheets + sticker data
   - Backend generates PDF with PDFKit (images + red cut lines)
   - Returns PDF blob for download

### Nesting Algorithm: "Oversubscribe and Sort" Strategy

**Context**: Production mode fills N requested pages with a balanced mix of uploaded designs (not "50 copies of design A").

**Implementation** (`server/src/services/nesting.service.ts::nestStickersMultiSheet`):
1. **Calculate Target Area**: `pageCount × pageWidth × pageHeight`
2. **Generate Candidate Pool**: Cycle through designs (A, B, C, A, B, C...) until total area reaches **115% of target**
   - This creates a finite, balanced pool (prevents infinite tiny items)
3. **Sort**: By height descending (Big Rocks First principle)
4. **Pack**: Feed sorted pool into maxrects-packer with maxrects options (`smart: true`, `allowRotation: true`)
5. **Calculate Quantities**: Count how many of each design actually got packed
6. **Result**: Returns sheets with balanced quantities of each design

**Why 115%**: Creates buffer for optimal fitting without allowing unlimited small items to dominate.

**Historical Note**: This method was refactored from accepting `quantities` as input to accepting `pageCount` as input. Quantities are now calculated as **output** based on what the algorithm successfully packed, not input constraints.

### Multi-Sheet vs Single-Sheet Mode

**Production Mode** (`config.productionMode = true`):
- User specifies `sheetCount` (e.g., "3 pages")
- Backend calls `nestStickersMultiSheet(stickers, sheetWidth, sheetHeight, pageCount, spacing)`
- Backend generates balanced quantities automatically using Oversubscribe and Sort
- Returns `MultiSheetResult` with `sheets[]`, `quantities{}`, `totalUtilization`
- Each sheet has array of placements with instance IDs (e.g., `design_A_0`, `design_A_1`)
- PDF generation creates multi-page document

**Preview Mode** (`config.productionMode = false`):
- Single sheet layout
- Backend calls `nestStickers(stickers, sheetWidth, sheetHeight, spacing)`
- Returns `NestingResult` with `placements[]`, `utilization`, `fitness`
- PDF generation creates single-page document

### State Management

**Frontend** (`src/app/app.ts`):
- No global state management library (uses Angular Signals)
- Main app component holds all state: `stickers[]`, `placements[]`, `sheets[]`, `config`
- Services are stateless and injected via Angular DI

**Backend**:
- Completely stateless REST API
- No database (processes requests in-memory)
- File uploads handled by Multer middleware (memory storage)

### Progress Tracking

**Upload Progress**:
- Uses Angular HttpClient with `reportProgress: true` + `observe: 'events'`
- Monitors `HttpEventType.UploadProgress` events
- Updates UI with percentage progress (0-100%)
- Useful when uploading 20 images simultaneously

**PDF Progress**:
- Uses `HttpEventType.DownloadProgress` to estimate generation progress
- For multi-sheet PDFs, estimates current page based on download progress
- Fallback approach (no true server-side progress streaming yet)

**Components**:
- `ProgressBarComponent` - Reusable progress bar with animated shimmer effect
- Supports both simple percentage and "current/total pages" display
- State managed in `app.ts`: `uploadProgress`, `showUploadProgress`, `pdfProgress`, `pdfCurrentPage`, `pdfTotalPages`

### PDF Generation Details

**Single-sheet** (`pdf.service.ts::generatePdf`):
- Places images at (x, y) positions
- Handles 90° rotations via translate + rotate + restore
- Draws red cut lines using sticker.points

**Multi-sheet** (`pdf.service.ts::generateMultiSheetPdf`):
- Iterates through sheets, calls `doc.addPage()` between sheets
- Extracts original sticker ID by removing instance suffix (`_0`, `_1`, etc.)
- Same rotation/cut line logic per placement

## Important File Locations

### Backend Services
- `server/src/services/nesting.service.ts` - MaxRects packing with Oversubscribe strategy
- `server/src/services/pdf.service.ts` - PDFKit generation with rotation support
- `server/src/services/image.service.ts` - Sharp + ImageTracerJS processing
- `server/src/services/geometry.service.ts` - Polygon operations (ClipperLib wrapper)

### Backend Routes
- `server/src/routes/nesting.routes.ts` - `/api/nesting/process` and `/api/nesting/nest`
- `server/src/routes/pdf.routes.ts` - `/api/pdf/generate`

### Frontend Components
- `src/app/app.ts` - Main orchestration component
- `src/app/components/upload-dropzone.component.ts` - Drag & drop file upload
- `src/app/components/canvas-preview.component.ts` - Canvas rendering of layout
- `src/app/components/control-panel.component.ts` - Settings UI (sheet size, production mode, etc.)
- `src/app/components/progress-bar.component.ts` - Reusable progress indicator

### Frontend Services
- `src/app/services/api.service.ts` - HTTP client for backend API (with progress callbacks)
- `src/app/services/image-analysis.service.ts` - Client-side bitmap loading

## Testing

**Backend**: 31 tests total (20 unit + 11 integration)
- Run via Jest
- Located in `server/src/__tests__/`
- See `server/TEST_RESULTS.md` for current status
- 6 integration tests need adjustment for MaxRects expectations (currently fail expecting greedy algorithm behavior)

**Frontend**: Karma + Jasmine
- Minimal test coverage currently
- Run via `npm test` from project root

## Common Development Patterns

### Adding New Sticker Properties
1. Update `Sticker` interface in `server/src/services/nesting.service.ts`
2. Update `StickerSource` model in `src/app/models/`
3. Update API payload in `src/app/services/api.service.ts`
4. Update route handler to parse new property
5. Update PDF generation to use new property

### Modifying Packing Algorithm
- Edit `server/src/services/nesting.service.ts::nestStickersMultiSheet`
- Key parameters: 115% buffer (line 61), sorting logic (line 109-114)
- maxrects-packer options: `smart: true`, `allowRotation: true` (line 127-131)

### Changing Sheet Dimensions/Units
- Default: 12" × 12" sheets, inches
- Image processing: 300 DPI conversion in `nesting.routes.ts::process` (line 31-46)
- PDF conversion: 72 points/inch in `pdf.service.ts` (line 17-18)

## Port Configuration

| Environment | Frontend | Backend | Docker |
|-------------|----------|---------|--------|
| Development | 4200     | 3001    | N/A    |
| Production  | N/A      | 3000    | 8084   |

**Note**: If you see `EADDRINUSE` errors, another instance is already running on that port.

## Dependencies to Know

**Image Processing**:
- `sharp` - High-performance image manipulation (backend)
- `imagetracerjs` - Bitmap to vector tracing (backend)

**Packing**:
- `maxrects-packer` - Rectangle packing algorithm with rotation support

**Geometry**:
- `clipper-lib` - Polygon offsetting and clipping (backend)
- `simplify-js` - Douglas-Peucker path simplification (backend)

**PDF Generation**:
- `pdfkit` - Server-side PDF creation (backend)

**File Upload**:
- `multer` - Multipart form-data parsing (backend, memory storage)

## Algorithm Evolution & Design Decisions

### Why "Oversubscribe and Sort" Instead of Explicit Quantities?

**Problem**: Original approach required users to specify exact quantities per design, which was:
- Unintuitive for users who just want "3 pages of stickers"
- Required manual calculation of how many copies would fit
- Led to either wasted space or overfilling

**Solution**: Oversubscribe strategy:
- User specifies desired page count only
- Algorithm generates 115% of needed area with round-robin cycling
- Ensures balanced distribution without user math
- Packer decides optimal quantities based on actual fit

**Result**: Simpler UX, better space utilization, automatic quantity optimization

### Instance ID Pattern

When generating multiple copies in production mode:
- Each sticker gets unique instance ID: `{originalId}_{instanceNumber}`
- Example: `design_A_0`, `design_A_1`, `design_A_2`
- PDF service strips suffix to find original image: `placement.id.replace(/_\d+$/, '')`
- Final quantities calculated by counting instances per original ID
