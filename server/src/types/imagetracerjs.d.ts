declare module 'imagetracerjs' {
  export interface ImageTracerOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    lcpr?: number;
    qcpr?: number;
    blurradius?: number;
    blurdelta?: number;
  }

  export interface TraceResult {
    layers: any[][];
  }

  const ImageTracer: {
    imagedataToTracedata(imageData: any, options?: ImageTracerOptions): TraceResult;
    imagedataToSVG(imageData: any, options?: ImageTracerOptions): string;
  };

  export default ImageTracer;
}
