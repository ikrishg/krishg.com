import type { ImageMetadata } from "astro";
import coverBotDcHtm from "~assets/cover-bot-dc-htm.webp";
import coverDevocado from "~assets/cover-devocado.webp";
import coverFastnWorkshop from "~assets/cover-fastn-workshop.webp";
import coverPlaylistwise from "~assets/cover-playlistwise.webp";
import coverReseterLead from "~assets/cover-reseter-lead.webp";
import coverReseterTile from "~assets/cover-reseter-tile.webp";
import coverSema from "~assets/cover-sema.webp";
import coverSudansTech from "~assets/cover-sudans-tech.webp";
import { socials, title } from "~shared";

export type WorkEntry = {
  name: string;
  summary: string;
  why: string;
  href: string;
  image: ImageMetadata;
  year?: string;
  context?: string;
  role?: string;
  outcome?: string;
  metric?: string;
  quiet?: boolean;
  accent?: "cobalt" | "sky" | "lavender" | "coral";
};

export type TimelineEntry = {
  period: string;
  text: string;
};

export type AboutRole = {
  title: string;
  org: string;
  detail: string;
};

export class SiteContent {
  static readonly thesis =
    "I build developer tools and agentic systems — shipped reseter.css at 12, still shipping in public.";

  static readonly age = 17;

  static readonly timezone = "Bengaluru (IST)";

  static readonly reseterStars = 1240;

  static readonly reseterCdnPerYear = "5M+";

  static getCapabilities(): readonly string[] {
    return [
      "Agentic AI and developer tooling",
      "Backend APIs, deployment pipelines, and production ops",
      "Developer relations — docs, onboarding, ambassador programs",
      "Open-source maintenance at scale",
      "Technical writing and workshop facilitation",
    ];
  }

  static getAboutRoles(): AboutRole[] {
    return [
      {
        title: "Founder",
        org: "Devocado",
        detail: "Fractional DevRel for API and AI startups.",
      },
      {
        title: "Backend engineer",
        org: "Sudan's Tech",
        detail: "APIs and deployment for Jammu & Kashmir's first student-led tech nonprofit.",
      },
      {
        title: "DevRel",
        org: "Sema",
        detail: "Ambassador programs for a global code-review education community.",
      },
      {
        title: "Software engineering intern",
        org: "Playlistwise",
        detail: "React and Next.js product work with Supabase-backed CRUD.",
      },
    ];
  }

  static getHomeWork(): WorkEntry[] {
    return [
      {
        name: "reseter.css",
        summary: "Modern CSS reset used across production sites worldwide.",
        why: "I wanted a zero-dependency reset that fixed real browser inconsistencies without wiping useful defaults.",
        outcome: `${SiteContent.reseterStars.toLocaleString()} GitHub stars · ${SiteContent.reseterCdnPerYear} jsDelivr requests/year`,
        metric: `${SiteContent.reseterStars.toLocaleString()} GitHub stars`,
        href: "https://github.com/ikrishg/reseter.css",
        image: coverReseterTile,
        context: "Open source",
        role: "Creator",
        accent: "cobalt",
      },
      {
        name: "bot-dc-htm",
        summary: "Discord economy bot for one of India's largest hackathons.",
        why:
          "Built a TypeScript Discord bot with the Sapphire framework to manage in-server economy flows during the event.",
        outcome: "TypeScript Discord bot with in-server economy flows",
        metric: "11 GitHub stars",
        href: "https://github.com/ikrishg/bot-dc-htm",
        image: coverBotDcHtm,
        context: "Hackathon tooling",
        role: "Builder",
        accent: "coral",
      },
      {
        name: "fastn workshop",
        summary: "Hands-on workshop for learning fastn.",
        why:
          "Created for the EduHub Roadshow Jaipur — a simple fastn and FTD starter with GitHub Pages deployment.",
        outcome: "fastn and FTD starter with GitHub Pages deployment",
        metric: "11 GitHub stars",
        href: "https://github.com/ikrishg/fastn-workshop",
        image: coverFastnWorkshop,
        context: "EduHub Roadshow Jaipur",
        role: "Workshop lead",
        accent: "sky",
      },
    ];
  }

