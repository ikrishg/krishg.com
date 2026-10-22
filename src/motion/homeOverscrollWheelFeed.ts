export type OverscrollWheelFeed = (deltaY: number) => void;

let feed: OverscrollWheelFeed | null = null;

export function registerOverscrollWheelFeed(fn: OverscrollWheelFeed | null) {
  feed = fn;
}

export function feedOverscrollWheelDelta(deltaY: number) {
  feed?.(deltaY);
}
