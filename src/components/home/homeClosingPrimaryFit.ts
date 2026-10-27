import { prepare } from "@darkroomengineering/fitbox";
import type { FitHandle } from "@darkroomengineering/fitbox";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClosingLink } from "./home-closing";

/** Canvas font string uses a realistic size so weight/family match layout. */
const MEASURE_BASE_PX = 16;

const PRIMARY_FIT_OPTS = {
  maxLines: 1 as const,
  minSize: 20,
  maxSize: 160,
};

const PRIMARY_LINE_HEIGHT = 1;

function readGapPx(element: HTMLElement | null) {
  if (!element) return 0;
  const gap = parseFloat(getComputedStyle(element).rowGap);
  return Number.isFinite(gap) ? gap : 0;
}

/** Remaining block height for the three primary words inside the shared closing viewport. */
function availablePrimaryHeightPx(row: HTMLElement) {
  const tail = row.closest<HTMLElement>(".home-closing-tail");
  if (!tail || tail.clientHeight <= 0) return null;

  const email = tail.querySelector<HTMLElement>(".home-footer__email");
  const social = tail.querySelector<HTMLElement>(".home-footer__social");
  const footerHeight =
    (email?.getBoundingClientRect().height ?? 0) +
    (social?.getBoundingClientRect().height ?? 0);
  const tailGap = readGapPx(tail);

  const nav = tail.querySelector<HTMLElement>(".home-closing-index__nav");
  const navHeight = nav?.getBoundingClientRect().height ?? 0;

  const reserved = footerHeight + tailGap + navHeight + 8;
  return Math.max(0, tail.clientHeight - reserved);
}

function maxFontSizeForAvailableHeight(
  row: HTMLElement,
  linkCount: number,
  availablePx: number,
) {
  if (availablePx <= 0) return PRIMARY_FIT_OPTS.minSize;
  const flexDir = getComputedStyle(row).flexDirection;
  if (flexDir === "row") {
    return Math.min(
      PRIMARY_FIT_OPTS.maxSize,
      availablePx / PRIMARY_LINE_HEIGHT,
    );
  }

  const rowGap = readGapPx(row);
  const totalGap = rowGap * Math.max(0, linkCount - 1);
  const perLine = (availablePx - totalGap) / (linkCount * PRIMARY_LINE_HEIGHT);
  return Math.min(PRIMARY_FIT_OPTS.maxSize, perLine);
}

export type SharedPrimaryMeasure = {
  appliedPx: number;
  clampPx: number;
  minFitPx: number;
  fitsPx: number[];
  overflowsAtApplied: { label: string; excessPx: number }[];
  clampOverflows: { label: string; excessPx: number }[];
};

function canvasFontFromSpan(span: HTMLElement) {
  const cs = getComputedStyle(span);
  return `${cs.fontStyle} ${cs.fontWeight} ${MEASURE_BASE_PX}px ${cs.fontFamily}`;
}

function letterSpacingEm(span: HTMLElement) {
  const cs = getComputedStyle(span);
  if (cs.letterSpacing === "normal") return 0;
  const spacingPx = parseFloat(cs.letterSpacing);
  const fontSizePx = parseFloat(cs.fontSize);
  if (!Number.isFinite(spacingPx) || !Number.isFinite(fontSizePx) || fontSizePx <= 0) {
    return 0;
  }
  return spacingPx / fontSizePx;
}

function effectiveNaturalWidth(
  handle: FitHandle,
  letterSpacingEmValue: number,
  charCount: number,
) {
  const gaps = Math.max(0, charCount - 1);
  return handle.naturalWidth + letterSpacingEmValue * gaps;
}

function fitSingleLineWithTracking(
  handle: FitHandle,
  width: number,
  letterSpacingEmValue: number,
  charCount: number,
) {
  if (width <= 0) return PRIMARY_FIT_OPTS.minSize;
  const natural = effectiveNaturalWidth(handle, letterSpacingEmValue, charCount);
  if (natural <= 0) return PRIMARY_FIT_OPTS.minSize;
  let fontSize = width / natural;
  fontSize = Math.max(
    PRIMARY_FIT_OPTS.minSize,
    Math.min(PRIMARY_FIT_OPTS.maxSize, fontSize),
  );
  return fontSize;
}

function readClampFontSizePx(span: HTMLElement) {
  if (!span.style.fontSize) {
    return parseFloat(getComputedStyle(span).fontSize);
  }
  const probe = document.createElement("span");
  probe.className = span.className;
  probe.textContent = "m";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  span.parentElement?.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px;
}

function textWidthAtFontSize(
  handle: FitHandle,
  fontSizePx: number,
  letterSpacingEmValue: number,
  charCount: number,
) {
  const gaps = Math.max(0, charCount - 1);
  return handle.naturalWidth * fontSizePx + letterSpacingEmValue * fontSizePx * gaps;
}

function measureOverflowPx(
  _span: HTMLElement,
  anchor: HTMLElement,
  handle: FitHandle,
  fontSizePx: number,
  letterSpacingEmValue: number,
  charCount: number,
) {
  const available = anchor.clientWidth;
  const needed = textWidthAtFontSize(
    handle,
    fontSizePx,
    letterSpacingEmValue,
    charCount,
  );
  return Math.max(0, needed - available);
}

