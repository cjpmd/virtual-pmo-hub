import { createFileRoute } from "@tanstack/react-router";
import { siteHead } from "@/components/marketing/site-head";
import { SitePlaceholderPage } from "@/components/marketing/site-page-parts";

// TODO: the legal text comes in its own work package.
export const Route = createFileRoute("/privacy")({
  head: () => siteHead("Privacy notice — ORMO PMO", "The ORMO PMO privacy notice."),
  component: () => <SitePlaceholderPage title="Privacy notice" />,
});
