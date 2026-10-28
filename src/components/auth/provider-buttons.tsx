import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { OAUTH_PROVIDERS, signInWithProvider, type OAuthProvider } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { cn } from "@/lib/utils";

/** The official four-square Microsoft logo (Microsoft identity platform branding guidelines). */
function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" width="21" height="21" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

// One entry per provider in OAUTH_PROVIDERS. Microsoft's guidelines: the text is exactly
// "Sign in with Microsoft"; light theme #FFFFFF with a #8C8C8C border and #5E5E5E text, dark
// theme #2F2F2F with white text; the logo on the left; Segoe UI where available.
const PROVIDERS: Record<OAuthProvider, { label: string; logo: ReactNode; className: string }> = {
  azure: {
    label: "Sign in with Microsoft",
    logo: <MicrosoftLogo />,
    className:
      "border-[#8c8c8c] bg-white text-[#5e5e5e] hover:bg-[#f3f3f3] dark:border-[#2f2f2f] dark:bg-[#2f2f2f] dark:text-white dark:hover:bg-[#3b3b3b] [font-family:'Segoe_UI',system-ui,sans-serif]",
  },
};

/** "Sign in with …" buttons for every configured OAuth provider, in OAUTH_PROVIDERS order. */
export function ProviderButtons({ next }: { next?: string | undefined }) {
  const start = useMutation({
    meta: { silent: true },
    mutationFn: (provider: OAuthProvider) => signInWithProvider(provider, next),
  });
  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.map((provider) => {
        const config = PROVIDERS[provider];
        const busy = start.isPending && start.variables === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => start.mutate(provider)}
            disabled={start.isPending}
            className={cn(
              "flex h-[41px] w-full items-center justify-center gap-3 rounded-md border px-3 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70",
              config.className,
            )}
          >
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : config.logo}
            {config.label}
          </button>
        );
      })}
      {start.isError && (
        <p
          role="alert"
          className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
        >
          {errorMessage(start.error)}
        </p>
      )}
    </div>
  );
}

/** The "or" between provider buttons and the email form. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
