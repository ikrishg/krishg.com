import { useEffect } from "react";

export default function HomeNavbarScroll() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".home-navbar");
    if (!header) return;

    let ticking = false;

    const setScrolled = (scrolled: boolean) => {
      header.dataset.scrolled = scrolled ? "true" : "false";
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 12);
        ticking = false;
      });
    };

    setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
