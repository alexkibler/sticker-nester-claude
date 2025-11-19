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

    it('should expand a triangle by offset distance', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const offset = service.offsetPolygon(points, 2, 'round');
      const bbox = service.getBoundingBox(offset);

      // Triangle should expand on all sides
      expect(offset.length).toBeGreaterThan(0);
      expect(bbox.width).toBeGreaterThan(10);
      expect(bbox.height).toBeGreaterThan(10);
    });

    it('should expand a hexagon by offset distance', () => {
      // Regular hexagon
      const points: Point[] = [
        { x: 10, y: 0 },
        { x: 5, y: 8.66 },
        { x: -5, y: 8.66 },
        { x: -10, y: 0 },
        { x: -5, y: -8.66 },
        { x: 5, y: -8.66 },
      ];

      const offset = service.offsetPolygon(points, 1, 'round');
      const bbox = service.getBoundingBox(offset);

      // Hexagon should expand
      expect(offset.length).toBeGreaterThan(0);
      expect(bbox.width).toBeGreaterThan(20);
      expect(bbox.height).toBeGreaterThan(17.32);
    });

    it('should handle a circle approximation', () => {
      // Create a circle approximation with 20 points
      const points: Point[] = [];
      const radius = 10;
      const segments = 20;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }

      const offset = service.offsetPolygon(points, 2, 'round');

      expect(offset.length).toBeGreaterThan(0);
      // Offset circle should have larger radius
      const offsetBbox = service.getBoundingBox(offset);
      expect(offsetBbox.width).toBeGreaterThan(20);
    });

    it('should handle an L-shaped polygon', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ];

      const offset = service.offsetPolygon(points, 1, 'square');

      expect(offset.length).toBeGreaterThan(0);
    });

    it('should handle a star shape', () => {
      // 5-pointed star
      const points: Point[] = [
        { x: 0, y: -10 },
        { x: 2.5, y: -2.5 },
        { x: 9.5, y: -2.5 },
        { x: 4, y: 2 },
        { x: 6, y: 9 },
        { x: 0, y: 4.5 },
        { x: -6, y: 9 },
        { x: -4, y: 2 },
        { x: -9.5, y: -2.5 },
        { x: -2.5, y: -2.5 },
      ];

      const offset = service.offsetPolygon(points, 0.5, 'round');

      expect(offset.length).toBeGreaterThan(0);
    });
  });

  describe('Non-rectangular shapes - getBoundingBox', () => {
    it('should calculate bounding box for a triangle', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(0);
      expect(bbox.maxX).toBe(10);
      expect(bbox.minY).toBe(0);
      expect(bbox.maxY).toBe(10);
      expect(bbox.width).toBe(10);
      expect(bbox.height).toBe(10);
    });

    it('should calculate bounding box for a hexagon', () => {
      const points: Point[] = [
        { x: 10, y: 0 },
        { x: 5, y: 8.66 },
        { x: -5, y: 8.66 },
        { x: -10, y: 0 },
        { x: -5, y: -8.66 },
        { x: 5, y: -8.66 },
      ];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(-10);
      expect(bbox.maxX).toBe(10);
      expect(bbox.width).toBe(20);
      expect(bbox.height).toBeCloseTo(17.32, 1);
    });

    it('should calculate bounding box for a circle approximation', () => {
      const points: Point[] = [];
      const radius = 5;
      const segments = 12;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }

      const bbox = service.getBoundingBox(points);

      expect(bbox.width).toBeCloseTo(10, 0);
      expect(bbox.height).toBeCloseTo(10, 0);
    });

    it('should calculate bounding box for an irregular polygon', () => {
      const points: Point[] = [
        { x: 1, y: 1 },
        { x: 5, y: 2 },
        { x: 7, y: 6 },
        { x: 3, y: 8 },
        { x: 0, y: 4 },
      ];

      const bbox = service.getBoundingBox(points);

      expect(bbox.minX).toBe(0);
      expect(bbox.maxX).toBe(7);
      expect(bbox.minY).toBe(1);
      expect(bbox.maxY).toBe(8);
      expect(bbox.width).toBe(7);
      expect(bbox.height).toBe(7);
    });
  });

  describe('Non-rectangular shapes - rotatePoints', () => {
    it('should rotate a triangle correctly', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const rotated = service.rotatePoints(points, 90);

      expect(rotated).toHaveLength(3);
      // After 90-degree rotation, rightmost point should be topmost
      const bbox = service.getBoundingBox(rotated);
      expect(bbox.width).toBeCloseTo(10, 0);
      expect(bbox.height).toBeCloseTo(10, 0);
    });

    it('should rotate a hexagon correctly', () => {
      const points: Point[] = [
        { x: 10, y: 0 },
        { x: 5, y: 8.66 },
        { x: -5, y: 8.66 },
        { x: -10, y: 0 },
        { x: -5, y: -8.66 },
        { x: 5, y: -8.66 },
      ];

      const rotated = service.rotatePoints(points, 60);

      expect(rotated).toHaveLength(6);
      // Bounding box dimensions should remain similar for a regular hexagon
      const bbox = service.getBoundingBox(rotated);
      expect(bbox.width).toBeCloseTo(20, 0);
    });

    it('should rotate a circle approximation correctly', () => {
      const points: Point[] = [];
      const radius = 5;
      const segments = 8;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }

      const rotated = service.rotatePoints(points, 45);

      expect(rotated).toHaveLength(8);
      // Circle should maintain same bounding box size after rotation
      const bbox = service.getBoundingBox(rotated);
      expect(bbox.width).toBeCloseTo(10, 0);
      expect(bbox.height).toBeCloseTo(10, 0);
    });
  });

  describe('Non-rectangular shapes - calculateCentroid', () => {
    it('should calculate centroid of a triangle', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
      ];

      const centroid = service.calculateCentroid(points);

      // Centroid of triangle is average of vertices
      expect(centroid.x).toBeCloseTo(3, 1);
      expect(centroid.y).toBeCloseTo(2, 1);
    });

    it('should calculate centroid of a hexagon', () => {
      const points: Point[] = [
        { x: 10, y: 0 },
        { x: 5, y: 8.66 },
        { x: -5, y: 8.66 },
        { x: -10, y: 0 },
        { x: -5, y: -8.66 },
        { x: 5, y: -8.66 },
      ];

      const centroid = service.calculateCentroid(points);

      // Regular hexagon centered at origin
      expect(centroid.x).toBeCloseTo(0, 0);
      expect(centroid.y).toBeCloseTo(0, 0);
    });

    it('should calculate centroid of an irregular polygon', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ];

      const centroid = service.calculateCentroid(points);

      expect(centroid.x).toBeGreaterThan(0);
      expect(centroid.y).toBeGreaterThan(0);
      expect(centroid.x).toBeLessThan(10);
      expect(centroid.y).toBeLessThan(10);
    });
  });

  describe('Non-rectangular shapes - simplifyPath', () => {
    it('should simplify a circle approximation', () => {
      const points: Point[] = [];
      const radius = 10;
      const segments = 100;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }

      const simplified = service.simplifyPath(points, 0.5);

      // Should reduce the number of points significantly
      expect(simplified.length).toBeLessThan(points.length);
      expect(simplified.length).toBeGreaterThan(10);
    });

    it('should simplify an irregular polygon with redundant points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0.1 },
        { x: 2, y: 0 },
        { x: 3, y: 0.05 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ];

      const simplified = service.simplifyPath(points, 0.5);

      // Should remove nearly collinear points
      expect(simplified.length).toBeLessThan(points.length);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
    });

    it('should preserve triangle shape', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const simplified = service.simplifyPath(points, 1.0);

      // Triangle already simple, should remain unchanged
      expect(simplified.length).toBe(3);
    });
  });
});
