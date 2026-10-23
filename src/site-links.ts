import { socials } from "~shared";

export const contactEmail = "i@krishg.com";

export type FooterSocial = {
  id: string;
  label: string;
  /** Visible label inside the footer pill. */
  pillLabel: string;
  href: string;
};

/** Extend this array when more platforms are confirmed. */
export const footerSocials: FooterSocial[] = [
  { id: "x", label: "X", pillLabel: "@ikrishg", href: socials.x },
  {
    id: "linkedin",
    label: "LinkedIn",
    pillLabel: "LinkedIn",
    href: socials.linkedin,
  },
];
