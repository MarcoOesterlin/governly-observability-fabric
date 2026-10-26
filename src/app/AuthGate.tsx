import { useEffect, useState, type ReactNode } from "react";
import { client } from "../data/client";
import { SignInScreen } from "./SignInScreen";
import { AppSpinner } from "../components/ui/AppSpinner";

type Session = { user?: { id: string; email?: string; name?: string } } | null;

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = client.auth.onSessionChange((s: unknown) => {
      if (!cancelled) setSession(s as Session);
    });
    void (async () => {
      try {
        const auth = client.auth as unknown as {
          initEmbeddedAuth?: () => Promise<unknown>;
        };
        await auth.initEmbeddedAuth?.();
      } finally {
        if (!cancelled) {
          const current = client.auth.getSession() as Session;
          setSession((prev) => prev ?? current);
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
