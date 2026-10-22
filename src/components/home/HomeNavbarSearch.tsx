import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  filterSiteSearch,
  type SiteSearchEntry,
} from "./home-search-index";

function SearchIcon() {
  return (
    <svg
      className="h-[1.35rem] w-[1.35rem] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.25" />
      <path strokeLinecap="round" d="M16.25 16.25 20.5 20.5" />
    </svg>
  );
}

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

    const onKeyDown = (event: KeyboardEvent) => {
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
    window.location.assign(entry.href);
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
        aria-controls={listId}
        onClick={() => (open ? close() : openSearch())}
      >
        <SearchIcon />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="home-navbar-search__panel absolute right-0 top-[calc(100%+0.35rem)] z-[50] w-[min(22rem,calc(100vw-2*var(--gutter)))] overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--home-nav-fg)_22%,transparent)] bg-[var(--home-nav-bg)] text-[var(--home-nav-fg)] shadow-[0_12px_40px_color-mix(in_srgb,#000_22%,transparent)]"
          role="dialog"
          aria-label="Search site"
        >
          <label className="sr-only" htmlFor={inputId}>
            Search
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="home-navbar-search__input w-full border-0 border-b border-[color-mix(in_srgb,var(--home-nav-fg)_18%,transparent)] bg-transparent px-3 py-3 text-base text-[var(--home-nav-fg)] outline-none placeholder:text-[color-mix(in_srgb,var(--home-nav-fg)_55%,transparent)]"
            placeholder="Search pages…"
          />
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="m-0 max-h-[min(16rem,50vh)] list-none overflow-y-auto p-1"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm opacity-75">No matches</li>
            ) : (
              results.map((entry, index) => (
                <li key={entry.id} role="presentation">
                  <a
                    role="option"
                    aria-selected={index === activeIndex}
                    href={entry.href}
                    className="block rounded-sm px-3 py-2.5 text-sm font-medium lowercase underline-offset-[0.2em] transition-opacity duration-150 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--home-nav-fg)] [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-85"
                    style={{
                      backgroundColor:
                        index === activeIndex
                          ? "color-mix(in srgb, var(--home-nav-fg) 12%, transparent)"
                          : undefined,
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
