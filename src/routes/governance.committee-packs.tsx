import { createFileRoute, redirect } from "@tanstack/react-router";

// Funding packs were retired in GL-14: collection packs are built in the report builder from the
// "Funding committee" template. Old links open Reports, filtered to the collection if one was given.
export const Route = createFileRoute("/governance/committee-packs")({
  validateSearch: (search: Record<string, unknown>): { collection?: string } => ({
    ...(typeof search["collection"] === "string" && { collection: search["collection"] }),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/governance/reports",
      search: search.collection ? { collection: search.collection } : {},
      replace: true,
    });
  },
});
