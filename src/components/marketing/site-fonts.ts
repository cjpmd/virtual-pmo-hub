// Fonts for the public site (ORMO brand restyle).

/** Montserrat (headings) and Plus Jakarta Sans (text), loaded only on public pages (add to the route's head links). */
export const siteFontLinks = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
  },
];
