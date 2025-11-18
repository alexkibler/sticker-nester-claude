declare module 'simplify-js' {
  export interface Point {
    x: number;
    y: number;
  }

  function simplify<T extends Point>(points: T[], tolerance?: number, highestQuality?: boolean): T[];

  export default simplify;
}
