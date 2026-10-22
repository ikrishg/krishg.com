import HomeOverscrollSpring from "./HomeOverscrollSpring";
import HomeScrollExperience from "./HomeScrollExperience";

/** Homepage-only Tempus scroll/overscroll hooks (not mounted on stub routes). */
export default function HomePageMotion() {
  return (
    <>
      <HomeScrollExperience />
      <HomeOverscrollSpring />
    </>
  );
}
