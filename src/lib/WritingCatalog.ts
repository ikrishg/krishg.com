import type { ImageMetadata } from "astro";
import { getCollection } from "astro:content";
import { site } from "~shared";

export type WritingKind = "article" | "essay" | "poem";

export type WritingPiece = {
  title: string;
  description: string;
  date: Date;
  href: string;
  external: boolean;
  tags: string[];
  kind: WritingKind;
  cover?: ImageMetadata;
};

export class WritingCatalog {
  static async load(): Promise<WritingPiece[]> {
    const [
      articles,
      externalArticles,
      essays,
      externalEssays,
      poems,
      externalPoems,
    ] = await Promise.all([
      getCollection("articles", ({ data }) => !data.draft).catch(() => []),
      getCollection("externalArticles").catch(() => []),
      getCollection("essays", ({ data }) => !data.draft).catch(() => []),
      getCollection("externalEssays").catch(() => []),
      getCollection("poems", ({ data }) => !data.draft).catch(() => []),
      getCollection("externalPoems").catch(() => []),
    ]);

    const pieces: WritingPiece[] = [
      ...articles.map((article) => ({
        title: article.data.title,
        description: article.data.description,
        date: article.data.date,
        href: new URL(`/p/${article.id}`, site).href,
        external: false,
        tags: article.data.tags ?? ["article"],
        kind: "article" as const,
        cover: article.data.cover,
      })),
      ...externalArticles.map((article) => ({
        title: article.data.title,
        description: article.data.description,
        date: article.data.date,
        href: String(article.data.url),
        external: true,
        tags: article.data.tags ?? ["article"],
        kind: "article" as const,
        cover: article.data.cover,
      })),
      ...essays.map((essay) => ({
        title: essay.data.title,
        description: essay.data.description,
        date: essay.data.date,
        href: new URL(`/p/${essay.id}`, site).href,
        external: false,
        tags: essay.data.tags ?? ["essay"],
        kind: "essay" as const,
        cover: essay.data.cover,
      })),
      ...externalEssays.map((essay) => ({
        title: essay.data.title,
        description: essay.data.description,
        date: essay.data.date,
        href: String(essay.data.url),
        external: true,
        tags: essay.data.tags ?? ["essay"],
        kind: "essay" as const,
        cover: essay.data.cover,
      })),
      ...poems.map((poem) => ({
        title: poem.data.title,
        description: poem.data.description,
        date: poem.data.date,
        href: new URL(`/p/${poem.id}`, site).href,
        external: false,
        tags: poem.data.tags ?? ["poem"],
        kind: "poem" as const,
        cover: poem.data.cover,
      })),
      ...externalPoems.map((poem) => ({
        title: poem.data.title,
        description: poem.data.description,
        date: poem.data.date,
        href: String(poem.data.url),
        external: true,
        tags: poem.data.tags ?? ["poem"],
        kind: "poem" as const,
        cover: poem.data.cover,
      })),
    ];

    return pieces.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  static async loadByKind(kind: WritingKind): Promise<WritingPiece[]> {
    const pieces = await WritingCatalog.load();
    return pieces.filter((piece) => piece.kind === kind);
  }

  static groupByYear(pieces: WritingPiece[]) {
    const years = Array.from(new Set(pieces.map((piece) => piece.date.getFullYear()))).sort(
      (a, b) => b - a,
    );

    return years.map((year) => ({
      year,
      pieces: pieces.filter((piece) => piece.date.getFullYear() === year),
    }));
  }

  /** Subtle accent tint for charcoal poem cards — variety from index, not shared imagery. */
  static poemCardAccent(index: number): string {
    const accents = ["#6eb5e8", "#b8a9d9", "#2f4acb", "#8a9bb8", "#b8a9d9", "#6eb5e8"];
    return accents[index % accents.length];
  }
}
