import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeNext } from "@/lib/safe-next";

// The old sign-in address. Kept so bookmarks and earlier emails still work.
export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search["next"]),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/login",
      search: search.next ? { next: search.next } : {},
      replace: true,
    });
  },
});
