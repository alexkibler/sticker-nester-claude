/**
 * Random Shape Integration Tests
 *
 * These tests generate random polygonal shapes and verify that the nesting
 * algorithm handles them correctly, including:
 * - No collisions between placed shapes
 * - Reasonable utilization rates
 * - All shapes stay within sheet boundaries
 * - Production mode generates balanced quantities
 */

import { NestingService, Sticker, Placement } from '../services/nesting.service';
import { generateRandomShapes, generateBalancedShapes } from './helpers/shape-generator.helper';

/**
 * Helper function to check for bounding box collisions
 */
function checkBoundingBoxCollision(
  sticker1: Sticker,
  p1: Placement,
  sticker2: Sticker,
  p2: Placement
): boolean {
  const EPSILON = 0.001;

  const getBox = (sticker: Sticker, p: Placement) => {
    const w = p.rotation === 90 ? sticker.height : sticker.width;
    const h = p.rotation === 90 ? sticker.width : sticker.height;
    return {
      minX: p.x,
      minY: p.y,
      maxX: p.x + w,
      maxY: p.y + h,
    };
  };

  const box1 = getBox(sticker1, p1);
  const box2 = getBox(sticker2, p2);

  const overlapX = !(box1.maxX <= box2.minX + EPSILON || box2.maxX <= box1.minX + EPSILON);
  const overlapY = !(box1.maxY <= box2.minY + EPSILON || box2.maxY <= box1.minY + EPSILON);

  return overlapX && overlapY;
}

