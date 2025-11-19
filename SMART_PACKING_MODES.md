# Smart Packing Modes: Implementation Plan

## Overview

Implementing two distinct packing modes to address production requirements:

### Mode 1: **Pack All Items** (Production Default - `packAllItems: true`)
**Requirement**: ALL uploaded items MUST be printed in production mode

**Behavior**:
- Automatically expand pages as needed to fit all items
- Never leave items unplaced
- Real-time notifications when pages are added
- Start with estimated minimum pages
- Add pages incrementally as sheets fill up

**Use Case**: Production runs where every uploaded design must be printed

**Example**:
```
User uploads 26 designs
Requests "3 pages"
→ System detects 3 pages insufficient
→ Auto-expands to 4 pages
→ Notifies: "Added page 4 to accommodate remaining 8 items"
→ All 26 items successfully packed across 4 pages
```

### Mode 2: **Fixed Pages** (Preview Mode - `packAllItems: false`)
**Requirement**: Fill exactly N pages, pack as many items as fit

**Behavior**:
- **Fail fast** with early detection before wasting time
- Estimate minimum pages needed BEFORE packing
- Warn user if requested pages insufficient
- Pack greedily into requested pages
- Report which items didn't fit

**Use Case**: Preview/testing, or when sheet count is constrained

**Example**:
```
User uploads 26 designs
Requests "2 pages"
→ System estimates: "26 items need ~4 pages (requested 2)"
→ FAILS FAST: "Add 2 more pages"
→ User increases to 4 pages
→ Packing proceeds successfully
```

## Implementation Details

### Early Failure Detection

**Space Estimation Function**:
```typescript
interface SpaceEstimate {
  totalItemArea: number;
  totalSheetArea: number;
  estimatedUtilization: number;
  minimumPagesNeeded: number;
  canFitInRequestedPages: boolean;
  warning?: string;
}
```

**Conservative Estimates**:
- Polygon packing achieves 50-70% utilization typically
- Use 60% as expected efficiency
- Use 50% as fail-fast threshold (conservative)
- Calculate: `minimumPages = ceil(totalArea / (sheetArea * 0.60))`

**Fail Fast Logic**:
```typescript
if (!packAllItems) {
  const estimate = estimateSpaceRequirements(items, width, height, requestedPages);

  if (!estimate.canFitInRequestedPages) {
    // FAIL IMMEDIATELY - don't waste time packing
    throw new Error(estimate.warning);
  }

  if (estimate.warning) {
    // WARNING - may not fit, but try anyway
    console.warn(estimate.warning);
  }
}
```

### Auto-Expand Logic

**Pack-All-Items Mode**:
```typescript
if (packAllItems) {
  // Use estimated minimum pages as starting point
  let currentPageCount = Math.max(requestedPages, estimate.minimumPagesNeeded);
  const MAX_PAGES = 50; // Safety limit

  let allItemsPlaced = false;

  while (!allItemsPlaced && currentPageCount <= MAX_PAGES) {
    // Try packing with current page count
    const result = packItems(items, currentPageCount);

    if (result.unplacedItems.length === 0) {
      allItemsPlaced = true;
    } else {
      // Add another page
      currentPageCount++;
      console.log(`⚠ Adding page ${currentPageCount} for ${result.unplacedItems.length} remaining items`);
    }
  }

  if (!allItemsPlaced) {
    throw new Error(`Failed to pack all items even with ${MAX_PAGES} pages`);
  }
}
```

### Real-Time Notifications

**Progress Events**:
```typescript
// Estimating
progress.emit({
  status: 'estimating',
  message: 'Estimating space requirements...'
});

// Warning
progress.emit({
  status: 'warning',
  message: 'Tight fit: 26 items will fill 95% of 3 pages. Some may not fit.'
});

// Expanding
progress.emit({
  status: 'expanding',
  message: 'Adding page 4 to accommodate remaining 8 items',
  sheetCount: 4
});

// Success
progress.emit({
  status: 'complete',
  message: 'All 26 items packed successfully across 4 pages',
  sheetCount: 4
});
```

