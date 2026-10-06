import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type SessionState =
  | { status: "loading"; session: null; user: null }
  | { status: "signed_out"; session: null; user: null }
  | { status: "signed_in"; session: Session; user: User };

const SessionContext = createContext<SessionState>({
  status: "loading",
  session: null,
  user: null,
});

const fromSession = (session: Session | null): SessionState =>
  session
    ? { status: "signed_in", session, user: session.user }
    : { status: "signed_out", session: null, user: null };

/** Holds the Supabase session. Server renders always start in "loading"; the browser resolves it. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({
    status: "loading",
    session: null,
    user: null,
  });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState(fromSession(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((current) => {
        // A different user (or none) must never see the previous user's cached data.
        if (current.user?.id !== session?.user.id) queryClient.clear();
        return fromSession(session);
      });
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** The signed-in user. Only call below AuthGate, where a session is guaranteed. */
export function useUser(): User {
  const state = useSession();
  if (state.status !== "signed_in") throw new Error("useUser called outside a signed-in area");
  return state.user;
}
