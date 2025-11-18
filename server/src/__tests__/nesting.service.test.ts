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
});
