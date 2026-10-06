import { formatDate } from "@/lib/format";
import { useState } from "react";
import { Search, UserPlus, UsersRound, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookingBadge } from "@/components/resource-assignments";
import { toast } from "sonner";
import { QueryState } from "@/components/query-state";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import { useResourceData, useResourceMutations } from "@/hooks/use-resources";
import { today } from "@/lib/today";
import {
  parseDay,
  projectCandidates,
  projectTeam,
  resolveAssignments,
  weekStarts,
  type ResourceData,
} from "@/services/resources";

export function ProjectResources({ projectId }: { projectId: string }) {
  const query = useResourceData();
  return (
    <QueryState query={query}>
      {(data) => <Resources data={data} projectId={projectId} />}
    </QueryState>
  );
}
function Resources({ data, projectId }: { data: ResourceData; projectId: string }) {
  const project = data.projects.find((item) => item.id === projectId),
    members = projectTeam(data, projectId),
    assignments = resolveAssignments(data).filter((item) => item.projectId === projectId),
    generic = assignments.filter((item) => item.resourceType === "Generic"),
    { canEdit } = useProjectPermissions(projectId),
    mutations = useResourceMutations(),
    [open, setOpen] = useState(false),
    [skill, setSkill] = useState(""),
    [booking, setBooking] = useState<"Soft" | "Hard">("Soft"),
    [hours, setHours] = useState(7.5);
  const skills = Array.from(
    new Set(
      [...data.generics, ...data.people].flatMap((item) => item.skills.map((skill) => skill.name)),
    ),
  ).sort();
  const candidates = projectCandidates(data, projectId, skill);
  const booked = new Set(assignments.map((item) => item.resourceId));
  const book = (personId: string, jobTitle: string) => {
    if (!project) return;
    mutations.book.mutate(
      {
        projectId,
        resourceId: personId,
        role: skill || jobTitle,
        start:
          parseDay(project.start) > today() ? project.start : (weekStarts(1)[0] ?? project.start),
        end: project.finish,
        hoursPerWeek: hours,
        bookingType: booking,
      },
      {
        onSuccess: () => toast.success(`${booking} booking added`),
        onError: (error) => toast.error(error.message),
      },
    );
  };
  return (
    <div className="space-y-5">
      {generic.length > 0 && canEdit && (
        <div className="flex flex-col gap-3 rounded-lg border border-health-warn/40 bg-health-warn/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <UsersRound className="size-5 text-health-warn-foreground" />
            <div>
              <p className="text-sm font-semibold">Needs staffing</p>
              <p className="text-xs text-muted-foreground">
                {generic.map((item) => item.resourceName).join(", ")} must be filled before
                delivery.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Search />
            Find people
          </Button>
        </div>
      )}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Project team</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Assigned effort and confirmed or proposed bookings.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setOpen(true)}>
              <UserPlus />
              Book a resource
            </Button>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-table-head">
                <tr className="border-b">
                  <Th>Team member</Th>
                  <Th>Role</Th>
                  <Th>Assignment</Th>
                  <Th>Booking</Th>
                  <Th>Allocated</Th>
                  <Th>Effort completed vs remaining</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const completed = Math.round(
                      (member.completedHours / member.allocatedEffortHours) * 100,
                    ),
                    bookingType =
                      assignments.find((item) => item.resourceId === member.personId)
                        ?.bookingType ?? "Hard";
                  return (
                    <tr
                      key={`${member.personId}-${member.role}`}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-accent text-xs font-semibold">
                              {member.person.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold">{member.person.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.person.jobTitle}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <p>
                          {formatDate(member.start)} – {formatDate(member.finish)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {member.weeklyHours.toFixed(1)} hours/week
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <BookingBadge type={bookingType} />
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {member.allocatedEffortHours}h
                      </td>
                      <td className="px-4 py-4">
                        <div className="mb-2 flex justify-between text-xs">
                          <span>{member.completedHours}h completed</span>
                          <span className="text-muted-foreground">
                            {member.remainingHours}h remaining
                          </span>
                        </div>
                        <Progress value={completed} className="h-2" />
                      </td>
                    </tr>
                  );
                })}
                {generic.map((item) => (
                  <tr key={item.id} className="border-b bg-health-warn/5">
                    <td className="px-4 py-4 font-semibold">{item.resourceName}</td>
                    <td className="px-4 py-4 text-sm">{item.role}</td>
                    <td className="px-4 py-4 text-sm">
                      {formatDate(item.start)} – {formatDate(item.end)}
                    </td>
                    <td className="px-4 py-4">
                      <BookingBadge type={item.bookingType} />
                    </td>
                    <td className="px-4 py-4 font-semibold">{item.effort}h</td>
                    <td className="px-4 py-4 text-xs text-health-warn-foreground">Unfilled</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {open && (
        <aside
          role="dialog"
          aria-label="Book a resource"
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Book a resource</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search by skill and availability for {project ? formatDate(project.start) : ""}–
                {project ? formatDate(project.finish) : ""}.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold">
              Skill
              <select
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border bg-background px-3"
              >
                <option value="">Any skill</option>
                {skills.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Booking type
              <select
                value={booking}
                onChange={(event) => setBooking(event.target.value as "Soft" | "Hard")}
                className="mt-2 h-10 w-full rounded-md border bg-background px-3"
              >
                <option>Soft</option>
                <option>Hard</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Hours per week
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value) || 0)}
                className="mt-2 h-10 w-full rounded-md border bg-background px-3"
              />
            </label>
          </div>
          <div className="mt-6 space-y-3">
            {candidates.map(({ person, freeCapacity }) => (
              <div key={person.id} className="flex items-center gap-3 rounded-lg border p-4">
                <Avatar>
                  <AvatarFallback>{person.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{person.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {person.jobTitle} · {person.team}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {person.skills.map((item) => (
                      <span key={item.name} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {item.name} L{item.level}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={
                      freeCapacity > 0
                        ? "text-sm font-semibold text-health-good"
                        : "text-sm font-semibold text-health-bad"
                    }
                  >
                    {freeCapacity}h free
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    disabled={
                      freeCapacity <= 0 ||
                      hours <= 0 ||
                      booked.has(person.id) ||
                      mutations.book.isPending
                    }
                    onClick={() => book(person.id, person.jobTitle)}
                  >
                    {booked.has(person.id) ? "Booked" : `Book ${booking}`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">{children}</th>;
}
