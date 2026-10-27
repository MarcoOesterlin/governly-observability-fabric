import { useEffect, useRef, useState, type ReactNode } from "react";
import { client } from "../data/client";
import { invalidateQueryCache } from "../data/queryCache";
import { preloadAllSharedTables } from "../data/sharedTables";
import { SignInScreen } from "./SignInScreen";
import { AppSpinner } from "../components/ui/AppSpinner";

type Session = { user?: { id: string; email?: string; name?: string } } | null;

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = client.auth.onSessionChange((s: unknown) => {
      if (cancelled) return;
      const nextSession = (s as Session) ?? null;
      const nextUserId = nextSession?.user?.id ?? null;
      if (nextUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextUserId;
        invalidateQueryCache();
        setSession(nextSession);
        if (nextUserId) {
          void preloadAllSharedTables(0);
        }
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
          const initialSession = (client.auth.getSession() as Session) ?? null;
          lastUserIdRef.current = initialSession?.user?.id ?? null;
          setSession(initialSession);
          if (initialSession?.user?.id) {
            void preloadAllSharedTables(0);
          }
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
