import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { SiteIcon } from "~components/icons/siteIcon";
import {
  filterSiteSearch,
  type SiteSearchEntry,
} from "./home-search-index";
import { navigateSearchEntry } from "./home-search-nav";

const PANEL_INK = "#141a2b";
const PANEL_SURFACE = "#fff9ec";

export default function HomeNavbarSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const inputId = useId();

  const results = filterSiteSearch(query);
  const activeOptionId =
    results.length > 0 ? `${listId}-option-${activeIndex}` : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    buttonRef.current?.focus();
  }, []);

  const openSearch = useCallback(() => {
    setOpen(true);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open, results.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  const onResultClick = (entry: SiteSearchEntry) => {
    close();
    navigateSearchEntry(entry);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      onResultClick(results[activeIndex]);
    }
  };

  return (
    <div className="home-navbar-search relative flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        className="home-navbar-search__trigger inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-[var(--home-nav-fg)] transition-opacity duration-150 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-nav-fg)] [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-80"
        aria-label="Search site"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openSearch())}
      >
        <SiteIcon
          name="search"
          weight="bold"
          className="home-navbar-search__icon shrink-0"
          size="1em"
        />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="home-navbar-search__panel absolute right-0 top-[calc(100%+0.35rem)] z-[50] w-[min(22rem,calc(100vw-2*var(--gutter)))] overflow-hidden rounded-md border border-[color-mix(in_srgb,#141a2b_14%,transparent)] shadow-[0_12px_40px_color-mix(in_srgb,#000_22%,transparent)]"
          style={{
            backgroundColor: PANEL_SURFACE,
            color: PANEL_INK,
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            Search
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="home-navbar-search__input w-full border-0 border-b border-[color-mix(in_srgb,#141a2b_14%,transparent)] bg-transparent px-3 py-3 text-base outline-none"
            style={{
              color: PANEL_INK,
            }}
            placeholder="Search pages…"
          />
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="m-0 max-h-[min(20rem,60vh)] list-none overflow-y-auto p-1"
          >
            {results.length === 0 ? (
              <li
                className="px-3 py-2 text-sm"
                style={{ color: `color-mix(in srgb, ${PANEL_INK} 75%, transparent)` }}
                role="status"
              >
                No matches
              </li>
            ) : (
              results.map((entry, index) => (
                <li key={entry.id} role="presentation">
                  <a
                    id={`${listId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    href={entry.href}
                    className="flex min-h-11 items-center rounded-sm px-3 text-sm font-medium lowercase underline-offset-[0.2em] transition-colors duration-150 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141a2b] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color-mix(in_srgb,#141a2b_8%,transparent)]"
                    style={{
                      backgroundColor:
                        index === activeIndex
                          ? "color-mix(in srgb, #141a2b 10%, transparent)"
                          : undefined,
                      color: PANEL_INK,
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      onResultClick(entry);
                    }}
                  >
                    {entry.title}
                  </a>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
