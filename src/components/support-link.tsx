import { supportEmail } from "@/lib/features";
import { cn } from "@/lib/utils";

/** "Contact support · address" as a mailto link; takes its colour from the footer it sits in. */
export function SupportLink({ className }: { className?: string }) {
  return (
    <a
      href={`mailto:${supportEmail}`}
      className={cn("text-inherit underline-offset-4 hover:underline", className)}
    >
      Contact support · {supportEmail}
    </a>
  );
}
