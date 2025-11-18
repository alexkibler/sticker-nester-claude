import { Injectable } from '@angular/core';
import { Point } from '../models';
import ImageTracer from 'imagetracerjs';

/**
 * ImageAnalysisService handles raster-to-vector conversion
 *
 * Key operations:
 * - Loading image files into ImageBitmap
 * - Extracting alpha channel for boundary detection
 * - Tracing raster images to vector paths using ImageTracer
 * - Converting traced SVG paths to coordinate arrays
 *
 * As specified in section 4.1 of the architectural specification
 */
@Injectable({
  providedIn: 'root'
})
export class ImageAnalysisService {
  constructor() {}

  /**
   * Load an image file and create an ImageBitmap for efficient canvas rendering
   */
  async loadImageBitmap(file: File): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const blob = new Blob([e.target!.result as ArrayBuffer], {
            type: file.type
          });
          const bitmap = await createImageBitmap(blob);
          resolve(bitmap);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Load an image file into an HTML Image element
   */
  async loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target!.result as string;
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extract ImageData from an image
   * Creates an off-screen canvas to get pixel data
   */
  getImageData(image: HTMLImageElement | ImageBitmap): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * Create a binary mask from the alpha channel
   * This optimizes tracing by focusing only on the shape outline
   *
   * Alpha > 0 = Black (shape)
   * Alpha = 0 = White (background)
   */
  createAlphaMask(imageData: ImageData): ImageData {
    const maskData = new ImageData(imageData.width, imageData.height);
    const data = imageData.data;
    const mask = maskData.data;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];

      if (alpha > 0) {
        // Black (shape)
        mask[i] = 0;
        mask[i + 1] = 0;
        mask[i + 2] = 0;
        mask[i + 3] = 255;
      } else {
        // White (background)
        mask[i] = 255;
        mask[i + 1] = 255;
        mask[i + 2] = 255;
        mask[i + 3] = 255;
      }
    }

    return maskData;
  }

  /**
   * Trace an image to vector paths using ImageTracer
   *
   * @param imageData - The image data to trace
   * @param options - ImageTracer options
   * @returns Array of coordinate paths
   */
  async traceImage(
    imageData: ImageData,
    options?: Partial<ImageTracerOptions>
  ): Promise<Point[][]> {
    const defaultOptions: ImageTracerOptions = {
      ltres: 0.1, // Line threshold
      qtres: 1.0, // Quad threshold
      pathomit: 8, // Omit paths smaller than this
      colorsampling: 2, // 0: disabled, 1: random, 2: deterministic
      numberofcolors: 2, // For binary mask
      mincolorratio: 0.0,
      colorquantcycles: 3,
      blurradius: 0,
      blurdelta: 20,
      linefilter: false,
      rightangleenhance: true,
      ...options
    };

    return new Promise((resolve, reject) => {
      try {
        // ImageTracer expects ImageData
        const traced = ImageTracer.imagedataToTracedata(
          imageData,
          defaultOptions
        );

        // Extract paths from traced data
        const paths = this.extractPathsFromTracedata(traced);
        resolve(paths);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Trace an image file directly
   * Convenience method that handles the entire pipeline
   */
  async traceImageFile(file: File): Promise<Point[][]> {
    const img = await this.loadImage(file);
    const imageData = this.getImageData(img);
    const mask = this.createAlphaMask(imageData);
    return this.traceImage(mask);
  }

  /**
   * Extract the largest path from traced data
   * This is typically the outer boundary of the sticker
   */
  getLargestPath(paths: Point[][]): Point[] {
    if (paths.length === 0) return [];

    // Calculate area for each path and return the largest
    let largestPath = paths[0];
    let largestArea = this.calculatePathArea(largestPath);

    for (let i = 1; i < paths.length; i++) {
      const area = this.calculatePathArea(paths[i]);
      if (area > largestArea) {
        largestArea = area;
        largestPath = paths[i];
      }
    }

    return largestPath;
  }

  /**
   * Extract coordinate paths from ImageTracer's tracedata
   */
  private extractPathsFromTracedata(tracedata: any): Point[][] {
    const paths: Point[][] = [];

    if (!tracedata || !tracedata.layers) {
      return paths;
    }

    // Iterate through layers and extract paths
    tracedata.layers.forEach((layer: any) => {
      if (!layer) return;

      layer.forEach((pathData: any) => {
        if (!pathData || !pathData.segments) return;

        const points: Point[] = [];

        pathData.segments.forEach((segment: any) => {
          if (!segment) return;

          // Each segment has control points
          // For our purposes, we'll use the end points
          if (segment.hasOwnProperty('x1') && segment.hasOwnProperty('y1')) {
            points.push({ x: segment.x1, y: segment.y1 });
          }
          if (segment.hasOwnProperty('x2') && segment.hasOwnProperty('y2')) {
            points.push({ x: segment.x2, y: segment.y2 });
          }
        });

        if (points.length >= 3) {
          paths.push(points);
        }
      });
    });

    return paths;
  }

  /**
   * Calculate area of a path using the Shoelace formula
   */
  private calculatePathArea(points: Point[]): number {
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
   * Parse SVG path data string to points
   * Helper for converting SVG path d attribute to coordinates
   */
  parseSvgPath(pathData: string): Point[] {
    const points: Point[] = [];
    const commands = pathData.match(/[a-zA-Z][^a-zA-Z]*/g);

    if (!commands) return points;

    let currentX = 0;
    let currentY = 0;

    commands.forEach(cmd => {
      const type = cmd[0];
      const values = cmd
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(n => !isNaN(n));

      switch (type.toUpperCase()) {
        case 'M': // MoveTo
        case 'L': // LineTo
          for (let i = 0; i < values.length; i += 2) {
            const x = type === type.toUpperCase()
              ? values[i]
              : currentX + values[i];
            const y = type === type.toUpperCase()
              ? values[i + 1]
              : currentY + values[i + 1];

            points.push({ x, y });
            currentX = x;
            currentY = y;
          }
          break;

        case 'H': // Horizontal line
          values.forEach(value => {
            const x = type === 'H' ? value : currentX + value;
            points.push({ x, y: currentY });
            currentX = x;
          });
          break;

        case 'V': // Vertical line
          values.forEach(value => {
            const y = type === 'V' ? value : currentY + value;
            points.push({ x: currentX, y });
            currentY = y;
          });
          break;
      }
    });

    return points;
  }

  /**
   * Get image dimensions from file
   */
  async getImageDimensions(
    file: File
  ): Promise<{ width: number; height: number }> {
    const img = await this.loadImage(file);
    return {
      width: img.width,
      height: img.height
    };
  }
}

/**
 * ImageTracer options interface
 */
interface ImageTracerOptions {
  ltres: number;
  qtres: number;
  pathomit: number;
  colorsampling: number;
  numberofcolors: number;
  mincolorratio: number;
  colorquantcycles: number;
  blurradius: number;
  blurdelta: number;
  linefilter: boolean;
  rightangleenhance: boolean;
}
