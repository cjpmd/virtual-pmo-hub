// Hooks over src/services/lessons.ts: lessons, improvement actions and phase lessons reviews.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  createImprovementAction,
  importLessons,
  loadLessons,
  recordPhaseReview,
  updateImprovementAction,
  updateLesson,
  type ActionInput,
  type LessonInput,
  type LessonsData,
  type ResolvedImportRow,
} from "@/services/lessons";
import { qk } from "@/services/query-keys";

export function useLessons() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.lessons(orgId), queryFn: () => loadLessons(orgId) });
}

export function useLessonMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.lessons(orgId) });
  return {
    updateLesson: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: LessonInput;
        lastSeen?: string | null;
      }) => updateLesson(id, input, lastSeen),
      onSettled,
    }),
    recordReview: useMutation({ mutationFn: recordPhaseReview, onSettled }),
    updateAction: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: ActionInput;
        lastSeen?: string | null;
      }) => updateImprovementAction(id, input, lastSeen),
      onSettled,
    }),
    createAction: useMutation({ mutationFn: createImprovementAction, onSettled }),
    importLessons: useMutation({
      mutationFn: ({ data, rows }: { data: LessonsData; rows: ResolvedImportRow[] }) =>
        importLessons(data, rows),
      onSettled,
    }),
  };
}
