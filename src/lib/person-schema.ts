import { socials, title } from "~shared";

export function getPersonSchema(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: title,
    url: siteUrl,
    email: "send@krishg.com",
    jobTitle: "Engineer, builder, educator",
    sameAs: [socials.x, socials.instagram, socials.linkedin],
  };
}
