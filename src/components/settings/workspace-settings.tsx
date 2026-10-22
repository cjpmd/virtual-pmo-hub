// Settings › Workspaces (work package 1.6). Organisation admins create, rename, describe,
// archive and delete workspaces; organisation admins and a workspace's own admins manage its
// members. Archived workspaces are read-only and stay listed with an "Archived" badge. The
// database refuses archiving or deleting the last active workspace, and deleting one that
// still holds records (archive it instead); those refusals show as they come back.
import { useEffect, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArchivedBadge } from "@/components/workspace-badge";
import { useOrgRole, useWorkspaceRoles } from "@/hooks/use-permissions";
import {
  useWorkspaceMemberMutations,
  useWorkspaceMembers,
  useWorkspaceMutations,
  useWorkspaces,
} from "@/hooks/use-workspaces";
import { atLeast, type AppRole } from "@/services/auth";
import { useSettings } from "@/services/settings";
import type { Workspace } from "@/services/workspaces";
import { Field, SettingsCard } from "./settings-shell";

const ROLES: { value: AppRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "contributor", label: "Contributor" },
  { value: "manager", label: "Manager" },
  { value: "pmo", label: "PMO" },
  { value: "admin", label: "Admin" },
];

export function WorkspaceSettings() {
  const workspaces = useWorkspaces();
  return (
    <QueryState query={workspaces}>
      {(data) => (
        <>
          <WorkspaceList workspaces={data} />
          <WorkspaceMembers workspaces={data} />
        </>
      )}
    </QueryState>
  );
}

type Confirming = { workspace: Workspace; action: "archive" | "delete" } | null;

function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  const isAdmin = atLeast(useOrgRole(), "admin");
  const mutations = useWorkspaceMutations();
  const [editing, setEditing] = useState<Workspace | "new" | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState("");
  const restore = (workspace: Workspace) => {
    setError("");
    mutations.setArchived.mutate(
      { workspace, archived: false },
      { onError: (e) => setError(e.message) },
    );
  };
  return (
    <SettingsCard
      title="Workspaces"
      description="Each workspace holds its own portfolios, programmes and projects. People see the workspaces they belong to; organisation PMO and admins work in all of them. Archived workspaces are read-only and stay visible."
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus />
          New workspace
        </Button>
      }
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="divide-y divide-border/70 rounded-lg border border-border/70">
        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            data-testid="workspace-row"
            className="flex flex-wrap items-center gap-2 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{workspace.name}</p>
                {workspace.archivedAt && <ArchivedBadge />}
              </div>
              {workspace.description && (
                <p className="text-xs text-muted-foreground">{workspace.description}</p>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-1.5">
                {!workspace.archivedAt && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(workspace)}>
                    <Pencil />
                    Edit
                  </Button>
                )}
                {workspace.archivedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutations.setArchived.isPending}
                    onClick={() => restore(workspace)}
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirming({ workspace, action: "archive" })}
                  >
                    <Archive />
                    Archive
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming({ workspace, action: "delete" })}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}
        {!workspaces.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">No workspaces.</p>
        )}
      </div>
      <WorkspaceForm
        workspace={editing === "new" ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <ConfirmWorkspaceAction
        confirming={confirming}
        onClose={() => setConfirming(null)}
        onError={setError}
      />
    </SettingsCard>
  );
}

