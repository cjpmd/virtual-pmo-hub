// "Ask to join" on organisation setup (work package 2.1). Lists organisations that accept join
// requests from the user's confirmed email domain or Microsoft organisation
// (find_joinable_organisations); an admin approves each request. Shows nothing when none match.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/auth/auth-fields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  findJoinableOrganisations,
  myPendingJoinRequest,
  requestToJoin,
  withdrawJoinRequest,
  type JoinableOrganisation,
} from "@/services/members";
import { qk } from "@/services/query-keys";

export function JoinableOrganisations({ userId }: { userId: string }) {
  const joinable = useQuery({
    queryKey: qk.joinable(userId),
    queryFn: findJoinableOrganisations,
  });
  if (!joinable.data?.length) return null;
  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-4">
      <p className="text-sm font-semibold">Your organisation may already be here</p>
      {joinable.data.map((org) => (
        <JoinableRow key={org.organisationId} userId={userId} org={org} />
      ))}
      <p className="text-xs text-muted-foreground">Or set up a new organisation below.</p>
    </div>
  );
}

function JoinableRow({ userId, org }: { userId: string; org: JoinableOrganisation }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.joinable(userId) });
  const send = useMutation({
    meta: { silent: true },
    mutationFn: () => requestToJoin(org.organisationId, message),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      const id = await myPendingJoinRequest(org.organisationId, userId);
      if (id) await withdrawJoinRequest(id);
    },
    onSuccess: refresh,
  });
  const via = org.matchedBy === "entra_tenant" ? "your Microsoft account" : "your email address";

  if (org.requestStatus === "pending")
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{org.name}</span>: request sent. An admin will let you in.
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate()}
        >
          Withdraw
        </Button>
        <FormError error={withdraw.error} />
      </div>
    );

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{org.name}</span> accepts requests from {via}.
          {org.requestStatus === "declined" && " Your last request was declined."}
        </span>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Ask to join
          </Button>
        )}
      </div>
      {open && (
        <>
          <Textarea
            rows={2}
            maxLength={500}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Optional message for the admins, e.g. your team"
          />
          <FormError error={send.error} />
          <Button size="sm" disabled={send.isPending} onClick={() => send.mutate()}>
            <Send className="size-3.5" />
            Send request
          </Button>
        </>
      )}
    </div>
  );
}
