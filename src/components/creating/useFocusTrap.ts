import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusables(root);
      if (items.length === 0) return;

      const current = document.activeElement;
      const idx =
        current instanceof HTMLElement ? items.indexOf(current) : -1;

      if (!root.contains(current)) {
        e.preventDefault();
        items[0]?.focus();
        return;
      }

      e.preventDefault();
      if (e.shiftKey) {
        const next = idx <= 0 ? items.length - 1 : idx - 1;
        items[next]?.focus();
      } else {
        const next = idx < 0 || idx >= items.length - 1 ? 0 : idx + 1;
        items[next]?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, containerRef]);
}
