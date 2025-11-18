import { TestBed } from '@angular/core/testing';
import { GeometryService } from './geometry.service';
import { Point } from '../models';

describe('GeometryService', () => {
  let service: GeometryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GeometryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('simplifyPath', () => {
    it('should simplify a path with many points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0.1 },
        { x: 2, y: -0.1 },
        { x: 3, y: 0.1 },
        { x: 4, y: 0 }
      ];

      const simplified = service.simplifyPath(points, 0.5, true);
      expect(simplified.length).toBeLessThan(points.length);
    });

    it('should return path unchanged if already simple', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ];

      const simplified = service.simplifyPath(points, 1.0, true);
      expect(simplified.length).toBe(points.length);
    });
  });

  describe('getBoundingBox', () => {
    it('should calculate correct bounding box', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 }
      ];

      const bbox = service.getBoundingBox(points);
      expect(bbox.minX).toBe(0);
      expect(bbox.minY).toBe(0);
      expect(bbox.maxX).toBe(10);
      expect(bbox.maxY).toBe(5);
      expect(bbox.width).toBe(10);
      expect(bbox.height).toBe(5);
    });

    it('should handle empty array', () => {
      const bbox = service.getBoundingBox([]);
      expect(bbox.width).toBe(0);
      expect(bbox.height).toBe(0);
    });
  });

  describe('rotatePolygon', () => {
    it('should rotate 90 degrees correctly', () => {
      const points: Point[] = [
        { x: 1, y: 0 },
        { x: 0, y: 0 }
      ];

      const rotated = service.rotatePolygon(points, 90);
      expect(rotated[0].x).toBeCloseTo(0, 5);
      expect(rotated[0].y).toBeCloseTo(1, 5);
    });

    it('should rotate around a custom center', () => {
      const points: Point[] = [{ x: 2, y: 0 }];
      const center: Point = { x: 1, y: 0 };

      const rotated = service.rotatePolygon(points, 90, center);
      expect(rotated[0].x).toBeCloseTo(1, 5);
      expect(rotated[0].y).toBeCloseTo(1, 5);
    });
  });

  describe('translatePolygon', () => {
    it('should translate polygon correctly', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ];

      const translated = service.translatePolygon(points, 5, 10);
      expect(translated[0]).toEqual({ x: 5, y: 10 });
      expect(translated[1]).toEqual({ x: 6, y: 11 });
    });
  });

  describe('calculateArea', () => {
    it('should calculate area of a square', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];

      const area = service.calculateArea(points);
      expect(area).toBe(100);
    });

    it('should calculate area of a triangle', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];

      const area = service.calculateArea(points);
      expect(area).toBe(50);
    });
  });

  describe('calculateCentroid', () => {
    it('should calculate centroid of a square', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];

      const centroid = service.calculateCentroid(points);
      expect(centroid.x).toBeCloseTo(5, 1);
      expect(centroid.y).toBeCloseTo(5, 1);
    });
  });

  describe('pointInPolygon', () => {
    it('should detect point inside polygon', () => {
      const polygon: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];

      expect(service.pointInPolygon({ x: 5, y: 5 }, polygon)).toBe(true);
    });

    it('should detect point outside polygon', () => {
      const polygon: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];

      expect(service.pointInPolygon({ x: 15, y: 15 }, polygon)).toBe(false);
    });
  });

  describe('scalePolygon', () => {
    it('should scale polygon by factor', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ];

      const scaled = service.scalePolygon(points, 2);
      const bbox = service.getBoundingBox(scaled);

      // After scaling by 2, bounding box should be roughly twice as large
      expect(bbox.width).toBeGreaterThan(15);
      expect(bbox.height).toBeGreaterThan(15);
    });
  });

  describe('ensureClockwise', () => {
    it('should keep clockwise polygon unchanged', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 }
      ];

      const result = service.ensureClockwise(points);
      expect(result).toEqual(points);
    });

    it('should reverse counter-clockwise polygon', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];

      const result = service.ensureClockwise(points);
      expect(result).not.toEqual(points);
      expect(result.length).toBe(points.length);
    });
  });
});
