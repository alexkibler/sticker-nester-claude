import { Point, Dimensions } from './geometry.types';

/**
 * StickerSource represents a single sticker image with all its geometric data
 * As defined in the architectural specification section 7.1
 */
export interface StickerSource {
  id: string; // UUID
  file: File; // Original user file
  bitmap: ImageBitmap | null; // GPU-ready bitmap for Canvas Preview

  // Dimensionality
  inputDimensions: Dimensions;

  // Geometry
  originalPath: Point[]; // High-res path from ImageTracer
  simplifiedPath: Point[]; // Low-res path for Nesting
  offsetPath: Point[]; // The margin/bleed path

  // Configuration
  margin: number; // In inches

  // Processing state
  isProcessed: boolean;
}
