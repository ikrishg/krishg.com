import { useEffect } from "react";

const HERO_SELECTOR = ".artifact-stage[data-artifact-ready]";
const VIEW_MARGIN_PX = 80;

function shellsInViewport(): HTMLElement[] {
  const shells = document.querySelectorAll<HTMLElement>(HERO_SELECTOR);
  const vh = window.innerHeight;
  return [...shells].filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.bottom > -VIEW_MARGIN_PX && rect.top < vh + VIEW_MARGIN_PX;
  });
}

function markHomeReady() {
  document.documentElement.dataset.homeReady = "true";
}

export default function HomeReadySignal() {
  useEffect(() => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      markHomeReady();
    };

    const check = () => {
      if (done) return;
      const all = document.querySelectorAll<HTMLElement>(HERO_SELECTOR);
      if (all.length < 1) {
        finish();
        return;
      }

      const inView = shellsInViewport();
      const targets = inView.length > 0 ? inView : [all[0]!];
      const ready = targets.every((el) => el.dataset.artifactReady === "true");
      if (!ready) return;

      finish();
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-artifact-ready"],
      childList: true,
    });

    check();
    return () => observer.disconnect();
  }, []);

  return null;
}
