import { RayfinClient, resolveRayfinConfig } from '@microsoft/rayfin-client';
import type { AppSchema } from '../../rayfin/data/schema';
import type { AppFunctionsSchema } from '../../rayfin/functions/src/types';

const apiUrl = import.meta.env.VITE_RAYFIN_API_URL || 'http://localhost:5168';
const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY || 'local-dev-key';

export let client = new RayfinClient<AppSchema, AppFunctionsSchema>({
  baseUrl,
  publishableKey,
  authStorage: true,
  runtimeConfig: {
    workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
    itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
    portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
  },
});

export async function initRuntimeClient(): Promise<RayfinClient<AppSchema, AppFunctionsSchema>> {
  try {
    const resolved = await resolveRayfinConfig({
      apiUrl: baseUrl,
      publishableKey,
      workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
      itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
      portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
    });
    client = new RayfinClient<AppSchema, AppFunctionsSchema>({
      ...resolved,
      baseUrl: resolved.baseUrl || baseUrl,
      publishableKey: resolved.publishableKey || publishableKey,
      authStorage: true,
    });
  } catch {
    // Keep build-time fallback when rayfin.config.json is absent (local dev / tests)
  }
  return client;
}

export function getRuntimeWorkspaceId(preferredWorkspaceId?: string | null): string {
  if (preferredWorkspaceId && preferredWorkspaceId !== 'all') {
    return preferredWorkspaceId;
  }
  return (
    client.runtimeConfig?.workspaceId ||
    import.meta.env.VITE_FABRIC_WORKSPACE_ID ||
    'default-workspace'
  );
}

