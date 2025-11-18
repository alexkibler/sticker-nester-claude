import { Injectable } from '@angular/core';
import { UnitType } from '../models';

/**
 * UnitConversionService - Single source of truth for unit conversions
 *
 * Handles conversions between:
 * - User units (inches, cm, mm)
 * - PDF units (points at 72 DPI)
 * - Print units (dots at 300 DPI)
 * - Canvas units (CSS pixels at 96 DPI)
 * - Clipper units (scaled integers for precision)
 *
 * As specified in section 6.2 of the architectural specification
 */
@Injectable({
  providedIn: 'root'
})
export class UnitConversionService {
  // DPI constants
  private readonly PDF_DPI = 72;
  private readonly PRINT_DPI = 300;
  private readonly CANVAS_DPI = 96;
  private readonly CLIPPER_SCALE = 1000; // Scale factor for ClipperLib integer math

  constructor() {}

  /**
   * Convert any unit to inches (base unit)
   */
  toInches(value: number, unit: UnitType): number {
    switch (unit) {
      case 'in':
        return value;
      case 'cm':
        return value / 2.54;
      case 'mm':
        return value / 25.4;
      default:
        throw new Error(`Unknown unit: ${unit}`);
    }
  }

  /**
   * Convert inches to any unit
   */
  fromInches(inches: number, unit: UnitType): number {
    switch (unit) {
      case 'in':
        return inches;
      case 'cm':
        return inches * 2.54;
      case 'mm':
        return inches * 25.4;
      default:
        throw new Error(`Unknown unit: ${unit}`);
    }
  }

  /**
   * Convert user units to PDF points
   * Formula: value (in inches) × 72 points/inch = PDF points
   */
  toPdfPoints(value: number, unit: UnitType): number {
    const inches = this.toInches(value, unit);
    return inches * this.PDF_DPI;
  }

  /**
   * Convert PDF points to user units
   */
  fromPdfPoints(points: number, unit: UnitType): number {
    const inches = points / this.PDF_DPI;
    return this.fromInches(inches, unit);
  }

  /**
   * Convert user units to print dots (300 DPI)
   */
  toPrintDots(value: number, unit: UnitType): number {
    const inches = this.toInches(value, unit);
    return inches * this.PRINT_DPI;
  }

  /**
   * Convert print dots to user units
   */
  fromPrintDots(dots: number, unit: UnitType): number {
    const inches = dots / this.PRINT_DPI;
    return this.fromInches(inches, unit);
  }

  /**
   * Convert user units to canvas pixels (96 DPI)
   */
  toCanvasPixels(value: number, unit: UnitType): number {
    const inches = this.toInches(value, unit);
    return inches * this.CANVAS_DPI;
  }

  /**
   * Convert canvas pixels to user units
   */
  fromCanvasPixels(pixels: number, unit: UnitType): number {
    const inches = pixels / this.CANVAS_DPI;
    return this.fromInches(inches, unit);
  }

  /**
   * Convert user units to Clipper internal units (scaled integers)
   * ClipperLib requires integer coordinates for stability
   */
  toClipperUnits(value: number, unit: UnitType): number {
    const inches = this.toInches(value, unit);
    // Use print DPI as base resolution, then scale for integer math
    return Math.round(inches * this.PRINT_DPI * this.CLIPPER_SCALE);
  }

  /**
   * Convert Clipper units back to user units
   */
  fromClipperUnits(clipperValue: number, unit: UnitType): number {
    const inches = clipperValue / (this.PRINT_DPI * this.CLIPPER_SCALE);
    return this.fromInches(inches, unit);
  }

  /**
   * Scale coordinates from one unit system to another
   * Used for scaling polygon coordinates
   */
  scaleCoordinates(
    value: number,
    fromUnit: UnitType,
    toUnit: UnitType
  ): number {
    const inches = this.toInches(value, fromUnit);
    return this.fromInches(inches, toUnit);
  }

  /**
   * Get the scale factor for PDF image embedding
   * When embedding a raster image in PDF, we need to scale it
   * to match the physical dimensions
   */
  getImageScaleFactor(
    imageWidthPixels: number,
    targetWidthInches: number
  ): number {
    const targetWidthPoints = targetWidthInches * this.PDF_DPI;
    return targetWidthPoints / imageWidthPixels;
  }

  /**
   * Calculate DPI of an image given its pixel dimensions and physical size
   */
  calculateDPI(
    imageSizePixels: number,
    physicalSize: number,
    unit: UnitType
  ): number {
    const physicalInches = this.toInches(physicalSize, unit);
    return imageSizePixels / physicalInches;
  }

  /**
   * Get the Clipper scale constant for external use
   */
  getClipperScale(): number {
    return this.CLIPPER_SCALE;
  }

  /**
   * Get PDF DPI constant
   */
  getPdfDpi(): number {
    return this.PDF_DPI;
  }

  /**
   * Get Print DPI constant
   */
  getPrintDpi(): number {
    return this.PRINT_DPI;
  }
}
