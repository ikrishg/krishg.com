import HomeClosingLink from "./HomeClosingLink";
import HomeSplashOverlay from "./HomeSplashOverlay";
import {
  closingBandRow,
  closingNavRow,
} from "./home-closing";

function StarSeparator() {
  return (
    <span
      className="home-closing-star select-none px-[0.35em] text-[0.95em] leading-none text-[var(--home-educator-fg)] opacity-80"
      aria-hidden="true"
    >
      ✱
    </span>
  );
}

function ClosingRow({ links }: { links: typeof closingBandRow }) {
  return (
    <p className="m-0 flex flex-wrap items-center justify-center gap-y-1 text-center">
      {links.map((link, index) => (
        <span key={link.key} className="inline-flex items-center">
          {index > 0 ? <StarSeparator /> : null}
          <HomeClosingLink link={link} />
        </span>
      ))}
    </p>
  );
}

export default function HomeClosingIndex() {
  return (
    <>
      <HomeSplashOverlay />
      <section
        id="home-closing-index"
        data-home-nav-theme="educator"
        className="home-closing-index relative z-[1] snap-start bg-[var(--home-educator-bg)] px-[var(--gutter)] py-16 text-[var(--home-educator-fg)] md:py-20"
        aria-label="Site index"
      >
        <div className="mx-auto flex w-full max-w-[var(--home-content-max)] flex-col items-center gap-6 md:gap-8">
          <ClosingRow links={closingBandRow} />
          <ClosingRow links={closingNavRow} />
        </div>
      </section>
    </>
  );
}
