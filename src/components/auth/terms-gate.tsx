import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptTerms, hasAcceptedCurrentTerms, termsAction } from "@/services/terms";
import { errorMessage } from "@/services/service-error";
import { CentredCard, SignOutButton } from "./auth-gate";
import { useOrganisation } from "./organisation-provider";
import { useUser } from "./session-provider";

/**
 * GL-7 follow-up. Everyone signed in to an organisation needs a record of accepting the current
 * Terms (and DPA) version there (public.terms_acceptances). Without one: an email sign-up whose
 * form captured this version is recorded silently; anyone else (Microsoft sign-ups, accounts from
 * before the records, everyone after a version change) is asked once before the app opens.
 * The check fails open: if it can't be read, the app opens and it's tried again next sign-in.
 */
export function TermsGate({ children }: { children: ReactNode }) {
  const user = useUser();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const key = ["me", user.id, "terms", orgId] as const;
  const accepted = useQuery({
    queryKey: key,
    queryFn: () => hasAcceptedCurrentTerms(orgId, user.id),
    staleTime: Infinity,
    retry: 1,
    meta: { silent: true },
  });
  const action = accepted.isSuccess ? termsAction(accepted.data, user.user_metadata) : "none";
  const record = useMutation({
    meta: { silent: true },
    mutationFn: (method: "signup_form" | "sign_in_prompt") => acceptTerms(orgId, method),
    onSuccess: () => queryClient.setQueryData(key, true),
  });

  const { mutate, isIdle } = record;
  useEffect(() => {
    if (action === "record_signup_form" && isIdle) mutate("signup_form");
  }, [action, isIdle, mutate]);

  if (action !== "prompt") return <>{children}</>;
  return (
    <TermsPrompt
      organisationName={organisation.name}
      pending={record.isPending}
      error={record.isError ? errorMessage(record.error) : null}
      onAccept={() => record.mutate("sign_in_prompt")}
    />
  );
}

function TermsPrompt({
  organisationName,
  pending,
  error,
  onAccept,
}: {
  organisationName: string;
  pending: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  const [ticked, setTicked] = useState(false);
  const link = "text-primary underline-offset-2 hover:underline";
  return (
    <CentredCard title="Accept the terms to continue">
      <p className="text-sm text-muted-foreground">
        Before you carry on in <strong className="text-foreground">{organisationName}</strong>,
        please read and accept our terms. We keep a record of the version you accepted and when.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={ticked}
          onCheckedChange={(value) => setTicked(value === true)}
          aria-label="I accept the terms"
        />
        <span>
          I accept the{" "}
          <a href="/terms" target="_blank" rel="noreferrer" className={link}>
            Terms of service
          </a>{" "}
          and the{" "}
          <a href="/dpa" target="_blank" rel="noreferrer" className={link}>
            Data Processing Agreement
          </a>
          , and I've read the{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className={link}>
            Privacy policy
          </a>
          .
        </span>
      </label>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={!ticked || pending} onClick={onAccept}>
          {pending && <LoaderCircle className="animate-spin" />}
          Accept and continue
        </Button>
        <SignOutButton />
      </div>
    </CentredCard>
  );
}
