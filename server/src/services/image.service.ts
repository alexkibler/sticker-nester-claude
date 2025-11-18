import ImageTracer from 'imagetracerjs';
import sharp from 'sharp';

export interface Point {
  x: number;
  y: number;
}

export class ImageService {
  /**
   * Process uploaded image and extract vector path
   */
  async processImage(buffer: Buffer): Promise<{
    path: Point[];
    width: number;
    height: number;
  }> {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Convert to PNG with alpha channel
    const pngBuffer = await sharp(buffer)
      .png()
      .toBuffer();

    // Create alpha mask for better tracing
    const maskBuffer = await sharp(buffer)
      .extractChannel('alpha')
      .threshold(128)
      .toBuffer();

    // Trace the image
    const traced = await this.traceImage(maskBuffer, width, height);

    return {
      path: traced,
      width,
      height
    };
  }

  /**
   * Trace image buffer to vector path
   */
  private async traceImage(
    buffer: Buffer,
    width: number,
    height: number
  ): Promise<Point[]> {
    return new Promise((resolve, reject) => {
      try {
        // Convert buffer to ImageData format
        const imageData = {
          data: buffer,
          width,
          height
        };

        // Trace with ImageTracer
        const traced = ImageTracer.imagedataToTracedata(imageData as any, {
          ltres: 0.1,
          qtres: 1.0,
          pathomit: 8,
          colorsampling: 2,
          numberofcolors: 2,
          mincolorratio: 0.0,
          colorquantcycles: 3,
          blurradius: 0,
          blurdelta: 20,
          linefilter: false,
          rightangleenhance: true
        });

        // Extract the largest path
        const paths = this.extractPathsFromTracedata(traced);
        const largestPath = this.getLargestPath(paths);

        resolve(largestPath);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Extract paths from ImageTracer result
   */
  private extractPathsFromTracedata(tracedata: any): Point[][] {
    const paths: Point[][] = [];

    if (!tracedata || !tracedata.layers) {
      return paths;
    }

    tracedata.layers.forEach((layer: any) => {
      if (!layer) return;

      layer.forEach((pathData: any) => {
        if (!pathData || !pathData.segments) return;

        const points: Point[] = [];
        pathData.segments.forEach((segment: any) => {
          if (!segment) return;

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
   * Get the largest path by area
   */
  private getLargestPath(paths: Point[][]): Point[] {
    if (paths.length === 0) return [];

    let largestPath = paths[0];
    let largestArea = this.calculateArea(largestPath);

    for (let i = 1; i < paths.length; i++) {
      const area = this.calculateArea(paths[i]);
      if (area > largestArea) {
        largestArea = area;
        largestPath = paths[i];
      }
    }

    return largestPath;
  }

  /**
   * Calculate area using shoelace formula
   */
  private calculateArea(points: Point[]): number {
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
}
