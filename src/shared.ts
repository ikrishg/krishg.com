import { site as astroSite, base } from "astro:config/server";

export const title = "Krish Gupta";
export const description =
  "Builder, creator, and educator. Interactive homepage at krishg.com.";
export const site = new URL(base, astroSite) || new URL("https://krishg.com");

export const socials = {
  x: "https://x.com/ikrishg",
  linkedin: "https://www.linkedin.com/in/ikrishg",
  substack: "https://koldovstvo.substack.com",
  github: "https://github.com/ikrishg",
} as const;
