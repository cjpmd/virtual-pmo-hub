import { createFileRoute } from "@tanstack/react-router";
import { siteHead } from "@/components/marketing/site-head";
import { SitePlaceholderPage } from "@/components/marketing/site-page-parts";

// TODO: the legal text comes in its own work package.
export const Route = createFileRoute("/terms")({
  head: () => siteHead("Terms of service — ORMO PMO", "The ORMO PMO terms of service."),
  component: () => <SitePlaceholderPage title="Terms of service" />,
});
