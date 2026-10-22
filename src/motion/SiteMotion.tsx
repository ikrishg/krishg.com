import { useEffect, useMemo, useRef, useState } from "react";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import { ReactTempus, useTempus } from "tempus/react";
import "lenis/dist/lenis.css";
import HomeOverscrollSpring from "./HomeOverscrollSpring";
import HomeScrollExperience from "./HomeScrollExperience";
import { flushR3fTempusGates } from "./r3fTempusGate";
import { setLenisInstance } from "./lenisStore";

const DEFAULT_NAV_OFFSET_PX = 64;

function lenisEnabledForPath(pathname: string) {
  return !pathname.startsWith("/creating");
}

function LenisTempusRaf({ lenisRef }: { lenisRef: React.RefObject<LenisRef | null> }) {
  useTempus(
    ({ time }) => {
      lenisRef.current?.lenis?.raf(time);
    },
    { order: -1, label: "lenis" },
  );
  return null;
}

function LenisInstanceSync() {
  const lenis = useLenis();
  useEffect(() => {
    setLenisInstance(lenis ?? null);
    return () => setLenisInstance(null);
  }, [lenis]);
  return null;
}

function R3fTempusFlush() {
  useTempus(
    () => {
      flushR3fTempusGates();
    },
    { order: 1, label: "r3f" },
  );
  return null;
}

function LenisRoot({
  lenisRef,
  options,
}: {
  lenisRef: React.RefObject<LenisRef | null>;
  options: React.ComponentProps<typeof ReactLenis>["options"];
}) {
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? true : lenisEnabledForPath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => {
      setEnabled(lenisEnabledForPath(window.location.pathname));
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <ReactLenis ref={lenisRef} root options={options} />
      <LenisTempusRaf lenisRef={lenisRef} />
      <LenisInstanceSync />
    </>
  );
}

export default function SiteMotion() {
  const lenisRef = useRef<LenisRef | null>(null);

  const lenisOptions = useMemo(
    () => ({
      autoRaf: false,
      respectReducedMotion: true,
      syncTouch: false,
      smoothWheel: true,
      lerp: 0.09,
      wheelMultiplier: 0.9,
      anchors: {
        offset: -DEFAULT_NAV_OFFSET_PX,
      },
      overscroll: true,
    }),
    [],
  );

  return (
    <>
      <ReactTempus patch />
      <LenisRoot lenisRef={lenisRef} options={lenisOptions} />
      <HomeScrollExperience />
      <HomeOverscrollSpring />
      <R3fTempusFlush />
    </>
  );
}
