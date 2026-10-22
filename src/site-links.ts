import { socials } from "~shared";

export const resumeHref = "/resume";

export const contactEmail = "krish@krishg.com";

export type FooterSocial = {
  id: string;
  label: string;
  href: string;
};

/** Extend this array when more platforms are confirmed. */
export const footerSocials: FooterSocial[] = [
  { id: "x", label: "X", href: socials.x },
  { id: "instagram", label: "Instagram", href: socials.instagram },
  { id: "linkedin", label: "LinkedIn", href: socials.linkedin },
];
