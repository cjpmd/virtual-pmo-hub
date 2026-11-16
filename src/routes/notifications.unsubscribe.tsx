import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { handleOneClickUnsubscribe } from "@/lib/one-click-unsubscribe";
import { unsubscribeNotificationEmails } from "@/services/notifications";

// GL-13: the unsubscribe link in notification emails. Public (works signed out): the token in
// the link turns the person's notification emails off; they can turn them back on in
// Settings › Account.
//   * POST (RFC 8058 one-click, from the email's List-Unsubscribe-Post header): handled on the
//     server, no page.
//   * GET (someone clicks the link): the page asks them to confirm, so a mail scanner that
//     prefetches links can't unsubscribe anyone.
export const Route = createFileRoute("/notifications/unsubscribe")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    ...(typeof search["token"] === "string" && { token: search["token"] }),
  }),
  server: {
    handlers: {
      POST: ({ request }) => handleOneClickUnsubscribe(request, unsubscribeNotificationEmails),
    },
  },
  head: () => ({
    meta: [{ title: "Unsubscribe — ORMO PMO" }, { name: "robots", content: "noindex" }],
  }),
  component: Unsubscribe,
});

type State = "ready" | "working" | "done" | "invalid" | "error";

function Unsubscribe() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>(token ? "ready" : "invalid");
  const confirm = () => {
    if (!token) return;
    setState("working");
    unsubscribeNotificationEmails(token)
      .then((ok) => setState(ok ? "done" : "invalid"))
      .catch(() => setState("error"));
  };
  const message: Record<State, { title: string; body: string }> = {
    ready: {
      title: "Unsubscribe from notification emails?",
      body: "You'll stop getting ORMO PMO notification emails. You'll still see notifications in the app, and you can turn emails back on in Settings › Account.",
    },
    working: { title: "Unsubscribing…", body: "One moment." },
    done: {
      title: "You're unsubscribed",
      body: "You won't get notification emails any more. You'll still see notifications in the app, and you can turn emails back on in Settings › Account.",
    },
    invalid: {
      title: "This link doesn't work",
      body: "It may have expired. Sign in and turn notification emails off in Settings › Account.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn't unsubscribe you just now. Try again, or turn emails off in Settings › Account.",
    },
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="font-display text-2xl font-semibold">{message[state].title}</h1>
      <p className="text-sm text-muted-foreground" role="status">
        {message[state].body}
      </p>
      <div className="flex flex-wrap gap-2">
        {(state === "ready" || state === "working" || state === "error") && (
          <Button onClick={confirm} disabled={state === "working"}>
            Unsubscribe
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/settings/$section" params={{ section: "account" }}>
            Notification settings
          </Link>
        </Button>
      </div>
    </main>
  );
}
