# %% tags=["parameters"]
from __future__ import annotations

TENANT_ID = ""
CLIENT_ID = ""
KEY_VAULT_URI = ""
SECRET_NAME = "governly-graph-sync"
APP_SQL_SERVER = "s3lrabakekdenjl5i5zqwf73ve-gey53tgqvnkeppzdpyigskrv4m.database.fabric.microsoft.com,1433"
APP_SQL_DATABASE = "governly-dd7d75e2-9669-420b-90ff-7bf423106525"

# %%
from datetime import datetime, timedelta, timezone
import json
import struct
from typing import Any
import urllib.request
import uuid

try:
    from _common import (
        get_runtime_token,
        read_lh_rows,
        resolve_sql_table_name,
        stable_uuid,
    )
except ImportError:
    NAMESPACE_GOVERNLY = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
    PUBLISHED_TABLE_MAP: dict[str, str] = {
        "PubWorkspace": "PubWorkspaces",
        "PubUserWorkspaceAccess": "PubUserWorkspaceAccesses",
        "PubEntraUser": "PubEntraUsers",
        "PubUserRole": "PubUserRoles",
        "PubDomain": "PubDomains",
        "PubOverviewKpi": "PubOverviewKpis",
        "PubHealthBucket": "PubHealthBuckets",
        "PubHealthDistribution": "PubHealthDistributions",
        "PubAsset": "PubAssets",
        "PubAssetLagPoint": "PubAssetLagPoints",
        "PubRefreshRun": "PubRefreshRuns",
        "PubQualityResult": "PubQualityResults",
        "PubQualityFailedRow": "PubQualityFailedRows",
        "PubAssetColumn": "PubAssetColumns",
        "PubSchemaChange": "PubSchemaChanges",
        "PubLineageEdge": "PubLineageEdges",
        "PubIncident": "PubIncidents",
        "PubIncidentImpact": "PubIncidentImpacts",
        "PubPublishRun": "PubPublishRuns",
        "StewardCase": "StewardCases",
        "CaseIncidentLink": "CaseIncidentLinks",
    }

    def stable_uuid(*parts: str) -> str:
        return str(uuid.uuid5(NAMESPACE_GOVERNLY, "|".join(str(p) for p in parts)))

    def resolve_sql_table_name(name: str) -> str:
        return PUBLISHED_TABLE_MAP.get(name, name)

    def get_runtime_token(
        scope: str,
        tenant_id: str = "",
        client_id: str = "",
        kv_uri: str = "",
        secret_name: str = "",
    ) -> str:
        audience = scope[:-9] if scope.endswith("/.default") else scope
        for mod_name in ("notebookutils", "mssparkutils"):
            try:
                mod = __import__(mod_name)
                return mod.credentials.getToken(audience)
            except Exception:
                continue
        raise RuntimeError(f"Unable to acquire token for {scope}")

    def read_lh_rows(spark: Any, table_name: str, lakehouse_name: str = "lh_governly") -> list[dict]:
        for candidate in (f"{lakehouse_name}.{table_name}", table_name):
            try:
                if spark.catalog.tableExists(candidate):
                    return [r.asDict(recursive=True) for r in spark.table(candidate).collect()]
            except Exception:
                continue
        return []

ACTIONABLE_MONITOR_TYPES = {"Schema", "Freshness", "Pipeline", "Quality", "Volume"}


def format_row_count(n: int | None) -> str:
    if n is None:
        return "—"
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def format_lag_minutes(minutes: float | None) -> str:
    if minutes is None or minutes < 0:
        return "—"
    if minutes < 1.0:
        return f"{max(1, int(round(minutes * 60)))}s"
    mins = int(round(minutes))
    if mins < 60:
        return f"{mins}m"
    hours = mins // 60
    rem = mins % 60
    if hours < 48:
        return f"{hours}h {rem:02d}m" if rem else f"{hours}h"
    days = hours // 24
    rem_h = hours % 24
    return f"{days}d {rem_h}h" if rem_h else f"{days}d"


def should_create_case(incident: dict, asset: dict | None = None) -> bool:
    """
    Cases are ONLY created if there is an active:
    1. Schema drift (`monitor_type == 'Schema'` or breaking schema change)
    2. Freshness / Pipeline SLA breach (`monitor_type in ('Freshness', 'Pipeline')` or `asset.is_late == True`)
    3. Poor data quality (`monitor_type in ('Quality', 'Volume')` or `asset.quality_score < 95.0` or `quality_pass < quality_total`)
    Resolved incidents never trigger a new case.
    """
    if incident.get("auto_resolved_at"):
        return False
    mtype = str(incident.get("monitor_type") or "")
    if mtype in ACTIONABLE_MONITOR_TYPES:
        if mtype == "Schema":
            return True
        if mtype in ("Freshness", "Pipeline"):
            return True if asset is None else bool(asset.get("is_late", True))
        if mtype in ("Quality", "Volume"):
            if asset is None:
                return True
            q_score = float(asset.get("quality_score") if asset.get("quality_score") is not None else -1.0)
            q_pass = int(asset.get("quality_pass") or 0)
            q_total = int(asset.get("quality_total") or 0)
            return (q_score >= 0.0 and q_score < 95.0) or q_pass < q_total
    if asset is not None:
        if asset.get("is_late"):
            return True
        q_score = float(asset.get("quality_score") if asset.get("quality_score") is not None else -1.0)
        if (q_score >= 0.0 and q_score < 95.0) or int(asset.get("quality_pass") or 0) < int(asset.get("quality_total") or 0):
            return True
    return False


def build_steward_cases(
    workspace_id: str,
    incidents: list[dict],
    assets_by_key: dict[str, dict],
    published_at: str,
) -> tuple[list[dict], list[dict]]:
    """Build StewardCase + CaseIncidentLink rows strictly for incidents with drift, SLA breach, or poor quality."""
    ws_incidents = [
        inc
        for inc in incidents
        if inc.get("workspace_id") == workspace_id and should_create_case(inc, assets_by_key.get(inc.get("asset_key", "")))
    ]
    # Group actionable incidents by asset_key so multiple failures on the same asset roll into one steward case
    grouped: dict[str, list[dict]] = {}
    for inc in ws_incidents:
        grouped.setdefault(inc["asset_key"], []).append(inc)

    sev_rank = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1, "critical": 4, "high": 3, "medium": 2, "low": 1}
    cases: list[dict] = []
    links: list[dict] = []

    try:
        base_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except Exception:
        base_dt = datetime.now(timezone.utc)

    for idx, (asset_key, inc_list) in enumerate(sorted(grouped.items()), start=1):
        asset = assets_by_key.get(asset_key, {})
        top_inc = max(inc_list, key=lambda x: sev_rank.get(str(x.get("severity")), 1))
        sev_lower = str(top_inc.get("severity") or "medium").lower()
        priority = sev_lower if sev_lower in ("critical", "high", "medium", "low") else "medium"
        reasons = sorted({str(i.get("monitor_type") or "Quality") for i in inc_list})
        reason_label = " + ".join(reasons)
        case_key = f"CASE-{100 + idx}"
        case_id = stable_uuid("steward_case", workspace_id, asset_key)
        owner_name = asset.get("steward_name") or asset.get("owner_name") or "Marco Österlin"
        owner_oid = asset.get("steward_object_id") or asset.get("owner_object_id") or "0d55578c-7868-4db7-b396-09109ca345cf"
        domain_key = asset.get("domain_key") or top_inc.get("domain_key") or "governance"
        due_hours = 24 if priority in ("critical", "high") else 72
        due_iso = (base_dt + timedelta(hours=due_hours)).isoformat()
        summaries = "; ".join(str(i.get("root_cause_hint") or i.get("summary") or i.get("title")) for i in inc_list)

        cases.append({
            "id": case_id,
            "workspace_id": workspace_id,
            "case_key": case_key,
            "title": f"[{reason_label}] Remediate {asset.get('name') or asset_key}",
            "description": summaries[:4000],
            "status": "open",
            "priority": priority,
            "owner_name": owner_name,
            "owner_object_id": owner_oid,
            "domain_key": domain_key,
            "due_date": due_iso,
            "created_at": str(top_inc.get("detected_at") or published_at),
            "updated_at": published_at,
        })
        for inc in inc_list:
            links.append({
                "id": stable_uuid("case_link", workspace_id, case_id, inc["incident_key"]),
                "workspace_id": workspace_id,
                "case_id": case_id,
                "incident_key": inc["incident_key"],
                "linked_at": published_at,
                "linked_by": owner_name,
            })

    return cases, links


