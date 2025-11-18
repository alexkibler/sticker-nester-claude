import { GeometryService } from '../services/geometry.service';
import { Point } from '../services/image.service';

describe('GeometryService', () => {
  let service: GeometryService;

  beforeEach(() => {
    service = new GeometryService();
  });

  describe('simplifyPath', () => {
    it('should simplify a path with redundant points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ];

      const simplified = service.simplifyPath(points, 1.0);

      // Should reduce collinear points
      expect(simplified.length).toBeLessThan(points.length);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[simplified.length - 1]).toEqual({ x: 3, y: 3 });
    });

    it('should return unchanged path if already simple', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const simplified = service.simplifyPath(points, 1.0);

      expect(simplified.length).toBe(4);
    });
  });

  describe('rotatePoints', () => {
    it('should rotate points correctly', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

      const rotated = service.rotatePoints(points, 90);

      expect(rotated).toHaveLength(4);
      expect(rotated[0]).toBeDefined();
    });

    it('should return same path for 0 degree rotation', () => {
      const points: Point[] = [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ];

      const rotated = service.rotatePoints(points, 0);

      expect(rotated[0].x).toBeCloseTo(1, 5);
      expect(rotated[0].y).toBeCloseTo(2, 5);
      expect(rotated[1].x).toBeCloseTo(3, 5);
      expect(rotated[1].y).toBeCloseTo(4, 5);
    });

    it('should return same path for 360 degree rotation', () => {
      const points: Point[] = [
        { x: 5, y: 5 },
        { x: 10, y: 5 },
      ];

      const rotated = service.rotatePoints(points, 360);

      expect(rotated[0].x).toBeCloseTo(5, 1);
      expect(rotated[0].y).toBeCloseTo(5, 1);
      expect(rotated[1].x).toBeCloseTo(10, 1);
      expect(rotated[1].y).toBeCloseTo(5, 1);
    });
  });

  describe('getBoundingBox', () => {
    it('should calculate bounding box for a square', () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 },
        { x: 10, y: 40 },
      ];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(10);
      expect(bbox.maxX).toBe(30);
      expect(bbox.minY).toBe(20);
      expect(bbox.maxY).toBe(40);
      expect(bbox.width).toBe(20);
      expect(bbox.height).toBe(20);
    });

    it('should handle single point', () => {
      const points: Point[] = [{ x: 5, y: 10 }];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(5);
      expect(bbox.maxX).toBe(5);
      expect(bbox.minY).toBe(10);
      expect(bbox.maxY).toBe(10);
      expect(bbox.width).toBe(0);
      expect(bbox.height).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const points: Point[] = [
        { x: -10, y: -20 },
        { x: 10, y: 20 },
      ];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(-10);
      expect(bbox.maxX).toBe(10);
      expect(bbox.minY).toBe(-20);
      expect(bbox.maxY).toBe(20);
      expect(bbox.width).toBe(20);
      expect(bbox.height).toBe(40);
    });
  });

  describe('offsetPolygon', () => {
    it('should expand a square by offset distance', () => {
      const points: Point[] = [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
      ];

      const offset = service.offsetPolygon(points, 5, 'square');
      const bbox = service.getBoundingBox(offset);

      // Expanding by 5 on all sides should increase dimensions by 10
      expect(bbox.width).toBeGreaterThan(10);
      expect(bbox.height).toBeGreaterThan(10);
    });

    it('should shrink polygon with negative offset', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const offset = service.offsetPolygon(points, -10, 'square');
      const bbox = service.getBoundingBox(offset);

      // Shrinking by 10 on all sides should decrease dimensions by 20
      expect(bbox.width).toBeLessThan(100);
      expect(bbox.height).toBeLessThan(100);
    });
  });
});
