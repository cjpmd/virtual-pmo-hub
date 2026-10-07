import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/components/auth/session-provider";
import { BusinessCasePage } from "@/components/business-case/business-case-page";
import { useCan } from "@/hooks/use-permissions";
import { useRequests } from "@/hooks/use-requests";

const title = "Request business case — Virtual PMO",
  description = "The request's business case: Five Case Model sections, options, benefits and documents.";

export const Route = createFileRoute("/portfolio/requests_/$requestId/business-case")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequestBusinessCase,
});

function RequestBusinessCase() {
  const { requestId } = Route.useParams();
  const requests = useRequests();
  const isManager = useCan("manager");
  const user = useUser();
  const request = requests.data?.requests.find((item) => item.id === requestId);
  if (requests.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!request) return <p className="text-sm text-muted-foreground">Request not found.</p>;
  // Mirrors the database rule: managers, or the request's author or requester.
  const requester = requests.data?.people.find((person) => person.id === request.requesterId);
  const canEdit =
    isManager ||
    (request as { createdBy?: string | null }).createdBy === user?.id ||
    (requester as { profileId?: string | null } | undefined)?.profileId === user?.id;
  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/portfolio/requests"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Requests · {request.ref}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">{request.title}: business case</h1>
      </div>
      <BusinessCasePage
        owner={{ requestId }}
        defaultTitle={`${request.title} business case`}
        canEdit={canEdit}
      />
    </div>
  );
}
