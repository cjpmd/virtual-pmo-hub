import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { PublicHome } from "@/components/public-home";

/** Public homepage. Signed-in users go straight to their portfolio. */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Virtual PMO — portfolio management for universities" },
      {
        name: "description",
        content:
          "Portfolio, programme and project management for university IT and change teams: evidence-based health, benefits, governance, delivery and resources in one place.",
      },
      { property: "og:title", content: "Virtual PMO — portfolio management for universities" },
      {
        property: "og:description",
        content: "Every project, programme and benefit, in one honest view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const session = useSession();
  if (session.status === "loading") return <Splash label="Loading…" />;
  if (session.status === "signed_in") return <Navigate to="/portfolio" replace />;
  return <PublicHome />;
}
