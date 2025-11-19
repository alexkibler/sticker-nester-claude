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

  constructor(
    widthInches: number,
    heightInches: number,
    spacing: number = 0.0625,
    cellsPerInch: number = 100,
    stepSize: number = 0.05,
    rotations: number[] = [0, 90, 180, 270]
  ) {
    this.grid = new RasterGrid(widthInches, heightInches, cellsPerInch);
    this.rasterizer = new PolygonRasterizer(cellsPerInch);
    this.spacing = spacing;
    this.stepSize = stepSize;
    this.rotations = rotations;
  }

  /**
   * Pack polygons onto the sheet using rasterization overlay algorithm
   */
  pack(polygons: PackablePolygon[]): PolygonPackingResult {
    console.log(`Starting polygon packing: ${polygons.length} polygons`);

    // Sort by area descending (Big Rocks First)
    const sorted = [...polygons].sort((a, b) => b.area - a.area);

    const placements: PolygonPlacement[] = [];
    const unplaced: PackablePolygon[] = [];

    const gridDims = this.grid.getDimensions();

    // Try to place each polygon
    for (const polygon of sorted) {
      const placement = this.findPlacement(polygon, gridDims);

      if (placement) {
        placements.push(placement);
        this.grid.markOccupied(placement.cells);
        console.log(
          `  Placed ${polygon.id} at (${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}) rotation ${placement.rotation}°`
        );
      } else {
        unplaced.push(polygon);
        console.log(`  Failed to place ${polygon.id}`);
      }
    }

    const utilization = this.grid.getUtilization();

    console.log(`Packing complete: ${placements.length}/${polygons.length} placed, ${utilization.toFixed(1)}% utilization`);

    return {
      placements,
      utilization,
      unplacedPolygons: unplaced,
    };
  }

  /**
   * Find a valid placement for a polygon
   * Tries different positions and rotations
   */
  private findPlacement(
    polygon: PackablePolygon,
    gridDims: { width: number; height: number }
  ): PolygonPlacement | null {
    // Try each rotation
    for (const rotation of this.rotations) {
      // Get rotated bounding box to limit search space
      const geometryService = new GeometryService();
      const rotatedPoints =
        rotation !== 0 ? geometryService.rotatePoints(polygon.points, rotation) : polygon.points;
      const bbox = geometryService.getBoundingBox(rotatedPoints);

      // Search grid of positions
      for (let y = 0; y < gridDims.height - bbox.height; y += this.stepSize) {
        for (let x = 0; x < gridDims.width - bbox.width; x += this.stepSize) {
          // Rasterize polygon at this position and rotation
          const cells = this.rasterizer.rasterizePolygon(polygon.points, x, y, rotation, this.spacing);

          // Check collision
          if (!this.grid.checkCollision(cells)) {
            // Found valid placement!
            return {
              id: polygon.id,
              x,
              y,
              rotation,
              cells,
            };
          }
        }
      }
    }

    // No valid placement found
    return null;
  }

  /**
   * Get current grid utilization
   */
  getUtilization(): number {
    return this.grid.getUtilization();
  }
}