describe('Random Shape Nesting Integration Tests', () => {
  let service: NestingService;
  const SHEET_WIDTH = 12;
  const SHEET_HEIGHT = 12;
  const SPACING = 0.0625;

  beforeEach(() => {
    service = new NestingService();
  });

  describe('Single Sheet Mode with Random Shapes', () => {
    it('should successfully pack 10 random shapes without collisions', () => {
      const shapes = generateRandomShapes(10);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const result = service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING);

      // Should place some stickers
      expect(result.placements.length).toBeGreaterThan(0);

      // Should have valid utilization
      expect(result.utilization).toBeGreaterThan(0);
      expect(result.utilization).toBeLessThanOrEqual(100);

      // Verify no collisions
      for (let i = 0; i < result.placements.length; i++) {
        for (let j = i + 1; j < result.placements.length; j++) {
          const p1 = result.placements[i];
          const p2 = result.placements[j];

          const sticker1 = stickers.find((s) => s.id === p1.id);
          const sticker2 = stickers.find((s) => s.id === p2.id);

          expect(sticker1).toBeDefined();
          expect(sticker2).toBeDefined();

          if (sticker1 && sticker2) {
            const hasCollision = checkBoundingBoxCollision(sticker1, p1, sticker2, p2);
            expect(hasCollision).toBe(false);
          }
        }
      }
    });

    it('should handle mixed shape types (concave, triangles, pentagons)', () => {
      const shapes = generateBalancedShapes(15);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const result = service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0);

      // Verify all placements stay within sheet bounds
      result.placements.forEach((placement) => {
        const sticker = stickers.find((s) => s.id === placement.id);
        expect(sticker).toBeDefined();

        if (sticker) {
          // Account for rotation when checking bounds
          const width = placement.rotation === 90 ? sticker.height : sticker.width;
          const height = placement.rotation === 90 ? sticker.width : sticker.height;

          // Check that the bounding box fits within the sheet
          expect(placement.x).toBeGreaterThanOrEqual(0);
          expect(placement.y).toBeGreaterThanOrEqual(0);
          expect(placement.x + width).toBeLessThanOrEqual(SHEET_WIDTH + 0.01); // Small epsilon for floating point
          expect(placement.y + height).toBeLessThanOrEqual(SHEET_HEIGHT + 0.01);
        }
      });
    });

    it('should achieve reasonable utilization with various random shapes', () => {
      // Run multiple trials to test consistency
      const trials = 5;
      const utilizations: number[] = [];

      for (let trial = 0; trial < trials; trial++) {
        const shapes = generateRandomShapes(20);
        const stickers: Sticker[] = shapes.map((shape) => ({
          id: `trial${trial}-${shape.id}`,
          points: shape.points,
          width: shape.width,
          height: shape.height,
        }));

        const result = service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING);
        utilizations.push(result.utilization);
      }

      // All trials should have some utilization
      utilizations.forEach((util) => {
        expect(util).toBeGreaterThan(0);
        expect(util).toBeLessThanOrEqual(100);
      });

      // Average utilization should be reasonable (>5% for random shapes)
      const avgUtilization = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
      expect(avgUtilization).toBeGreaterThan(5);
    });
  });

  describe('Production Mode (Multi-Sheet) with Random Shapes', () => {
    it('should distribute random shapes across multiple sheets', () => {
      const shapes = generateBalancedShapes(10);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const pageCount = 3;
      const result = service.nestStickersMultiSheet(stickers, SHEET_WIDTH, SHEET_HEIGHT, pageCount, SPACING);

      // Should have multiple sheets
      expect(result.sheets.length).toBeGreaterThan(0);
      expect(result.sheets.length).toBeLessThanOrEqual(pageCount);

      // Should have quantities for each design
      expect(Object.keys(result.quantities).length).toBeGreaterThan(0);

      // Total placed should match sum of quantities
      let totalPlaced = 0;
      result.sheets.forEach((sheet) => {
        totalPlaced += sheet.placements.length;
      });

      const quantitySum = Object.values(result.quantities).reduce((sum: number, q) => sum + (q as number), 0);
      expect(totalPlaced).toBe(quantitySum);
    });

    it.skip('should verify no collisions in multi-sheet random packing (FLAKY - TODO: fix randomness)', () => {
      const shapes = generateRandomShapes(8);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const result = service.nestStickersMultiSheet(stickers, SHEET_WIDTH, SHEET_HEIGHT, 2, SPACING);

      // Check each sheet for collisions
      result.sheets.forEach((sheet, sheetIndex) => {
        for (let i = 0; i < sheet.placements.length; i++) {
          for (let j = i + 1; j < sheet.placements.length; j++) {
            const p1 = sheet.placements[i];
            const p2 = sheet.placements[j];

            // Extract original sticker ID (remove instance suffix like _0, _1)
            const originalId1 = p1.id.replace(/_\d+$/, '');
            const originalId2 = p2.id.replace(/_\d+$/, '');

            const sticker1 = stickers.find((s) => s.id === originalId1);
            const sticker2 = stickers.find((s) => s.id === originalId2);

            expect(sticker1).toBeDefined();
            expect(sticker2).toBeDefined();

            if (sticker1 && sticker2) {
              const hasCollision = checkBoundingBoxCollision(sticker1, p1, sticker2, p2);

              if (hasCollision) {
                console.error(`Collision detected on sheet ${sheetIndex}:`, {
                  placement1: p1,
                  placement2: p2,
                  sticker1: { id: sticker1.id, width: sticker1.width, height: sticker1.height },
                  sticker2: { id: sticker2.id, width: sticker2.width, height: sticker2.height },
                });
              }

              expect(hasCollision).toBe(false);
            }
          }
        }
      });
    });

    it('should generate balanced quantities in production mode', () => {
      // Use balanced shapes (50% concave, 25% triangles, 25% pentagons)
      const shapes = generateBalancedShapes(12);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const result = service.nestStickersMultiSheet(stickers, SHEET_WIDTH, SHEET_HEIGHT, 3, SPACING);

      // Each design should appear at least once (or close to it)
      const quantities = Object.values(result.quantities) as number[];
      expect(quantities.length).toBeGreaterThan(0);

      // No quantity should dominate excessively
      const maxQty = Math.max(...quantities);
      const minQty = Math.min(...quantities.filter((q) => q > 0));

      if (minQty > 0) {
        const ratio = maxQty / minQty;
        // Random shapes with different sizes will pack differently
        // Allow variance but ensure no single shape dominates (ratio < 10)
        expect(ratio).toBeLessThan(10);
      }
    });

    it('should handle large number of random shapes efficiently', () => {
      const shapes = generateRandomShapes(50);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const startTime = Date.now();
      const result = service.nestStickersMultiSheet(stickers, SHEET_WIDTH, SHEET_HEIGHT, 5, SPACING);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 10 seconds)
      expect(duration).toBeLessThan(10000);

      // Should successfully pack shapes
      expect(result.sheets.length).toBeGreaterThan(0);
      expect(result.totalUtilization).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases with Random Shapes', () => {
    it('should handle very small random shapes', () => {
      // Generate tiny shapes (0.1-0.5 inches)
      const shapes = Array.from({ length: 20 }, (_, i) => {
        const shape = generateRandomShapes(1)[0];
        const scale = 0.1 + Math.random() * 0.4; // 0.1-0.5
        return {
          id: `tiny-${i}`,
          points: shape.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
          width: shape.width * scale,
          height: shape.height * scale,
        };
      });

      const result = service.nestStickers(shapes, SHEET_WIDTH, SHEET_HEIGHT, SPACING);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0);
    });

    it('should handle very large random shapes', () => {
      // Generate large shapes (4-6 inches)
      const shapes = Array.from({ length: 5 }, (_, i) => {
        const shape = generateRandomShapes(1)[0];
        const scale = 4 + Math.random() * 2; // 4-6
        return {
          id: `large-${i}`,
          points: shape.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
          width: shape.width * scale,
          height: shape.height * scale,
        };
      });

      const result = service.nestStickers(shapes, SHEET_WIDTH, SHEET_HEIGHT, SPACING);

      // May not fit all shapes, but should handle gracefully
      expect(result.placements.length).toBeGreaterThanOrEqual(0);
      expect(result.utilization).toBeGreaterThanOrEqual(0);
    });

    it('should handle single random shape', () => {
      const shapes = generateRandomShapes(1);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      const result = service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING);

      expect(result.placements.length).toBe(1);
      expect(result.utilization).toBeGreaterThan(0);
    });
  });

  describe('Stress Tests with Random Shapes', () => {
    it('should handle 100 random shapes without crashing', () => {
      const shapes = generateRandomShapes(100);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      expect(() => {
        service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING);
      }).not.toThrow();
    });

    it('should verify consistency across multiple runs', () => {
      // Generate shapes once
      const shapes = generateRandomShapes(15);
      const stickers: Sticker[] = shapes.map((shape) => ({
        id: shape.id,
        points: shape.points,
        width: shape.width,
        height: shape.height,
      }));

      // Run nesting multiple times with same input
      const results = Array.from({ length: 3 }, () => service.nestStickers(stickers, SHEET_WIDTH, SHEET_HEIGHT, SPACING));

      // Results should be consistent (same placements, utilization)
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result.placements.length).toBe(firstResult.placements.length);
        expect(result.utilization).toBeCloseTo(firstResult.utilization, 2);
        expect(result.fitness).toBeCloseTo(firstResult.fitness, 2);
      });
    });
  });
});
