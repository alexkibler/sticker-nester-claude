import { Point } from './image.service';
import { GeometryService } from './geometry.service';

/**
 * RasterGrid: 2D boolean grid representing occupied space on the sheet
 */
export class RasterGrid {
  private grid: boolean[][];
  private readonly cellsPerInch: number;
  private readonly width: number; // in inches
  private readonly height: number; // in inches
  private readonly gridWidth: number; // in cells
  private readonly gridHeight: number; // in cells

  constructor(widthInches: number, heightInches: number, cellsPerInch: number = 100) {
    this.width = widthInches;
    this.height = heightInches;
    this.cellsPerInch = cellsPerInch;
    this.gridWidth = Math.ceil(widthInches * cellsPerInch);
    this.gridHeight = Math.ceil(heightInches * cellsPerInch);

    // Initialize grid with all cells free (false)
    this.grid = Array(this.gridHeight)
      .fill(null)
      .map(() => Array(this.gridWidth).fill(false));
  }

  /**
   * Convert inches to grid cells
   */
  private inchesToCells(inches: number): number {
    return Math.round(inches * this.cellsPerInch);
  }

  /**
   * Convert grid cells to inches
   */
  private cellsToInches(cells: number): number {
    return cells / this.cellsPerInch;
  }

  /**
   * Check if a set of grid cells collide with already occupied cells
   */
  checkCollision(cells: GridCell[]): boolean {
    for (const cell of cells) {
      // Check bounds
      if (cell.x < 0 || cell.x >= this.gridWidth || cell.y < 0 || cell.y >= this.gridHeight) {
        return true; // Out of bounds = collision
      }
      // Check if occupied
      if (this.grid[cell.y][cell.x]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Mark cells as occupied
   */
  markOccupied(cells: GridCell[]): void {
    for (const cell of cells) {
      if (cell.x >= 0 && cell.x < this.gridWidth && cell.y >= 0 && cell.y < this.gridHeight) {
        this.grid[cell.y][cell.x] = true;
      }
    }
  }

  /**
   * Get grid dimensions
   */
  getDimensions(): { width: number; height: number; cellsPerInch: number } {
    return {
      width: this.width,
      height: this.height,
      cellsPerInch: this.cellsPerInch,
    };
  }

  /**
   * Get utilization percentage
   */
  getUtilization(): number {
    let occupied = 0;
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.grid[y][x]) occupied++;
      }
    }
    return (occupied / (this.gridWidth * this.gridHeight)) * 100;
  }
}

/**
 * Grid cell coordinates
 */
export interface GridCell {
  x: number; // cell x coordinate
  y: number; // cell y coordinate
}

/**
 * PolygonRasterizer: Convert polygon vertices to grid cells
 */
export class PolygonRasterizer {
  private readonly cellsPerInch: number;
  private readonly geometryService: GeometryService;

  constructor(cellsPerInch: number = 100) {
    this.cellsPerInch = cellsPerInch;
    this.geometryService = new GeometryService();
  }

  /**
   * Rasterize a polygon at a specific position and rotation
   * Returns the set of grid cells occupied by the polygon
   */
  rasterizePolygon(
    points: Point[],
    posX: number, // position in inches
    posY: number, // position in inches
    rotation: number = 0, // rotation in degrees
    spacing: number = 0 // spacing/margin in inches
  ): GridCell[] {
    // Step 1: Apply rotation if needed
    let transformedPoints = points;
    if (rotation !== 0) {
      transformedPoints = this.geometryService.rotatePoints(points, rotation);
    }

    // Step 2: Apply spacing/margin using offset
    if (spacing > 0) {
      transformedPoints = this.geometryService.offsetPolygon(transformedPoints, spacing);
    }

    // Step 3: Translate to position
    const bbox = this.geometryService.getBoundingBox(transformedPoints);
    const offsetX = posX - bbox.minX;
    const offsetY = posY - bbox.minY;
    const positionedPoints = transformedPoints.map(p => ({
      x: p.x + offsetX,
      y: p.y + offsetY,
    }));

    // Step 4: Rasterize using scan-line algorithm
    return this.scanlineRasterize(positionedPoints);
  }

