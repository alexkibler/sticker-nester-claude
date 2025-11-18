import { NestingService, Sticker } from '../services/nesting.service';
import { Point } from '../services/image.service';

describe('NestingService', () => {
  let service: NestingService;

  beforeEach(() => {
    service = new NestingService();
  });

  describe('nestStickers', () => {
    it('should nest a single square sticker', () => {
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

      const result = service.nestStickers(stickers, 12, 12, 0.0625);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('sticker-1');
      expect(result.placements[0].x).toBeGreaterThanOrEqual(0);
      expect(result.placements[0].y).toBeGreaterThanOrEqual(0);
      expect(result.utilization).toBeGreaterThan(0);
    });

    it('should nest multiple identical squares optimally', () => {
      // Test case: Four 2x2 squares should fit in a 5x5 sheet with 0.0625 spacing
      // Expected: All 4 should fit with ~64% utilization (16 sq in / 25 sq in)
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
        {
          id: 'sticker-2',
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
          id: 'sticker-3',
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
          id: 'sticker-4',
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

      const result = service.nestStickers(stickers, 5, 5, 0.0625);

      // All 4 stickers should be placed
      expect(result.placements).toHaveLength(4);

      // Check that each sticker is placed
      expect(result.placements.map(p => p.id)).toContain('sticker-1');
      expect(result.placements.map(p => p.id)).toContain('sticker-2');
      expect(result.placements.map(p => p.id)).toContain('sticker-3');
      expect(result.placements.map(p => p.id)).toContain('sticker-4');

      // Utilization should be around 64% (16 / 25)
      expect(result.utilization).toBeGreaterThan(50);
      expect(result.utilization).toBeLessThan(70);
    });

    it('should handle case where not all stickers fit', () => {
      // Try to fit ten 3x3 squares in a 5x5 sheet
      // Only 1-2 should fit
      const stickers: Sticker[] = Array.from({ length: 10 }, (_, i) => ({
        id: `sticker-${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 3 },
          { x: 0, y: 3 },
        ],
        width: 3,
        height: 3,
      }));

      const result = service.nestStickers(stickers, 5, 5, 0.0625);

      // Only a few should fit
      expect(result.placements.length).toBeLessThan(10);
      expect(result.placements.length).toBeGreaterThan(0);
    });

    it('should sort by area (largest first)', () => {
      const stickers: Sticker[] = [
        {
          id: 'small',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          width: 1,
          height: 1,
        },
        {
          id: 'large',
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 3 },
            { x: 0, y: 3 },
          ],
          width: 3,
          height: 3,
        },
        {
          id: 'medium',
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

      const result = service.nestStickers(stickers, 12, 12, 0.0625);

      expect(result.placements).toHaveLength(3);

      // Largest should be placed first (at or near origin with spacing)
      const largePlacement = result.placements.find(p => p.id === 'large');
      expect(largePlacement).toBeDefined();
      expect(largePlacement!.x).toBeCloseTo(0.0625, 4);
      expect(largePlacement!.y).toBeCloseTo(0.0625, 4);
    });

    it('should calculate fitness correctly', () => {
      const stickers: Sticker[] = [
        {
          id: 'sticker-1',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 3 },
            { x: 0, y: 3 },
          ],
          width: 2,
          height: 3,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0);

      // Fitness should equal the area of the sticker (2 * 3 = 6)
      expect(result.fitness).toBe(6);
    });

    it('should respect spacing between stickers', () => {
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
        {
          id: 'sticker-2',
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

      const spacing = 0.5;
      const result = service.nestStickers(stickers, 12, 12, spacing);

      expect(result.placements).toHaveLength(2);

      // First sticker should be at (spacing, spacing)
      expect(result.placements[0].x).toBeCloseTo(spacing, 4);
      expect(result.placements[0].y).toBeCloseTo(spacing, 4);

      // Second sticker should be at (spacing + 2 + spacing, spacing)
      expect(result.placements[1].x).toBeCloseTo(2 + 2 * spacing, 4);
      expect(result.placements[1].y).toBeCloseTo(spacing, 4);
    });

    it('should calculate 100% utilization for perfect fit', () => {
      // Four 1x1 squares perfectly fitting in a 2x2 sheet with no spacing
      const stickers: Sticker[] = Array.from({ length: 4 }, (_, i) => ({
        id: `sticker-${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        width: 1,
        height: 1,
      }));

      const result = service.nestStickers(stickers, 2, 2, 0);

      expect(result.placements).toHaveLength(4);
      expect(result.utilization).toBeCloseTo(100, 0);
    });
  });

  describe('Non-rectangular sticker shapes', () => {
    it('should nest triangular stickers', () => {
      const stickers: Sticker[] = [
        {
          id: 'triangle-1',
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 1.5, y: 3 },
          ],
          width: 3,
          height: 3,
        },
        {
          id: 'triangle-2',
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 1.5, y: 3 },
          ],
          width: 3,
          height: 3,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      expect(result.placements).toHaveLength(2);
      expect(result.utilization).toBeGreaterThan(0);

      // Verify both triangles are placed
      expect(result.placements.map(p => p.id)).toContain('triangle-1');
      expect(result.placements.map(p => p.id)).toContain('triangle-2');
    });

    it('should nest hexagonal stickers', () => {
      const stickers: Sticker[] = [
        {
          id: 'hex-1',
          points: [
            { x: 2, y: 0 },
            { x: 1, y: 1.73 },
            { x: -1, y: 1.73 },
            { x: -2, y: 0 },
            { x: -1, y: -1.73 },
            { x: 1, y: -1.73 },
          ],
          width: 4,
          height: 3.46,
        },
        {
          id: 'hex-2',
          points: [
            { x: 2, y: 0 },
            { x: 1, y: 1.73 },
            { x: -1, y: 1.73 },
            { x: -2, y: 0 },
            { x: -1, y: -1.73 },
            { x: 1, y: -1.73 },
          ],
          width: 4,
          height: 3.46,
        },
      ];

      const result = service.nestStickers(stickers, 12, 12, 0.0625);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0);
    });

    it('should nest circular stickers (approximated)', () => {
      // Create circle approximation
      const points: Point[] = [];
      const radius = 1.5;
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }

      const stickers: Sticker[] = [
        {
          id: 'circle-1',
          points: points,
          width: 3,
          height: 3,
        },
        {
          id: 'circle-2',
          points: points,
          width: 3,
          height: 3,
        },
        {
          id: 'circle-3',
          points: points,
          width: 3,
          height: 3,
        },
      ];

      const result = service.nestStickers(stickers, 12, 12, 0.0625);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.placements.length).toBeLessThanOrEqual(3);
    });

    it('should nest star-shaped stickers', () => {
      const stickers: Sticker[] = [
        {
          id: 'star-1',
          points: [
            { x: 0, y: -2 },
            { x: 0.5, y: -0.5 },
            { x: 1.9, y: -0.5 },
            { x: 0.8, y: 0.4 },
            { x: 1.2, y: 1.8 },
            { x: 0, y: 0.9 },
            { x: -1.2, y: 1.8 },
            { x: -0.8, y: 0.4 },
            { x: -1.9, y: -0.5 },
            { x: -0.5, y: -0.5 },
          ],
          width: 3.8,
          height: 3.8,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('star-1');
      expect(result.utilization).toBeGreaterThan(0);
    });

    it('should nest L-shaped stickers', () => {
      const stickers: Sticker[] = [
        {
          id: 'l-shape-1',
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 1.5 },
            { x: 1.5, y: 1.5 },
            { x: 1.5, y: 3 },
            { x: 0, y: 3 },
          ],
          width: 3,
          height: 3,
        },
        {
          id: 'l-shape-2',
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 1.5 },
            { x: 1.5, y: 1.5 },
            { x: 1.5, y: 3 },
            { x: 0, y: 3 },
          ],
          width: 3,
          height: 3,
        },
      ];

      const result = service.nestStickers(stickers, 12, 12, 0.0625);

      expect(result.placements.length).toBeGreaterThan(0);
      expect(result.placements.length).toBeLessThanOrEqual(2);
    });

    it('should nest irregular polygon stickers', () => {
      const stickers: Sticker[] = [
        {
          id: 'irregular-1',
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 1 },
            { x: 5, y: 4 },
            { x: 2, y: 5 },
            { x: 0, y: 3 },
          ],
          width: 5,
          height: 5,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('irregular-1');
    });

    it('should nest mixed shapes efficiently', () => {
      const stickers: Sticker[] = [
        // Triangle
        {
          id: 'triangle',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 2 },
          ],
          width: 2,
          height: 2,
        },
        // Square
        {
          id: 'square',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          width: 2,
          height: 2,
        },
        // Pentagon
        {
          id: 'pentagon',
          points: [
            { x: 1, y: 0 },
            { x: 1.95, y: 0.69 },
            { x: 1.59, y: 1.81 },
            { x: 0.41, y: 1.81 },
            { x: 0.05, y: 0.69 },
          ],
          width: 1.95,
          height: 1.81,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      // All shapes should fit
      expect(result.placements).toHaveLength(3);
      expect(result.placements.map(p => p.id)).toContain('triangle');
      expect(result.placements.map(p => p.id)).toContain('square');
      expect(result.placements.map(p => p.id)).toContain('pentagon');
    });

    it('should handle non-rectangular shapes that do not fit', () => {
      // Create large irregular polygons
      const stickers: Sticker[] = Array.from({ length: 20 }, (_, i) => ({
        id: `large-irregular-${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 1 },
          { x: 6, y: 5 },
          { x: 2, y: 6 },
          { x: 0, y: 4 },
        ],
        width: 6,
        height: 6,
      }));

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      // Not all should fit
      expect(result.placements.length).toBeLessThan(20);
      expect(result.placements.length).toBeGreaterThan(0);
    });

    it('should calculate fitness correctly for non-rectangular shapes', () => {
      const stickers: Sticker[] = [
        {
          id: 'triangle',
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 2, y: 3 },
          ],
          width: 4,
          height: 3,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0);

      // Fitness should be width * height = 4 * 3 = 12
      expect(result.fitness).toBe(12);
    });

    it('should handle very complex polygon shapes', () => {
      // Create a complex heart-like shape
      const stickers: Sticker[] = [
        {
          id: 'heart',
          points: [
            { x: 0, y: -2 },
            { x: 1, y: -3 },
            { x: 2, y: -2 },
            { x: 2, y: 0 },
            { x: 0, y: 2 },
            { x: -2, y: 0 },
            { x: -2, y: -2 },
            { x: -1, y: -3 },
          ],
          width: 4,
          height: 5,
        },
      ];

      const result = service.nestStickers(stickers, 10, 10, 0.0625);

      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].id).toBe('heart');
    });
  });
});