function WorkspaceForm({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: Workspace | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useWorkspaceMutations();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
    setError("");
  }, [open, workspace]);
  const pending = create.isPending || update.isPending;
  const submit = () => {
    if (!name.trim()) {
      setError("Give the workspace a name.");
      return;
    }
    const done = {
      onSuccess: () => onOpenChange(false),
      onError: (e: Error) => setError(e.message),
    };
    if (workspace) update.mutate({ workspace, name, description }, done);
    else create.mutate({ name, description }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{workspace ? "Edit workspace" : "New workspace"}</DialogTitle>
          <DialogDescription>
            {workspace
              ? "Rename the workspace or change its description."
              : "An empty workspace. Add its members below, then its PMO can create portfolios in it."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={submit}>
            {workspace ? "Save changes" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmWorkspaceAction({
  confirming,
  onClose,
  onError,
}: {
  confirming: Confirming;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const { setArchived, remove } = useWorkspaceMutations();
  const workspace = confirming?.workspace;
  const archiving = confirming?.action === "archive";
  const confirm = () => {
    if (!workspace) return;
    onError("");
    const done = { onError: (e: Error) => onError(e.message) };
    if (archiving) setArchived.mutate({ workspace, archived: true }, done);
    else remove.mutate(workspace, done);
    onClose();
  };
  return (
    <Dialog open={!!confirming} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{archiving ? "Archive workspace" : "Delete workspace"}</DialogTitle>
          <DialogDescription>
            {archiving
              ? `“${workspace?.name}” becomes read-only for everyone. Its records stay visible in lists and reports, and its health keeps updating. You can restore it later.`
              : `“${workspace?.name}” will be deleted. Only an empty workspace can be deleted; archive one that holds records.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm}>
            {archiving ? <Archive /> : <Trash2 />}
            {archiving ? "Archive workspace" : "Delete workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceMembers({ workspaces }: { workspaces: Workspace[] }) {
  const settings = useSettings();
  const roles = useWorkspaceRoles().data ?? [];
  const [chosen, setChosen] = useState("");
  const workspace =
    workspaces.find((item) => item.id === chosen) ??
    workspaces.find((item) => !item.archivedAt) ??
    workspaces[0];
  // Organisation admins and the workspace's admins (an archived workspace caps them at viewer).
  const canManage =
    !!workspace && atLeast(roles.find((row) => row.workspaceId === workspace.id)?.role, "admin");
  const members = useWorkspaceMembers(workspace?.id);
  const mutations = useWorkspaceMemberMutations(workspace?.id ?? "");
  const [newMember, setNewMember] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("contributor");
  const [error, setError] = useState("");
  useEffect(() => setError(""), [workspace?.id]);
  const listed = new Set((members.data ?? []).map((member) => member.profileId));
  const candidates = settings.users.filter((user) => !listed.has(user.id));
  const fail = (e: Error) => setError(e.message);
  return (
    <SettingsCard
      title="Workspace members"
      description="Who works in each workspace, and their role there. Organisation PMO and admins work in every workspace without being listed."
      editable={canManage}
      lockedNote={
        workspace?.archivedAt
          ? "This workspace is archived, so its members can't be changed. Restore it first."
          : "Only organisation admins and this workspace's admins can change its members."
      }
    >
      {/* In the fieldset's legend, so choosing a workspace still works when the card is read-only. */}
      {workspaces.length > 1 && (
        <legend className="mb-4 block w-full max-w-sm space-y-1.5">
          <span className="block text-xs font-semibold text-muted-foreground">Workspace</span>
          <select
            aria-label="Workspace"
            value={workspace?.id ?? ""}
            onChange={(event) => setChosen(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </legend>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <QueryState query={members}>
        {(rows) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-table-head text-xs text-muted-foreground">
                <tr>
                  <th className="h-10 px-3 font-semibold">Name</th>
                  <th className="px-3 font-semibold">Email</th>
                  <th className="px-3 font-semibold">Workspace role</th>
                  <th className="px-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.profileId} className="border-t">
                    <td className="px-3 py-2.5 font-medium">{member.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{member.email}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`${member.name} workspace role`}
                        value={member.role}
                        onChange={(event) => {
                          setError("");
                          mutations.changeRole.mutate(
                            { member, role: event.target.value as AppRole },
                            { onError: fail },
                          );
                        }}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${member.name}`}
                        onClick={() => {
                          setError("");
                          mutations.remove.mutate(member, { onError: fail });
                        }}
                      >
                        <Trash2 />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Nobody is listed on this workspace yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      {canManage && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newMember) return;
            setError("");
            mutations.add.mutate(
              { profileId: newMember, role: newRole },
              { onSuccess: () => setNewMember(""), onError: fail },
            );
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Organisation member</span>
            <select
              aria-label="Organisation member to add"
              value={newMember}
              onChange={(event) => setNewMember(event.target.value)}
              className="h-9 w-64 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Choose a person…</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.email ? ` (${user.email})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Role</span>
            <select
              aria-label="Role for the new member"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as AppRole)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!newMember || mutations.add.isPending}>
            <UserPlus />
            Add to workspace
          </Button>
        </form>
      )}
    </SettingsCard>
  );
}
