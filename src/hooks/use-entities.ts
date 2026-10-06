// Create, edit, close/reopen and archive portfolios, programmes and projects.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  archiveEntity,
  closeEntity,
  createPortfolio,
  createProgramme,
  createProject,
  reopenEntity,
  updatePortfolio,
  updateProgramme,
  updateProject,
  type Kind,
  type PortfolioInput,
  type ProgrammeInput,
  type ProjectInput,
} from "@/services/entities";
import { latest, type Written } from "@/services/write";
import { invalidateRollups } from "./use-project-records";

// The updated_at each of this tab's own writes returned. Lists refresh in the background, so a
// second action straight after a save would otherwise send the older updated_at and trip the
// optimistic-concurrency check on our own change.
const writtenAt = new Map<string, string | null>();
const seen = (id: string, lastSeen: string | null) => latest(lastSeen, writtenAt.get(id));
const remember = (id: string) => (written: Written) => {
  writtenAt.set(id, written.updatedAt);
  return written;
};

export function useEntityMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // Any of these changes the lists and roll-ups at every level. Not awaited: dialogs close as
  // soon as the write succeeds and the lists refresh behind them.
  const onSettled = () => {
    void invalidateRollups(queryClient, orgId);
  };
  return {
    close: useMutation({
      mutationFn: (v: { kind: Kind; id: string; reason: string; lastSeen: string | null }) =>
        closeEntity(v.kind, v.id, v.reason, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
    reopen: useMutation({
      mutationFn: (v: { kind: Kind; id: string; lastSeen: string | null }) =>
        reopenEntity(v.kind, v.id, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
    archive: useMutation({
      mutationFn: (v: { kind: Kind; id: string; lastSeen: string | null }) =>
        archiveEntity(v.kind, v.id, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
    createPortfolio: useMutation({
      mutationFn: (v: { workspaceId: string; input: PortfolioInput }) =>
        createPortfolio(v.workspaceId, v.input),
      onSettled,
    }),
    updatePortfolio: useMutation({
      mutationFn: (v: { id: string; input: PortfolioInput; lastSeen: string | null }) =>
        updatePortfolio(v.id, v.input, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
    createProgramme: useMutation({ mutationFn: createProgramme, onSettled }),
    updateProgramme: useMutation({
      mutationFn: (v: { id: string; input: ProgrammeInput; lastSeen: string | null }) =>
        updateProgramme(v.id, v.input, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
    createProject: useMutation({ mutationFn: createProject, onSettled }),
    updateProject: useMutation({
      mutationFn: (v: { id: string; input: ProjectInput; lastSeen: string | null }) =>
        updateProject(v.id, v.input, seen(v.id, v.lastSeen)).then(remember(v.id)),
      onSettled,
    }),
  };
}
