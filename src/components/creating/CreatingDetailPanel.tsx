import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { registerCreatingEasings } from "~lib/creating/easings";
import type { CreatingEntry } from "~lib/creating/types";
import { CATEGORY_ACCENT } from "~lib/creating/types";
import { isTextForwardCategory } from "~lib/creating/entries";
import { useFocusTrap } from "./useFocusTrap";

registerCreatingEasings();

type Props = {
  entry: CreatingEntry;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  focusEntryId: string | null;
  reducedMotion: boolean;
};

export function CreatingDetailPanel({
  entry,
  onClose,
  returnFocusRef,
  focusEntryId,
  reducedMotion,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const textCard = isTextForwardCategory(entry.category);

  useFocusTrap(panelRef, true);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || reducedMotion) {
      closeRef.current?.focus();
      return;
    }
    gsap.fromTo(
      panel,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.65, ease: "creating.cubicOut" },
    );
    closeRef.current?.focus();
  }, [entry.id, reducedMotion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      const target = returnFocusRef.current;
      if (target && document.contains(target)) {
        target.focus();
        return;
      }
      if (!focusEntryId) return;
      const el = document.querySelector(
        `[data-entry-id="${focusEntryId}"] .creating-card__open`,
      );
      if (el instanceof HTMLElement) el.focus();
    };
  }, [returnFocusRef, focusEntryId]);

  const accent = CATEGORY_ACCENT[entry.category];

  return (
    <section
      ref={panelRef}
      className="creating-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creating-detail-title"
    >
      <button
        ref={closeRef}
        type="button"
        className="creating-detail__close"
        onClick={onClose}
      >
        Close
      </button>
      <div className="creating-detail__hero-wrap">
        {textCard ? (
          <div
            className="creating-detail__hero creating-detail__hero--text"
            style={{
              borderColor: accent,
              viewTransitionName: `creating-entry-${entry.id}`,
            }}
          >
            <p className="creating-detail__hero-excerpt">{entry.body}</p>
          </div>
        ) : (
          <img
            className="creating-detail__hero"
            src={entry.cover}
            alt=""
            width={512}
            height={640}
            style={{
              borderColor: accent,
              viewTransitionName: `creating-entry-${entry.id}`,
            }}
          />
        )}
      </div>
      <div className="creating-detail__copy">
        {entry.demo ? (
          <p className="creating-demo-badge" aria-label="Demo placeholder content">
            DEMO
          </p>
        ) : null}
        <h2 id="creating-detail-title" className="creating-detail__title">
          {entry.title}
        </h2>
        {entry.subtitle && (
          <p className="creating-detail__subtitle">{entry.subtitle}</p>
        )}
        <p className="creating-detail__meta">
          {entry.demo
            ? [entry.medium, `Placeholder year ${entry.year}`].join(" · ")
            : [entry.medium, entry.published ?? String(entry.year)]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <div className="creating-detail__body">
          <p>{entry.body}</p>
        </div>
      </div>
    </section>
  );
}
