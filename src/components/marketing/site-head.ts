// Head tags for the public content pages.
import { siteFontLinks } from "@/components/marketing/site-fonts";

/** Head tags for a public page. */
export function siteHead(title: string, description: string) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: siteFontLinks,
  };
}
