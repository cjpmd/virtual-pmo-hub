import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { Eye, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { joinDemoAsViewer } from "@/services/auth";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";

/** Kept outside the organisation gate so first-time visitors can join without onboarding. */
export function DemoEntry({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const join = useMutation({
    meta: { silent: true },
    mutationFn: joinDemoAsViewer,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["org"] });
      await queryClient.invalidateQueries({ queryKey: qk.memberships(userId) });
    },
  });
  const { mutate } = join;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  if (join.isSuccess) return <Navigate to="/portfolio" replace />;
  if (join.isError)
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-muted-foreground">
          {errorMessage(join.error)}
        </p>
        <Button onClick={() => join.mutate()}>
          <Eye />
          Try again
        </Button>
      </div>
    );
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" />
      Opening the demo…
    </p>
  );
}
