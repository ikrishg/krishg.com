import { useEffect } from "react";
import { getScrollY, subscribeScroll } from "~motion/lenisStore";

export default function HomeNavbarScroll() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".home-navbar");
    if (!header) return;

    const setScrolled = (scrolled: boolean) => {
      header.dataset.scrolled = scrolled ? "true" : "false";
    };

    const onScroll = () => {
      setScrolled(getScrollY() > 12);
    };

    onScroll();
    return subscribeScroll(onScroll);
  }, []);

  return null;
}
