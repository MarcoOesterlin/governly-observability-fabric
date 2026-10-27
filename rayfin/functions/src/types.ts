/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  manageComputeNotebook: {
    input: { hostWorkspaceId: string; action: string; scheduleEnabled: boolean; intervalMinutes: number };
    output: { ok: boolean; workspaceId?: undefined | string; notebookId?: undefined | string; scheduleEnabled?: undefined | false | true; intervalMinutes?: undefined | number; jobStatus?: undefined | string; workspacesJson?: undefined | string; message: string };
  };
};
