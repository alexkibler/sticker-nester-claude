import simplify from 'simplify-js';
import * as ClipperLib from 'clipper-lib';
import { Point } from './image.service';

export class GeometryService {
  private readonly CLIPPER_SCALE = 1000;

  /**
   * Simplify a path using Ramer-Douglas-Peucker algorithm
   */
  simplifyPath(points: Point[], tolerance: number = 2.0): Point[] {
    if (points.length <= 2) return points;
    return simplify(points, tolerance, true);
  }

  /**
   * Offset a polygon (for margins/bleed)
   */
  offsetPolygon(
    points: Point[],
    offsetDistance: number,
    joinType: 'round' | 'miter' | 'square' = 'round'
  ): Point[] {
    if (points.length < 3) return points;

    try {
      // Scale points to integers for ClipperLib
      const scaledPath = points.map(p => ({
        X: Math.round(p.x * this.CLIPPER_SCALE),
        Y: Math.round(p.y * this.CLIPPER_SCALE)
      }));

      // Determine join type
      let join: ClipperLib.JoinType;
      switch (joinType) {
        case 'round':
          join = ClipperLib.JoinType.jtRound;
          break;
        case 'miter':
          join = ClipperLib.JoinType.jtMiter;
          break;
        case 'square':
          join = ClipperLib.JoinType.jtSquare;
          break;
        default:
          join = ClipperLib.JoinType.jtRound;
      }

      // Create offset
      const co = new ClipperLib.ClipperOffset();
      co.AddPath(scaledPath, join, ClipperLib.EndType.etClosedPolygon);

      const offsetPaths: ClipperLib.Paths = [];
      co.Execute(offsetPaths, offsetDistance * this.CLIPPER_SCALE);

      // Scale back to original units
      if (offsetPaths.length > 0) {
        return offsetPaths[0].map(p => ({
          x: p.X / this.CLIPPER_SCALE,
          y: p.Y / this.CLIPPER_SCALE
        }));
      }

      return points;
    } catch (error) {
      console.error('Error offsetting polygon:', error);
      return points;
    }
  }

  /**
   * Rotate points around a center
   */
  rotatePoints(points: Point[], degrees: number, center?: Point): Point[] {
    if (!center) {
      center = this.calculateCentroid(points);
    }

    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return points.map(p => {
      const translatedX = p.x - center!.x;
      const translatedY = p.y - center!.y;

      return {
        x: translatedX * cos - translatedY * sin + center!.x,
        y: translatedX * sin + translatedY * cos + center!.y
      };
    });
  }

  /**
   * Calculate centroid of a polygon
   */
  calculateCentroid(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 };

    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  /**
   * Get bounding box of points
   */
  getBoundingBox(points: Point[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}