## API Changes

### Request Parameters

```typescript
POST /api/nesting/nest
{
  stickers: [...],
  sheetWidth: 304.8,
  sheetHeight: 304.8,
  sheetCount: 3,
  productionMode: true,
  usePolygonPacking: true,
  packAllItems: true,  // NEW: true = auto-expand, false = fixed pages
  rotations: [0, 45, 90, 135, 180, 225, 270, 315]
}
```

### Response (Pack-All Mode)

```json
{
  "sheets": [...],
  "totalUtilization": 67.3,
  "quantities": {...},
  "actualPageCount": 4,  // NEW: May be > requested if auto-expanded
  "expandedPages": true,  // NEW: Indicates if pages were added
  "message": "Auto-expanded from 3 to 4 pages to fit all items"
}
```

### Response (Fixed Mode - Success)

```json
{
  "sheets": [...],
  "totalUtilization": 82.1,
  "quantities": {...},
  "unplacedItems": [],  // NEW: Empty if all fit
  "message": "23/23 items packed in 2 pages"
}
```

### Response (Fixed Mode - Some Failed)

```json
{
  "sheets": [...],
  "totalUtilization": 94.7,
  "quantities": {...},
  "unplacedItems": ["pentagon-44", "pentagon-46", "pentagon-47"],  // NEW
  "message": "20/23 items packed. 3 items did not fit. Increase page count."
}
```

### Error Response (Fixed Mode - Fail Fast)

```json
{
  "error": "Insufficient space: 26 items need ~4 pages (requested 2). Add 2 more page(s)."
}
```

## Benefits

### For Production Users:
✅ **Guaranteed** all items are printed (no lost designs)
✅ **Automatic** page optimization (no manual calculation)
✅ **Real-time** feedback on page expansion
✅ **Predictable** costs (know exact page count upfront via estimation)

### For Preview Users:
✅ **Fail fast** - immediate feedback if pages insufficient
✅ **No waste** - don't spend 3 minutes packing when it won't fit
✅ **Early warning** - know before packing if it's tight
✅ **Fixed budget** - strict page count for cost control

## Testing Plan

### Test Case 1: Pack-All Mode Success
```
Input: 26 items, request 1 page, packAllItems=true
Expected: Auto-expands to ~2 pages, all items packed
```

### Test Case 2: Fixed Mode Success
```
Input: 10 items, request 2 pages, packAllItems=false
Expected: All items fit, no expansion
```

### Test Case 3: Fixed Mode Warning
```
Input: 26 items, request 3 pages, packAllItems=false
Expected: Warning issued, most items fit, 3-4 fail
```

### Test Case 4: Fixed Mode Fail Fast
```
Input: 50 items, request 1 page, packAllItems=false
Expected: Immediate error, suggests ~5 pages needed
```

### Test Case 5: Pack-All Safety Limit
```
Input: 1000 items, request 1 page, packAllItems=true
Expected: Expands up to MAX_PAGES (50), then errors
```

## Next Steps

1. ✅ Add `SpaceEstimate` interface and estimation function
2. ⏳ Implement auto-expand loop in `nestStickersMultiSheetPolygon`
3. ⏳ Implement fail-fast logic for fixed mode
4. ⏳ Add progress notifications for page expansion
5. ⏳ Update API route to accept `packAllItems` parameter
6. ⏳ Write tests for both modes
7. ⏳ Update frontend to support both modes
8. ⏳ Document new behavior

## Status

**Partially Implemented**:
- ✅ `SpaceEstimate` interface
- ✅ `estimateSpaceRequirements()` function
- ✅ Progress status types updated ('estimating', 'warning', 'expanding')
- ⏳ Auto-expand loop (in progress)
- ⏳ Fail-fast logic (todo)
- ⏳ API parameter handling (todo)