export function measureSharedPrimaryFontSize(
  anchors: HTMLElement[],
  links: ClosingLink[],
): SharedPrimaryMeasure | null {
  if (anchors.length !== links.length || anchors.length === 0) return null;

  const fitsPx: number[] = [];
  const clampsPx: number[] = [];
  const meta: {
    label: string;
    span: HTMLElement;
    anchor: HTMLElement;
    handle: FitHandle;
    letterSpacingEmValue: number;
    charCount: number;
  }[] = [];

  for (let i = 0; i < links.length; i += 1) {
    const anchor = anchors[i];
    const link = links[i];
    if (!anchor || !link) continue;
    const span = anchor.querySelector<HTMLElement>("span");
    if (!span) continue;

    const width = anchor.getBoundingClientRect().width;
    if (width <= 0) continue;

    const label = link.label;
    const charCount = label.length;
    const letterSpacingEmValue = letterSpacingEm(span);
    const handle = prepare(label, canvasFontFromSpan(span));
    const fitPx = fitSingleLineWithTracking(
      handle,
      width,
      letterSpacingEmValue,
      charCount,
    );

    fitsPx.push(fitPx);
    clampsPx.push(readClampFontSizePx(span));
    meta.push({
      label,
      span,
      anchor,
      handle,
      letterSpacingEmValue,
      charCount,
    });
  }

  if (fitsPx.length === 0) return null;

  const minFitPx = Math.min(...fitsPx);
  const clampPx = Math.max(...clampsPx);
  let appliedPx = Math.max(clampPx, minFitPx);

  const row = anchors[0]?.closest<HTMLElement>(".home-closing-primary-row");
  const availableHeight = row ? availablePrimaryHeightPx(row) : null;
  if (row && availableHeight != null && availableHeight > 0) {
    const heightCap = maxFontSizeForAvailableHeight(
      row,
      links.length,
      availableHeight,
    );
    appliedPx = Math.min(appliedPx, heightCap);
  }
  appliedPx = Math.max(PRIMARY_FIT_OPTS.minSize, appliedPx);

  const overflowsAtApplied: { label: string; excessPx: number }[] = [];
  const clampOverflows: { label: string; excessPx: number }[] = [];

  for (const item of meta) {
    const appliedExcess = measureOverflowPx(
      item.span,
      item.anchor,
      item.handle,
      appliedPx,
      item.letterSpacingEmValue,
      item.charCount,
    );
    if (appliedExcess > 0.5) {
      overflowsAtApplied.push({ label: item.label, excessPx: appliedExcess });
    }

    const clampExcess = measureOverflowPx(
      item.span,
      item.anchor,
      item.handle,
      clampPx,
      item.letterSpacingEmValue,
      item.charCount,
    );
    if (clampExcess > 0.5) {
      clampOverflows.push({ label: item.label, excessPx: clampExcess });
    }
  }

  if (clampOverflows.length > 0) {
    console.warn(
      "[homeClosingPrimaryFit] clamp() overflows its box at this viewport:",
      clampOverflows,
    );
  }
  if (overflowsAtApplied.length > 0) {
    console.warn(
      "[homeClosingPrimaryFit] applied shared size overflows:",
      overflowsAtApplied,
    );
  }

  return {
    appliedPx,
    clampPx,
    minFitPx,
    fitsPx,
    overflowsAtApplied,
    clampOverflows,
  };
}

export function useSharedPrimaryFontSize(
  rowRef: RefObject<HTMLElement | null>,
  links: ClosingLink[],
) {
  const [fontSize, setFontSize] = useState<number | null>(null);

  const remeasure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const anchors = [
      ...row.querySelectorAll<HTMLElement>(".home-closing-link--primary"),
    ];
    const result = measureSharedPrimaryFontSize(anchors, links);
    if (result == null) return;

    row.dataset.closingPrimaryClamp = String(
      Math.round(result.clampPx * 1000) / 1000,
    );
    row.dataset.closingPrimaryFittedMin = String(
      Math.round(result.minFitPx * 1000) / 1000,
    );
    row.dataset.closingPrimaryApplied = String(
      Math.round(result.appliedPx * 1000) / 1000,
    );

    setFontSize((prev) =>
      prev != null && Math.abs(prev - result.appliedPx) < 0.05
        ? prev
        : result.appliedPx,
    );
  }, [links, rowRef]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    let cancelled = false;
    const ro = new ResizeObserver(() => {
      void document.fonts.ready.then(() => {
        if (!cancelled) remeasure();
      });
    });
    ro.observe(row);
    for (const anchor of row.querySelectorAll(".home-closing-link--primary")) {
      ro.observe(anchor);
    }
    const tail = row.closest(".home-closing-tail");
    if (tail) ro.observe(tail);
    const footer = tail?.querySelector(".home-footer");
    if (footer) ro.observe(footer);

    void document.fonts.ready.then(() => {
      if (!cancelled) remeasure();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [remeasure]);

  return fontSize;
}
