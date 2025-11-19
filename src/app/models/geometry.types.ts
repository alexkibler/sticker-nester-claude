/**
 * Basic geometry types
 */

export interface Point {
  x: number;
  y: number;
}

export type UnitType = 'in' | 'cm' | 'mm';

export interface Dimensions {
  width: number;
  height: number;
  unit: UnitType;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