  static getWorkPage(): WorkEntry[] {
    return [
      ...SiteContent.getHomeWork(),
      {
        name: "Sudan's Tech",
        summary: "Backend work for Jammu & Kashmir's first student-led tech nonprofit.",
        why: "Built APIs and deployment pipelines so the community could ship programs for underprivileged students.",
        outcome: "Govt. of India–registered nonprofit",
        metric: "Govt. of India–registered nonprofit",
        href: "https://www.sudanstech.com/",
        image: coverSudansTech,
        context: "Student-led nonprofit",
        role: "Backend engineer",
        accent: "lavender",
      },
      {
        name: "Sema",
        summary: "DevRel for a global code-review education community.",
        why: "Ran ambassador programs and sessions for 1,000+ reviewers learning how to review code well.",
        outcome: "12 global ambassadors · 1,000+ reviewers",
        metric: "12 global ambassadors",
        href: "https://www.semasoftware.com/",
        image: coverSema,
        context: "Code-review education",
        role: "DevRel",
        accent: "cobalt",
      },
      {
        name: "Playlistwise",
        summary: "Software engineering internship on a React and Next.js product team.",
        why: "Shipped UI flows, Supabase-backed CRUD, and production deployments on Appwrite and Netlify.",
        outcome: "15+ UI flows shipped",
        metric: "15+ UI flows shipped",
        href: "https://www.linkedin.com/in/ikrishg/details/experience/",
        image: coverPlaylistwise,
        context: "React & Next.js product",
        role: "Software engineering intern",
        accent: "sky",
      },
      {
        name: "Devocado",
        summary: "Fractional DevRel consultancy for API and AI startups.",
        why: "I help founders turn docs, onboarding, and agent-ready surfaces into adoption.",
        outcome: "Docs, onboarding, and agent-ready surfaces for adoption",
        href: "https://devocado.tech",
        image: coverDevocado,
        context: "API & AI startups",
        role: "Founder · fractional DevRel",
        quiet: true,
        accent: "lavender",
      },
    ];
  }

  static formatWorkOutcome(entry: WorkEntry): string {
    const outcome = entry.outcome ?? entry.summary;
    if (entry.metric && outcome) {
      if (outcome.includes(entry.metric)) {
        return outcome;
      }
      return `${entry.metric} · ${outcome}`;
    }
    return entry.metric ?? outcome;
  }

  static getAboutTimeline(): TimelineEntry[] {
    return [
      {
        period: "Age ~10",
        text: "Started coding to build WordPress plugins in PHP.",
      },
      {
        period: "Age 12",
        text: `Shipped reseter.css — now at ${SiteContent.reseterStars.toLocaleString()} GitHub stars and ${SiteContent.reseterCdnPerYear} jsDelivr requests per year.`,
      },
      {
        period: "2021 onward",
        text: "DevRel roles early — community programs, education, and launch work.",
      },
      {
        period: "Since then",
        text: "Backend engineering alongside community work at Sudan's Tech, Playlistwise, and Sema.",
      },
      {
        period: "Now",
        text: "Studying CS and statistics at Christ University, Bengaluru. Building agentic AI and developer tooling.",
      },
    ];
  }

  static getContact() {
    return {
      heading: "Say hello",
      body:
        "For collaborations, speaking, or fractional DevRel — reach out directly.",
      email: "send@krishg.com",
      href: "mailto:send@krishg.com",
    };
  }

  static getReseterLeadCover(): ImageMetadata {
    return coverReseterLead;
  }

  static getPersonSchema(siteUrl: string) {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      name: title,
      url: siteUrl,
      email: "send@krishg.com",
      jobTitle: "Engineer, builder, sidequester",
      sameAs: [
        socials.github,
        socials.linkedin,
        socials.x,
        socials.instagram,
        socials.substack,
      ],
    };
  }
}
