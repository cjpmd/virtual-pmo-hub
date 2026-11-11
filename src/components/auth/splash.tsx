import { LoaderCircle } from "lucide-react";

export function Splash({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm text-foreground/75">
        <LoaderCircle className="size-5 animate-spin" />
        {label}
      </div>
    </div>
  );
}
