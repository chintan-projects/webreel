/**
 * Type declarations for @nut-tree-fork/nut-js.
 *
 * nut.js is an optional native addon used by ApplicationSurface and
 * DesktopSurface. These minimal declarations allow TypeScript to
 * resolve the dynamic import without requiring the native package
 * to be installed in every environment.
 */
declare module "@nut-tree-fork/nut-js" {
  export class Region {
    constructor(left: number, top: number, width: number, height: number);
    left: number;
    top: number;
    width: number;
    height: number;
  }

  export class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  export interface Image {
    readonly width: number;
    readonly height: number;
    toRGB(): Promise<{ data: Buffer; width: number; height: number }>;
  }

  export const screen: {
    grabRegion(region: Region): Promise<Image>;
    width(): Promise<number>;
    height(): Promise<number>;
  };

  export const keyboard: {
    type(text: string): Promise<void>;
    pressKey(...keys: number[]): Promise<void>;
    releaseKey(...keys: number[]): Promise<void>;
  };

  export const mouse: {
    setPosition(point: Point): Promise<void>;
    leftClick(): Promise<void>;
    rightClick(): Promise<void>;
    doubleClick(): Promise<void>;
    move(path: Point[]): Promise<void>;
  };

  export const Key: Record<string, number>;
}
