import { useEffect, useState } from "react";
import { client } from "./client";
import { matchEntraUser } from "./identity";

export interface PubEntraUserRow {
  object_id: string;
  upn: string;
  display_name: string;
  job_title?: string | null;
  department?: string | null;
  is_synthetic: boolean;
}

export interface PubUserRoleRow {
  role: string;
  domain_key?: string | null;
}

export interface CurrentStewardState {
  status: "loading" | "matched" | "unmatched";
  entra?: PubEntraUserRow;
  initials: string;
  roles: PubUserRoleRow[];
  canWrite: boolean;
  isSynthetic: boolean;
}

interface ParsedJwtClaims {
  oid?: string;
  sub?: string;
  email?: string;
  upn?: string;
  preferred_username?: string;
  unique_name?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  role?: string;
}

function readJwtClaimsFromStorage(): ParsedJwtClaims {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("authSession");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { accessToken?: string };
    const token = parsed?.accessToken;
    if (!token || typeof token !== "string") return {};
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as ParsedJwtClaims;
  } catch {
    return {};
  }
}

export function formatDisplayNameFromIdentity(
  rawName?: string | null,
  rawEmail?: string | null
): string {
  const trimmedName = (rawName ?? "").trim();
  if (trimmedName && !trimmedName.includes("@") && trimmedName.toLowerCase() !== "unknown") {
    return trimmedName;
  }
  const emailSource = (trimmedName.includes("@") ? trimmedName : rawEmail ?? "").trim();
  if (emailSource) {
    const localPart = emailSource.split("@")[0] ?? "";
    const tokens = localPart
      .split(/[._+-]+/)
      .map((t) => t.replace(/\d+$/g, "").trim())
      .filter(Boolean);
    if (tokens.length > 0) {
      return tokens
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return "Workspace Steward";
}

export function deriveInitialsFromIdentity(
  displayName?: string | null,
  email?: string | null
): string {
  const cleanName = formatDisplayNameFromIdentity(displayName, email);
  if (cleanName && cleanName !== "Workspace Steward") {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length === 1) {
      return parts[0].toUpperCase();
    }
  }
  const local = (email ?? "").split("@")[0] ?? "";
  const emailParts = local.split(/[._+-]+/).filter(Boolean);
  if (emailParts.length >= 2) {
    return `${emailParts[0][0] ?? ""}${emailParts[emailParts.length - 1][0] ?? ""}`.toUpperCase();
  }
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return "WS";
}

function resolveSessionIdentity(): {
  oid?: string;
  email?: string;
  displayName?: string;
  role?: string;
} {
  const claims = readJwtClaimsFromStorage();
  try {
    const session = client.auth.getSession() as {
      user?: { id?: string; email?: string; name?: string; oid?: string; role?: string };
    } | null;
    const email =
      session?.user?.email ||
      claims.email ||
      claims.upn ||
      claims.preferred_username ||
      claims.unique_name;
    const claimFullName =
      claims.name ||
      [claims.given_name, claims.family_name].filter(Boolean).join(" ").trim() ||
      undefined;
    const rawName = session?.user?.name || claimFullName;
    const oid = session?.user?.oid || claims.oid || session?.user?.id || claims.sub;
    const role = session?.user?.role || claims.role;
    if (email || rawName || oid) {
      return {
        oid,
        email,
        displayName: formatDisplayNameFromIdentity(rawName, email),
        role,
      };
    }
  } catch {
    // ignore auth read errors in test/SSR
  }
  return {};
}

function buildInitialSteward(): CurrentStewardState {
  const ident = resolveSessionIdentity();
  if (ident.email || ident.displayName || ident.oid) {
    const displayName = ident.displayName ?? formatDisplayNameFromIdentity(undefined, ident.email);
    const upn = ident.email ?? "steward@fabric.local";
    return {
      status: "matched",
      entra: {
        object_id: ident.oid ?? "00000000-0000-0000-0000-000000000001",
        upn,
        display_name: displayName,
        job_title: "Workspace Admin · Data Steward",
        department: "Data Governance",
        is_synthetic: false,
      },
      initials: deriveInitialsFromIdentity(displayName, upn),
      roles: [{ role: "admin", domain_key: null }],
      canWrite: true,
      isSynthetic: false,
    };
  }
  return {
    status: "loading",
    initials: "WS",
    roles: [{ role: "admin", domain_key: null }],
    canWrite: true,
    isSynthetic: false,
  };
}

export function useCurrentSteward(): CurrentStewardState {
  const [state, setState] = useState<CurrentStewardState>(buildInitialSteward);
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    try {
      const authObj = client.auth as unknown as {
        onSessionChange?: (cb: () => void) => () => void;
      };
      if (typeof authObj?.onSessionChange === "function") {
        return authObj.onSessionChange(() => {
          setAuthTick((t) => t + 1);
        });
      }
    } catch {
      // ignore in unit tests with mocked client.auth
    }
    return undefined;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ident = resolveSessionIdentity();
      try {
        const users = await client.data.PubEntraUser.select([
          "object_id",
          "upn",
          "display_name",
          "job_title",
          "department",
          "is_synthetic",
        ])
          .first(200)
          .execute();
        if (cancelled) return;
        const allUserRows = Array.isArray(users) ? users : [];
        const realUserRows = allUserRows.filter((u) => !u.is_synthetic);
        const candidateRows = realUserRows.length > 0 ? realUserRows : allUserRows;

        let matched =
          ident.oid || ident.email
            ? matchEntraUser(candidateRows, {
                oid: ident.oid,
                email: ident.email,
              })
            : candidateRows[0];

        if (!matched && !ident.oid && !ident.email && candidateRows.length > 0) {
          matched = candidateRows[0];
        }

        if (!matched) {
          // Check AppUser table if available before falling back to session identity
          let appUserDisplayName: string | undefined;
          try {
            const appUserRepo = (client.data as Record<string, any>).AppUser;
            if (appUserRepo && (ident.email || ident.oid)) {
              const appUsers = await appUserRepo
                .select(["id", "email", "display_name", "role"])
                .first(50)
                .execute();
              if (Array.isArray(appUsers)) {
                const foundAppUser = appUsers.find(
                  (au: any) =>
                    (ident.email &&
                      String(au.email ?? "").toLowerCase() === ident.email.toLowerCase()) ||
                    (ident.oid && String(au.id ?? "").toLowerCase() === ident.oid.toLowerCase())
                );
                if (foundAppUser?.display_name) {
                  appUserDisplayName = String(foundAppUser.display_name);
                }
              }
            }
          } catch {
            // ignore optional AppUser lookup error
          }
          if (cancelled) return;
          if (ident.email || ident.displayName || ident.oid) {
            const finalName = formatDisplayNameFromIdentity(
              appUserDisplayName ?? ident.displayName,
              ident.email
            );
            const finalUpn = ident.email ?? "steward@fabric.local";
            setState({
              status: "matched",
              entra: {
                object_id: ident.oid ?? "00000000-0000-0000-0000-000000000001",
                upn: finalUpn,
                display_name: finalName,
                job_title: "Workspace Admin · Data Steward",
                department: "Data Governance",
                is_synthetic: false,
              },
              initials: deriveInitialsFromIdentity(finalName, finalUpn),
              roles: [{ role: "admin", domain_key: null }],
              canWrite: true,
              isSynthetic: false,
            });
          }
          return;
        }

        const roles = await client.data.PubUserRole.select(["role", "domain_key"])
          .where({ object_id: { eq: matched.object_id } })
          .execute();
        if (cancelled) return;
        const cleanDisplayName = formatDisplayNameFromIdentity(
          matched.display_name,
          matched.upn || ident.email
        );
        const enrichedEntra: PubEntraUserRow = {
          ...matched,
          display_name: cleanDisplayName,
          upn: matched.upn || ident.email || "steward@fabric.local",
        };
        setState({
          status: "matched",
          entra: enrichedEntra,
          initials: deriveInitialsFromIdentity(enrichedEntra.display_name, enrichedEntra.upn),
          roles: Array.isArray(roles) ? roles : [],
          canWrite: true,
          isSynthetic: Boolean(matched.is_synthetic),
        });
      } catch {
        if (!cancelled && (ident.email || ident.displayName || ident.oid)) {
          const finalName = ident.displayName ?? formatDisplayNameFromIdentity(undefined, ident.email);
          const finalUpn = ident.email ?? "steward@fabric.local";
          setState({
            status: "matched",
            entra: {
              object_id: ident.oid ?? "00000000-0000-0000-0000-000000000001",
              upn: finalUpn,
              display_name: finalName,
              job_title: "Workspace Admin · Data Steward",
              department: "Data Governance",
              is_synthetic: false,
            },
            initials: deriveInitialsFromIdentity(finalName, finalUpn),
            roles: [{ role: "admin", domain_key: null }],
            canWrite: true,
            isSynthetic: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authTick]);

  return state;
}
