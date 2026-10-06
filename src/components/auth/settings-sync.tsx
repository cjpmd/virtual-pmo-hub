// Loads the organisation's settings into the settings store before the app renders, and
// saves edits made through updateSettings() back to Supabase.
//
// Edits apply on screen at once. Saves are debounced (a burst of typing is one save) and are
// flushed before navigation, when the tab is hidden and on unmount, so nothing is dropped.
// After a save the organisation's queries refresh, because thresholds, lists and phases feed
// health and labels everywhere. A failed save is reported and the screen returns to what the
// server holds.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { AppSettings } from "@/data/settings-types";
import { loadOrgSettings, saveOrgSettings, type OrgSettingsData } from "@/services/org-settings";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import {
  applyServerSettings,
  clearServerSettings,
  setSettingsPersister,
} from "@/services/settings";
import { Button } from "@/components/ui/button";
import { CentredCard, SignOutButton, Splash } from "./auth-gate";
import { useOrganisation } from "./organisation-provider";

let pendingLogo: File | undefined;
/** The organisation settings screen hands the chosen logo file over here before saving. */
export const setPendingLogo = (file: File | undefined) => {
  pendingLogo = file;
};

const DELAY = 800;

export function SettingsSync({ children }: { children: ReactNode }) {
  const { organisation, profile } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: qk.settings(orgId),
    queryFn: () => loadOrgSettings(orgId, profile.id),
    staleTime: 5 * 60_000,
  });
  const [applied, setApplied] = useState<string | null>(null);
  const state = useRef({
    data: undefined as OrgSettingsData | undefined,
    baseline: undefined as AppSettings | undefined,
    latest: undefined as AppSettings | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    saving: Promise.resolve() as Promise<unknown>,
    busy: false,
    ids: new Map<string, string>(),
  });

  // Adopt the server's settings whenever they (re)load, unless the user has unsaved edits.
  useEffect(() => {
    if (!query.data) return;
    state.current.data = query.data;
    if (state.current.busy) return;
    applyServerSettings(query.data.settings);
    setApplied(orgId);
  }, [query.data, orgId]);

  useEffect(() => {
    const current = state.current;
    const flush = () => {
      if (!current.timer) return;
      clearTimeout(current.timer);
      current.timer = undefined;
      const previous = current.baseline,
        next = current.latest;
      current.baseline = undefined;
      if (!previous || !next || !current.data) return;
      const data = current.data;
      const logoFile = pendingLogo;
      pendingLogo = undefined;
      current.saving = current.saving
        .catch(() => undefined)
        .then(() => saveOrgSettings({ orgId, data, logoFile, ids: current.ids }, previous, next))
        .then(
          () => queryClient.invalidateQueries({ queryKey: qk.org(orgId) }),
          async (error: unknown) => {
            toast.error(errorMessage(error));
            current.busy = false;
            await queryClient.invalidateQueries({ queryKey: qk.org(orgId) });
          },
        )
        .finally(() => {
          if (!current.timer) current.busy = false;
        });
    };
    setSettingsPersister((previous, next) => {
      current.busy = true;
      current.baseline ??= previous;
      current.latest = next;
      if (current.timer) clearTimeout(current.timer);
      current.timer = setTimeout(flush, DELAY);
    });
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (current.busy) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    const unsubscribe = router.subscribe("onBeforeNavigate", flush);
    return () => {
      flush();
      setSettingsPersister(null);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsubscribe();
    };
  }, [orgId, queryClient, router]);

  // Leaving the organisation (switch or sign-out): back to defaults.
  useEffect(() => () => clearServerSettings(), [orgId]);

  if (applied !== orgId) {
    if (query.isError)
      return (
        <CentredCard title="We couldn't load your organisation's settings">
          <p className="text-sm text-muted-foreground">{errorMessage(query.error)}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void query.refetch()}>Try again</Button>
            <SignOutButton />
          </div>
        </CentredCard>
      );
    return <Splash />;
  }
  return <>{children}</>;
}
