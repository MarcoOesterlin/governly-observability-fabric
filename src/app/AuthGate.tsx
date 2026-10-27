import { useEffect, useState, type ReactNode } from "react";
import { client } from "../data/client";
import { invalidateQueryCache } from "../data/queryCache";
import { SignInScreen } from "./SignInScreen";
import { AppSpinner } from "../components/ui/AppSpinner";

type Session = { user?: { id: string; email?: string; name?: string } } | null;

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = client.auth.onSessionChange((s: unknown) => {
      if (!cancelled) {
        invalidateQueryCache();
        setSession(s as Session);
      }
    });
    void (async () => {
      try {
        const auth = client.auth as unknown as {
          initEmbeddedAuth?: () => Promise<unknown>;
        };
        await auth.initEmbeddedAuth?.();
      } finally {
        if (!cancelled) {
          invalidateQueryCache();
          setSession((client.auth.getSession() as Session) ?? null);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  if (!ready) return <AppSpinner label="Starting Governly…" />;
  if (!session?.user) return <SignInScreen />;
  return <>{children}</>;
}
