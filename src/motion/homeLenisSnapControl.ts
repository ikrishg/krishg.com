import type Snap from "lenis/snap";

let activeSnap: Snap | null = null;

export function registerHomeLenisSnap(snap: Snap | null) {
  activeSnap = snap;
}

export function pauseHomeLenisSnap() {
  activeSnap?.stop();
}

export function resumeHomeLenisSnap() {
  activeSnap?.start();
  activeSnap?.resize();
}
