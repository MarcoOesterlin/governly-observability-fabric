# Governly — Data Observability for Microsoft Fabric

Governly is a native Microsoft Fabric Data Observability application built with the Rayfin SDK (`@microsoft/rayfin-client`, `@microsoft/rayfin-core`, `@microsoft/rayfin-cli`), React 19, TypeScript, and PySpark. It provides zero-plumbing discovery and live observability across Lakehouse Delta tables, Semantic Models, Data Pipelines, and Spark Notebooks.

---

## Key Capabilities

- **Zero-Plumbing Workspace & Asset Discovery:** Automatically discovers accessible Microsoft Fabric workspaces, Lakehouses, Delta tables, Semantic Models, Data Pipelines, and Spark Notebooks.
- **Freshness & Configurable SLA Monitoring:** Tracks Delta table commit history and Fabric Job Scheduler runs against configurable per-asset or workspace-wide Freshness SLAs.
- **Data Quality Rule Studio & Failed Row Diagnostics:** Author, validate, and schedule Spark SQL predicate, completeness (`NOT NULL`), range, and key uniqueness rules (`QualityRules`), with row-level failure capture and remediation SQL.
- **Schema Drift Detection:** Compares current OneLake Delta table schemas against historical snapshots (`PubAssetColumns`) and flags breaking column drops or type changes.
- **Incident & Steward Case Workflows:** Triages freshness, quality, and schema drift incidents with ownership, status transitions, 1-hour snoozing, audit trails, and Kanban remediation cases.

---

## One-Click Fabric Workspace Installation & Updates

You can deploy or update Governly directly from inside any Microsoft Fabric workspace attached to an F-SKU capacity:

1. Download [`fabric/bootstrap/nb_governly_installer.ipynb`](fabric/bootstrap/nb_governly_installer.ipynb).
2. Import the notebook into your target Microsoft Fabric workspace.
3. Click **Run all**.

What the installer notebook does automatically (idempotent for both first-time installs and updates):
- Clones or updates this repository in the notebook environment.
- Runs `npx rayfin up --yes` to provision or update the Fabric SQL Database, UserDataFunction backend, 25 SQL tables, and Static WebApp.
- Deploys or updates the standalone Spark telemetry notebook (`nb_governly_compute_publish`) wired to the workspace's SQL endpoint.
- Configures the recurring 36-minute background schedule and triggers an immediate initial telemetry run.

---

## CLI Deployment & Local Development

```bash
# Install dependencies
npm install

# Build the production bundle
npm run build

# Deploy to Microsoft Fabric
npx rayfin login
npx rayfin up --yes
```

