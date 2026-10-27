# Governly: Data Observability for Microsoft Fabric

Governly is a native Microsoft Fabric Data Observability application built with the Rayfin SDK (`@microsoft/rayfin-client`, `@microsoft/rayfin-core`, `@microsoft/rayfin-cli`), React 19, TypeScript, and PySpark. It provides zero-plumbing discovery and live observability across Lakehouse Delta tables, Semantic Models, Data Pipelines, and Spark Notebooks.

---

## Key Capabilities

- **Zero-Plumbing Workspace & Asset Discovery:** Automatically discovers accessible Microsoft Fabric workspaces, Lakehouses, Delta tables, Semantic Models, Data Pipelines, and Spark Notebooks.
- **Freshness & Configurable SLA Monitoring:** Tracks Delta table commit history and Fabric Job Scheduler runs against configurable per-asset or workspace-wide Freshness SLAs.
- **Data Quality Rule Studio & Failed Row Diagnostics:** Author, validate, and schedule Spark SQL predicate, completeness (`NOT NULL`), range, and key uniqueness rules (`QualityRules`), with failure diagnostics and remediation SQL.
- **Schema Drift Detection:** Compares current OneLake Delta table schemas against historical snapshots (`PubAssetColumns`) and flags breaking column drops or type changes.
- **Incident & Steward Case Workflows:** Triages freshness, quality, and schema drift incidents with ownership, status transitions, 1-hour snoozing, audit trails, and Kanban remediation cases.

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
- **Delta Transaction Log Telemetry (`_delta_log`):** Commit timestamps, total row counts, storage byte sizes, Parquet file counts, and Delta operation types (`WRITE`, `MERGE`, `OPTIMIZE`).
- **Job Execution Telemetry:** Refresh statuses (`Completed`, `Failed`, `InProgress`), start and end timestamps, duration metrics, and error messages from the Fabric Job Scheduler API.
- **Application Governance State:** Configurable SLA targets, data quality rule definitions, incident triage state, steward Kanban cases, and monitored workspace selections.

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
   - Unchecked workspaces are skipped during OneLake Delta table scanning, Data Quality rule execution, and dashboard aggregation to save Spark compute time and capacity units (CU).
   - Sidebar **Workspace** and **Domain** filters remain locked until the first scan has been triggered.
2. **Trigger On-Demand Runs (`Run Compute Notebook Now`):**
   - Click **Run Compute Notebook Now** in Settings after selecting your monitored workspaces to run the initial scan (or queue an on-demand refresh at any time) via the Rayfin User Data Function (`manageComputeNotebook`).
3. **Recurring Schedule & Cadence (`compute_schedule`):**
   - By default, the recurring schedule is **paused (Manual Mode)** after installation, with the default cadence preset to **Every 36m (Default)**.
   - Select your desired cadence (`Every 15m`, `Every 30m`, **`Every 36m (Default)`**, `Every 1h`, `Every 2h`, `Every 4h`, `Every 6h`, `Every 12h`, or `Every 24h`) and click **Enable Recurring Schedule** (or **Schedule: ON (Click to Pause)**) to update the Fabric Job Scheduler (`RunNotebook`) directly from the UI.
4. **Notebook Runtime Parameters (`notebook_params`):**
   - Leave `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI`, and `SECRET_NAME` blank for zero-config delegated mode (uses the notebook owner's Fabric and OneLake identity).
   - To use an unattended Entra Service Principal backed by Azure Key Vault, enter `TENANT_ID`, `CLIENT_ID`, `KEY_VAULT_URI` (e.g. `https://<vault>.vault.azure.net/`), and `SECRET_NAME` (default `governly-graph-sync`) directly in **Settings → Notebook Runtime Parameters** and click **Save Notebook Parameters**. `nb_governly_compute_publish` reads these values from the App SQL Database (`dbo.QualityRules`) at the start of every run.

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

