/** Keep in sync with `src/components/home/scrollToHomeBand.ts`. */
export const HOME_BAND_IDS = ["builder", "creator", "educator"];

export function homeBandScrollTargetInPage(bandId) {
  const i = HOME_BAND_IDS.indexOf(bandId);
  if (i < 0) return 0;

  const surface = document.querySelector(".home-scroll-surface");
  if (!surface) return 0;

  const nav = document.querySelector(".home-navbar");
  const navH = nav?.offsetHeight > 0 ? nav.offsetHeight : 64;

  let prior = 0;
  for (let j = 0; j < i; j++) {
    const band = document.getElementById(HOME_BAND_IDS[j]);
    if (band) prior += band.offsetHeight;
  }

  return Math.max(0, surface.offsetTop - navH + prior);
}

export function homeBandScrollTargetsInPage() {
  return HOME_BAND_IDS.map((id) => homeBandScrollTargetInPage(id));
}

/** Self-contained for Playwright `page.evaluate(fn)`. */
export function measureHomeBandScrollTargets() {
  const ids = ["builder", "creator", "educator"];
  const surface = document.querySelector(".home-scroll-surface");
  if (!surface) return [];
  const nav = document.querySelector(".home-navbar");
  const navH = nav?.offsetHeight > 0 ? nav.offsetHeight : 64;
  return ids.map((bandId) => {
    const i = ids.indexOf(bandId);
    let prior = 0;
    for (let j = 0; j < i; j++) {
      const band = document.getElementById(ids[j]);
      if (band) prior += band.offsetHeight;
    }
    return Math.max(0, surface.offsetTop - navH + prior);
  });
}

export function measureHomeBandScrollTarget(bandId) {
  const ids = ["builder", "creator", "educator"];
  const i = ids.indexOf(bandId);
  if (i < 0) return 0;
  const surface = document.querySelector(".home-scroll-surface");
  if (!surface) return 0;
  const nav = document.querySelector(".home-navbar");
  const navH = nav?.offsetHeight > 0 ? nav.offsetHeight : 64;
  let prior = 0;
  for (let j = 0; j < i; j++) {
    const band = document.getElementById(ids[j]);
    if (band) prior += band.offsetHeight;
  }
  return Math.max(0, surface.offsetTop - navH + prior);
}
