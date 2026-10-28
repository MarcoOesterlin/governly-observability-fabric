# Governly: Data Observability for Microsoft Fabric

Governly is a native, 100% tenant-resident **Microsoft Fabric Data Observability** application built with the **Rayfin SDK** (`@microsoft/rayfin-client`, `@microsoft/rayfin-core`, `@microsoft/rayfin-functions`, `@microsoft/rayfin-cli`), **React 19**, **TypeScript**, **Data API Builder (DAB) GraphQL**, and **PySpark**.

It provides zero-plumbing discovery, live telemetry, and interactive governance across **Lakehouse Delta tables, Data Warehouses, Semantic Models, Data Pipelines, and Spark Notebooks**, running entirely inside your Microsoft Fabric workspace.

---

## Quick Start: One-Click Install & Initial Setup

### 1. Install or Update in Microsoft Fabric (1 Minute)
1. Download [`fabric/bootstrap/nb_governly_installer.ipynb`](fabric/bootstrap/nb_governly_installer.ipynb).
2. Import the notebook into your target Microsoft Fabric workspace (attached to an `F2+` capacity) and click **Run all**.
3. The installer automatically provisions the Fabric SQL Database (`governly`), User Data Functions, Static WebApp, and the PySpark scanner notebook (`nb_governly_compute_publish`) with the recurring schedule **paused by default** so you can choose which workspaces to scan first.

### 2. Configure Workspaces & Schedule in Settings
1. Open the deployed **Governly** web app in your workspace and go to **Settings** (bottom-left navigation).
2. **Select Monitored Workspaces:** Check the Fabric workspaces you want Governly to profile and click **Save Workspace Selection**.
3. **Run First Scan & Enable Schedule:** Click **Run Compute Notebook Now** to trigger your initial scan, then select your cadence (default **Every 36m**) and click **Enable Recurring Schedule**.
4. *(Optional)* Configure **Freshness SLAs**, **Expected Landing Times (`HH:MM` or Auto Average)**, or **Azure Key Vault Service Principal** parameters on the same page.

