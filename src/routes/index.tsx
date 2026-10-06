import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { siteFontLinks } from "@/components/marketing/site-fonts";
import { PublicHome } from "@/components/public-home";

const title = "Virtual PMO — know which projects are really on track";
const description =
  "Portfolios, programmes and projects in one place, with health calculated from delivery data and every status report checked against the evidence.";

/** Public homepage. Signed-in users go straight to their portfolio. */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: siteFontLinks,
  }),
  component: Landing,
});

function Landing() {
  const session = useSession();
  if (session.status === "loading") return <Splash label="Loading…" />;
  if (session.status === "signed_in") return <Navigate to="/portfolio" replace />;
  return <PublicHome />;
}
