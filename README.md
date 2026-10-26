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

## Required Permissions & Where to Configure Them

| Scope / Resource | Required Role or Permission | Where to Configure | Why It Is Needed |
| :--- | :--- | :--- | :--- |
| **1. Fabric Capacity** | Active **F-SKU Capacity** (`F2` or higher) attached to the workspace | **Fabric Portal → Workspace settings → License info** (or **Admin Portal → Capacity settings**) | Required to provision the Fabric SQL Database, host the Rayfin AppBackend, and run PySpark notebooks. *(Note: `F2` supports 1 concurrent Spark session; the installer automatically stops its session so the scheduled compute notebook can start).* |
| **2. Fabric Tenant Settings** | Enable **SQL database** and **User data functions** | **Fabric Admin Portal → Tenant settings** | Allows the workspace to create and query the native Fabric SQL Database and Data API Builder (DAB) GraphQL endpoint. |
| **3. Governly Host Workspace** | **Admin** or **Member** (for installer/owner)<br>**Contributor** or **Viewer** (for app users) | **Fabric Portal → Target Workspace → Manage access** | **Admin / Member** is required when running `nb_governly_installer` to create the SQL Database, AppBackend, `nb_governly_compute_publish` notebook, and 36-minute job schedule. **Admin** is also recommended if you want `nb_governly_compute_publish` to read workspace role assignments (`GET /v1/workspaces/{id}/roleAssignments`). |
| **4. Monitored Workspaces & Lakehouses** | **Contributor** (or **Viewer** + OneLake **ReadAll**) | **Fabric Portal → Monitored Workspace(s) → Manage access** | The identity that owns/schedules `nb_governly_compute_publish` automatically discovers all workspaces it has access to, lists items/jobs via the Fabric REST API, and profiles Delta tables + `_delta_log` commit history from OneLake (`abfss://...`). |
| **5. Fabric SQL Database (`governly`)** | Automatic for installer owner; for additional stewards, grant **Read / Write** access | **Fabric Portal → `governly` SQL Database → Manage permissions** (or SQL `db_datareader` / `db_datawriter`) | Allows the web app and `nb_governly_compute_publish` to read published telemetry (`dbo.Pub*`) and write custom Data Quality rules (`dbo.QualityRules`), SLAs, incident statuses (`dbo.IncidentStates`), and steward cases (`dbo.StewardCases`). |
| **6. Optional: Unattended Service Principal & Key Vault** | **Member / Contributor** on workspaces + **Key Vault Secrets User** on Azure Key Vault | **Entra ID → App registrations**, **Fabric Workspace → Manage access**, and **Azure Portal → Key Vault → Access control (IAM)** | Only needed if you prefer `nb_governly_compute_publish` to authenticate with an Entra Service Principal instead of the scheduling user's Fabric identity. Pass `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI`, and `SECRET_NAME` as notebook parameters. |

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

