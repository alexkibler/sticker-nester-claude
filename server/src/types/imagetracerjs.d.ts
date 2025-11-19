/**
 * Type definitions for imagetracerjs
 * Library for tracing bitmap images to vector paths
 */
declare module 'imagetracerjs' {
  export interface TracingOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    strokewidth?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    lcpr?: number;
    qcpr?: number;
    blurradius?: number;
    blurdelta?: number;
  }

  export interface Point {
    x: number;
    y: number;
  }

  export interface TracedLayer {
    segments: Array<{
      type: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>;
  }

  export interface TracedImage {
    layers: TracedLayer[];
    palette: string[][];
    width: number;
    height: number;
  }

  function imagedataToTracedata(
    imageData: ImageData | any,
    options?: TracingOptions
  ): TracedImage;

  function imagedataToSVG(
    imageData: ImageData | any,
    options?: TracingOptions
  ): string;

  export default {
    imagedataToTracedata,
    imagedataToSVG,
  };
}
