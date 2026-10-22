import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Pencil, Plus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QueryState } from "@/components/query-state";
import { DecisionPanel } from "@/components/decision-panel";
import { DecisionStatusPill } from "@/components/decision-pills";
import { DecisionMeetingSignals } from "@/components/decision-meeting-signals";
import { ForumField, ForumForm, MeetingForm, forumSelectClass } from "@/components/forum-forms";
import {
  useForumMembers,
  useForumMutations,
  useForumPermissions,
  useForums,
  useMeetingDecisions,
  useMeetings,
} from "@/hooks/use-forums";
import { usePeople } from "@/hooks/use-hierarchy";
import { useGovernance } from "@/hooks/use-governance";
import { ArchivedWorkspaceBadge } from "@/components/workspace-badge";
import { useWorkspaces } from "@/hooks/use-workspaces";
import type { ForumItem, MeetingItem } from "@/services/forums";
import { formatDate } from "@/lib/format";
import { daysFromToday } from "@/lib/today";
import { errorMessage } from "@/services/service-error";

type AgendaRenderer = (
  forum: ForumItem,
  meeting?: MeetingItem,
  targetedOnly?: boolean,
) => ReactNode;
export function BoardsWorkspace({ renderAgenda }: { renderAgenda: AgendaRenderer }) {
  const forums = useForums();
  const workspaces = useWorkspaces();
  const { forum: forumId, meeting: meetingId } = useSearch({ from: "/governance/forum" });
  const permissions = useForumPermissions();
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<ForumItem | "new" | null>(null);
  const mutations = useForumMutations();
  const selected = forums.data?.find((forum) => forum.id === forumId);
  return (
    <QueryState query={forums}>
      {(items) => (
        <div className="space-y-6">
          {forumId ? (
            selected ? (
              <ForumDetail
                key={selected.id}
                forum={selected}
                meetingId={meetingId}
                renderAgenda={renderAgenda}
                onEdit={() => setEditing(selected)}
              />
            ) : (
              <p role="alert">
                This forum is unavailable.{" "}
                <Link to="/governance/forum" search={{}} className="text-primary underline">
                  Back to Boards
                </Link>
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={inactive} onCheckedChange={setInactive} />
                  Show inactive
                </label>
                {(permissions.canAddOrganisationForum || permissions.workspaceIds.length > 0) && (
                  <Button onClick={() => setEditing("new")}>
                    <Plus />
                    Add forum
                  </Button>
                )}
              </div>
              {workspaces.error && (
                <p role="alert" className="text-sm text-health-bad-foreground">
                  {errorMessage(workspaces.error)}
                </p>
              )}
              {[
                null,
                ...new Set(
                  items.map((forum) => forum.workspaceId).filter((id): id is string => Boolean(id)),
                ),
              ].map((workspaceId) => {
                const group = items.filter(
                  (forum) => forum.workspaceId === workspaceId && (inactive || forum.active),
                );
                if (!group.length) return null;
                return (
                  <section key={workspaceId ?? "organisation"} className="space-y-3">
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                      {workspaceId
                        ? (workspaces.data?.find((workspace) => workspace.id === workspaceId)
                            ?.name ?? "Workspace")
                        : "Organisation"}
                      <ArchivedWorkspaceBadge workspaceId={workspaceId} />
                    </h2>
                    <div className="divide-y border-y">
                      {group.map((forum) => (
                        <div
                          key={forum.id}
                          className="grid gap-3 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto]"
                        >
                          <div className="min-w-0">
                            <Link
                              to="/governance/forum"
                              search={{ forum: forum.id }}
                              className="font-semibold text-primary hover:underline"
                            >
                              {forum.name}
                            </Link>
                            <span className="ml-2 rounded-md bg-muted px-2 py-1 text-xs">
                              {forum.level}
                            </span>
                            {!forum.active && (
                              <span className="ml-2 text-xs text-muted-foreground">Inactive</span>
                            )}
                            <p className="mt-2 text-sm text-muted-foreground">
                              {forum.chairName ?? "No chair"} · {forum.memberCount} members
                            </p>
                          </div>
                          <div className="text-sm">
                            <p>{forum.cadence ?? "No cadence"}</p>
                            <p className="mt-2 font-mono text-xs text-muted-foreground">
                              {forum.pendingDecisions} pending decisions
                            </p>
                          </div>
                          <div className="text-sm">
                            {forum.nextMeetingDate ? (
                              <>
                                <Link
                                  to="/governance/forum"
                                  search={{
                                    forum: forum.id,
                                    ...(forum.nextMeetingId
                                      ? { meeting: forum.nextMeetingId }
                                      : {}),
                                  }}
                                  className="inline-flex items-center gap-2 text-primary hover:underline"
                                >
                                  <CalendarDays className="size-4" />
                                  {formatDate(forum.nextMeetingDate)}
                                </Link>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Papers due {formatDate(forum.nextPapersDeadline ?? undefined)}
                                </p>
                                <PapersWarning date={forum.nextPapersDeadline} />
                              </>
                            ) : (
                              <span className="text-muted-foreground">No upcoming meeting</span>
                            )}
                          </div>
                          {permissions.canManage(forum) && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Edit ${forum.name}`}
                                title={`Edit ${forum.name}`}
                                onClick={() => setEditing(forum)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={mutations.setForumActive.isPending}
                                onClick={() =>
                                  mutations.setForumActive.mutate({
                                    id: forum.id,
                                    active: !forum.active,
                                    lastSeen: forum.updatedAt,
                                  })
                                }
                              >
                                {forum.active ? "Deactivate" : "Reactivate"}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {!items.some((forum) => inactive || forum.active) && (
                <p className="py-8 text-sm text-muted-foreground">No forums.</p>
              )}
            </>
          )}
          {editing && (
            <ForumForm
              forum={editing === "new" ? undefined : editing}
              workspaces={workspaces.data ?? []}
              close={() => setEditing(null)}
            />
          )}
        </div>
      )}
    </QueryState>
  );
}

function PapersWarning({ date, passed }: { date: string | null; passed?: boolean }) {
  const days = daysFromToday(date);
  if (!passed && (days === undefined || days > 3)) return null;
  return (
    <span className="mt-2 inline-block rounded-md bg-health-warn/20 px-2 py-1 text-xs font-semibold text-health-warn-foreground">
      {passed || (days !== undefined && days < 0)
        ? "Papers deadline passed"
        : `Papers due in ${days} days`}
    </span>
  );
}

function ForumDetail({
  forum,
  meetingId,
  renderAgenda,
  onEdit,
}: {
  forum: ForumItem;
  meetingId?: string | undefined;
  renderAgenda: AgendaRenderer;
  onEdit: () => void;
}) {
  const meetings = useMeetings(forum.id);
  const members = useForumMembers(forum.id);
  const people = usePeople();
  const permissions = useForumPermissions();
  const mutations = useForumMutations();
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState("");
  const [form, setForm] = useState<{
    meeting?: MeetingItem | undefined;
    mode: "edit" | "held" | "cancel";
  } | null>(null);
  const meeting = meetings.data?.find((item) => item.id === meetingId);
  const canManage = permissions.canManage(forum);
  const canMeet = permissions.canManageMeetings(forum);
  const memberIds = new Set((members.data ?? []).map((member) => member.resourceId));
  const meetingRows = (items: MeetingItem[]) => (
    <div className="divide-y border-y">
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div>
            <Link
              to="/governance/forum"
              search={{ forum: forum.id, meeting: item.id }}
              className="font-semibold text-primary hover:underline"
            >
              {formatDate(item.meetingDate)}
            </Link>
            <span className="ml-2 rounded-md bg-muted px-2 py-1 text-xs">{item.status}</span>
            <p className="mt-2 text-xs text-muted-foreground">
              Papers due {formatDate(item.papersDeadline)} · {item.decisionsTargeted} targeted ·{" "}
              {item.decisionsPending} pending
            </p>
            {item.status === "Planned" && (
              <PapersWarning date={item.papersDeadline} passed={item.papersDeadlinePassed} />
            )}
            {item.minutesLink && (
              <a
                href={item.minutesLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-primary underline"
              >
                Minutes
              </a>
            )}
          </div>
          {canMeet && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ meeting: item, mode: "edit" })}
              >
                Edit
              </Button>
              {item.status === "Planned" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ meeting: item, mode: "held" })}
                  >
                    Mark held
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ meeting: item, mode: "cancel" })}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {!items.length && <p className="py-4 text-sm text-muted-foreground">No meetings.</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() =>
          navigate({ to: "/governance/forum", search: meetingId ? { forum: forum.id } : {} })
        }
      >
        <ArrowLeft />
        {meetingId ? forum.name : "All boards"}
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-semibold">{forum.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {forum.level} · {forum.chairName ?? "No chair"} · {forum.cadence ?? "No cadence"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Papers due {forum.papersDeadlineDays} days before
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={onEdit}>
            <Pencil />
            Edit forum
          </Button>
        )}
      </header>
      <QueryState query={meetings}>
        {(items) =>
          meetingId ? (
            meeting ? (
              <>
                <header className="border-y py-4">
                  <h3 className="text-xl font-semibold">{formatDate(meeting.meetingDate)}</h3>
                  <p className="mt-2 text-sm">
                    {meeting.status} · Papers due {formatDate(meeting.papersDeadline)}
                  </p>
                  <PapersWarning
                    date={meeting.papersDeadline}
                    passed={meeting.papersDeadlinePassed}
                  />
                  {meeting.minutesLink && (
                    <a
                      href={meeting.minutesLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-3 text-sm text-primary underline"
                    >
                      Minutes
                    </a>
                  )}
                  {meeting.notes && (
                    <p className="mt-2 text-sm text-muted-foreground">{meeting.notes}</p>
                  )}
                </header>
                <MeetingDecisions meeting={meeting} />
                {renderAgenda(forum, meeting, true)}
              </>
            ) : (
              <p role="alert">This meeting is unavailable for this forum.</p>
            )
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">Members</h3>
                <QueryState query={members}>
                  {(list) => (
                    <ul className="divide-y">
                      {list.map((member) => (
                        <li
                          key={member.resourceId}
                          className="flex items-center justify-between gap-2 py-2 text-sm"
                        >
                          {member.name}
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={`Remove ${member.name}`}
                              aria-label={`Remove ${member.name}`}
                              disabled={mutations.removeMember.isPending}
                              onClick={() =>
                                mutations.removeMember.mutate({
                                  forumId: forum.id,
                                  resourceId: member.resourceId,
                                })
                              }
                            >
                              <UserMinus />
                            </Button>
                          )}
                        </li>
                      ))}
                      {!list.length && (
                        <li className="text-sm text-muted-foreground">No members.</li>
                      )}
                    </ul>
                  )}
                </QueryState>
                {canManage && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <ForumField label="Add member">
                        <select
                          className={forumSelectClass}
                          value={memberId}
                          onChange={(event) => setMemberId(event.target.value)}
                        >
                          <option value="">Choose a resource</option>
                          {(people.data ?? [])
                            .filter((person) => !memberIds.has(person.id))
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                        </select>
                      </ForumField>
                    </div>
                    <Button
                      disabled={!memberId || mutations.addMember.isPending}
                      onClick={() =>
                        mutations.addMember.mutate(
                          { forumId: forum.id, resourceId: memberId },
                          { onSuccess: () => setMemberId("") },
                        )
                      }
                    >
                      <Plus />
                      Add
                    </Button>
                  </div>
                )}
              </section>
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Upcoming meetings</h3>
                  {canMeet && (
                    <Button onClick={() => setForm({ mode: "edit" })}>
                      <Plus />
                      Add meeting
                    </Button>
                  )}
                </div>
                {meetingRows(items.filter((item) => item.status === "Planned" && !item.isPast))}
              </section>
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">Past meetings</h3>
                {meetingRows(
                  items
                    .filter((item) => item.isPast || item.status !== "Planned")
                    .slice()
                    .reverse(),
                )}
              </section>
              {renderAgenda(forum)}
            </>
          )
        }
      </QueryState>
      {form && (
        <MeetingForm
          forum={forum}
          meeting={form.meeting}
          mode={form.mode}
          close={() => setForm(null)}
        />
      )}
    </div>
  );
}

function MeetingDecisions({ meeting }: { meeting: MeetingItem }) {
  const decisions = useMeetingDecisions(meeting.id);
  const governance = useGovernance();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = governance.data?.decisions.find((decision) => decision.id === openId);
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Decisions targeted at this meeting</h3>
      <QueryState query={governance}>
        {() => {
          const items = decisions.data;
          return (
            <div className="divide-y border-y">
              {items.map((decision) => (
                <div key={decision.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="link"
                      className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left"
                      onClick={() => setOpenId(decision.id)}
                    >
                      {decision.reference} · {decision.title}
                    </Button>
                    <DecisionStatusPill status={decision.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {decision.scopeName} · Needed by {formatDate(decision.neededBy)}
                  </p>
                  <DecisionMeetingSignals decision={decision} />
                </div>
              ))}
              {!items.length && (
                <p className="py-4 text-sm text-muted-foreground">No targeted decisions.</p>
              )}
            </div>
          );
        }}
      </QueryState>
      {open && (
        <DecisionPanel
          decision={open}
          all={governance.data?.decisions ?? []}
          close={() => setOpenId(null)}
          onOpen={setOpenId}
        />
      )}
    </section>
  );
}
