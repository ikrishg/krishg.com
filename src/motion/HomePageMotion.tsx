import { useTempus } from "tempus/react";
import { useHomeScrollExperienceFrame } from "./useHomeScrollExperienceFrame";
import { useOverscrollSpringFrame } from "./useOverscrollSpringFrame";

/** Homepage-only Tempus loop: scroll-linked bands + overscroll spring (one subscriber). */
export default function HomePageMotion() {
  const tickScroll = useHomeScrollExperienceFrame();
  const tickSpring = useOverscrollSpringFrame();

  useTempus(
    ({ deltaTime }) => {
      tickScroll();
      tickSpring(deltaTime);
    },
    { order: 0, label: "home-page" },
  );

  return null;
}
