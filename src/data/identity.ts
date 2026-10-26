export type EntraLike = {
  object_id: string;
  user_principal_name?: string;
  upn?: string;
  display_name: string;
  is_synthetic: boolean;
};

export type Claims = { oid?: string; email?: string };

export function matchEntraUser<T extends EntraLike>(users: T[], claims: Claims): T | undefined {
  if (claims.oid) return users.find((u) => u.object_id === claims.oid);
  const email = claims.email?.trim().toLowerCase();
  if (!email) return undefined;
  return users.find((u) => (u.user_principal_name ?? u.upn ?? "").trim().toLowerCase() === email);
}