def build_overview_kpis(
    workspace_id: str,
    range_key: str,
    published_at: str = "2026-10-25T12:00:00Z",
    assets: list[dict] | None = None,
    incidents: list[dict] | None = None,
    cases: list[dict] | None = None,
) -> list[dict]:
    ws_assets = [a for a in (assets or []) if a.get("workspace_id", workspace_id) == workspace_id]
    ws_incidents = [
        i
        for i in (incidents or [])
        if i.get("workspace_id", workspace_id) == workspace_id and not i.get("auto_resolved_at")
    ]
    ws_cases = [
        c
        for c in (cases or [])
        if c.get("workspace_id", workspace_id) == workspace_id and c.get("status") != "resolved"
    ]

    total_assets = len(ws_assets)
    if total_assets > 0:
        avg_health = round(sum(float(a.get("health_score") or 100.0) for a in ws_assets) / total_assets, 1)
        on_time = sum(1 for a in ws_assets if not a.get("is_late"))
        delayed = total_assets - on_time
        sla_pct = round((on_time / total_assets) * 100.0, 1)
        health_sub = f"{on_time} of {total_assets} assets within SLA"
        sla_sub = f"{delayed} table(s) delayed > SLA" if delayed > 0 else f"All {total_assets} assets within SLA"
    else:
        avg_health = 100.0
        sla_pct = 100.0
        health_sub = "No monitored assets"
        sla_sub = "No SLA breaches"

    crit_cnt = sum(1 for i in ws_incidents if str(i.get("severity", "")).lower() == "critical")
    high_cnt = sum(1 for i in ws_incidents if str(i.get("severity", "")).lower() == "high")
    med_cnt = sum(1 for i in ws_incidents if str(i.get("severity", "")).lower() in ("medium", "low"))
    inc_sub = (
        f"{crit_cnt} critical · {high_cnt} high · {med_cnt} medium"
        if ws_incidents
        else "0 drift, SLA breach, or DQ incidents"
    )

    stewards_cnt = len({c.get("owner_object_id") for c in ws_cases if c.get("owner_object_id")}) or 1
    case_sub = (
        f"Assigned across {stewards_cnt} data steward(s)"
        if ws_cases
        else "Created on drift, breach, or poor quality"
    )

    specs = [
        (
            "health_score",
            "Overall health score",
            avg_health,
            f"{avg_health:.1f}%",
            f"Live ({range_key})",
            "up" if avg_health >= 90.0 else "down",
            health_sub,
        ),
        (
            "active_incidents",
            "Active incidents",
            float(len(ws_incidents)),
            str(len(ws_incidents)),
            "Live checks" if ws_incidents else "All clear",
            "down" if len(ws_incidents) == 0 else "up",
            inc_sub,
        ),
        (
            "freshness_sla",
            "Freshness SLA met",
            sla_pct,
            f"{sla_pct:.1f}%",
            f"Window {range_key}",
            "up" if sla_pct >= 95.0 else "down",
            sla_sub,
        ),
        (
            "open_cases",
            "Open stewardship cases",
            float(len(ws_cases)),
            str(len(ws_cases)) if cases is not None else "",
            f"{len(ws_cases)} active" if ws_cases else "0 open",
            "flat",
            case_sub,
        ),
    ]
    return [
        {
            "id": stable_uuid(workspace_id, range_key, kpi_key),
            "workspace_id": workspace_id,
            "range": range_key,
            "kpi_key": kpi_key,
            "label": label,
            "value_num": val_num,
            "value_label": val_label,
            "trend_label": trend_label,
            "trend_direction": trend_dir,
            "sub_label": sub_label,
            "published_at": published_at,
        }
        for kpi_key, label, val_num, val_label, trend_label, trend_dir, sub_label in specs
    ]


def build_health_buckets(
    workspace_id: str,
    range_key: str,
    published_at: str = "2026-10-25T12:00:00Z",
    assets: list[dict] | None = None,
    lag_points: list[dict] | None = None,
    prior_buckets: list[dict] | None = None,
) -> list[dict]:
    ws_assets = [a for a in (assets or []) if a.get("workspace_id", workspace_id) == workspace_id]
    if not ws_assets:
        return []
    current_health = round(
        sum(float(a.get("health_score") or 95.0) for a in ws_assets) / len(ws_assets),
        1,
    )

    history = [
        b
        for b in (prior_buckets or [])
        if b.get("workspace_id") == workspace_id
        and b.get("range") == range_key
        and str(b.get("bucket_start") or "") == str(b.get("published_at") or "")
        and str(b.get("bucket_start") or "") != published_at
    ]
    history.sort(key=lambda r: str(r.get("bucket_start") or ""))
    combined = history + [
        {
            "bucket_start": published_at,
            "published_at": published_at,
            "height_pct": current_health,
        }
    ]
    combined = combined[-40:]

    rows: list[dict] = []
    prev_h: float | None = None
    for i, entry in enumerate(combined):
        h = round(float(entry.get("height_pct") or current_health), 1)
        b_start = str(entry.get("bucket_start") or published_at)
        pub_ts = str(entry.get("published_at") or b_start)
        drop = (prev_h - h) if prev_h is not None else 0.0
        prev_h = h
        status = (
            "breach"
            if (h < 83.0 or drop >= 10.0)
            else ("degraded" if (h < 90.0 or drop >= 5.0) else "ok")
        )
        rows.append({
            "id": stable_uuid(workspace_id, range_key, str(i)),
            "workspace_id": workspace_id,
            "range": range_key,
            "bucket_index": i,
            "bucket_start": b_start,
            "status": status,
            "height_pct": h,
            "published_at": pub_ts,
        })
    return rows


def build_incident_impacts(
    workspace_id: str,
    incidents: list[dict],
    lineage_edges: list[dict],
    published_at: str,
) -> list[dict]:
    """Traverse downstream lineage edges via BFS for each incident to compute impacted assets."""
    ws_edges = [e for e in lineage_edges if e.get("workspace_id") == workspace_id]
    adj: dict[str, list[dict]] = {}
    for e in ws_edges:
        adj.setdefault(e["upstream_asset_key"], []).append(e)

    impacts: list[dict] = []
    for inc in incidents:
        if inc.get("workspace_id") != workspace_id:
            continue
        inc_key = inc["incident_key"]
        root_key = inc["asset_key"]
        visited: set[str] = {root_key}
        queue: list[tuple[str, int]] = [(root_key, 0)]
        while queue:
            curr_key, hops = queue.pop(0)
            if hops >= 3:
                continue
            for edge in adj.get(curr_key, []):
                nxt_key = edge["downstream_asset_key"]
                if nxt_key in visited:
                    continue
                visited.add(nxt_key)
                next_hops = hops + 1
                imp_sev = "high" if next_hops == 1 and str(inc.get("severity", "")).lower() in ("critical", "high") else "medium"
                impacts.append({
                    "id": stable_uuid("incident_impact", workspace_id, inc_key, nxt_key),
                    "workspace_id": workspace_id,
                    "incident_key": inc_key,
                    "impacted_asset_key": nxt_key,
                    "impacted_name": edge.get("downstream_name") or nxt_key,
                    "impacted_type": edge.get("downstream_type") or "Lakehouse table",
                    "impact_severity": imp_sev,
                    "hops": next_hops,
                    "published_at": published_at,
                })
                queue.append((nxt_key, next_hops))
    return impacts


def replace_table_rows_jdbc(jdbc_conn: Any, table: str, rows: list[dict], commit: bool = True) -> int:
    """Replace all rows in `dbo.[<sql_table>]` over a Spark JVM JDBC connection inside a transaction."""
    sql_table = resolve_sql_table_name(table)
    stmt = jdbc_conn.createStatement()
    try:
        stmt.executeUpdate(f"DELETE FROM [dbo].[{sql_table}]")
    finally:
        stmt.close()

    if not rows:
        if commit:
            jdbc_conn.commit()
        return 0

    cols = list(rows[0].keys())
    col_list = ", ".join(f"[{c}]" for c in cols)
    placeholders = ", ".join(["?"] * len(cols))
    ps = jdbc_conn.prepareStatement(f"INSERT INTO [dbo].[{sql_table}] ({col_list}) VALUES ({placeholders})")
    try:
        for r in rows:
            for idx, c in enumerate(cols, start=1):
                val = r.get(c)
                if val is None:
                    ps.setObject(idx, None)
                elif isinstance(val, bool):
                    ps.setBoolean(idx, bool(val))
                elif isinstance(val, int):
                    ps.setLong(idx, int(val))
                elif isinstance(val, float):
                    ps.setDouble(idx, float(val))
                else:
                    ps.setString(idx, str(val))
            ps.addBatch()
        ps.executeBatch()
    finally:
        ps.close()
    if commit:
        jdbc_conn.commit()
    return len(rows)


def open_fabric_sql_jdbc(spark: Any, server: str, database: str, token: str) -> Any:
    """Open a JDBC connection to Fabric SQL Database using the Spark JVM SQLServerDataSource."""
    host = server.split(",")[0].split(":")[0].strip()
    port = 1433
    if "," in server:
        port = int(server.split(",")[1].strip())
    elif ":" in server:
        port = int(server.split(":")[1].strip())
    ds = spark._sc._gateway.jvm.com.microsoft.sqlserver.jdbc.SQLServerDataSource()
    ds.setServerName(host)
    ds.setPortNumber(port)
    ds.setDatabaseName(database)
    ds.setEncrypt("true")
    ds.setTrustServerCertificate(False)
    ds.setAccessToken(token)
    conn = ds.getConnection()
    conn.setAutoCommit(False)
    return conn


