// Board assurance (NHS-1 part 3): a programme's assurance rating on its Status tab. Shown only
// while the 'assurance' module is on. Every workspace member reads the rating and its history;
// workspace PMO and admins record a new rating (the database checks both, and the level).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, Sparkle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { useModule } from "@/lib/modules";
import { todayIso } from "@/lib/today";
import {
  addProgrammeRating,
  DIRECTION_TEXT,
  directionOf,
  loadProgrammeAssurance,
  ratingChoices,
  removeProgrammeRating,
  type Direction,
  type ProgrammeAssurance,
  type ProgrammeRating,
} from "@/services/programme-assurance";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function ProgrammeAssuranceCard({
  programmeId,
  workspaceId,
}: {
  programmeId: string;
  workspaceId: string;
}) {
  const enabled = useModule("assurance");
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const data = useQuery({
    queryKey: qk.programmeAssurance(orgId, programmeId),
    queryFn: () => loadProgrammeAssurance(orgId, programmeId),
    enabled,
  });
  if (!enabled) return null;
  return (
    <section
      aria-labelledby="programme-assurance-heading"
      className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
    >
      <h2 id="programme-assurance-heading" className="font-display text-lg font-semibold">
        Assurance rating
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The level of assurance the board or committee takes on this programme's delivery.
      </p>
      <QueryState query={data}>
        {(value) => (
          <Body value={value} orgId={orgId} programmeId={programmeId} workspaceId={workspaceId} />
        )}
      </QueryState>
    </section>
  );
}

function RatingChip({ rating }: { rating: Pick<ProgrammeRating, "label" | "colour"> }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span
        aria-hidden
        className="inline-block size-3 rounded-full"
        style={{ background: rating.colour ?? "#6b7280" }}
      />
      {rating.label}
    </span>
  );
}

function DirectionMark({ direction }: { direction: Direction }) {
  const Icon =
    direction === "better"
      ? ArrowUp
      : direction === "worse"
        ? ArrowDown
        : direction === "same"
          ? ArrowRight
          : Sparkle;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {DIRECTION_TEXT[direction]}
    </span>
  );
}

function Body({
  value,
  orgId,
  programmeId,
  workspaceId,
}: {
  value: ProgrammeAssurance;
  orgId: string;
  programmeId: string;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const writable = useOrgWritable();
  const canRate = useCan("pmo", workspaceId);
  const [adding, setAdding] = useState(false);
  const [rating, setRating] = useState("");
  const [rationale, setRationale] = useState("");
  const [forumId, setForumId] = useState("");
  const [ratedOn, setRatedOn] = useState(todayIso());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.programmeAssurance(orgId, programmeId) });
  const add = useMutation({
    mutationFn: () =>
      addProgrammeRating(programmeId, { rating, rationale, forumId: forumId || null, ratedOn }),
    onSuccess: () => {
      toast.success("Rating recorded");
      setAdding(false);
      setRating("");
      setRationale("");
      setForumId("");
      setRatedOn(todayIso());
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeProgrammeRating(id),
    onSuccess: () => {
      toast.success("Rating removed");
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const latest = value.ratings[0];
  const forumName = (id: string | null) => value.forums.find((f) => f.id === id)?.name;
  const choices = ratingChoices(value.scheme);

  return (
    <div className="mt-4 space-y-5">
      {latest ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <RatingChip rating={latest} />
            <DirectionMark direction={directionOf(value.ratings, value.scheme)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Rated {formatDate(latest.ratedOn)}
            {forumName(latest.forumId) && ` by ${forumName(latest.forumId)}`}
          </p>
          {latest.rationale && <p className="text-sm">{latest.rationale}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not rated yet.</p>
      )}

      {canRate && !adding && (
        <ReadOnlyTip readOnly={!writable}>
          <Button size="sm" disabled={!writable} onClick={() => setAdding(true)}>
            Record a rating
          </Button>
        </ReadOnlyTip>
      )}
      {canRate && adding && (
        <form
          className="space-y-3 rounded-md border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rating) {
              toast.error("Choose a rating.");
              return;
            }
            add.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Rating</span>
              <select
                className={selectClass}
                value={rating}
                onChange={(event) => setRating(event.target.value)}
              >
                <option value="">Choose…</option>
                {choices.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Rated on</span>
              <Input
                type="date"
                max={todayIso()}
                value={ratedOn}
                onChange={(event) => setRatedOn(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Board or committee (optional)</span>
              <select
                className={selectClass}
                value={forumId}
                onChange={(event) => setForumId(event.target.value)}
              >
                <option value="">None</option>
                {value.forums.map((forum) => (
                  <option key={forum.id} value={forum.id}>
                    {forum.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Rationale</span>
            <Textarea
              rows={3}
              maxLength={4000}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Do not enter patient-identifiable information.
            </span>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={add.isPending || !writable}>
              Save rating
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {value.ratings.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold">Earlier ratings</h3>
          <ul className="mt-2 space-y-2">
            {value.ratings.slice(1).map((item) => (
              <li key={item.id} className="flex flex-wrap items-start gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {formatDate(item.ratedOn)}
                </span>
                <RatingChip rating={item} />
                {item.rationale && (
                  <span className="min-w-40 flex-1 text-muted-foreground">{item.rationale}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canRate && latest && (
        <ReadOnlyTip readOnly={!writable}>
          <Button
            size="sm"
            variant="ghost"
            disabled={!writable || remove.isPending}
            onClick={() => remove.mutate(latest.id)}
          >
            <Trash2 className="size-4" aria-hidden /> Remove the latest rating (a mistake)
          </Button>
        </ReadOnlyTip>
      )}
    </div>
  );
}
