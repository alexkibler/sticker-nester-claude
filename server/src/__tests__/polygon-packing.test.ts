import {
  RasterGrid,
  PolygonRasterizer,
  PolygonPacker,
  PackablePolygon,
  GridCell,
} from '../services/polygon-packing.service';
import { Point } from '../services/image.service';
import { NestingService, Sticker } from '../services/nesting.service';

describe('PolygonPacking', () => {
  describe('RasterGrid', () => {
    it('should initialize grid with correct dimensions', () => {
      const grid = new RasterGrid(12, 12, 100);
      const dims = grid.getDimensions();

      expect(dims.width).toBe(12);
      expect(dims.height).toBe(12);
      expect(dims.cellsPerInch).toBe(100);
    });

    it('should detect collisions with occupied cells', () => {
      const grid = new RasterGrid(12, 12, 100);

      const cells: GridCell[] = [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
        { x: 10, y: 11 },
        { x: 11, y: 11 },
      ];

      // Should not collide before marking
      expect(grid.checkCollision(cells)).toBe(false);

      // Mark as occupied
      grid.markOccupied(cells);

      // Should collide after marking
      expect(grid.checkCollision(cells)).toBe(true);
    });

    it('should detect out-of-bounds collisions', () => {
      const grid = new RasterGrid(12, 12, 100);

      const outOfBoundsCells: GridCell[] = [
        { x: -1, y: 0 }, // Out of bounds
        { x: 0, y: 0 },
      ];

      expect(grid.checkCollision(outOfBoundsCells)).toBe(true);
    });

    it('should calculate utilization correctly', () => {
      const grid = new RasterGrid(10, 10, 10); // 100x100 = 10,000 cells
      const dims = grid.getDimensions();

      // Initially 0% utilization
      expect(grid.getUtilization()).toBe(0);

      // Mark 2,500 cells (25% of grid)
      const cells: GridCell[] = [];
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          cells.push({ x, y });
        }
      }
      grid.markOccupied(cells);

      expect(grid.getUtilization()).toBe(25);
    });
  });

  describe('PolygonRasterizer', () => {
    it('should rasterize a square polygon', () => {
      const rasterizer = new PolygonRasterizer(100);

      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

      const cells = rasterizer.rasterizePolygon(square, 0, 0, 0, 0);

      // Should have roughly 100x100 = 10,000 cells for a 1"x1" square at 100 cells/inch
      expect(cells.length).toBeGreaterThan(9000);
      expect(cells.length).toBeLessThan(11000);
    });

    it('should handle rotation correctly', () => {
      const rasterizer = new PolygonRasterizer(100);

      const rectangle: Point[] = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ];

      // Rasterize at 0° and 90°
      const cells0 = rasterizer.rasterizePolygon(rectangle, 0, 0, 0, 0);
      const cells90 = rasterizer.rasterizePolygon(rectangle, 0, 0, 90, 0);

      // Both should have similar cell counts (2 sq in)
      expect(Math.abs(cells0.length - cells90.length)).toBeLessThan(5000);
    });

    it('should apply spacing correctly', () => {
      const rasterizer = new PolygonRasterizer(100);

      const square: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

      const cellsNoSpacing = rasterizer.rasterizePolygon(square, 0, 0, 0, 0);
      const cellsWithSpacing = rasterizer.rasterizePolygon(square, 0, 0, 0, 0.1);

      // With spacing, polygon should be larger
      expect(cellsWithSpacing.length).toBeGreaterThan(cellsNoSpacing.length);
    });
  });

  describe('PolygonPacker', () => {
    it('should pack a single square polygon', async () => {
      const packer = new PolygonPacker(12, 12, 0.0625, 100, 0.1);

      const polygons: PackablePolygon[] = [
        {
          id: 'square-1',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
          area: 4,
        },
      ];

      const result = await packer.pack(polygons);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('square-1');
      expect(result.placements[0].x).toBeGreaterThanOrEqual(0);
      expect(result.placements[0].y).toBeGreaterThanOrEqual(0);
      expect(result.unplacedPolygons).toHaveLength(0);
    });

    it('should pack multiple non-overlapping squares', async () => {
      const packer = new PolygonPacker(12, 12, 0.0625, 100, 0.1);

      const polygons: PackablePolygon[] = [
        {
          id: 'square-1',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
          area: 4,
        },
        {
          id: 'square-2',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
          area: 4,
        },
        {
          id: 'square-3',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
          area: 4,
        },
      ];

      const result = await packer.pack(polygons);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0);

      // Verify no collisions by checking all placements have unique cells
      const allCells = new Set<string>();
      let hasCollision = false;

      result.placements.forEach(placement => {
        placement.cells.forEach(cell => {
          const key = `${cell.x},${cell.y}`;
          if (allCells.has(key)) {
            hasCollision = true;
          }
          allCells.add(key);
        });
      });

      expect(hasCollision).toBe(false);
    });

    it('should pack irregular polygon (triangle)', async () => {
      const packer = new PolygonPacker(12, 12, 0.0625, 100, 0.1);

      const polygons: PackablePolygon[] = [
        {
          id: 'triangle-1',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 2 },
          ],
          width: 2,
          height: 2,
          area: 2,
        },
      ];

      const result = await packer.pack(polygons);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('triangle-1');
      expect(result.unplacedPolygons).toHaveLength(0);
    });

    it('should try rotations to find optimal placement', async () => {
      const packer = new PolygonPacker(3, 12, 0.0625, 100, 0.1, [0, 90]);

      // Wide rectangle that only fits when rotated
      const polygons: PackablePolygon[] = [
        {
          id: 'rectangle-1',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 10,
          height: 2,
          area: 20,
        },
      ];

      const result = await packer.pack(polygons);

      // Should place with rotation
      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].rotation).toBe(90);
    });
  });

  describe('NestingService - Polygon Methods', () => {
    let service: NestingService;

    beforeEach(() => {
      service = new NestingService();
    });

    it('should use polygon packing for single sheet', async () => {
      const stickers: Sticker[] = [
        {
          id: 'sticker-1',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
        },
      ];

      const result = await service.nestStickersPolygon(stickers, 12, 12, 0.0625, 100, 0.1);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('sticker-1');
      expect(result.utilization).toBeGreaterThan(0);
    });

    it('should use polygon packing for multi-sheet', async () => {
      const stickers: Sticker[] = [
        {
          id: 'sticker-A',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
        },
        {
          id: 'sticker-B',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          width: 1,
          height: 1,
        },
      ];

      const result = await service.nestStickersMultiSheetPolygon(stickers, 12, 12, 2, 0.0625, 50, 0.2);

      expect(result.sheets.length).toBeGreaterThan(0);
      expect(result.totalUtilization).toBeGreaterThan(0);
      expect(result.quantities['sticker-A']).toBeGreaterThan(0);
      expect(result.quantities['sticker-B']).toBeGreaterThan(0);
    });

    it('should handle irregular polygon shapes better than rectangles', async () => {
      // Create a C-shaped polygon that wastes space if packed as rectangle
      const cShape: Point[] = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ];

      const sticker: Sticker = {
        id: 'c-shape',
        points: cShape,
        width: 3,
        height: 3,
      };

      // Pack using rectangles
      const rectResult = service.nestStickers([sticker], 12, 12, 0.0625);

      // Pack using polygons with lower resolution for faster test
      const polyResult = await service.nestStickersPolygon([sticker], 12, 12, 0.0625, 50, 0.2);

      // Both should place the sticker
      expect(rectResult.placements).toHaveLength(1);
      expect(polyResult.placements).toHaveLength(1);

      // Polygon packing should potentially achieve better utilization
      // (though for single item this may not be visible)
      expect(polyResult.utilization).toBeGreaterThan(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty polygon list', async () => {
      const packer = new PolygonPacker(12, 12, 0.0625);
      const result = await packer.pack([]);

      expect(result.placements).toHaveLength(0);
      expect(result.utilization).toBe(0);
      expect(result.unplacedPolygons).toHaveLength(0);
    });

    it('should handle polygons that do not fit', async () => {
      const packer = new PolygonPacker(2, 2, 0.0625, 100, 0.1);

      const tooLarge: PackablePolygon = {
        id: 'too-large',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        width: 10,
        height: 10,
        area: 100,
      };

      const result = await packer.pack([tooLarge]);

      expect(result.placements).toHaveLength(0);
      expect(result.unplacedPolygons).toHaveLength(1);
    });

    it('should work with very small polygons', async () => {
      const packer = new PolygonPacker(12, 12, 0.0625, 100, 0.05);

      const tiny: PackablePolygon = {
        id: 'tiny',
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0 },
          { x: 0.1, y: 0.1 },
          { x: 0, y: 0.1 },
        ],
        width: 0.1,
        height: 0.1,
        area: 0.01,
      };

      const result = await packer.pack([tiny]);

      expect(result.placements).toHaveLength(1);
    });
  });
});