def _fabric_api_get(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


INTERNAL_STAGING_TABLES = {
    "dim_entra_user",
    "dim_entra_group",
    "bridge_entra_group_member",
    "dim_fabric_workspace",
    "fact_user_workspace_access",
    "dim_domain",
    "dim_asset",
    "fact_refresh_run",
    "fact_asset_lag",
    "fact_quality_result",
    "dim_asset_column",
    "fact_schema_change",
    "fact_lineage_edge",
    "fact_incident_detected",
    "dq_results",
}


def _list_onelake_delta_tables(
    spark: Any,
    ws_id: str,
    lh_id: str,
    storage_token: str = "",
) -> list[tuple[str, str, str]]:
    base_uri = f"abfss://{ws_id}@onelake.dfs.fabric.microsoft.com/{lh_id}/Tables"
    discovered: list[tuple[str, str, str]] = []
    seen_paths: set[str] = set()

    if storage_token:
        try:
            dfs_url = f"https://onelake.dfs.fabric.microsoft.com/{ws_id}?resource=filesystem&directory={lh_id}/Tables&recursive=true"
            req = urllib.request.Request(
                dfs_url,
                headers={"Authorization": f"Bearer {storage_token}", "x-ms-version": "2021-06-08"},
            )
            with urllib.request.urlopen(req) as resp:
                dfs_data = json.loads(resp.read().decode("utf-8"))
            for p in dfs_data.get("paths", []):
                pname = str(p.get("name") or "")
                if pname.endswith("/_delta_log") and str(p.get("isDirectory")).lower() == "true":
                    tdir = pname[: -len("/_delta_log")]
                    if "/Tables/" not in tdir:
                        continue
                    rel = tdir.split("/Tables/", 1)[1].strip("/")
                    if not rel or rel.startswith("_"):
                        continue
                    parts = rel.split("/")
                    if len(parts) == 1:
                        schema_name, table_name = "dbo", parts[0]
                    else:
                        schema_name, table_name = parts[0], parts[-1]
                    abfss_path = f"{base_uri}/{rel}"
                    if abfss_path not in seen_paths:
                        seen_paths.add(abfss_path)
                        discovered.append((schema_name, table_name, abfss_path))
        except Exception:
            pass

    if discovered:
        return discovered

    fs_utils = None
    for mod_name in ("notebookutils", "mssparkutils"):
        try:
            fs_utils = __import__(mod_name).fs
            break
        except Exception:
            continue
    if fs_utils is None:
        return discovered
    try:
        top_entries = fs_utils.ls(base_uri)
    except Exception:
        return discovered
    for entry in top_entries:
        name = getattr(entry, "name", "").rstrip("/")
        path = getattr(entry, "path", f"{base_uri}/{name}")
        if not name or name.startswith("_"):
            continue
        try:
            sub_entries = fs_utils.ls(path)
            sub_names = {getattr(s, "name", "").rstrip("/") for s in sub_entries}
            if "_delta_log" in sub_names:
                discovered.append(("dbo", name, path))
            else:
                for sub in sub_entries:
                    tname = getattr(sub, "name", "").rstrip("/")
                    tpath = getattr(sub, "path", f"{path}/{tname}")
                    if tname and not tname.startswith("_"):
                        discovered.append((name, tname, tpath))
        except Exception:
            continue
    return discovered


def read_custom_quality_rules(jdbc_conn: Any) -> list[dict]:
    """Read active user-authored QualityRule definitions from the Rayfin SQL Database."""
    rules: list[dict] = []
    stmt = jdbc_conn.createStatement()
    try:
        rs = stmt.executeQuery(
            "SELECT id, workspace_id, asset_key, rule_name, rule_type, expression, threshold_pct, severity "
            "FROM dbo.[QualityRules] WHERE is_active = 1"
        )
        try:
            while rs.next():
                rules.append({
                    "id": str(rs.getString(1) or ""),
                    "workspace_id": str(rs.getString(2) or ""),
                    "asset_key": str(rs.getString(3) or ""),
                    "rule_name": str(rs.getString(4) or ""),
                    "rule_type": str(rs.getString(5) or "sql_predicate"),
                    "expression": str(rs.getString(6) or ""),
                    "threshold_pct": float(rs.getDouble(7) if rs.getObject(7) is not None else 100.0),
                    "severity": str(rs.getString(8) or "High"),
                })
        finally:
            rs.close()
    except Exception:
        return []
    finally:
        stmt.close()
    return rules


def read_existing_real_buckets(jdbc_conn: Any) -> list[dict]:
    """Read previously recorded real-run health buckets (where bucket_start == published_at)."""
    buckets: list[dict] = []
    stmt = jdbc_conn.createStatement()
    try:
        rs = stmt.executeQuery(
            "SELECT workspace_id, [range], bucket_index, bucket_start, height_pct, published_at "
            "FROM dbo.[PubHealthBuckets] WHERE bucket_start = published_at"
        )
        try:
            while rs.next():
                buckets.append({
                    "workspace_id": str(rs.getString(1) or ""),
                    "range": str(rs.getString(2) or "24h"),
                    "bucket_index": int(rs.getInt(3)),
                    "bucket_start": str(rs.getString(4) or ""),
                    "height_pct": float(rs.getDouble(5)),
                    "published_at": str(rs.getString(6) or ""),
                })
        finally:
            rs.close()
    except Exception:
        return []
    finally:
        stmt.close()
    return buckets


def read_existing_pub_columns(jdbc_conn: Any) -> dict[tuple[str, str], list[tuple[str, str]]]:
    """Read previously published table schemas from dbo.[PubAssetColumns] for historical drift detection."""
    by_asset: dict[tuple[str, str], list[tuple[str, str]]] = {}
    stmt = jdbc_conn.createStatement()
    try:
        rs = stmt.executeQuery(
            "SELECT workspace_id, asset_key, column_name, data_type "
            "FROM dbo.[PubAssetColumns] ORDER BY ordinal ASC"
        )
        try:
            while rs.next():
                wid = str(rs.getString(1) or "")
                akey = str(rs.getString(2) or "")
                cname = str(rs.getString(3) or "")
                dtype = str(rs.getString(4) or "")
                if wid and akey and cname:
                    by_asset.setdefault((wid, akey), []).append((cname, dtype))
        finally:
            rs.close()
    except Exception:
        return {}
    finally:
        stmt.close()
    return by_asset


def _profile_fabric_item_jobs(
    wid: str,
    item_id: str,
    asset_key: str,
    sla_min: int,
    now_dt: datetime,
    now_iso: str,
    fabric_token: str,
) -> dict[str, Any]:
    """Query real Fabric Job Scheduler instances for a Pipeline, Notebook, or Semantic Model."""
    item_runs: list[dict] = []
    item_lags: list[dict] = []
    try:
        url = f"https://api.fabric.microsoft.com/v1/workspaces/{wid}/items/{item_id}/jobs/instances"
        raw_jobs = _fabric_api_get(url, fabric_token).get("value", [])
    except Exception:
        raw_jobs = []

    completed_jobs = [
        j for j in raw_jobs
        if str(j.get("status") or "").lower() in ("completed", "failed", "cancelled", "deduped")
    ]
    if not completed_jobs:
        return {
            "status": "healthy",
            "health_score": 100.0,
            "freshness_label": "No runs yet",
            "is_late": False,
            "last_refresh_at": now_iso,
            "runs": [],
            "lags": [],
        }

    def _parse_job_ts(j: dict) -> datetime:
        raw_ts = str(j.get("endTimeUtc") or j.get("startTimeUtc") or now_iso)
        try:
            if not raw_ts.endswith("Z") and "+" not in raw_ts:
                raw_ts += "Z"
            return datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
        except Exception:
            return now_dt

    completed_jobs.sort(key=_parse_job_ts, reverse=True)
    latest_dt = _parse_job_ts(completed_jobs[0])
    latest_iso = latest_dt.replace(microsecond=0).isoformat()
    lag_min = max(1.0, round((now_dt - latest_dt).total_seconds() / 60.0, 1))
    latest_status = str(completed_jobs[0].get("status") or "Completed").lower()
    failed_recent = latest_status in ("failed", "cancelled")
    is_late = lag_min > sla_min or failed_recent
    fresh_lbl = "Run failed" if failed_recent else format_lag_minutes(lag_min)

    chron_jobs = list(reversed(completed_jobs[:15]))
    for idx, j in enumerate(chron_jobs):
        j_dt = _parse_job_ts(j)
        j_iso = j_dt.replace(microsecond=0).isoformat()
        if idx > 0:
            prev_dt = _parse_job_ts(chron_jobs[idx - 1])
            step_lag = max(1.0, round((j_dt - prev_dt).total_seconds() / 60.0, 1))
        else:
            step_lag = lag_min
        j_stat = str(j.get("status") or "Completed").lower()
        run_status = "succeeded" if j_stat == "completed" and step_lag <= sla_min else "breach"
        item_runs.append({
            "workspace_id": wid,
            "run_id": f"{asset_key}:{j.get('id') or idx}",
            "asset_key": asset_key,
            "ended_at": j_iso,
            "lag_minutes": step_lag,
            "rows_processed": None,
            "status": run_status,
        })
        item_lags.append({
            "workspace_id": wid,
            "asset_key": asset_key,
            "range": "6h",
            "ts": j_iso,
            "lag_minutes": step_lag,
        })

    if failed_recent or lag_min > sla_min * 2:
        a_status = "critical"
        h_score = 68.0
    elif is_late:
        a_status = "warning"
        h_score = 84.0
    else:
        a_status = "healthy"
        h_score = 100.0

    return {
        "status": a_status,
        "health_score": h_score,
        "freshness_label": fresh_lbl,
        "is_late": is_late,
        "last_refresh_at": latest_iso,
        "runs": item_runs,
        "lags": item_lags,
    }


def discover_and_profile_live_fabric(
    spark: Any,
    fabric_token: str,
    now_iso: str,
    custom_rules: list[dict] | None = None,
    storage_token: str = "",
    prior_columns: dict[tuple[str, str], list[tuple[str, str]]] | None = None,
) -> dict[str, list[dict]]:
    """
    Zero-plumbing in-memory discovery & Spark Delta profiling across accessible Fabric workspaces.
    Used automatically when intermediate Lakehouse staging tables are not present.
    """
    now_dt = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    cap_sku: dict[str, str] = {}
    cap_active: dict[str, bool] = {}
    try:
        for c in _fabric_api_get("https://api.fabric.microsoft.com/v1/capacities", fabric_token).get("value", []):
            cid = str(c.get("id") or "").lower()
            cap_sku[cid] = c.get("sku") or "F2"
            cap_active[cid] = str(c.get("state") or "Active").lower() == "active"
    except Exception:
        pass

    ws_raw = _fabric_api_get("https://api.fabric.microsoft.com/v1/workspaces", fabric_token).get("value", [])
    workspaces: list[dict] = []
    access_rows: list[dict] = []
    users_by_id: dict[str, dict] = {}
    groups_by_id: dict[str, dict] = {}
    member_rows: list[dict] = []

    for w in ws_raw:
        if w.get("type") != "Workspace":
            continue
        wid = w["id"]
        cid = str(w.get("capacityId") or "").lower()
        if not cid:
            continue
        is_cap_active = cap_active.get(cid, True)
        workspaces.append({
            "workspace_id": wid,
            "name": w.get("displayName") or wid,
            "capacity_id": w.get("capacityId"),
            "capacity_sku": cap_sku.get(cid, "F2"),
            "is_monitored": True,
            "capacity_active": is_cap_active,
        })
        try:
            ras = _fabric_api_get(
                f"https://api.fabric.microsoft.com/v1/workspaces/{wid}/roleAssignments",
                fabric_token,
            ).get("value", [])
        except Exception:
            ras = []
        gid = f"role-{wid}"
        groups_by_id[gid] = {
            "group_id": gid,
            "display_name": f"{w.get('displayName') or wid} Stewards",
            "role": "steward",
            "domain_key": None,
        }
        for ra in ras:
            p = ra.get("principal") or {}
            oid = p.get("id") or ra.get("id")
            if not oid:
                continue
            dname = p.get("displayName") or "Workspace Steward"
            upn = (p.get("userDetails") or {}).get("userPrincipalName") or f"{dname.lower().replace(' ', '.')}@fabric.local"
            role = ra.get("role") or "Admin"
            access_rows.append({
                "workspace_id": wid,
                "object_id": oid,
                "effective_role": role,
                "via": "direct",
            })
            users_by_id[oid] = {
                "object_id": oid,
                "upn": upn,
                "display_name": dname,
                "job_title": f"Fabric {role}",
                "department": "Data Platform",
                "is_active": True,
                "is_synthetic": False,
            }
            member_rows.append({
                "group_id": gid,
                "object_id": oid,
                "is_active": True,
            })

    domains: list[dict] = []
    assets: list[dict] = []
    runs: list[dict] = []
    lags: list[dict] = []
    quality: list[dict] = []
    failed_rows: list[dict] = []
    columns: list[dict] = []
    schema_changes: list[dict] = []
    edges: list[dict] = []
    incidents: list[dict] = []

    default_steward_id = next(iter(users_by_id.keys()), "00000000-0000-0000-0000-000000000001")
    default_steward_name = users_by_id.get(default_steward_id, {}).get("display_name", "Workspace Steward")

    for w in workspaces:
        wid = w["workspace_id"]
        ws_steward_id = next(
            (a["object_id"] for a in access_rows if a["workspace_id"] == wid),
            default_steward_id,
        )
        ws_steward_name = users_by_id.get(ws_steward_id, {}).get("display_name", default_steward_name)

        try:
            items = _fabric_api_get(
                f"https://api.fabric.microsoft.com/v1/workspaces/{wid}/items",
                fabric_token,
            ).get("value", [])
        except Exception:
            items = []

        lakehouses = [
            i
            for i in items
            if i.get("type") == "Lakehouse"
            and not str(i.get("displayName") or "").endswith("_Staging")
            and str(i.get("displayName") or "") != "lh_governly"
        ]
        models = [i for i in items if i.get("type") == "SemanticModel" and not str(i.get("displayName") or "").endswith("_Staging")]
        reports = [i for i in items if i.get("type") == "Report"]
        pipelines = [i for i in items if i.get("type") == "DataPipeline"]
        notebooks = [
            i
            for i in items
            if i.get("type") == "Notebook"
            and not str(i.get("displayName") or "").startswith("nb_governly_")
        ]
        ai_items = [i for i in items if i.get("type") in ("DataAgent", "MLModel", "MLExperiment")]

        ws_domains_seen: dict[str, str] = {}
        table_schemas_by_short: dict[str, list[tuple[str, str, list[tuple[str, str]]]]] = {}

        for lh in lakehouses:
            lh_id = lh["id"]
            lh_name = lh.get("displayName") or "lakehouse"
            lh_prefix = lh_name.lower().replace("_lakehouse", "").replace("lh_", "").replace(" ", "_")
            d_key = (
                lh_prefix
                if lh_prefix
                in (
                    "bronze",
                    "silver",
                    "gold",
                    "landing",
                    "base",
                    "curated",
                    "finance",
                    "sales",
                    "customer",
                    "governly_insights",
                )
                else ("bronze" if "bronze" in lh_prefix else "analytics")
            )
            d_name = d_key.replace("_", " ").title()
            ws_domains_seen[d_key] = d_name
            item_url = f"https://app.fabric.microsoft.com/groups/{wid}/lakehouses/{lh_id}"

            lh_tables = _list_onelake_delta_tables(spark, wid, lh_id, storage_token)
            if not lh_tables:
                # Capacity may be paused/inactive on cross-capacity Lakehouses; register Lakehouse item metadata
                lh_asset_key = f"lakehouse.{lh_prefix}"
                cap_ok = bool(w.get("capacity_active", True))
                assets.append({
                    "workspace_id": wid,
                    "asset_key": lh_asset_key,
                    "name": lh_name,
                    "asset_type": "Lakehouse",
                    "domain_key": d_key,
                    "steward_object_id": ws_steward_id,
                    "steward_name": ws_steward_name,
                    "status": "healthy" if cap_ok else "warning",
                    "health_score": 98.0 if cap_ok else 88.0,
                    "quality_score": 100.0,
                    "freshness_label": "Active" if cap_ok else "Capacity paused",
                    "is_late": not cap_ok,
                    "last_refresh_at": now_iso,
                    "freshness_sla_minutes": 1440,
                    "row_count": None,
                    "row_count_label": "Lakehouse",
                    "quality_pass": 0,
                    "quality_total": 0,
                    "fabric_item_url": item_url,
                })

            for schema_name, table_name, abfss_path in lh_tables:
                if table_name.lower() in INTERNAL_STAGING_TABLES:
                    continue
                asset_key = f"{lh_prefix}.{table_name}" if schema_name == "dbo" else f"{lh_prefix}.{schema_name}.{table_name}"
                try:
                    df = spark.read.format("delta").load(abfss_path)
                    row_count = int(df.count())
                    fields = list(df.schema.fields)
                except Exception:
                    continue

                col_tuples: list[tuple[str, str]] = []
                for idx, f in enumerate(fields, start=1):
                    cname = f.name
                    dtype = f.dataType.simpleString().upper()
                    col_tuples.append((cname, dtype))
                    clower = cname.lower()
                    is_pk = idx == 1 and (clower.endswith("_key") or clower.endswith("_id") or clower == "id")
                    is_fk = not is_pk and (clower.endswith("_key") or clower.endswith("_id"))
                    columns.append({
                        "workspace_id": wid,
                        "asset_key": asset_key,
                        "column_name": cname,
                        "data_type": dtype,
                        "ordinal": idx,
                        "is_pk": is_pk,
                        "is_fk": is_fk,
                        "change_tag": None,
                    })
                table_schemas_by_short.setdefault(table_name.lower(), []).append((asset_key, lh_prefix, col_tuples))

                commits: list[dict] = []
                try:
                    for h in spark.sql(f"DESCRIBE HISTORY delta.`{abfss_path}`").limit(8).collect():
                        hd = h.asDict(recursive=True)
                        ts_val = hd.get("timestamp")
                        ts_iso = ts_val.astimezone(timezone.utc).replace(microsecond=0).isoformat() if isinstance(ts_val, datetime) else now_iso
                        metrics = hd.get("operationMetrics") or {}
                        commits.append({
                            "version": int(hd.get("version") or 0),
                            "ts": ts_iso,
                            "user": str(hd.get("userName") or ws_steward_name),
                            "rows": int(metrics.get("numOutputRows") or row_count),
                        })
                except Exception:
                    commits = [{"version": 0, "ts": now_iso, "user": ws_steward_name, "rows": row_count}]

                latest_iso = commits[0]["ts"] if commits else now_iso
                try:
                    latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00"))
                except Exception:
                    latest_dt = now_dt
                lag_min = max(1.0, round((now_dt - latest_dt).total_seconds() / 60.0, 1))
                sla_rules = [
                    ur
                    for ur in (custom_rules or [])
                    if str(ur.get("rule_type") or "") == "freshness_sla"
                    and (not ur.get("workspace_id") or ur["workspace_id"] == wid or ur["workspace_id"] == "all")
                ]
                custom_sla_min: int | None = None
                for target_k in (asset_key, table_name, f"domain:{d_key}", "*"):
                    matched_sla = next(
                        (int(float(r["threshold_pct"])) for r in sla_rules if r.get("asset_key") == target_k and float(r.get("threshold_pct") or 0) > 0),
                        None,
                    )
                    if matched_sla is not None:
                        custom_sla_min = matched_sla
                        break
                sla_min = custom_sla_min if custom_sla_min is not None else (1440 if ("dimension" in table_name.lower() or "dq_" in table_name.lower()) else 720)
                is_late = (lag_min > sla_min) if custom_sla_min is not None else (lag_min > sla_min and ("fact_" in table_name.lower() or "sale" in table_name.lower()))

                for c_idx, c in enumerate(commits[:5]):
                    try:
                        c_dt = datetime.fromisoformat(str(c["ts"]).replace("Z", "+00:00"))
                        prev_ts = commits[c_idx + 1]["ts"] if c_idx + 1 < len(commits) else None
                        if prev_ts:
                            prev_dt = datetime.fromisoformat(str(prev_ts).replace("Z", "+00:00"))
                            commit_lag = max(1.0, round((c_dt - prev_dt).total_seconds() / 60.0, 1))
                        else:
                            commit_lag = lag_min
                    except Exception:
                        commit_lag = lag_min
                    runs.append({
                        "workspace_id": wid,
                        "run_id": f"{asset_key}-v{c['version']}-{c_idx}",
                        "asset_key": asset_key,
                        "ended_at": c["ts"],
                        "status": "late" if (c_idx == 0 and is_late) else "succeeded",
                        "lag_minutes": lag_min if c_idx == 0 else commit_lag,
                        "rows_processed": c["rows"],
                    })
                    lags.append({
                        "workspace_id": wid,
                        "asset_key": asset_key,
                        "range": "6h",
                        "ts": c["ts"],
                        "lag_minutes": lag_min if c_idx == 0 else commit_lag,
                    })
                lags.append({
                    "workspace_id": wid,
                    "asset_key": asset_key,
                    "range": "6h",
                    "ts": now_iso,
                    "lag_minutes": lag_min,
                })

                asset_q: list[dict] = []
                pk_col = fields[0].name if fields else None
                commit_ver = commits[0]["version"] if commits else 0
                commit_ts = commits[0]["ts"] if commits else now_iso

                def _row_to_json_and_pk(r_obj: Any, idx_fallback: int) -> tuple[str, str, dict]:
                    rd = r_obj.asDict(recursive=True) if hasattr(r_obj, "asDict") else dict(r_obj)
                    clean: dict[str, Any] = {}
                    for k, v in list(rd.items())[:18]:
                        if isinstance(v, (int, float, bool)) or v is None:
                            clean[str(k)] = v
                        else:
                            clean[str(k)] = str(v)[:120]
                    pk_val = clean.get(pk_col) if pk_col else None
                    pk_str = f"{pk_col}={pk_val}" if pk_col and pk_val is not None else f"row#{idx_fallback}"
                    return pk_str[:120], json.dumps(clean)[:1900], clean

                matching_user_rules = [
                    ur
                    for ur in (custom_rules or [])
                    if str(ur.get("rule_type") or "") != "freshness_sla"
                    and (not ur.get("workspace_id") or ur["workspace_id"] == wid or ur["workspace_id"] == "all")
                    and ur.get("asset_key") in (asset_key, table_name, "*")
                ]
                for ur in matching_user_rules:
                    expr = str(ur.get("expression") or "").strip()
                    thresh = float(ur.get("threshold_pct") or 100.0)
                    rtype = str(ur.get("rule_type") or "sql_predicate")
                    if not expr:
                        continue
                    try:
                        if row_count == 0:
                            pass_pct = 100.0
                        elif rtype == "unique":
                            col_ident = expr.split()[0]
                            dist_rows = int(df.select(col_ident).distinct().count())
                            pass_pct = round((dist_rows / row_count) * 100.0, 2)
                        else:
                            passed_rows = int(df.filter(expr).count())
                            pass_pct = round((passed_rows / row_count) * 100.0, 2)
                        passed_ur = pass_pct >= thresh
                        obs_label = f"{pass_pct:.1f}% pass"
                        if pass_pct < 100.0 and row_count > 0:
                            col_guess = expr.split()[0] if expr.split() else (pk_col or "expr")
                            if rtype == "unique":
                                dup_keys_df = df.groupBy(col_guess).count().filter("count > 1").limit(8)
                                dup_counts = {
                                    r.asDict()[col_guess]: int(r.asDict()["count"])
                                    for r in dup_keys_df.collect()
                                }
                                order_col = fields[-1].name if len(fields) > 1 else col_guess
                                dup_rows_df = (
                                    df.join(dup_keys_df.select(col_guess), on=col_guess, how="inner").limit(12)
                                    if dup_counts
                                    else df.limit(8)
                                )
                                for r_idx, r_obj in enumerate(dup_rows_df.collect(), start=1):
                                    pk_label, r_json, clean_d = _row_to_json_and_pk(r_obj, r_idx)
                                    kv = clean_d.get(col_guess)
                                    cnt_val = dup_counts.get(kv, 2)
                                    failed_rows.append({
                                        "workspace_id": wid,
                                        "asset_key": asset_key,
                                        "rule_name": ur["rule_name"][:64],
                                        "rule_definition": f"COUNT(DISTINCT {col_guess}) / COUNT(*)"[:128],
                                        "primary_key": f"{pk_label} (#{r_idx})"[:120],
                                        "failed_column": col_guess[:120],
                                        "failed_value": f"{kv} ({cnt_val}x duplicate)"[:200],
                                        "row_json": r_json,
                                        "likely_cause": (
                                            f"Key '{col_guess} = {kv}' appears {cnt_val} times in {asset_key} "
                                            f"(last updated in Delta commit v{commit_ver} at {commit_ts}). "
                                            f"SCD Type 2 history or incremental append loaded multiple versions of the same entity without deduplicating on {col_guess}."
                                        ),
                                        "suggested_solution": (
                                            f"1. Deduplicate {asset_key} using ROW_NUMBER() OVER (PARTITION BY {col_guess} ORDER BY {order_col} DESC) = 1.\n"
                                            f"2. Update the upstream Spark write from mode('append') to Delta MERGE INTO on {col_guess}."
                                        ),
                                        "sql_fix": (
                                            f"-- Deduplicate {asset_key} keeping latest record per {col_guess}\n"
                                            f"WITH ranked AS (\n"
                                            f"  SELECT *, ROW_NUMBER() OVER (PARTITION BY {col_guess} ORDER BY {order_col} DESC) AS _rn\n"
                                            f"  FROM {asset_key}\n"
                                            f"  WHERE {col_guess} = '{kv}'\n"
                                            f")\n"
                                            f"SELECT * FROM ranked WHERE _rn = 1;"
                                        ),
                                        "detected_at": now_iso,
                                    })
                            else:
                                viol_df = df.filter(f"NOT ({expr}) OR ({expr}) IS NULL").limit(12)
                                for r_idx, r_obj in enumerate(viol_df.collect(), start=1):
                                    pk_label, r_json, clean_d = _row_to_json_and_pk(r_obj, r_idx)
                                    f_val = str(clean_d.get(col_guess, "NULL / Invalid"))[:200]
                                    failed_rows.append({
                                        "workspace_id": wid,
                                        "asset_key": asset_key,
                                        "rule_name": ur["rule_name"][:64],
                                        "rule_definition": expr[:128],
                                        "primary_key": f"{pk_label} (ur#{r_idx})"[:120],
                                        "failed_column": col_guess[:120],
                                        "failed_value": f_val,
                                        "row_json": r_json,
                                        "likely_cause": (
                                            f"Record {pk_label} in {asset_key} violated rule '{ur['rule_name']}' "
                                            f"({expr}) with {col_guess} = {f_val} (Delta commit v{commit_ver} at {commit_ts})."
                                        ),
                                        "suggested_solution": (
                                            f"1. Correct {col_guess} on {pk_label} in {asset_key} so it satisfies ({expr}).\n"
                                            f"2. Enforce WHERE {expr} in the upstream ingestion pipeline."
                                        ),
                                        "sql_fix": (
                                            f"-- Query rows violating '{ur['rule_name']}' on {asset_key}\n"
                                            f"SELECT * FROM {asset_key}\n"
                                            f"WHERE NOT ({expr}) OR ({expr}) IS NULL;"
                                        ),
                                        "detected_at": now_iso,
                                    })
                    except Exception:
                        pass_pct = 0.0
                        passed_ur = False
                        obs_label = "Rule eval error"
                    asset_q.append({
                        "workspace_id": wid,
                        "monitor_key": f"{asset_key}:user_{ur['id'][:8]}",
                        "asset_key": asset_key,
                        "rule_name": ur["rule_name"],
                        "definition": expr[:128],
                        "passed": passed_ur,
                        "pass_rate": pass_pct,
                        "observed_label": obs_label,
                    })

                quality.extend(asset_q)
                q_total = len(asset_q)
                q_pass = sum(1 for r in asset_q if r["passed"])
                q_score = round(sum(float(r["pass_rate"]) for r in asset_q) / q_total, 1) if q_total else -1.0
                failed_q = [r for r in asset_q if not r["passed"] and r["rule_name"] != "Freshness SLA"]

                if (is_late and failed_q) or (q_score >= 0.0 and q_score < 75.0):
                    status = "critical"
                elif is_late or failed_q or (q_score >= 0.0 and q_score < 95.0):
                    status = "warning"
                else:
                    status = "healthy"
                base_health = q_score if q_score >= 0.0 else 100.0
                health_score = round(max(25.0, base_health - (15.0 if is_late else 0.0)), 1)

                assets.append({
                    "workspace_id": wid,
                    "asset_key": asset_key,
                    "name": asset_key,
                    "asset_type": "Lakehouse table",
                    "domain_key": d_key,
                    "steward_object_id": ws_steward_id,
                    "steward_name": ws_steward_name,
                    "status": status,
                    "health_score": health_score,
                    "quality_score": q_score,
                    "freshness_label": f"{format_lag_minutes(lag_min)} ago",
                    "is_late": is_late,
                    "last_refresh_at": latest_iso,
                    "freshness_sla_minutes": sla_min,
                    "row_count": row_count,
                    "row_count_label": format_row_count(row_count),
                    "quality_pass": q_pass,
                    "quality_total": q_total,
                    "fabric_item_url": item_url,
                })

                if is_late:
                    inc_num = 1000 + (abs(hash(f"{wid}:{asset_key}:fresh")) % 8999)
                    incidents.append({
                        "workspace_id": wid,
                        "incident_key": f"INC-{inc_num}",
                        "asset_key": asset_key,
                        "asset_name": asset_key,
                        "monitor_type": "Freshness",
                        "monitor_label": f"Freshness · {d_name}",
                        "severity": "High",
                        "title": f"Freshness SLA breached on {asset_key}",
                        "root_cause_hint": f"Table {asset_key} last updated {format_lag_minutes(lag_min)} ago vs SLA target of {format_lag_minutes(float(sla_min))}.",
                        "detected_at": now_iso,
                        "sla_target_label": format_lag_minutes(float(sla_min)),
                        "observed_label": format_lag_minutes(lag_min),
                        "domain_key": d_key,
                    })
                if failed_q or (q_score >= 0.0 and q_score < 95.0):
                    first_fail = failed_q[0] if failed_q else {"rule_name": "Quality threshold", "observed_label": f"{q_score:.1f}%"}
                    inc_num = 1000 + (abs(hash(f"{wid}:{asset_key}:qual")) % 8999)
                    incidents.append({
                        "workspace_id": wid,
                        "incident_key": f"INC-{inc_num}",
                        "asset_key": asset_key,
                        "asset_name": asset_key,
                        "monitor_type": "Quality",
                        "monitor_label": f"Quality · {d_name}",
                        "severity": "Critical" if q_score < 75.0 else "High",
                        "title": f"Quality check failed: {first_fail['rule_name']}",
                        "root_cause_hint": f"{len(failed_q)} of {q_total} quality checks failed on {asset_key} (score {q_score:.1f}%).",
                        "detected_at": now_iso,
                        "sla_target_label": ">= 95.0%",
                        "observed_label": str(first_fail.get("observed_label") or f"{q_score:.1f}%"),
                        "domain_key": d_key,
                    })

        for short_name, versions in table_schemas_by_short.items():
            if len(versions) >= 2:
                up_key, _, up_cols = versions[0]
                down_key, _, down_cols = versions[-1]
                edges.append({
                    "workspace_id": wid,
                    "upstream_asset_key": up_key,
                    "downstream_asset_key": down_key,
                    "hops": 1,
                })
                up_map = dict(up_cols)
                down_map = dict(down_cols)
                for col_name, dtype in down_cols:
                    if col_name not in up_map:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": f"{down_key}:add:{col_name}",
                            "asset_key": down_key,
                            "column_name": col_name,
                            "change_kind": "added",
                            "detail": f"Added {dtype}",
                            "is_breaking": False,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })
                    elif up_map[col_name] != dtype:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": f"{down_key}:mod:{col_name}",
                            "asset_key": down_key,
                            "column_name": col_name,
                            "change_kind": "changed",
                            "detail": f"{up_map[col_name]} -> {dtype}",
                            "is_breaking": True,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })
                for col_name, dtype in up_cols:
                    if col_name not in down_map:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": f"{down_key}:drop:{col_name}",
                            "asset_key": down_key,
                            "column_name": col_name,
                            "change_kind": "dropped",
                            "detail": f"Dropped {dtype} from upstream {up_key}",
                            "is_breaking": True,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })

        # Also compare each table's current schema against prior stored dbo.[PubAssetColumns] snapshot
        if prior_columns:
            curr_cols_by_asset: dict[str, list[tuple[str, str]]] = {}
            for col_row in columns:
                if col_row["workspace_id"] == wid:
                    curr_cols_by_asset.setdefault(col_row["asset_key"], []).append(
                        (col_row["column_name"], col_row["data_type"])
                    )
            existing_change_ids = {sc["change_id"] for sc in schema_changes if sc["workspace_id"] == wid}
            for akey, curr_list in curr_cols_by_asset.items():
                prev_list = prior_columns.get((wid, akey))
                if not prev_list:
                    continue
                prev_map = dict(prev_list)
                curr_map = dict(curr_list)
                for col_name, dtype in curr_list:
                    cid_add = f"{akey}:hist_add:{col_name}"
                    cid_mod = f"{akey}:hist_mod:{col_name}"
                    if col_name not in prev_map and cid_add not in existing_change_ids:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": cid_add,
                            "asset_key": akey,
                            "column_name": col_name,
                            "change_kind": "added",
                            "detail": f"Added {dtype} since prior snapshot",
                            "is_breaking": False,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })
                    elif col_name in prev_map and prev_map[col_name] != dtype and cid_mod not in existing_change_ids:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": cid_mod,
                            "asset_key": akey,
                            "column_name": col_name,
                            "change_kind": "changed",
                            "detail": f"{prev_map[col_name]} -> {dtype}",
                            "is_breaking": True,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })
                for col_name, dtype in prev_list:
                    cid_drop = f"{akey}:hist_drop:{col_name}"
                    if col_name not in curr_map and cid_drop not in existing_change_ids:
                        schema_changes.append({
                            "workspace_id": wid,
                            "change_id": cid_drop,
                            "asset_key": akey,
                            "column_name": col_name,
                            "change_kind": "dropped",
                            "detail": f"Dropped {dtype} since prior snapshot",
                            "is_breaking": True,
                            "changed_at": now_iso,
                            "changed_by": ws_steward_name,
                        })

        ws_changes = [sc for sc in schema_changes if sc["workspace_id"] == wid]
        for sc in ws_changes:
            for col_row in columns:
                if (
                    col_row["workspace_id"] == wid
                    and col_row["asset_key"] == sc["asset_key"]
                    and col_row["column_name"] == sc["column_name"]
                ):
                    col_row["change_tag"] = sc["change_kind"]
            if sc.get("is_breaking"):
                inc_num = 1000 + (abs(hash(f"{wid}:{sc['change_id']}:schema")) % 8999)
                incidents.append({
                    "workspace_id": wid,
                    "incident_key": f"INC-{inc_num}",
                    "asset_key": sc["asset_key"],
                    "asset_name": sc["asset_key"],
                    "monitor_type": "Schema",
                    "monitor_label": "Schema drift",
                    "severity": "High",
                    "title": f"Breaking schema drift on {sc['asset_key']}.{sc['column_name']}",
                    "root_cause_hint": f"Column {sc['column_name']} ({sc['change_kind']}): {sc['detail']}.",
                    "detected_at": now_iso,
                    "sla_target_label": "0 breaking changes",
                    "observed_label": f"{sc['change_kind']}: {sc['column_name']}",
                    "domain_key": sc["asset_key"].split(".")[0],
                })

        ws_tables = [a for a in assets if a["workspace_id"] == wid and a["asset_type"] == "Lakehouse table"]
        dim_keys = [a["asset_key"] for a in ws_tables if "dimension" in a["asset_key"].lower()]
        fact_keys = [a["asset_key"] for a in ws_tables if "fact" in a["asset_key"].lower()]
        for dk in dim_keys:
            for fk in fact_keys:
                edges.append({
                    "workspace_id": wid,
                    "upstream_asset_key": dk,
                    "downstream_asset_key": fk,
                    "hops": 1,
                })

        for sm in models:
            sm_key = str(sm.get("displayName") or sm["id"]).lower().replace(" ", "_")
            ws_domains_seen.setdefault("bi", "BI & Analytics")
            sm_prof = _profile_fabric_item_jobs(
                wid, str(sm["id"]), sm_key, 1440, now_dt, now_iso, fabric_token
            )
            runs.extend(sm_prof["runs"])
            lags.extend(sm_prof["lags"])
            assets.append({
                "workspace_id": wid,
                "asset_key": sm_key,
                "name": sm.get("displayName") or sm_key,
                "asset_type": "Semantic model",
                "domain_key": "bi",
                "steward_object_id": ws_steward_id,
                "steward_name": ws_steward_name,
                "status": sm_prof["status"],
                "health_score": sm_prof["health_score"],
                "quality_score": -1.0,
                "freshness_label": sm_prof["freshness_label"],
                "is_late": sm_prof["is_late"],
                "last_refresh_at": sm_prof["last_refresh_at"],
                "freshness_sla_minutes": 1440,
                "row_count": None,
                "row_count_label": "Model",
                "quality_pass": 0,
                "quality_total": 0,
                "fabric_item_url": f"https://app.fabric.microsoft.com/groups/{wid}/datasets/{sm['id']}",
            })
            for fk in (fact_keys or [a["asset_key"] for a in ws_tables[:2]]):
                edges.append({
                    "workspace_id": wid,
                    "upstream_asset_key": fk,
                    "downstream_asset_key": sm_key,
                    "hops": 1,
                })
            for rpt in reports:
                edges.append({
                    "workspace_id": wid,
                    "upstream_asset_key": sm_key,
                    "downstream_asset_key": str(rpt.get("displayName") or rpt["id"]),
                    "downstream_name": str(rpt.get("displayName") or rpt["id"]),
                    "downstream_type": "Power BI report",
                    "hops": 1,
                })

        for pl in pipelines:
            pl_key = str(pl.get("displayName") or pl["id"]).lower().replace(" ", "_")
            ws_domains_seen.setdefault("engineering", "Data Engineering")
            pl_prof = _profile_fabric_item_jobs(
                wid, str(pl["id"]), pl_key, 360, now_dt, now_iso, fabric_token
            )
            runs.extend(pl_prof["runs"])
            lags.extend(pl_prof["lags"])
            assets.append({
                "workspace_id": wid,
                "asset_key": pl_key,
                "name": pl.get("displayName") or pl_key,
                "asset_type": "Data pipeline",
                "domain_key": "engineering",
                "steward_object_id": ws_steward_id,
                "steward_name": ws_steward_name,
                "status": pl_prof["status"],
                "health_score": pl_prof["health_score"],
                "quality_score": -1.0,
                "freshness_label": pl_prof["freshness_label"],
                "is_late": pl_prof["is_late"],
                "last_refresh_at": pl_prof["last_refresh_at"],
                "freshness_sla_minutes": 360,
                "row_count": None,
                "row_count_label": "Pipeline",
                "quality_pass": 0,
                "quality_total": 0,
                "fabric_item_url": f"https://app.fabric.microsoft.com/groups/{wid}/pipelines/{pl['id']}",
            })

        for nb in notebooks:
            nb_name = str(nb.get("displayName") or nb["id"])
            nb_key = f"notebook.{nb_name.lower().replace(' ', '_')}"
            ws_domains_seen.setdefault("engineering", "Data Engineering")
            nb_prof = _profile_fabric_item_jobs(
                wid, str(nb["id"]), nb_key, 1440, now_dt, now_iso, fabric_token
            )
            runs.extend(nb_prof["runs"])
            lags.extend(nb_prof["lags"])
            assets.append({
                "workspace_id": wid,
                "asset_key": nb_key,
                "name": nb_name,
                "asset_type": "Spark notebook",
                "domain_key": "engineering",
                "steward_object_id": ws_steward_id,
                "steward_name": ws_steward_name,
                "status": nb_prof["status"],
                "health_score": nb_prof["health_score"],
                "quality_score": -1.0,
                "freshness_label": nb_prof["freshness_label"],
                "is_late": nb_prof["is_late"],
                "last_refresh_at": nb_prof["last_refresh_at"],
                "freshness_sla_minutes": 1440,
                "row_count": None,
                "row_count_label": "PySpark",
                "quality_pass": 0,
                "quality_total": 0,
                "fabric_item_url": f"https://app.fabric.microsoft.com/groups/{wid}/synapsenotebooks/{nb['id']}",
            })

        for ai in ai_items:
            ai_name = str(ai.get("displayName") or ai["id"])
            ai_type = str(ai.get("type") or "DataAgent")
            ai_key = f"{ai_type.lower()}.{ai_name.lower().replace(' ', '_')}"
            ws_domains_seen.setdefault("ai_ml", "AI & ML")
            assets.append({
                "workspace_id": wid,
                "asset_key": ai_key,
                "name": ai_name,
                "asset_type": ai_type,
                "domain_key": "ai_ml",
                "steward_object_id": ws_steward_id,
                "steward_name": ws_steward_name,
                "status": "healthy",
                "health_score": 99.0,
                "quality_score": -1.0,
                "freshness_label": "Active",
                "is_late": False,
                "last_refresh_at": now_iso,
                "freshness_sla_minutes": 1440,
                "row_count": None,
                "row_count_label": ai_type,
                "quality_pass": 0,
                "quality_total": 0,
                "fabric_item_url": f"https://app.fabric.microsoft.com/groups/{wid}",
            })

        if not ws_domains_seen:
            ws_domains_seen["platform"] = "Platform"
        for d_key, d_name in ws_domains_seen.items():
            domains.append({
                "workspace_id": wid,
                "domain_key": d_key,
                "name": d_name,
                "lead_steward_object_id": ws_steward_id,
            })

    ws_with_assets = {a["workspace_id"] for a in assets}
    workspaces.sort(key=lambda w: (0 if w["workspace_id"] in ws_with_assets else 1, w["name"]))

    return {
        "workspaces": workspaces,
        "access": access_rows,
        "users": list(users_by_id.values()),
        "groups": list(groups_by_id.values()),
        "members": member_rows,
        "domains": domains,
        "assets": assets,
        "runs": runs,
        "lags": lags,
        "quality": quality,
        "failed_rows": failed_rows,
        "columns": columns,
        "schema_changes": schema_changes,
        "edges": edges,
        "incidents": incidents,
    }


