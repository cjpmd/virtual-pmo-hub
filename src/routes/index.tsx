import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getDefaultHome, hydrateSettings, useSettings } from "@/services/settings";

/**
 * The landing page follows the default home configured for the signed-in user's role.
 * It resolves on the client so the stored user is known before redirecting.
 */
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Home — Virtual PMO" },
    { name: "description", content: "Open your Virtual PMO workspace and portfolio home." },
    { property: "og:title", content: "Home — Virtual PMO" },
    { property: "og:description", content: "Open your Virtual PMO workspace and portfolio home." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Landing,
});

function Landing() {
  const settings = useSettings();
  const navigate = useNavigate();
  useEffect(() => { hydrateSettings() }, []);
  const home = getDefaultHome(settings);
  useEffect(() => { navigate({ to: home, replace: true }) }, [home, navigate]);
  return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Taking you to your home page…</div>;
}
