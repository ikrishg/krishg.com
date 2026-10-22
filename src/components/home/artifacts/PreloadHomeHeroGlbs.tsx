import { useEffect } from "react";
import { preloadHomeHeroGlbs } from "./preloadHomeHeroGlbs";

function isAbortError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const name = (reason as { name?: string }).name;
  const message = (reason as { message?: string }).message ?? "";
  return name === "AbortError" || message.includes("aborted a request");
}

export default function PreloadHomeHeroGlbs() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isAbortError(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onRejection);

    const run = () => {
      try {
        preloadHomeHeroGlbs();
      } catch (error) {
        if (!isAbortError(error)) throw error;
      }
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => {
        window.removeEventListener("unhandledrejection", onRejection);
        window.cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(run, 400);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(t);
    };
  }, []);
  return null;
}
