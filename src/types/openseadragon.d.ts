/**
 * The little of OpenSeadragon the glass uses. The package ships no types, and `@types/openseadragon`
 * would be a dependency added for a handful of names; this is the handful.
 */
declare module "openseadragon" {
  /** A custom tile source: Deep Zoom addressing, the tiles fetched from wherever `getTileUrl` says. */
  export type CustomTileSource = {
    width: number;
    height: number;
    tileSize: number;
    tileOverlap: number;
    minLevel?: number;
    maxLevel: number;
    getTileUrl(level: number, x: number, y: number): string;
  };

  export type Options = {
    element: HTMLElement;
    tileSources: CustomTileSource;
    [option: string]: unknown;
  };

  export interface Viewer {
    destroy(): void;
    addHandler(event: string, handler: (event: unknown) => void): void;
  }

  function OpenSeadragon(options: Options): Viewer;
  export default OpenSeadragon;
}
