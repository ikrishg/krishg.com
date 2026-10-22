import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { CreatingEntry } from "~lib/creating/types";
import {
  CATEGORY_ACCENT,
  CATEGORY_LABELS,
} from "~lib/creating/types";
import { isTextForwardCategory } from "~lib/creating/entries";

type Variant = "gallery" | "listicle" | "timeline";

type Props = {
  entry: CreatingEntry;
  variant: Variant;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover?: (id: string | null) => void;
  parallaxY?: number;
  reducedMotion: boolean;
};

export function CreatingWorkCard({
  entry,
  variant,
  onOpen,
  onHover,
  parallaxY = 0,
  reducedMotion,
}: Props) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const accent = CATEGORY_ACCENT[entry.category];
  const textCard = isTextForwardCategory(entry.category);

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reducedMotion) return;
    const media = mediaRef.current;
    if (!media) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    media.style.transform = `perspective(800px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(var(--card-parallax, 0px))`;
  };

  const onPointerLeave = () => {
    const media = mediaRef.current;
    if (!media) return;
    media.style.transform = reducedMotion
      ? ""
      : `translateY(var(--card-parallax, 0px))`;
  };

  const style = {
    "--card-accent": accent,
    "--card-parallax": reducedMotion ? "0px" : `${parallaxY}px`,
    viewTransitionName: `creating-entry-${entry.id}`,
  } as CSSProperties;

  return (
    <article
      className={`creating-card creating-card--${variant}`}
      data-flip-id={entry.id}
      data-entry-id={entry.id}
      style={style}
      onPointerEnter={() => onHover?.(entry.id)}
      onPointerLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(entry.id)}
      onBlur={() => onHover?.(null)}
    >
      <button
        type="button"
        className="creating-card__open"
        onClick={(e) => onOpen(entry.id, e.currentTarget)}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <div
          ref={mediaRef}
          className="creating-card__media"
          data-text-card={textCard ? "true" : undefined}
        >
          {textCard ? (
            <div className="creating-card__typography" aria-hidden="true">
              <p className="creating-card__excerpt">{entry.body.slice(0, 120)}…</p>
            </div>
          ) : (
            <img
              src={entry.cover}
              alt=""
              width={400}
              height={500}
              loading="lazy"
              decoding="async"
              className="creating-card__image"
            />
          )}
          {entry.demo ? (
            <span className="creating-card__demo" aria-hidden="true">DEMO</span>
          ) : null}
        </div>
        <div className="creating-card__meta">
          <h3 className="creating-card__title">{entry.title}</h3>
          <p className="creating-card__subtitle">
            {CATEGORY_LABELS[entry.category]}
            <span aria-hidden="true"> · </span>
            <span>{entry.year}</span>
          </p>
        </div>
      </button>
    </article>
  );
}