# %%
if "spark" in globals() and APP_SQL_SERVER and APP_SQL_DATABASE:
    started_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    run_id = str(uuid.uuid4())
    sql_token = get_runtime_token(
        "https://database.windows.net/.default",
        TENANT_ID,
        CLIENT_ID,
        KEY_VAULT_URI,
        SECRET_NAME,
    )

    # Always run live zero-plumbing discovery & OneLake Delta profiling
    fabric_token = get_runtime_token(
        "https://api.fabric.microsoft.com/.default",
        TENANT_ID,
        CLIENT_ID,
        KEY_VAULT_URI,
        SECRET_NAME,
    )
    try:
        storage_token = get_runtime_token(
            "https://storage.azure.com/.default",
            TENANT_ID,
            CLIENT_ID,
            KEY_VAULT_URI,
            SECRET_NAME,
        )
    except Exception:
        storage_token = ""
    rules_conn = open_fabric_sql_jdbc(spark, APP_SQL_SERVER, APP_SQL_DATABASE, sql_token)
    try:
        user_quality_rules = read_custom_quality_rules(rules_conn)
        prior_real_buckets = read_existing_real_buckets(rules_conn)
        prior_columns = read_existing_pub_columns(rules_conn)
    finally:
        rules_conn.close()
    live = discover_and_profile_live_fabric(
        spark,
        fabric_token,
        started_at,
        user_quality_rules,
        storage_token,
        prior_columns,
    )
    lh_workspaces = live["workspaces"]
    lh_access = live["access"]
    lh_users = live["users"]
    lh_groups = live["groups"]
    lh_members = live["members"]
    lh_domains = live["domains"]
    lh_assets = live["assets"]
    lh_runs = live["runs"]
    lh_lags = live["lags"]
    lh_quality = live["quality"]
    lh_failed_rows = live.get("failed_rows", [])
    lh_columns = live["columns"]
    lh_schema_changes = live["schema_changes"]
    lh_edges = live["edges"]
    lh_incidents = live["incidents"]

    domain_names = {
        (d["workspace_id"], d["domain_key"]): d["name"]
        for d in lh_domains
    }
    assets_by_ws_and_key = {
        (a["workspace_id"], a["asset_key"]): a
        for a in lh_assets
    }

    pub_workspaces = [
        {
            "id": stable_uuid("pub_workspace", w["workspace_id"]),
            "workspace_id": w["workspace_id"],
            "display_name": w["name"],
            "capacity_sku": w.get("capacity_sku") or "F2",
            "is_monitored": bool(w.get("is_monitored", True)),
            "published_at": started_at,
        }
        for w in lh_workspaces
    ]

    pub_access = [
        {
            "id": stable_uuid("pub_access", a["workspace_id"], a["object_id"]),
            "workspace_id": a["workspace_id"],
            "object_id": a["object_id"],
            "effective_role": a["effective_role"],
            "via": a.get("via") or "direct",
            "published_at": started_at,
        }
        for a in lh_access
    ]

    pub_users = [
        {
            "id": stable_uuid("pub_user", u["object_id"]),
            "object_id": u["object_id"],
            "upn": u["upn"],
            "display_name": u["display_name"],
            "job_title": u.get("job_title"),
            "department": u.get("department"),
            "is_active": bool(u.get("is_active", True)),
            "is_synthetic": bool(u.get("is_synthetic", False)),
            "published_at": started_at,
        }
        for u in lh_users
    ]

    groups_by_id = {g["group_id"]: g for g in lh_groups}
    pub_roles_map: dict[tuple[str, str, str], dict] = {}
    for m in lh_members:
        if not m.get("is_active", True):
            continue
        g = groups_by_id.get(m["group_id"])
        if not g:
            continue
        rname = g.get("role") or "steward"
        dkey = g.get("domain_key")
        key_tuple = (m["object_id"], rname, dkey or "")
        pub_roles_map[key_tuple] = {
            "id": stable_uuid("pub_role", m["object_id"], rname, dkey or "all"),
            "object_id": m["object_id"],
            "role": rname,
            "domain_key": dkey,
            "published_at": started_at,
        }
    pub_roles = list(pub_roles_map.values())

    pub_domains = [
        {
            "id": stable_uuid("pub_domain", d["workspace_id"], d["domain_key"]),
            "workspace_id": d["workspace_id"],
            "domain_key": d["domain_key"],
            "name": d["name"],
            "lead_steward_object_id": d["lead_steward_object_id"],
            "published_at": started_at,
        }
        for d in lh_domains
    ]

    pub_assets = [
        {
            "id": stable_uuid("pub_asset", a["workspace_id"], a["asset_key"]),
            "workspace_id": a["workspace_id"],
            "asset_key": a["asset_key"],
            "name": a["name"],
            "asset_type": a["asset_type"],
            "domain_key": a["domain_key"],
            "domain_name": domain_names.get((a["workspace_id"], a["domain_key"]), a["domain_key"].title()),
            "owner_object_id": a["steward_object_id"],
            "owner_name": a["steward_name"],
            "status": a["status"],
            "health_score": float(a.get("health_score") or 95.0),
            "quality_score": float(a.get("quality_score") if a.get("quality_score") is not None else -1.0),
            "freshness_label": a.get("freshness_label") or "Active",
            "is_late": bool(a.get("is_late", False)),
            "last_refresh_at": a.get("last_refresh_at") or started_at,
            "sla_minutes": int(a.get("freshness_sla_minutes") or 60),
            "row_count_label": a.get("row_count_label") or format_row_count(a.get("row_count")),
            "quality_pass": int(a.get("quality_pass") or 0),
            "quality_total": int(a.get("quality_total") or 0),
            "fabric_item_url": a.get("fabric_item_url"),
            "published_at": started_at,
        }
        for a in lh_assets
    ]

    pub_lags = [
        {
            "id": stable_uuid("pub_lag", lp["workspace_id"], lp["asset_key"], lp["range"], lp["ts"]),
            "workspace_id": lp["workspace_id"],
            "asset_key": lp["asset_key"],
            "range": lp["range"],
            "ts": lp["ts"],
            "lag_minutes": float(lp["lag_minutes"]),
            "published_at": started_at,
        }
        for lp in lh_lags
    ]

    pub_runs = []
    for r in lh_runs:
        ended_str = str(r.get("ended_at") or started_at)
        try:
            ended_dt = datetime.fromisoformat(ended_str.replace("Z", "+00:00"))
            time_lbl = ended_dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            time_lbl = ended_str[:16]
        status_raw = str(r.get("status") or "succeeded").lower()
        res_code = "ok" if status_raw == "succeeded" else "breach"
        res_lbl = "On time" if res_code == "ok" else "SLA Breach"
        pub_runs.append({
            "id": stable_uuid("pub_run", r["workspace_id"], r["run_id"]),
            "workspace_id": r["workspace_id"],
            "run_id": r["run_id"],
            "asset_key": r["asset_key"],
            "completed_at": ended_str,
            "time_label": time_lbl,
            "lag_label": format_lag_minutes(float(r.get("lag_minutes") or 1.0)),
            "rows_label": format_row_count(r.get("rows_processed")),
            "result": res_code,
            "result_label": res_lbl,
            "published_at": started_at,
        })

    pub_quality = [
        {
            "id": stable_uuid("pub_quality", q["workspace_id"], q["monitor_key"]),
            "workspace_id": q["workspace_id"],
            "monitor_key": q["monitor_key"],
            "asset_key": q["asset_key"],
            "rule_name": q["rule_name"],
            "definition": q["definition"],
            "observed_label": q.get("observed_label") or f"{float(q.get('pass_rate') or 100.0):.1f}%",
            "result": "pass" if q.get("passed", True) else "fail",
            "published_at": started_at,
        }
        for q in lh_quality
    ]

    pub_failed_rows = [
        {
            "id": stable_uuid(
                "pub_failed_row",
                fr["workspace_id"],
                fr["asset_key"],
                fr["rule_name"],
                fr["primary_key"],
            ),
            "workspace_id": fr["workspace_id"],
            "asset_key": fr["asset_key"],
            "rule_name": fr["rule_name"][:64],
            "rule_definition": fr["rule_definition"][:128],
            "primary_key": fr["primary_key"][:128],
            "failed_column": fr["failed_column"][:128],
            "failed_value": fr["failed_value"][:256],
            "row_json": fr["row_json"][:2000],
            "likely_cause": fr["likely_cause"][:1000],
            "suggested_solution": fr["suggested_solution"][:1000],
            "sql_fix": fr["sql_fix"][:1000],
            "detected_at": fr.get("detected_at") or started_at,
        }
        for fr in lh_failed_rows
    ]

    pub_columns = [
        {
            "id": stable_uuid("pub_col", c["workspace_id"], c["asset_key"], c["column_name"]),
            "workspace_id": c["workspace_id"],
            "asset_key": c["asset_key"],
            "column_name": c["column_name"],
            "data_type": c["data_type"],
            "ordinal": int(c["ordinal"]),
            "is_pk": bool(c.get("is_pk", False)),
            "is_fk": bool(c.get("is_fk", False)),
            "change_tag": c.get("change_tag"),
            "published_at": started_at,
        }
        for c in lh_columns
    ]

    pub_schema_changes = [
        {
            "id": stable_uuid("pub_sc", sc["workspace_id"], sc["change_id"]),
            "workspace_id": sc["workspace_id"],
            "change_id": sc["change_id"],
            "asset_key": sc["asset_key"],
            "column_name": sc["column_name"],
            "change_kind": sc["change_kind"],
            "detail": sc["detail"],
            "is_breaking": bool(sc.get("is_breaking", False)),
            "changed_at": sc["changed_at"],
            "changed_by": sc["changed_by"],
            "published_at": started_at,
        }
        for sc in lh_schema_changes
    ]

    pub_edges: list[dict] = []
    for e in lh_edges:
        wid = e["workspace_id"]
        up_key = e["upstream_asset_key"]
        down_key = e["downstream_asset_key"]
        up_asset = assets_by_ws_and_key.get((wid, up_key), {})
        down_asset = assets_by_ws_and_key.get((wid, down_key), {})
        pub_edges.append({
            "id": stable_uuid("pub_edge", wid, up_key, down_key),
            "workspace_id": wid,
            "upstream_asset_key": up_key,
            "upstream_name": e.get("upstream_name") or up_asset.get("name") or up_key,
            "upstream_type": e.get("upstream_type") or up_asset.get("asset_type") or "Lakehouse table",
            "downstream_asset_key": down_key,
            "downstream_name": e.get("downstream_name") or down_asset.get("name") or down_key,
            "downstream_type": e.get("downstream_type") or down_asset.get("asset_type") or "Lakehouse table",
            "direction": "downstream",
            "hops": int(e.get("hops") or 1),
            "published_at": started_at,
        })

    pub_incidents = [
        {
            "id": stable_uuid("pub_inc", inc["workspace_id"], inc["incident_key"]),
            "workspace_id": inc["workspace_id"],
            "incident_key": inc["incident_key"],
            "asset_key": inc["asset_key"],
            "asset_name": inc.get("asset_name") or inc["asset_key"],
            "monitor_type": inc["monitor_type"],
            "monitor_label": inc["monitor_label"],
            "severity": str(inc["severity"]).lower(),
            "title": inc["title"],
            "summary": inc.get("root_cause_hint") or inc["title"],
            "detected_at": inc["detected_at"],
            "sla_target_label": inc.get("sla_target_label") or "<= 60m",
            "observed_label": inc.get("observed_label") or inc.get("detected_label") or "Breached",
            "domain_key": inc["domain_key"],
            "auto_resolved_at": inc.get("auto_resolved_at"),
            "published_at": started_at,
        }
        for inc in lh_incidents
    ]

    pub_impacts: list[dict] = []
    pub_distributions: list[dict] = []
    pub_kpis: list[dict] = []
    pub_buckets: list[dict] = []
    steward_cases: list[dict] = []
    case_links: list[dict] = []

    for w in lh_workspaces:
        wid = w["workspace_id"]
        ws_assets = [a for a in pub_assets if a["workspace_id"] == wid]
        healthy_cnt = sum(1 for a in ws_assets if a["status"] == "healthy")
        warn_cnt = sum(1 for a in ws_assets if a["status"] == "warning")
        crit_cnt = sum(1 for a in ws_assets if a["status"] == "critical")
        pub_distributions.append({
            "id": stable_uuid("pub_dist", wid),
            "workspace_id": wid,
            "healthy": healthy_cnt,
            "warning": warn_cnt,
            "critical": crit_cnt,
            "total": len(ws_assets),
            "published_at": started_at,
        })

        pub_impacts.extend(build_incident_impacts(wid, pub_incidents, pub_edges, started_at))

        ws_assets_by_key = {a["asset_key"]: a for a in ws_assets}
        ws_cases, ws_links = build_steward_cases(wid, pub_incidents, ws_assets_by_key, started_at)
        steward_cases.extend(ws_cases)
        case_links.extend(ws_links)

        for rkey in ("24h", "7d", "30d"):
            pub_kpis.extend(build_overview_kpis(wid, rkey, started_at, ws_assets, pub_incidents, ws_cases))
            pub_buckets.extend(
                build_health_buckets(
                    wid,
                    rkey,
                    started_at,
                    ws_assets,
                    pub_lags,
                    locals().get("prior_real_buckets"),
                )
            )

    jdbc_conn = open_fabric_sql_jdbc(spark, APP_SQL_SERVER, APP_SQL_DATABASE, sql_token)
    try:
        counts_by_table: dict[str, int] = {}
        payloads = [
            ("PubWorkspace", pub_workspaces),
            ("PubUserWorkspaceAccess", pub_access),
            ("PubEntraUser", pub_users),
            ("PubUserRole", pub_roles),
            ("PubDomain", pub_domains),
            ("PubOverviewKpi", pub_kpis),
            ("PubHealthBucket", pub_buckets),
            ("PubHealthDistribution", pub_distributions),
            ("PubAsset", pub_assets),
            ("PubAssetLagPoint", pub_lags),
            ("PubRefreshRun", pub_runs),
            ("PubQualityResult", pub_quality),
            ("PubQualityFailedRow", pub_failed_rows),
            ("PubAssetColumn", pub_columns),
            ("PubSchemaChange", pub_schema_changes),
            ("PubLineageEdge", pub_edges),
            ("PubIncident", pub_incidents),
            ("PubIncidentImpact", pub_impacts),
        ]
        for logical_name, rows in payloads:
            counts_by_table[logical_name] = replace_table_rows_jdbc(jdbc_conn, logical_name, rows, commit=False)

        # ReplaceCaseIncidentLinks before StewardCases due to FK constraint
        counts_by_table["CaseIncidentLink"] = replace_table_rows_jdbc(jdbc_conn, "CaseIncidentLink", [], commit=False)
        counts_by_table["StewardCase"] = replace_table_rows_jdbc(jdbc_conn, "StewardCase", steward_cases, commit=False)
        counts_by_table["CaseIncidentLink"] = replace_table_rows_jdbc(jdbc_conn, "CaseIncidentLink", case_links, commit=False)

        ended_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        counts_by_table["PubPublishRun"] = replace_table_rows_jdbc(
            jdbc_conn,
            "PubPublishRun",
            [{
                "id": stable_uuid("publish_run", run_id),
                "run_id": run_id,
                "started_at": started_at,
                "ended_at": ended_at,
                "rows_by_table": json.dumps(counts_by_table),
                "status": "Succeeded",
                "error": None,
            }],
            commit=True,
        )
    finally:
        jdbc_conn.close()

    print("Compute & publish completed:", json.dumps(counts_by_table, indent=2))