> 📖 **Want the full details?** Jump to [Full Installation & Update Guide ↓](#one-click-fabric-workspace-installation--updates), [Detailed Settings & Schedule Configuration ↓](#configuring-the-compute-notebook-workspaces--schedule-in-settings), or [Required Permissions ↓](#required-permissions--where-to-configure-them).

---

## Table of Contents

1. [Key Capabilities](#key-capabilities)
2. [System Architecture & End-to-End Data Flow](#system-architecture--end-to-end-data-flow)
3. [Complete Codebase & Component Reference](#complete-codebase--component-reference)
   - [Application Shell, Auth & Routing (`src/app/`)](#1-application-shell-auth--routing-srcapp)
   - [Application Pages (`src/pages/*.tsx`)](#2-application-pages-srcpagestsx)
   - [Domain Components & Asset Tabs (`src/components/`)](#3-domain-components--asset-tabs-srccomponents)
   - [Data Hooks, State Merging & Caching Engine (`src/data/` & `src/lib/`)](#4-data-hooks-state-merging--caching-engine-srcdata--srclib)
   - [Rayfin Database Schema: All 25 SQL Entities (`rayfin/data/`)](#5-rayfin-database-schema-all-25-sql-entities-rayfindata)
   - [Rayfin User Data Functions Control Plane (`rayfin/functions/`)](#6-rayfin-user-data-functions-control-plane-rayfinfunctions)
   - [Fabric PySpark Notebooks (`fabric/`)](#7-fabric-pyspark-notebooks-fabric)
4. [Deep-Dive Feature Mechanics](#deep-dive-feature-mechanics)
   - [Data Assets vs. Runtime Jobs Separation](#1-data-assets-vs-runtime-jobs-separation)
   - [Expected Landing Time (Auto 24h Circular Mean vs. Steward Override)](#2-expected-landing-time-auto-24h-circular-mean-vs-steward-override)
   - [Row Count Drift (Start vs. After Processing) & Operational Metadata](#3-row-count-drift-start-vs-after-processing--operational-metadata)
   - [Daily Key-Column Null Rates & 7 Data Quality Dimensions](#4-daily-key-column-null-rates--7-data-quality-dimensions)
   - [Failure Blast Radius (Upstream & Downstream Impact)](#5-failure-blast-radius-upstream--downstream-impact)
   - [Two-Tier Query Cache & Atomic Render Coalescing](#6-two-tier-query-cache--atomic-render-coalescing)
5. [Security, Credentials & Data Residency](#security-credentials--data-residency)
6. [Required Permissions & Where to Configure Them](#required-permissions--where-to-configure-them)
7. [One-Click Fabric Workspace Installation & Updates](#one-click-fabric-workspace-installation--updates)
8. [Configuring the Compute Notebook, Workspaces & Schedule in Settings](#configuring-the-compute-notebook-workspaces--schedule-in-settings)
9. [CLI Deployment, Testing & Local Development](#cli-deployment-testing--local-development)

---

## Key Capabilities

- **Zero-Plumbing Workspace & Asset Discovery:** Automatically discovers accessible Microsoft Fabric workspaces, Lakehouses, Delta tables, Semantic Models, Data Pipelines, and Spark Notebooks without requiring manual YAML catalogs.
- **Clear Separation of Data Assets vs. Runtime Jobs:**
  - **Overview, Monitored Assets, Data Quality, and Schema Drift** focus strictly on **Data Assets & Data Products** (Lakehouse Delta tables, Warehouses, SQL endpoints, and Semantic Models) where row-level quality rules and column schemas apply.
  - **Pipelines & Freshness** combines both Data Assets and **Runtime Jobs** (Data Pipelines, Spark Notebooks, Scheduled Refreshes), showing execution timelines, failure root causes, remediation recipes, and blast radius.
- **Freshness SLAs & Expected Landing Time:**
  - **Max-Age Freshness SLAs:** Configurable global, domain-level, or per-asset lag thresholds (`1h` to `168h`).
  - **Expected Landing Time (`HH:MM`):** Automatically computes an asset's expected daily arrival time using a **24-hour circular mean** once at least 2 runs are recorded (`Auto avg`), while allowing Data Stewards/Engineers to set an explicit `HH:MM` override and grace buffer in **Settings** or on the asset's **Freshness** tab.
- **Row Count Drift (Before vs. After Processing) & Operational Metadata:**
  - Extracts Delta transaction log (`DESCRIBE HISTORY`) operational metrics (`MERGE`, `WRITE`, `DELETE`, `OPTIMIZE`) and compares row count at the start of processing against row count after processing, net row delta (`+ins / upd / del`), percentage drift, and throughput (`rows/sec`).
- **Daily Key-Column Null Rates & 7 Data Quality Dimensions:**
  - Automatically profiles null rates across primary/foreign key, business key, and timestamp columns in a single Spark SQL pass.
  - Built-in **Rule Studio** organized around the **7 Data Quality Dimensions**: **Completeness**, **Uniqueness**, **Validity**, **Accuracy**, **Consistency**, **Timeliness**, and **Volume / Drift**, with instant SQL cleanup across `dbo.QualityRules`, `dbo.PubQualityResults`, and `dbo.PubQualityFailedRows`.
- **Failure Blast Radius & Root-Cause Diagnostics:**
  - Whenever a pipeline, Spark notebook, or table refresh fails, Governly resolves the **Upstream Sources** (what fed the failed job) and **Downstream Impact** (which tables, semantic models, and reports are now stale or broken), along with Spark/Pipeline error extraction and step-by-step fix guidance.
- **Schema Drift Detection:** Compares current OneLake Delta table schemas against historical snapshots (`dbo.PubAssetColumns`) and flags breaking column drops, type changes, or additive columns.
- **Incident & Steward Case Workflows:** Triages freshness, quality, and schema drift incidents with ownership, status transitions, 1-hour snoozing, audit trails, comments, and multi-incident Kanban remediation cases.

---

## System Architecture & End-to-End Data Flow

Governly is architected around a **Hybrid Publish + Interactive Overlay Pattern** inside Microsoft Fabric:

1. **Heavy Telemetry & Profiling (`dbo.Pub*` tables)** is computed asynchronously by the PySpark scanner notebook (`nb_governly_compute_publish`) and written into the Fabric SQL Database.
2. **Interactive User State & Configuration (`dbo.IncidentStates`, `dbo.QualityRules`, `dbo.StewardCases`, etc.)** is read and mutated in real time from the React frontend via Rayfin's Data API Builder (DAB) GraphQL layer and merged with published telemetry on the client.
3. **Fabric Control Plane Operations** (triggering notebooks, managing Fabric Job Scheduler Cron schedules, listing live workspace jobs, and executing multi-table SQL rule cleanup) run through a privileged Rayfin User Data Function (`manageComputeNotebook`).

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              MICROSOFT FABRIC WORKSPACE                                  │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. REACT 19 + TYPESCRIPT FRONTEND (Rayfin Static WebApp)                           │  │
│  │                                                                                    │  │
│  │  • Pages: Overview, Assets, AssetDetail, Freshness, Quality, SchemaDrift,          │  │
│  │           Incidents, IncidentDetail, Cases, CaseDetail, Settings                   │  │
│  │  • Two-Tier Query Cache (src/data/queryCache.ts): Memory + sessionStorage +        │  │
│  │           Atomic In-Flight Notification Coalescing                                 │  │
│  │  • Client Merge Engine: Overlays live SLAs, Expected Landing Times, DQ rules,      │  │
│  │           and Incident triage states onto published Spark telemetry                │  │
│  └───────────────┬────────────────────────────────────────────────────┬───────────────┘  │
│                  │ GraphQL (DAB)                                      │ UDF Invoke       │
│                  ▼                                                    ▼                  │
│  ┌───────────────────────────────────────────┐    ┌───────────────────────────────────┐  │
│  │ 2. FABRIC SQL DATABASE (governly)         │    │ 3. RAYFIN USER DATA FUNCTIONS     │  │
│  │    + DATA API BUILDER (DAB)               │    │    (rayfin/functions/)            │  │
│  │                                           │    │                                   │  │
│  │  • 17 Published Tables (dbo.Pub*)         │◄───┤  • manageComputeNotebook          │  │
│  │    Assets, LagPoints, RefreshRuns,        │    │    - status / run                 │  │
│  │    QualityResults, FailedRows, Columns,   │    │    - enable_schedule / disable    │  │
│  │    SchemaChanges, LineageEdges, Incidents │    │    - list_workspaces / list_jobs  │  │
│  │  • 8 Interactive Tables                   │    │    - save_config                  │  │
│  │    QualityRules, IncidentStates, Events,  │    │    - delete_quality_rule          │  │
│  │    Comments, StewardCases, CaseLinks,     │    └─────────────────┬─────────────────┘  │
│  │    AppUsers, UserPreferences              │                      │ Fabric REST API    │
│  └─────────────────────▲─────────────────────┘                      ▼                    │
│                        │ JDBC / Access Token      ┌───────────────────────────────────┐  │
│                        │ Batch Publish            │ 4. PYSPARK TELEMETRY ENGINE       │  │
│                        └──────────────────────────┤    (nb_governly_compute_publish)  │  │
│                                                   │                                   │  │
│                                                   │  • Reads monitored workspaces &   │  │
│                                                   │    custom DQ rules from SQL DB    │  │
│                                                   │  • Scans OneLake Delta tables &   │  │
│                                                   │    DESCRIBE HISTORY (_delta_log)  │  │
│                                                   │  • Computes Row Count Drift &     │  │
│                                                   │    Key-Column Null Rates          │  │
│                                                   │  • Executes 7-Dimension DQ rules  │  │
│                                                   │  • Polls Fabric Job Scheduler API │  │
│                                                   └───────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Codebase & Component Reference

### 1. Application Shell, Auth & Routing (`src/app/`)

| File | Role & Responsibilities |
| :--- | :--- |
| `src/main.tsx` | Application entry point; mounts React 19 root with `Providers` and global typography/CSS (`src/index.css`). |
| `src/app/providers.tsx` | Wraps the application in `ThemeProvider`, `AuthGate`, `WorkspaceProvider`, `RouterProvider`, and `Toaster`. |
| `src/app/AuthGate.tsx` | Manages Microsoft Entra ID / Fabric SSO authentication via `client.auth.ensureSignedInWithFabric()`. Automatically provisions the signed-in user in `dbo.AppUsers` on first login and fires `prefetchCoreQueries()` so primary dashboard tables load in parallel immediately after authentication. |
| `src/app/SignInScreen.tsx` | Branded Microsoft Entra ID sign-in screen displayed when running outside the embedded Fabric iframe or before SSO token acquisition completes. |
| `src/app/WorkspaceProvider.tsx` | Global React context managing the active **Workspace filter** (`all` or specific workspace), **Domain filter**, **Search query** (`Cmd+K`), and **Scan Gating** (`hasCompletedScan`, which keeps sidebar workspace/domain filters locked until the first workspace scan has been triggered). |
| `src/app/router.tsx` | Hash-based SPA router (`useLocation`, `useNavigate`, `useParams`, `<Link>`) supporting embedded Fabric iframe navigation without page reloads. |
| `src/app/theme.tsx` | Light/Dark theme state provider persisted to `localStorage` and synchronized with CSS custom properties. |

---

### 2. Application Pages (`src/pages/*.tsx`)

| Page File | Route | What It Renders & How It Works |
| :--- | :--- | :--- |
| `src/pages/Overview.tsx` | `#/` | **Executive & Steward Overview Dashboard:** Displays the top health signal bar (`DataAsOf`), 4 headline KPI cards (**Healthy assets**, **Open incidents**, **Freshness SLA**, **Quality checks** with `N/A` support when 0 checks are configured), a 7-day stacked **Asset Health History** bar chart + distribution breakdown (`HealthCard`), **Open Incidents** triage list (`IncidentsCard`), **Recent Schema Drift** (`SchemaChangesCard`), and **Monitored Data Assets** table (`AssetsCard`). |
| `src/pages/Assets.tsx` | `#/assets` | **Monitored Data Assets Catalog:** Lists all monitored **Data Assets & Data Products** (Lakehouse tables, Warehouses, Semantic Models; excludes runtime-only pipelines/notebooks). Supports filtering by health status (`All`, `Healthy`, `Warning`, `Critical`), asset type (`Tables`, `Models`), and column sorting. |
| `src/pages/AssetDetail.tsx` | `#/assets/:id` | **Single Asset 360° Observability View:** Header with asset badge, workspace/domain metadata, steward owner, SLA status, and 6 specialized tabs: **Overview**, **Freshness**, **Quality**, **Schema**, **Incidents**, and **Lineage & Impact**. |
| `src/pages/Freshness.tsx` | `#/freshness` | **Pipelines, Notebooks & Freshness Monitor:** Unified runtime & freshness command center covering both **Data Assets** and **Runtime Jobs** (Spark Notebooks & Data Pipelines, including the host workspace's own notebooks). Features:<ul><li>KPI summary cards (SLA compliance, late assets, failed jobs, **Expected Landing Time** status).</li><li>**Failed Runtime Jobs & Blast Radius Diagnostics:** Expandable cards showing exact Spark/Pipeline failure reason, **Upstream Sources** & **Downstream Impacted Objects**, and remediation steps.</li><li>**Row Count Drift (Start vs. After Processing) & Operational Metadata** table across recent runs.</li><li>Interactive **Freshness SLA** and **Expected Landing Time (`HH:MM`)** inline editors.</li></ul> |
| `src/pages/Quality.tsx` | `#/quality` | **Data Quality Command Center & Rule Studio:** Aggregates quality pass rates across all monitored tables, groups rules by the **7 Data Quality Dimensions** (`Completeness`, `Uniqueness`, `Validity`, `Accuracy`, `Consistency`, `Timeliness`, `Volume / Drift`), displays failed-row samples, and embeds the **Quality Rule Studio** modal for creating or deleting rules with instant optimistic UI updates + background SQL cleanup. |
| `src/pages/SchemaDrift.tsx` | `#/schema` | **Schema Drift Explorer:** Lists all detected DDL changes (`added`, `removed`, `type_changed`) across OneLake Delta tables, classifying changes into **Breaking** vs. **Additive/Non-breaking** with copyable remediation SQL (`ALTER TABLE ...`). |
| `src/pages/Incidents.tsx` | `#/incidents` | **Incident Triage Queue:** Filterable queue of active, acknowledged, snoozed, and resolved observability incidents across `Freshness`, `Quality`, `Schema`, and `Volume`, with bulk/inline **Acknowledge**, **Snooze 1h**, **Assign to Me**, and **Resolve** actions. |
| `src/pages/IncidentDetail.tsx` | `#/incidents/:id` | **Incident Investigation & Root Cause View:** Full incident timeline (`Timeline`), **Upstream & Downstream Failure Blast Radius**, linked Steward Cases, root-cause diagnostics, copyable remediation SQL, and collaborative `CommentThread`. |
| `src/pages/Cases.tsx` | `#/cases` | **Steward Cases Kanban Board:** 3-column board (`Open`, `In Progress`, `Resolved`) for grouping related incidents into multi-step engineering remediation cases with priority (`High`, `Medium`, `Low`) and assignee tracking. |
| `src/pages/CaseDetail.tsx` | `#/cases/:id` | **Case Detail & Linked Incidents View:** Manage case status, priority, description, and link/unlink observability incidents (`dbo.CaseIncidentLinks`). |
| `src/pages/Settings.tsx` | `#/settings` | **Platform Configuration & Control Plane:**<ul><li>**Monitored Workspaces Selector:** Check/uncheck Fabric workspaces to include in scans, with unsaved-change diff detection (`Add Workspaces to Recurring Scan`).</li><li>**Spark Scanner Control & Recurring Schedule:** Trigger `nb_governly_compute_publish` on demand (`Run Compute Notebook Now`) and toggle the Fabric Job Scheduler Cron schedule (`Every 15m` to `Every 24h`, default `Every 36m`).</li><li>**Freshness SLA Policy:** Set global default max-age SLA (`1h`–`168h`), domain overrides, and per-asset SLA overrides.</li><li>**Expected Landing Time Policy (Auto Average vs. Steward Override):** Configure global default landing time (`HH:MM`), grace window (`15m`–`120m`), and per-asset/pipeline `HH:MM` overrides or 1-click reset to **Auto Average**.</li><li>**Notebook Runtime Parameters:** Configure optional Entra ID Service Principal + Azure Key Vault parameters (`TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI`, `SECRET_NAME`).</li></ul> |

---

### 3. Domain Components & Asset Tabs (`src/components/`)

#### Layout & Navigation Components (`src/components/governly/`)
| Component File | Purpose |
| :--- | :--- |
| `FabricChrome.tsx` | Top Microsoft Fabric workload bar displaying workspace context, global `Cmd+K` search input, theme toggle, and signed-in steward identity pill. |
| `Shell.tsx` | Main two-column layout combining `FabricChrome`, `Sidebar`, and scrollable page viewport. |
| `Sidebar.tsx` | Left navigation rail with live badge counts (open incidents, open cases, monitored assets), **Workspace** and **Domain** filter dropdowns (gated until initial workspace scan completes), and bottom **Settings** link. |
| `DataAsOf.tsx` | Top telemetry status banner displaying overall health signal bar, last notebook sync timestamp (`Synced Xm ago`), schedule cadence (`Every 36m · On`), and one-click refresh. |
| `WorkspaceSwitcher.tsx` | Dropdown selector for filtering telemetry by Fabric workspace or domain. |

#### Dashboard & Workflow Cards (`src/components/governly/`)
| Component File | Purpose |
| :--- | :--- |
| `KpiCard.tsx` | Headline metric card with status pill (`Healthy`, `Warning`, `Critical`, `N/A`), sub-label, and trend indicator. |
| `HealthCard.tsx` | Renders the 7-day stacked health bar chart (`PubHealthBucket`) and current status breakdown (`PubHealthDistribution`). |
| `IncidentsCard.tsx` | Compact incident triage panel on Overview with inline `Ack`, `Snooze 1h`, and `Resolve` buttons. |
| `SchemaChangesCard.tsx` | Recent schema drift summary card on Overview highlighting breaking vs. non-breaking column changes. |
| `AssetsCard.tsx` | Searchable, filterable data assets table on Overview with health dot, freshness lag vs. SLA bar, quality score (`N/A` when 0 rules), and volume sparkline. |
| `QualityRuleStudio.tsx` | Interactive modal & rule builder organized around the **7 Data Quality Dimensions**. Validates custom Spark SQL predicates (`ruleValidator.ts`) and saves rules to `dbo.QualityRules`. |
| `CommentThread.tsx` | Threaded steward discussion & activity feed on incidents (`dbo.IncidentComments`). |
| `ResolveDialog.tsx` | Modal dialog requiring a resolution note when closing an incident or case. |
| `Timeline.tsx` | Chronological audit log of system detections, acknowledgments, snoozes, assignments, and resolutions (`dbo.IncidentEvents`). |
| `Box.tsx`, `EmptyView.tsx`, `primitives.tsx` | Design system primitives: status dots, severity pills, sparklines, progress bars, badges, and empty-state placeholders. |
| `src/components/ui/*.tsx` | Low-level UI elements: `AppSpinner.tsx`, `ErrorState.tsx`, `Skeleton.tsx`, and `Toaster.tsx`. |

#### Asset Detail Tabs (`src/components/governly/asset-tabs/`)
| Tab File | What It Renders Inside `AssetDetail.tsx` |
| :--- | :--- |
| `OverviewTab.tsx` | Summary of the asset's health, freshness lag vs. SLA, quality pass rate, row count sparkline, active incidents, and steward metadata. |
| `FreshnessTab.tsx` | **48-Hour Commit Lag Chart** against SLA threshold, **Expected Landing Time (`HH:MM`)** status card with inline time picker (`Auto avg` vs. `Steward override`), **Row Count Drift (Start vs. After Processing) & Operational Metadata** panel (`rowsBefore`, `rowsAfter`, net delta, `% drift`, Delta DML summary `+ins / upd / del`, throughput), **Failure Blast Radius** (upstream/downstream dependencies on failed runs), and recent refresh history (`PubRefreshRun`). |
| `QualityTab.tsx` | **Daily Check · Row Count Drift & Key-Column Null Rates** card at the top, followed by **7 Data Quality Dimension** filter pills, rule execution table, instant rule deletion (with immediate SQL cleanup), and failed-row sample viewer (`PubQualityFailedRow`). |
| `SchemaTab.tsx` | Complete column catalog (`PubAssetColumn`: ordinal, name, Spark/SQL type, nullability, semantic tag, description) and chronological DDL change history (`PubSchemaChange`). |
| `IncidentsTab.tsx` | Filtered list of open and historical incidents affecting this specific asset. |
| `LineageTab.tsx` | Upstream source tables/pipelines and downstream dependent tables, semantic models, and Power BI reports (`PubLineageEdge`). |

---

### 4. Data Hooks, State Merging & Caching Engine (`src/data/` & `src/lib/`)

| File | Responsibilities |
| :--- | :--- |
| `src/data/client.ts` | Instantiates the singleton `RayfinClient<AppSchema, never, AppFunctionsSchema>` wired to the Fabric AppBackend DAB GraphQL endpoint and User Data Functions runtime. |
| `src/data/queryCache.ts` | **Two-Tier SWR Query Cache (`useCachedQuery`):** Combines an in-memory `Map` with `sessionStorage` (`governly:qcache:v3:*`) and in-flight Promise deduplication. Includes **Atomic Notification Coalescing** (`scheduleNotify` / `flushNotifications`), which waits up to 650ms while concurrent page-mount queries (`assets`, `incidents`, `cases`, `health-buckets`) are in flight and flushes all React state updates in a single synchronous render batch so KPI numbers never jump or flicker on load. |
| `src/data/queryKeys.ts` | Central registry of cache keys (`assets`, `incidents`, `cases`, `freshness-slas`, `landing-time-slas`, `quality-rules`, `compute-config`, etc.) and targeted cache invalidators. |
| `src/data/useAssets.ts` | Fetches `dbo.PubAssets` and `dbo.PubRefreshRuns`, separates **Data Assets** (`isDataAssetType`: tables, lakehouses, warehouses, semantic models) from **Runtime Jobs** (`isRuntimeJobType`: notebooks, pipelines), overlays custom Freshness SLAs (`applyEffectiveSla`), and attaches live Fabric Job Scheduler runs. Importantly, `applyEffectiveSla` prevents the global wildcard SLA (`slaMap["*"]`) from flipping static historical reference tables (`late = false`) to `critical` unless an explicit per-asset or per-domain SLA override was configured. |
| `src/data/useAsset.ts` | Fetches comprehensive single-asset telemetry (`PubAsset`, `PubAssetLagPoint`, `PubRefreshRun`, `PubQualityResult`, `PubQualityFailedRow`, `PubAssetColumn`, `PubSchemaChange`, `PubLineageEdge`) and merges live runtime job history + upstream/downstream blast radius for notebooks and pipelines. |
| `src/data/useFreshnessSla.ts` | Implements:<ul><li>**Freshness SLA Hook (`useFreshnessSlas`):** Reads/writes max-age SLAs (`rule_type = 'freshness_sla'`) in `dbo.QualityRules` + `localStorage`.</li><li>**Expected Landing Time Engine (`calculateAverageLandingTime`, `evaluateExpectedLanding`, `useExpectedLandingTimes`):** Computes the 24-hour circular mean (`atan2(mean(sin θ), mean(cos θ))`) across run timestamps once `runCount >= 2`, or applies steward-defined `HH:MM` overrides (`rule_type = 'landing_time_sla'`).</li><li>**Operational Row Count Drift Resolver (`resolveRowCountDriftAndOps`):** Parses published Delta `DESCRIBE HISTORY` operational metadata or consecutive run row counts to compute `rowsBefore`, `rowsAfter`, `netDelta`, `driftPct`, `dmlSummary`, `throughput`, and `driftStatus`.</li></ul> |
| `src/data/useQualityRules.ts` | Manages the **7 Data Quality Dimensions** (`DQ_DIMENSIONS`), merges user-authored rules in `dbo.QualityRules` with published execution results in `dbo.PubQualityResults`, and executes **instant optimistic rule deletion** coupled with `manageComputeNotebook({ action: 'delete_quality_rule' })` + GraphQL cleanup across `dbo.QualityRules`, `dbo.PubQualityResults`, and `dbo.PubQualityFailedRows`. |
| `src/data/useIncidents.ts` & `src/data/incidentMerge.ts` | Merges immutable published incidents (`dbo.PubIncidents`, `dbo.PubIncidentImpacts`) with mutable steward triage rows (`dbo.IncidentStates`, `dbo.IncidentEvents`, `dbo.IncidentComments`), automatically suppressing incidents whose underlying asset is healthy under its effective SLA. |
| `src/data/useIncidentActions.ts` | Mutation hooks for `acknowledge`, `snooze1h`, `assignToMe`, `resolve`, `reopen`, and `addComment`, writing to `dbo.IncidentStates`, `dbo.IncidentEvents`, and `dbo.IncidentComments`. |
| `src/data/useCaseActions.ts` | CRUD hooks for creating Steward Cases (`dbo.StewardCases`), updating status/priority, and linking/unlinking incidents (`dbo.CaseIncidentLinks`). |
| `src/data/useComputeConfig.ts` | Client hook for `manageComputeNotebook` UDF: loads workspace inventory, live runtime jobs, notebook execution status, and schedule state; includes **automatic schedule self-healing** (if `scheduleEnabled` is true locally but Fabric reports no active schedule on `/jobs/RunNotebook/schedules`, it automatically re-registers the Cron schedule in the background). |
| `src/data/useOverview.ts` | Computes headline Overview KPIs, health buckets, and distribution counts scoped to the active workspace/domain filter. |
| `src/data/useCurrentSteward.ts` & `src/data/identity.ts` | Resolves the current signed-in Microsoft Entra user (`claims.sub` / `claims.email`), workspace access permissions, and steward avatar initials. |
| `src/data/mappers.ts` | Pure transformation functions mapping raw SQL/GraphQL entity rows (`Pub*`) into strongly-typed UI view models (`src/fixtures/types.ts`). |
| `src/lib/format.ts`, `src/lib/ruleValidator.ts`, `src/lib/css.ts` | Relative timestamp formatters, Spark SQL predicate syntax/safety validator for the Rule Studio, and CSS class utilities. |

---

### 5. Rayfin Database Schema: All 25 SQL Entities (`rayfin/data/`)

All 25 tables are defined using TC39 stage-3 decorators in `rayfin/data/` and deployed automatically to the workspace's native Fabric SQL Database (`governly`) via Data API Builder (DAB).

#### A. Interactive Governance & Configuration Entities (8 Tables - Read/Write `@authenticated('*')`)

| Entity Class | SQL Table | File | Purpose |
| :--- | :--- | :--- | :--- |
| `QualityRule` | `dbo.QualityRules` | `rayfin/data/quality-rule.ts` | Stores user-authored **7-Dimension Data Quality Rules** (`completeness`, `uniqueness`, `validity`, `accuracy`, `consistency`, `timeliness`, `volume`) **plus** platform configuration rows keyed by `rule_type`:<ul><li>`compute_config`: Monitored workspace IDs JSON</li><li>`compute_schedule`: Schedule enabled state & cadence minutes</li><li>`notebook_params`: Optional Key Vault & SPN parameters</li><li>`freshness_sla`: Max-age SLA thresholds (minutes)</li><li>`landing_time_sla`: Expected Landing Time (`HH:MM\|graceMins\|mode`)</li></ul> |
| `IncidentState` | `dbo.IncidentStates` | `rayfin/data/incident-state.ts` | Mutable triage overlay per incident (`open`, `acknowledged`, `snoozed`, `resolved`, assignee, resolution note, snoozed-until timestamp). |
| `IncidentEvent` | `dbo.IncidentEvents` | `rayfin/data/incident-event.ts` | Immutable audit trail of every steward action taken on an incident. |
| `IncidentComment` | `dbo.IncidentComments` | `rayfin/data/incident-comment.ts` | Threaded discussion comments attached to an incident. |
| `StewardCase` | `dbo.StewardCases` | `rayfin/data/steward-case.ts` | Kanban remediation cases (`open`, `in_progress`, `resolved`, priority, owner, summary). |
| `CaseIncidentLink` | `dbo.CaseIncidentLinks` | `rayfin/data/case-incident-link.ts` | Many-to-many join linking `StewardCase` items to `PubIncident` keys. |
| `AppUser` | `dbo.AppUsers` | `rayfin/data/app-user.ts` | Registered application stewards populated via Entra ID SSO (`sub`, `email`, `display_name`, `role`). |
| `UserPreference` | `dbo.UserPreferences` | `rayfin/data/user-preference.ts` | Per-user UI preferences (default workspace, theme, notification settings). |

#### B. Published Telemetry Entities (17 Tables - Populated by `nb_governly_compute_publish`)

| Entity Class | SQL Table | File | Purpose |
| :--- | :--- | :--- | :--- |
| `PubWorkspace` | `dbo.PubWorkspaces` | `rayfin/data/published/identity.ts` | Discovered Fabric workspaces (`workspace_id`, `name`, `capacity_sku`, `domain`). |
| `PubDomain` | `dbo.PubDomains` | `rayfin/data/published/identity.ts` | Logical business domains mapped to workspaces and assets. |
| `PubEntraUser` | `dbo.PubEntraUsers` | `rayfin/data/published/identity.ts` | Workspace role assignment principals discovered from Fabric REST API. |
| `PubUserRole` | `dbo.PubUserRoles` | `rayfin/data/published/identity.ts` | Role mappings (`Admin`, `Member`, `Contributor`, `Viewer`) per user. |
| `PubUserWorkspaceAccess` | `dbo.PubUserWorkspaceAccesses` | `rayfin/data/published/identity.ts` | Maps which users have access to which Fabric workspaces. |
| `PubOverviewKpi` | `dbo.PubOverviewKpis` | `rayfin/data/published/overview.ts` | Pre-aggregated workspace KPI snapshots. |
| `PubHealthBucket` | `dbo.PubHealthBuckets` | `rayfin/data/published/overview.ts` | 7-day daily counts of `healthy`, `warning`, and `critical` assets. |
| `PubHealthDistribution` | `dbo.PubHealthDistributions` | `rayfin/data/published/overview.ts` | Current health distribution percentages and counts per workspace. |
| `PubAsset` | `dbo.PubAssets` | `rayfin/data/published/asset.ts` | Core catalog of discovered tables, semantic models, pipelines, and notebooks (`asset_key`, `name`, `type`, `status`, `lag`, `sla`, `late`, `quality_score`, `row_count`, `volume_spark`). |
| `PubAssetLagPoint` | `dbo.PubAssetLagPoints` | `rayfin/data/published/asset.ts` | 48-hour time-series points of commit lag vs. SLA for each asset's Freshness chart. |
| `PubRefreshRun` | `dbo.PubRefreshRuns` | `rayfin/data/published/asset.ts` | Historical table commits and job runs (`run_time`, `lag`, `row_count`, `result`, `duration_sec`). |
| `PubQualityResult` | `dbo.PubQualityResults` | `rayfin/data/published/asset.ts` | Published results of built-in and custom DQ rules, **Operational Row Count Drift** (`Row count drift (Start vs After)`), and **Daily Key-Column Null Rates** (`Null rate · <col>`). Marked `@authenticated('*')` so rule deletions clean up results immediately. |
| `PubQualityFailedRow` | `dbo.PubQualityFailedRows` | `rayfin/data/published/asset.ts` | Sampled primary keys and offending column values for failing DQ rules (`@authenticated('*')`). |
| `PubAssetColumn` | `dbo.PubAssetColumns` | `rayfin/data/published/asset.ts` | Latest schema catalog per table (`ordinal`, `column_name`, `data_type`, `is_nullable`, `tag`). |
| `PubSchemaChange` | `dbo.PubSchemaChanges` | `rayfin/data/published/asset.ts` | Detected schema drift events (`added`, `removed`, `type_changed`, breaking flag, SQL fix). |
| `PubLineageEdge` | `dbo.PubLineageEdges` | `rayfin/data/published/asset.ts` | Upstream and downstream dependency edges between pipelines, notebooks, tables, and models. |
| `PubIncident` | `dbo.PubIncidents` | `rayfin/data/published/incident.ts` | Auto-detected observability incidents (`Freshness`, `Quality`, `Schema`, `Volume`) with root cause and SQL remediation. |
| `PubIncidentImpact` | `dbo.PubIncidentImpacts` | `rayfin/data/published/incident.ts` | Downstream assets and semantic models impacted by each incident. |
| `PubPublishRun` | `dbo.PubPublishRuns` | `rayfin/data/published/publish-run.ts` | Metadata on each execution of `nb_governly_compute_publish` (`run_id`, `published_at`, `assets_scanned`, `rules_evaluated`). |

---

### 6. Rayfin User Data Functions Control Plane (`rayfin/functions/`)

`rayfin/functions/src/function_app.ts` registers the server-side User Data Function `manageComputeNotebook` using `RayfinContext<AppSchema, AudienceType.Fabric | AudienceType.Sql>`. It authenticates with the application's Fabric & SQL tokens and exposes 8 actions to the frontend:

| Action (`input.action`) | What It Executes on the Backend |
| :--- | :--- |
| `status` | Finds `nb_governly_compute_publish` in the host workspace, fetches its latest job instances (`GET /v1/workspaces/{wsId}/items/{nbId}/jobs/instances?jobType=RunNotebook`), queries its active Cron schedules (`GET /v1/workspaces/{wsId}/items/{nbId}/jobs/RunNotebook/schedules`), and reads persisted config from `dbo.QualityRules`. |
| `run` | Saves any updated monitored workspace IDs to `dbo.QualityRules` and triggers an immediate on-demand Spark execution via `POST /v1/workspaces/{wsId}/items/{nbId}/jobs/instances?jobType=RunNotebook`. |
| `enable_schedule` | Creates (`POST`) or updates (`PATCH`) a recurring Cron schedule on `nb_governly_compute_publish` via `/v1/workspaces/{wsId}/items/{nbId}/jobs/RunNotebook/schedules` (`interval` in minutes, `startDateTime`, `endDateTime`, `localTimeZoneId: "UTC"`) and persists `compute_schedule` in `dbo.QualityRules`. |
| `disable_schedule` | Disables the active Fabric schedule (`enabled: false`) via `PATCH /v1/workspaces/{wsId}/items/{nbId}/jobs/RunNotebook/schedules/{scheduleId}` and updates `dbo.QualityRules`. |
| `save_config` | Persists the selected monitored workspace IDs (`compute_config`) to `dbo.QualityRules` without triggering an immediate notebook run. |
| `list_workspaces` | Calls `GET /v1/workspaces` (excluding the host app workspace from monitored data-asset workspace selection) and merges with `dbo.PubWorkspaces`. |
| `list_jobs` | Scans all accessible workspaces (including the host workspace) for `Notebook` and `DataPipeline` items, fetches their latest execution instances (`GET /v1/workspaces/{wsId}/items/{itemId}/jobs/instances`), extracts failure messages, and returns live runtime job telemetry for the **Pipelines & Freshness** page. |
| `delete_quality_rule` | Connects directly to the Fabric SQL Database via `tedious` (`ctx.Tokens.Sql`) and executes an atomic `DELETE` across `dbo.QualityRules`, `dbo.PubQualityResults`, and `dbo.PubQualityFailedRows` in a single round-trip. |

---

### 7. Fabric PySpark Notebooks (`fabric/`)

#### A. Telemetry & Quality Scanner: `fabric/notebooks/nb_governly_compute_publish.py` (`.ipynb`)
This is the core PySpark observability engine that runs on schedule (default every 36 minutes) or on demand from **Settings**:

1. **Stage 1 - Configuration & Token Acquisition:**
   - Connects to the workspace's Fabric SQL Database (`governly`) using `notebookutils.credentials.getToken("https://database.windows.net/")`.
   - Reads `compute_config` (monitored workspace IDs), `freshness_sla` overrides, `landing_time_sla` overrides, `notebook_params` (optional Key Vault SPN credentials), and active user-defined `QualityRules` from `dbo.QualityRules`.
2. **Stage 2 - Zero-Plumbing Workspace & Item Discovery:**
   - Queries the Fabric REST API (`GET /v1/workspaces` and `GET /v1/workspaces/{id}/items`) across all selected monitored workspaces to discover Lakehouses, Warehouses, Semantic Models, Data Pipelines, and Spark Notebooks, plus workspace steward role assignments.
3. **Stage 3 - OneLake Delta Table & `_delta_log` Profiling:**
   - Reads Delta tables directly via `abfss://<workspaceId>@onelake.dfs.fabric.microsoft.com/<lakehouseId>/Tables/<tableName>`.
   - Runs `DESCRIBE DETAIL` and `DESCRIBE HISTORY LIMIT 14` to capture exact commit timestamps, total row counts, storage sizes, and 48-hour commit lag points (`dbo.PubAssetLagPoints`).
   - Distinguishes actively refreshed tables from static historical reference/dimension tables so historical sample tables aren't falsely marked late unless an explicit SLA rule targets them.
4. **Stage 4 - Row Count Drift (Before vs. After) & Daily Key-Column Null Rates:**
   - Extracts `operationMetrics` from the latest Delta history commits (`operation`, `numTargetRowsInserted`, `numTargetRowsUpdated`, `numTargetRowsDeleted`, `numOutputRows`) and compares the latest row count (`After`) against the prior commit's row count (`Start`), publishing a `Row count drift (Start vs After)` check row to `dbo.PubQualityResults`.
   - Identifies up to 4 key columns per table (`*_id`, `*_key`, `*_code`, `*_date`, or leading columns) and executes a **single consolidated Spark SQL aggregation pass** (`SUM(CASE WHEN col IS NULL THEN 1 ELSE 0 END)`) to publish `Null rate · <col>` checks to `dbo.PubQualityResults`.
5. **Stage 5 - 7-Dimension Data Quality Rule Execution & Failed Row Sampling:**
   - Evaluates all enabled user rules from `dbo.QualityRules` (`Completeness`, `Uniqueness`, `Validity`, `Accuracy`, `Consistency`, `Timeliness`, `Volume / Drift`) via Spark SQL, computing pass rates and capturing up to 25 failing sample rows (`dbo.PubQualityFailedRows`).
6. **Stage 6 - Schema Snapshot & Drift Detection:**
   - Compares each table's current column catalog against the previous snapshot in `dbo.PubAssetColumns`, recording added columns, dropped columns (`breaking = true`), and data type changes (`breaking = true`) into `dbo.PubSchemaChanges`.
7. **Stage 7 - Lineage & Failure Blast Radius Construction:**
   - Builds upstream/downstream dependency edges (`dbo.PubLineageEdges`) linking bronze → silver → gold tables, pipelines, notebooks, and semantic models, and generates `dbo.PubIncidents` + `dbo.PubIncidentImpacts` for any SLA breaches, DQ failures, or breaking schema changes.
8. **Stage 8 - Atomic SQL Publish:**
   - Truncates and batch-inserts the refreshed `dbo.Pub*` tables inside the Fabric SQL Database while preserving all interactive steward tables (`dbo.IncidentStates`, `dbo.StewardCases`, `dbo.QualityRules`, etc.).

#### B. One-Click Bootstrap Installer: `fabric/bootstrap/nb_governly_installer.py` (`.ipynb`)
- Standalone Python notebook imported once into a target Fabric workspace.
- Installs Node.js/Rayfin CLI in the ephemeral notebook container, clones/updates the repo, runs `npx rayfin up --yes` to provision the SQL Database, 25 tables, User Data Functions, and Static WebApp, creates `nb_governly_compute_publish` via the Fabric REST API, and stops its own Spark session to free F2 capacity units.

---

## Deep-Dive Feature Mechanics

### 1. Data Assets vs. Runtime Jobs Separation
- **Data Assets (`Table`, `Lakehouse`, `Warehouse`, `SQL Database`, `Semantic Model`):** Shown in **Overview**, **Monitored Assets**, **Data Quality**, and **Schema Drift**. Quality scores average only over Data Assets that have at least one active quality check; assets with `0` checks display `N/A` rather than inflating the workspace quality score with synthetic `100%` values.
- **Runtime Jobs (`Notebook`, `Data Pipeline`, `Scheduled Refresh`):** Shown in **Pipelines & Freshness** across all workspaces (including the Governly host workspace so you can monitor `nb_governly_compute_publish` alongside your engineering notebooks).

### 2. Expected Landing Time (Auto 24h Circular Mean vs. Steward Override)
Implemented in `src/data/useFreshnessSla.ts`:
- **Auto Average Mode (`mode: 'auto'`):** Once an asset or pipeline has `≥ 2` historical refresh timestamps, Governly converts each run's time-of-day into radians on a 24-hour unit circle ($\theta = \frac{\text{minutes}}{1440} \cdot 2\pi$) and computes the circular mean $\text{atan2}(\overline{\sin\theta}, \overline{\cos\theta})$. This accurately averages runs that cross midnight (e.g., `23:50` and `00:10` average to `00:00`, not `12:00`).
- **Steward Override Mode (`mode: 'manual'`):** Stewards can configure a fixed daily target time (`HH:MM`) and grace buffer (`15m`–`120m`) globally or per asset in **Settings → Expected Landing Time Policy** or directly on the **Freshness** tab. Overrides persist to `dbo.QualityRules` (`rule_type = 'landing_time_sla'`).

### 3. Row Count Drift (Start vs. After Processing) & Operational Metadata
Displayed on both the **Pipelines & Freshness** page and each asset's **Freshness** and **Quality** tabs:
- **Rows (Start / Before):** Row count from the previous commit/run prior to the latest processing job.
- **Rows (After Processing):** Row count after the latest commit/run completed.
- **Net Row Delta & Drift %:** Signed row delta (`+14,200` / `-3,100`) and percentage change (`+2.4%`), automatically flagged as `Watch` (`≥15%` drift) or `Spike / Drop` (`≥30%` drift or `0` rows after processing).
- **Operational Metadata:** Delta operation type (`DELTA MERGE`, `DELTA WRITE`, `SPARK JOB`), DML breakdown (`+X ins · Y upd · Z del`), execution duration, and throughput (`rows/s`).

### 4. Daily Key-Column Null Rates & 7 Data Quality Dimensions
- **Daily Key-Column Null Rates:** Automatically profiled on every scan across key/ID/timestamp columns and displayed in a dedicated **Daily Check · Row Count Drift & Key-Column Null Rates** card at the top of the **Quality** tab with visual null-rate bars (`0.00%` Pass, `0.01%–1.99%` Watch, `≥2.00%` Fail).
- **7 Data Quality Dimensions:** Every built-in template and custom rule in the **Rule Studio** maps to one of the 7 standard dimensions:
  1. `Completeness` (`NOT NULL` / non-empty checks)
  2. `Uniqueness` (primary/business key duplicate checks)
  3. `Validity` (allowed values, regex format, range bounds)
  4. `Accuracy` (cross-field mathematical/business accuracy)
  5. `Consistency` (referential integrity across bronze/silver/gold tables)
  6. `Timeliness` (event-time vs. ingestion-time lag checks)
  7. `Volume / Drift` (row count delta and null-rate spike thresholds)

### 5. Failure Blast Radius (Upstream & Downstream Impact)
When any pipeline, Spark notebook, or table refresh fails:
- Governly traces `dbo.PubLineageEdges` and workspace item dependencies to display an interactive **Failure Blast Radius** panel showing:
  - **Upstream Sources:** Lakehouses, bronze/silver tables, or parameters read by the failed job.
  - **Downstream Impacted Objects (At Risk / Stale):** Silver/gold tables, Semantic Models, and Power BI reports that depend on the failed job, clickable to open their 360° Asset Detail view.

### 6. Two-Tier Query Cache & Atomic Render Coalescing
Implemented in `src/data/queryCache.ts`:
- **Instant Warm Starts:** Queries hydrate synchronously from in-memory cache or `sessionStorage` (`governly:qcache:v3:*`) so navigating between pages renders in `<16ms` with zero loading spinners.
- **Atomic In-Flight Coalescing:** On initial cold start, when multiple queries (`assets`, `freshness-slas`, `landing-time-slas`, `incidents`, `cases`, `health-buckets`) fire concurrently, `scheduleNotify` waits until the concurrent batch settles (up to a 650ms cap) and flushes all listeners in a single React render pass so headline numbers never jump after opening the app.

---

## Security, Credentials & Data Residency

### 1. Which Credentials Does Governly Run With?

- **Web Application & APIs (Interactive):**
  - Authenticates using **Microsoft Entra ID Single Sign-On (SSO)** via the signed-in user's Fabric identity and the application's native Fabric managed identity.
  - No static credentials, secrets, or connection strings are stored in the frontend bundle.
- **Scanner Notebook (`nb_governly_compute_publish`):**
  - **Default Mode (Delegated Fabric Identity):** Runs under the identity of the user who triggers or schedules the notebook (`notebookutils.credentials.getToken`). The identity requires **Viewer** (or higher) access on monitored workspaces and **Contributor / Member** access on the Governly host workspace.
  - **Optional Mode (Unattended Service Principal):** Supports authenticating via an Entra ID App Registration whose client secret is retrieved at runtime from **Azure Key Vault** (`KEY_VAULT_URI` and `SECRET_NAME`). Client secrets are never stored in plain text in notebooks or database tables.

### 2. Which Data Does Governly Save?

Governly stores **only technical metadata and aggregated observability telemetry**. Unless custom failed-row sampling rules are explicitly authored by a steward, no row-level business records or PII are copied from monitored tables:

- **Catalog & Schema Metadata:** Workspace names and IDs, Fabric item names and types, table names, column names, data types, and workspace steward contact identities.
- **Delta Transaction Log Telemetry (`_delta_log`):** Commit timestamps, total row counts, storage byte sizes, Parquet file counts, and Delta operation metrics (`WRITE`, `MERGE`, `OPTIMIZE`, rows inserted/updated/deleted).
- **Job Execution Telemetry:** Refresh statuses (`Completed`, `Failed`, `InProgress`), start and end timestamps, duration metrics, and error messages from the Fabric Job Scheduler API.
- **Application Governance State:** Configurable SLA targets, expected landing times, data quality rule definitions, incident triage state, steward Kanban cases, and monitored workspace selections.

### 3. Where Is the Data Saved?

- **100% Inside Your Microsoft Fabric Tenant:** All metadata, telemetry, and application state are stored in a single native **Fabric SQL Database (`governly`)** provisioned directly inside the Fabric workspace where Governly is installed (and automatically mirrored to OneLake inside the same workspace).
- **Zero External Data Egress:** No telemetry, schema metadata, or credentials ever leave your Microsoft Fabric tenant or get transmitted to third-party servers.

---

## Required Permissions & Where to Configure Them

| Scope / Resource | Required Role or Permission | Where to Configure | Why It Is Needed |
| :--- | :--- | :--- | :--- |
| **1. Fabric Capacity** | Active **F-SKU Capacity** (`F2` or higher) attached to the workspace | **Fabric Portal → Workspace settings → License info** (or **Admin Portal → Capacity settings**) | Required to provision the Fabric SQL Database, host the Rayfin AppBackend, and run PySpark notebooks. *(Note: `F2` supports 1 concurrent Spark session; the installer automatically stops its session when finished).* |
| **2. Fabric Tenant Settings** | Enable **SQL database** and **User data functions** | **Fabric Admin Portal → Tenant settings** | Allows the workspace to create and query the native Fabric SQL Database, User Data Functions, and Data API Builder (DAB) GraphQL endpoint. |
| **3. Governly Host Workspace** | **Admin** or **Member** (for installer/owner)<br>**Contributor** or **Viewer** (for app users) | **Fabric Portal → Target Workspace → Manage access** | **Admin / Member** is required when running `nb_governly_installer` to create the SQL Database, AppBackend, and `nb_governly_compute_publish` notebook. **Admin** is also recommended so `nb_governly_compute_publish` can resolve workspace steward role assignments (`GET /v1/workspaces/{id}/roleAssignments`). |
| **4. Monitored Workspaces & Lakehouses** | **Contributor** (or **Viewer** + OneLake **ReadAll**) | **Fabric Portal → Monitored Workspace(s) → Manage access** | The identity that runs or schedules `nb_governly_compute_publish` discovers workspaces it has access to, lists items and jobs via the Fabric REST API, and profiles Delta tables and `_delta_log` commit history from OneLake (`abfss://...`). |
| **5. Fabric SQL Database (`governly`)** | Automatic for installer owner; for additional stewards, grant **Read / Write** access | **Fabric Portal → `governly` SQL Database → Manage permissions** (or SQL `db_datareader` / `db_datawriter`) | Allows the web app and `nb_governly_compute_publish` to read published telemetry (`dbo.Pub*`) and write custom Data Quality rules (`dbo.QualityRules`), SLAs, incident statuses (`dbo.IncidentStates`), and steward cases (`dbo.StewardCases`). |
| **6. Optional: Unattended Service Principal & Key Vault** | **Member / Contributor** on workspaces + **Key Vault Secrets User** on Azure Key Vault | **Entra ID → App registrations**, **Fabric Workspace → Manage access**, and **Azure Portal → Key Vault → Access control (IAM)** | Only needed if you prefer `nb_governly_compute_publish` to authenticate with an Entra Service Principal instead of the scheduling user's Fabric identity. Configure `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI`, and `SECRET_NAME` directly in **Governly → Settings** (or as notebook parameters). |

---

## One-Click Fabric Workspace Installation & Updates

You can deploy or update Governly directly from inside any Microsoft Fabric workspace attached to an F-SKU capacity:

1. Download [`fabric/bootstrap/nb_governly_installer.ipynb`](fabric/bootstrap/nb_governly_installer.ipynb).
2. Import the notebook into your target Microsoft Fabric workspace.
3. Click **Run all**.

What the installer notebook does automatically (idempotent for both first-time installs and updates):
- Clones or updates this repository in the notebook environment.
- Runs `npx rayfin up --yes` to provision or update the Fabric SQL Database, UserDataFunction backend (`manageComputeNotebook`), 25 SQL tables, and Static WebApp.
- Deploys or updates the standalone Spark telemetry notebook (`nb_governly_compute_publish`) wired to the workspace's SQL endpoint.
- Leaves the **initial scan and recurring schedule OFF by default** so you can first choose which workspaces to monitor in **Settings** before consuming Spark capacity.

---

## Configuring the Compute Notebook, Workspaces & Schedule in Settings

After installation, open the **Governly** web app and navigate to **Settings** (bottom-left navigation) to configure and control `nb_governly_compute_publish` without editing notebook code:

1. **Monitored Workspaces (`compute_config`):**
   - Check or uncheck which discovered Fabric workspaces should be profiled.
   - When you modify the workspace selection while the recurring schedule is active, click **Add Workspaces to Recurring Scan** (or **Save Workspace Selection**) to persist the updated scope to `dbo.QualityRules`.
   - Unchecked workspaces are skipped during OneLake Delta table scanning, Data Quality rule execution, and dashboard aggregation to save Spark compute time and capacity units (CU).
2. **Trigger On-Demand Runs (`Run Compute Notebook Now`):**
   - Click **Run Compute Notebook Now** in Settings after selecting your monitored workspaces to run the initial scan (or queue an on-demand refresh at any time) via the Rayfin User Data Function (`manageComputeNotebook`).
3. **Recurring Schedule & Cadence (`compute_schedule`):**
   - Select your desired cadence (`Every 15m`, `Every 30m`, **`Every 36m (Default)`**, `Every 1h`, `Every 2h`, `Every 4h`, `Every 6h`, `Every 12h`, or `Every 24h`) and click **Enable Recurring Schedule** to register the Cron schedule on `/v1/workspaces/{workspaceId}/items/{notebookId}/jobs/RunNotebook/schedules`.
4. **Freshness SLA & Expected Landing Time Policies:**
   - Configure global default max-age SLAs (`1h`–`168h`), domain-level SLAs, and per-asset overrides.
   - Configure **Expected Landing Time (`HH:MM`)** globally or per asset/pipeline, or leave assets on **Auto Average** (calculated automatically via 24h circular mean after `≥ 2` runs).
5. **Notebook Runtime Parameters (`notebook_params`):**
   - Leave `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI`, and `SECRET_NAME` blank for zero-config delegated mode (uses the notebook owner's Fabric and OneLake identity).
   - To use an unattended Entra Service Principal backed by Azure Key Vault, enter `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI` (e.g. `https://<vault>.vault.azure.net/`), and `SECRET_NAME` (default `governly-graph-sync`) directly in **Settings → Notebook Runtime Parameters** and click **Save Notebook Parameters**.

---

## CLI Deployment, Testing & Local Development

```bash
# Install dependencies
npm install

# Run the TypeScript compiler and build the production bundle
npm run build

# Run the Vitest unit & integration test suite (20 test files, 118 tests)
npx vitest run

# Authenticate with Microsoft Fabric
npx rayfin login

# Full deployment (SQL Database schema + User Data Functions + Static WebApp)
npx rayfin up --yes

# Targeted deployments during iterative development
npx rayfin up db apply          # Apply entity/permission changes to Fabric SQL Database + DAB
npx rayfin up functions deploy  # Bundle and deploy Rayfin User Data Functions
npx rayfin up staticapp deploy  # Build and deploy the React 19 Static WebApp
```


