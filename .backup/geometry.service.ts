import { Injectable } from '@angular/core';
import { Point } from '../models';
import simplify from 'simplify-js';
import * as ClipperLib from 'js-clipper';

/**
 * GeometryService handles polygon operations
 *
 * Key operations:
 * - Path simplification using Ramer-Douglas-Peucker algorithm
 * - Polygon offsetting (dilation) for bleed/margin using ClipperLib
 * - Coordinate transformations and rotations
 *
 * As specified in sections 4.2 and 4.3 of the architectural specification
 */
@Injectable({
  providedIn: 'root'
})
export class GeometryService {
  private clipperScale = 1000; // Scale factor for ClipperLib integer precision

  constructor() {}

  /**
   * Simplify a polygon path using the Ramer-Douglas-Peucker algorithm
   *
   * @param points - Array of points to simplify
   * @param tolerance - Distance tolerance (higher = more aggressive simplification)
   * @param highQuality - Use high-quality mode (slower but better results)
   * @returns Simplified array of points
   */
  simplifyPath(
    points: Point[],
    tolerance: number = 2.0,
    highQuality: boolean = true
  ): Point[] {
    if (points.length <= 2) {
      return points;
    }

    // simplify-js expects objects with x,y properties
    const simplified = simplify(points, tolerance, highQuality);
    return simplified;
  }

  /**
   * Offset (dilate) a polygon to create a margin/bleed
   * Uses ClipperLib for precise geometric offset
   *
   * @param points - Original polygon points
   * @param offsetDistance - Distance to offset (in same units as points)
   * @param joinType - Corner style: 'round', 'miter', or 'square'
   * @returns Offset polygon points
   */
  async offsetPolygon(
    points: Point[],
    offsetDistance: number,
    joinType: 'round' | 'miter' | 'square' = 'round'
  ): Promise<Point[]> {
    if (points.length < 3) {
      return points;
    }

    try {
      // Convert points to ClipperLib format (scaled to integers)
      const scaledPath = points.map(p => ({
        X: Math.round(p.x * this.clipperScale),
        Y: Math.round(p.y * this.clipperScale)
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
      const clipperOffset = new ClipperLib.ClipperOffset();
      clipperOffset.AddPath(
        scaledPath,
        join,
        ClipperLib.EndType.etClosedPolygon
      );

      const offsetPaths: ClipperLib.Paths = [];
      clipperOffset.Execute(offsetPaths, offsetDistance * this.clipperScale);

      // Return first path (should only be one for simple offset)
      if (offsetPaths.length > 0) {
        const resultPath = offsetPaths[0].map(p => ({
          x: p.X / this.clipperScale,
          y: p.Y / this.clipperScale
        }));
        return resultPath;
      }

      return points;
    } catch (error) {
      console.error('Error offsetting polygon:', error);
      return points;
    }
  }

  /**
   * Rotate a polygon around a point
   *
   * @param points - Points to rotate
   * @param angleDegrees - Rotation angle in degrees
   * @param center - Center point of rotation (defaults to origin)
   * @returns Rotated points
   */
  rotatePolygon(
    points: Point[],
    angleDegrees: number,
    center: Point = { x: 0, y: 0 }
  ): Point[] {
    const angleRadians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);

    return points.map(p => {
      // Translate to origin
      const translatedX = p.x - center.x;
      const translatedY = p.y - center.y;

      // Rotate
      const rotatedX = translatedX * cos - translatedY * sin;
      const rotatedY = translatedX * sin + translatedY * cos;

      // Translate back
      return {
        x: rotatedX + center.x,
        y: rotatedY + center.y
      };
    });
  }

  /**
   * Calculate the bounding box of a polygon
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

  /**
   * Translate (move) a polygon
   */
  translatePolygon(points: Point[], dx: number, dy: number): Point[] {
    return points.map(p => ({
      x: p.x + dx,
      y: p.y + dy
    }));
  }

  /**
   * Calculate the area of a polygon using the Shoelace formula
   */
  calculateArea(points: Point[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
  }

  /**
   * Calculate the centroid (center of mass) of a polygon
   */
  calculateCentroid(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 };

    const n = points.length;
    let cx = 0;
    let cy = 0;
    let area = 0;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = points[i].x * points[j].y - points[j].x * points[i].y;
      cx += (points[i].x + points[j].x) * cross;
      cy += (points[i].y + points[j].y) * cross;
      area += cross;
    }

    area /= 2;
    const factor = 1 / (6 * area);

    return {
      x: cx * factor,
      y: cy * factor
    };
  }

  /**
   * Check if a point is inside a polygon (ray casting algorithm)
   */
  pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Scale a polygon by a factor
   */
  scalePolygon(
    points: Point[],
    scale: number,
    center?: Point
  ): Point[] {
    if (!center) {
      center = this.calculateCentroid(points);
    }

    return points.map(p => ({
      x: center!.x + (p.x - center!.x) * scale,
      y: center!.y + (p.y - center!.y) * scale
    }));
  }

  /**
   * Reverse the winding order of a polygon
   */
  reverseWinding(points: Point[]): Point[] {
    return [...points].reverse();
  }

  /**
   * Ensure polygon has clockwise winding order
   */
  ensureClockwise(points: Point[]): Point[] {
    const area = this.calculateSignedArea(points);
    // If area is positive, polygon is counter-clockwise
    if (area > 0) {
      return this.reverseWinding(points);
    }
    return points;
  }

  /**
   * Calculate signed area (positive = counter-clockwise, negative = clockwise)
   */
  private calculateSignedArea(points: Point[]): number {
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return area / 2;
  }
}
