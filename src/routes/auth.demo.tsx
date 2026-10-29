import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { DemoEntry } from "@/components/auth/demo-entry";
import { useSession } from "@/components/auth/session-provider";

const title = "View demo — ORMO PMO";
const description =
  "Explore the ORMO PMO demo portfolio with read-only access after confirming your email.";

export const Route = createFileRoute("/auth/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ViewDemo,
});

function ViewDemo() {
  const session = useSession();
  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_out")
    return <Navigate to="/login" search={{ next: "/auth/demo" }} replace />;
  return (
    <CentredCard title="View demo">
      <DemoEntry key={session.user.id} userId={session.user.id} />
    </CentredCard>
  );
}
