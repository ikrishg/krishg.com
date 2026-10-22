import { useEffect } from "react";
import { HOME_BAND_IDS, scrollToHomeBand } from "./scrollToHomeBand";

function bandIdFromHash(): string | null {
  const id = window.location.hash.replace(/^#/, "");
  if (!id) return null;
  return HOME_BAND_IDS.includes(id as (typeof HOME_BAND_IDS)[number]) ? id : null;
}

export default function HomeBandHashScroll() {
  useEffect(() => {
    const scrollIfBand = () => {
      const bandId = bandIdFromHash();
      if (!bandId) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToHomeBand(bandId));
      });
    };

    scrollIfBand();
    window.addEventListener("hashchange", scrollIfBand);
    return () => window.removeEventListener("hashchange", scrollIfBand);
  }, []);

  return null;
}
