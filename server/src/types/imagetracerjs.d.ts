declare module 'imagetracerjs' {
  export interface ImageTracerOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    blurradius?: number;
    blurdelta?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
  }

  export interface TraceData {
    layers: any[];
    palette: any[];
    width: number;
    height: number;
  }

  const ImageTracer: {
    imagedataToTracedata(imagedata: any, options?: ImageTracerOptions): TraceData;
  };

  export default ImageTracer;
}