  /**
   * Scan-line rasterization algorithm
   * Fills the interior of a polygon by scanning horizontal lines
   */
  private scanlineRasterize(points: Point[]): GridCell[] {
    if (points.length < 3) return [];

    const cells: GridCell[] = [];
    const bbox = this.geometryService.getBoundingBox(points);

    // Convert bounds to grid cells
    const minY = Math.floor(bbox.minY * this.cellsPerInch);
    const maxY = Math.ceil(bbox.maxY * this.cellsPerInch);
    const minX = Math.floor(bbox.minX * this.cellsPerInch);
    const maxX = Math.ceil(bbox.maxX * this.cellsPerInch);

    // Scan each horizontal line
    for (let y = minY; y <= maxY; y++) {
      const scanY = y / this.cellsPerInch;

      // Find intersections of scan line with polygon edges
      const intersections: number[] = [];

      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        // Check if edge crosses scan line
        if ((p1.y <= scanY && p2.y > scanY) || (p2.y <= scanY && p1.y > scanY)) {
          // Calculate x coordinate of intersection
          const t = (scanY - p1.y) / (p2.y - p1.y);
          const intersectX = p1.x + t * (p2.x - p1.x);
          intersections.push(intersectX);
        }
      }

      // Sort intersections
      intersections.sort((a, b) => a - b);

      // Fill between pairs of intersections
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = Math.floor(intersections[i] * this.cellsPerInch);
        const x2 = Math.ceil(intersections[i + 1] * this.cellsPerInch);

        for (let x = x1; x <= x2; x++) {
          cells.push({ x, y });
        }
      }
    }

    return cells;
  }

  /**
   * Get bounding box of rasterized cells
   */
  getCellBounds(cells: GridCell[]): { minX: number; minY: number; maxX: number; maxY: number } {
    if (cells.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    const xs = cells.map(c => c.x);
    const ys = cells.map(c => c.y);

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
}

/**
 * Polygon with metadata for packing
 */
export interface PackablePolygon {
  id: string;
  points: Point[]; // polygon vertices in inches
  width: number; // bounding box width
  height: number; // bounding box height
  area: number; // approximate area
}

/**
 * Placement result for a polygon
 */
export interface PolygonPlacement {
  id: string;
  x: number; // position in inches
  y: number; // position in inches
  rotation: number; // rotation in degrees
  cells: GridCell[]; // grid cells occupied
}

/**
 * Polygon packing result
 */
export interface PolygonPackingResult {
  placements: PolygonPlacement[];
  utilization: number;
  unplacedPolygons: PackablePolygon[];
  performance?: PackingPerformanceMetrics;
}

/**
 * Performance metrics for packing operations
 */
export interface PackingPerformanceMetrics {
  totalTimeMs: number;
  totalTimeSec: number;
  itemCount: number;
  avgTimePerItemMs: number;
  totalPositionsTried: number;
  totalRotationsTried: number;
  successfulPlacements: number;
  failedPlacements: number;
  rotationCount: number;
  stepSize: number;
  cellsPerInch: number;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Progress callback for packing operations
 */
export interface PackingProgress {
  current: number;
  total: number;
  itemId: string;
  status: 'trying' | 'placed' | 'failed' | 'estimating' | 'warning' | 'expanding';
  message: string;
  sheetCount?: number; // Current number of sheets being used
}

export type ProgressCallback = (progress: PackingProgress) => void;

/**
 * Detailed failure information
 */
export interface PlacementFailure {
  polygonId: string;
  positionsTried: number;
  rotationsTried: number;
  gridUtilization: number;
  reason: string;
}

/**
 * Space estimation result
 */
export interface SpaceEstimate {
  totalItemArea: number;
  totalSheetArea: number;
  estimatedUtilization: number;
  minimumPagesNeeded: number;
  canFitInRequestedPages: boolean;
  warning?: string;
}

/**
 * PolygonPacker: Main packing algorithm using rasterization overlay
 */
export class PolygonPacker {
  private readonly grid: RasterGrid;
  private readonly rasterizer: PolygonRasterizer;
  private readonly spacing: number;
  private readonly stepSize: number; // position search step size in inches
  private readonly rotations: number[]; // rotation angles to try
  private progressCallback?: ProgressCallback;

  constructor(
    widthInches: number,
    heightInches: number,
    spacing: number = 0.0625,
    cellsPerInch: number = 100,
    stepSize: number = 0.05,
    rotations: number[] = [0, 90, 180, 270],
    progressCallback?: ProgressCallback
  ) {
    this.grid = new RasterGrid(widthInches, heightInches, cellsPerInch);
    this.rasterizer = new PolygonRasterizer(cellsPerInch);
    this.spacing = spacing;
    this.stepSize = stepSize;
    this.rotations = rotations;
    this.progressCallback = progressCallback;
  }

  /**
   * Pack polygons onto the sheet using rasterization overlay algorithm
   */
  pack(polygons: PackablePolygon[], trackPerformance: boolean = false): PolygonPackingResult {
    console.log(`\n=== Starting polygon packing ===`);
    console.log(`Polygons: ${polygons.length}`);
    console.log(`Rotations: ${this.rotations.join(', ')}°`);
    console.log(`Step size: ${this.stepSize}"`);
    console.log(`Grid resolution: ${this.grid.getDimensions().cellsPerInch} cells/inch`);

    // Sort by area descending (Big Rocks First)
    const sorted = [...polygons].sort((a, b) => b.area - a.area);

    const placements: PolygonPlacement[] = [];
    const unplaced: PackablePolygon[] = [];
    const failures: PlacementFailure[] = [];

    const gridDims = this.grid.getDimensions();
    const startTime = Date.now();

    // Performance tracking
    let totalPositionsTried = 0;
    let totalRotationsTried = 0;

    // Try to place each polygon
    for (let i = 0; i < sorted.length; i++) {
      const polygon = sorted[i];
      const itemStartTime = Date.now();

      // Report progress
      if (this.progressCallback) {
        this.progressCallback({
          current: i + 1,
          total: sorted.length,
          itemId: polygon.id,
          status: 'trying',
          message: `Trying to place ${polygon.id} (${i + 1}/${sorted.length})...`,
        });
      }

      console.log(`\n[${i + 1}/${sorted.length}] Placing ${polygon.id} (${(polygon.width * polygon.height).toFixed(2)} sq in)...`);

      const result = this.findPlacement(polygon, gridDims);

      const itemTime = Date.now() - itemStartTime;

      // Track performance
      totalPositionsTried += result.positionsTried;
      if (result.failure) {
        totalRotationsTried += result.failure.rotationsTried;
      }

      if (result.placement) {
        placements.push(result.placement);
        this.grid.markOccupied(result.placement.cells);

        console.log(
          `  ✓ PLACED at (${result.placement.x.toFixed(2)}, ${result.placement.y.toFixed(2)}) rotation ${result.placement.rotation}° (${itemTime}ms, ${result.positionsTried} positions tried)`
        );

        if (this.progressCallback) {
          this.progressCallback({
            current: i + 1,
            total: sorted.length,
            itemId: polygon.id,
            status: 'placed',
            message: `Placed ${polygon.id} at (${result.placement.x.toFixed(2)}, ${result.placement.y.toFixed(2)})`,
          });
        }
      } else {
        unplaced.push(polygon);
        failures.push(result.failure!);

        console.log(`  ✗ FAILED to place ${polygon.id} (${itemTime}ms)`);
        console.log(`    Positions tried: ${result.positionsTried}`);
        console.log(`    Rotations tried: ${result.failure!.rotationsTried}`);
        console.log(`    Current utilization: ${result.failure!.gridUtilization.toFixed(1)}%`);
        console.log(`    Reason: ${result.failure!.reason}`);

        if (this.progressCallback) {
          this.progressCallback({
            current: i + 1,
            total: sorted.length,
            itemId: polygon.id,
            status: 'failed',
            message: `Failed to place ${polygon.id}: ${result.failure!.reason}`,
          });
        }
      }
    }

    const utilization = this.grid.getUtilization();
    const totalTime = Date.now() - startTime;

    console.log(`\n=== Packing complete ===`);
    console.log(`Placed: ${placements.length}/${polygons.length} (${((placements.length / polygons.length) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${unplaced.length}`);
    console.log(`Utilization: ${utilization.toFixed(1)}%`);
    console.log(`Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
    console.log(`Avg time per item: ${(totalTime / polygons.length).toFixed(0)}ms`);

    if (failures.length > 0) {
      console.log(`\nFailure summary:`);
      failures.forEach(f => {
        console.log(`  - ${f.polygonId}: ${f.reason} (tried ${f.positionsTried} positions, ${f.rotationsTried} rotations)`);
      });
    }

    // Build performance metrics if requested
    let performanceMetrics: PackingPerformanceMetrics | undefined;
    if (trackPerformance) {
      performanceMetrics = {
        totalTimeMs: totalTime,
        totalTimeSec: totalTime / 1000,
        itemCount: polygons.length,
        avgTimePerItemMs: totalTime / polygons.length,
        totalPositionsTried,
        totalRotationsTried,
        successfulPlacements: placements.length,
        failedPlacements: unplaced.length,
        rotationCount: this.rotations.length,
        stepSize: this.stepSize,
        cellsPerInch: gridDims.cellsPerInch,
        gridWidth: gridDims.width,
        gridHeight: gridDims.height,
      };
    }

    return {
      placements,
      utilization,
      unplacedPolygons: unplaced,
      performance: performanceMetrics,
    };
  }

  /**
   * Find a valid placement for a polygon
   * Tries different positions and rotations
   * Returns detailed information about search attempts
   */
  private findPlacement(
    polygon: PackablePolygon,
    gridDims: { width: number; height: number }
  ): {
    placement: PolygonPlacement | null;
    positionsTried: number;
    failure?: PlacementFailure;
  } {
    let positionsTried = 0;
    let rotationsTried = 0;
    const geometryService = new GeometryService();

    // Try each rotation
    for (const rotation of this.rotations) {
      rotationsTried++;

      // Get rotated bounding box to limit search space
      const rotatedPoints =
        rotation !== 0 ? geometryService.rotatePoints(polygon.points, rotation) : polygon.points;
      const bbox = geometryService.getBoundingBox(rotatedPoints);

      // Check if bounding box even fits
      if (bbox.width > gridDims.width || bbox.height > gridDims.height) {
        continue; // Skip this rotation, polygon too large
      }

      // Search grid of positions
      for (let y = 0; y <= gridDims.height - bbox.height; y += this.stepSize) {
        for (let x = 0; x <= gridDims.width - bbox.width; x += this.stepSize) {
          positionsTried++;

          // Rasterize polygon at this position and rotation
          const cells = this.rasterizer.rasterizePolygon(polygon.points, x, y, rotation, this.spacing);

          // Check collision
          if (!this.grid.checkCollision(cells)) {
            // Found valid placement!
            return {
              placement: {
                id: polygon.id,
                x,
                y,
                rotation,
                cells,
              },
              positionsTried,
            };
          }
        }
      }
    }

    // No valid placement found - determine reason
    const currentUtilization = this.grid.getUtilization();
    let reason: string;

    if (polygon.width > gridDims.width || polygon.height > gridDims.height) {
      reason = `Polygon too large for sheet (${polygon.width.toFixed(2)}" × ${polygon.height.toFixed(2)}" > ${gridDims.width.toFixed(2)}" × ${gridDims.height.toFixed(2)}")`;
    } else if (currentUtilization > 80) {
      reason = `Sheet nearly full (${currentUtilization.toFixed(1)}% utilized), no space for polygon`;
    } else if (positionsTried < 10) {
      reason = `Polygon doesn't fit in any rotation (tried ${rotationsTried} rotations)`;
    } else {
      reason = `No collision-free position found (tried ${positionsTried} positions across ${rotationsTried} rotations)`;
    }

    return {
      placement: null,
      positionsTried,
      failure: {
        polygonId: polygon.id,
        positionsTried,
        rotationsTried,
        gridUtilization: currentUtilization,
        reason,
      },
    };
  }

  /**
   * Get current grid utilization
   */
  getUtilization(): number {
    return this.grid.getUtilization();
  }
}

/**
 * Estimate if items can fit in requested pages
 * Uses conservative estimates to fail fast
 */
export function estimateSpaceRequirements(
  polygons: PackablePolygon[],
  sheetWidth: number,
  sheetHeight: number,
  requestedPages: number,
  spacing: number = 0.0625
): SpaceEstimate {
  // Calculate total area of all items
  const totalItemArea = polygons.reduce((sum, p) => sum + p.area, 0);

  // Calculate available sheet area
  const singleSheetArea = sheetWidth * sheetHeight;
  const totalSheetArea = singleSheetArea * requestedPages;

  // Conservative packing efficiency estimates based on empirical data
  // Polygon packing typically achieves 50-70% utilization
  // We use 60% as a reasonable estimate for early detection
  const EXPECTED_EFFICIENCY = 0.60;
  const CONSERVATIVE_EFFICIENCY = 0.50; // Fail-fast threshold

  const estimatedUtilization = totalItemArea / totalSheetArea;
  const conservativeUtilization = totalItemArea / (totalSheetArea * CONSERVATIVE_EFFICIENCY);

  // Estimate minimum pages needed (conservative)
  const minimumPagesNeeded = Math.ceil(totalItemArea / (singleSheetArea * EXPECTED_EFFICIENCY));

  // Determine if items can fit
  const canFitInRequestedPages = conservativeUtilization <= 1.0;

  // Generate warning if needed
  let warning: string | undefined;
  if (!canFitInRequestedPages) {
    const shortage = Math.ceil(minimumPagesNeeded - requestedPages);
    warning = `Insufficient space: ${polygons.length} items need ~${minimumPagesNeeded} pages (requested ${requestedPages}). Add ${shortage} more page(s).`;
  } else if (estimatedUtilization > 0.80) {
    warning = `Tight fit warning: ${polygons.length} items will fill ${(estimatedUtilization * 100).toFixed(0)}% of ${requestedPages} page(s). Some items may not fit.`;
  }

  return {
    totalItemArea,
    totalSheetArea,
    estimatedUtilization,
    minimumPagesNeeded,
    canFitInRequestedPages,
    warning,
  };
}
