export type SiteSearchEntry = {
  id: string;
  title: string;
  href: string;
  keywords: string[];
};

/** Pages and homepage bands searchable from the navbar. */
export const siteSearchEntries: SiteSearchEntry[] = [
  {
    id: "builder",
    title: "building",
    href: "/building",
    keywords: ["builder", "maker", "makerhouse", "making", "hacking"],
  },
  {
    id: "creator",
    title: "creating",
    href: "/creating",
    keywords: ["creator", "atelier", "poetic", "imprint"],
  },
  {
    id: "educator",
    title: "educating",
    href: "/educating",
    keywords: ["educator", "library", "talks", "workshops", "articles"],
  },
  {
    id: "about",
    title: "about",
    href: "/about",
    keywords: ["about", "bio"],
  },
  {
    id: "now",
    title: "now",
    href: "/now",
    keywords: ["now", "current"],
  },
  {
    id: "sitemap",
    title: "sitemap",
    href: "/sitemap",
    keywords: ["sitemap", "map", "routes"],
  },
];

export function filterSiteSearch(query: string): SiteSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return siteSearchEntries;
  return siteSearchEntries.filter((entry) => {
    const haystack = [entry.title, ...entry.keywords].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
