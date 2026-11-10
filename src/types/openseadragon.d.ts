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

  export interface Viewport {
    /** The zoom now (`current`) or where the animation is heading; 1 = the work's width fills the viewer. */
    getZoom(current?: boolean): number;
    /** The zoom at which the whole work fits the viewer as it is now shaped. */
    getHomeZoom(): number;
    /** Fit the whole work again. */
    goHome(immediately?: boolean): void;
    /** Bring the view back inside the work's edges and the zoom limits. */
    applyConstraints(immediately?: boolean): void;
  }

  /** The pointers of one kind (touch, mouse, pen) the tracker knows about. */
  export interface GesturePointList {
    /** How many of them are pressed. Drops on release — and on a touch the browser cancels. */
    contacts: number;
    getLength(): number;
  }

  export interface MouseTracker {
    getActivePointersListByType(kind: string): GesturePointList;
    /** Every pointer tracked, a hovering mouse included — not the same as pressed. */
    getActivePointerCount(): number;
  }

  export interface Viewer {
    viewport: Viewport;
    /** The tracker on the viewer's own canvas. */
    innerTracker: MouseTracker;
    destroy(): void;
    addHandler(event: string, handler: (event: unknown) => void): void;
  }

  function OpenSeadragon(options: Options): Viewer;
  export default OpenSeadragon;
}
