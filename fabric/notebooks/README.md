# Governly Telemetry Notebook (`nb_governly_compute_publish`)

`nb_governly_compute_publish` is a self-contained PySpark notebook that runs inside Microsoft Fabric and publishes live observability telemetry into the Governly SQL Database.

## What It Does

1. **Workspace & Asset Discovery:** Discovers accessible Fabric workspaces, role assignments, Lakehouses, OneLake Delta tables (`abfss://...`), Semantic Models, Reports, Data Pipelines, and Spark Notebooks.
2. **Delta & Job Telemetry Profiling:** Reads Delta table commit history (`DESCRIBE HISTORY`), row counts, column schemas, and Fabric Job Scheduler history (`Refreshables`, `DataPipeline`, `RunNotebook`).
3. **Quality Rules & Freshness SLAs:** Evaluates custom SQL rules and configurable Freshness SLAs defined in `dbo.[QualityRules]`, capturing failed row samples into `dbo.[PubQualityFailedRows]`.
4. **Schema Drift & Steward Cases:** Compares live column schemas against previous `dbo.[PubAssetColumns]` snapshots and automatically opens `dbo.[StewardCases]` for breaking schema drift, freshness SLA breaches, or failed quality rules.

## Automated Setup

When you install or update Governly via [`fabric/bootstrap/nb_governly_installer.ipynb`](../bootstrap/nb_governly_installer.ipynb), this notebook is automatically parameterized with your workspace's `APP_SQL_SERVER` and `APP_SQL_DATABASE`, deployed to the workspace, scheduled every 36 minutes, and triggered immediately.

