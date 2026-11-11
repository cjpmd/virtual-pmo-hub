// GL-18: everything a signed-in page renders around its route (the auth and organisation gate,
// the app shell and the Issue task sheet), in one module the root route loads on demand. Public
// pages (the homepage, pricing, sign-in …) never download it.
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { IssueTaskSheet } from "@/components/issue-task-sheet";

export function SignedInShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>
        {children}
        <IssueTaskSheet />
      </AppShell>
    </AuthGate>
  );
}
