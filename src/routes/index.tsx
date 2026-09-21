import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getDefaultHome, hydrateSettings, useSettings } from "@/services/settings";

/**
 * The landing page follows the default home configured for the signed-in user's role.
 * It resolves on the client so the stored user is known before redirecting.
 */
export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const settings = useSettings();
  const navigate = useNavigate();
  useEffect(() => { hydrateSettings() }, []);
  const home = getDefaultHome(settings);
  useEffect(() => { navigate({ to: home, replace: true }) }, [home, navigate]);
  return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Taking you to your home page…</div>;
}
