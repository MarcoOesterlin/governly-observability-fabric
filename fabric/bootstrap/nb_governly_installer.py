# Fabric Notebook source
# ============================================================================
# Governly — Idempotent Single-Notebook Installer & Updater for Microsoft Fabric
# ============================================================================
# Import this notebook into ANY Microsoft Fabric workspace (attached to an F-SKU
# capacity) and click "Run All".
# - First run: Clones the Governly repository, provisions the Fabric SQL Database,
#   UserDataFunction, WebApp, 25 observability tables, deploys the Spark telemetry
#   notebook (`nb_governly_compute_publish`), triggers an immediate telemetry run,
#   and configures the recurring 36-minute schedule.
# - Subsequent runs (Updates): Pulls the latest repository changes, applies any
#   additive schema migrations, updates the WebApp and Spark notebook definitions
#   in-place without losing existing data or custom DQ rules, and triggers a fresh
#   telemetry sync.

# %% [markdown]
# # Governly — One-Click Fabric Installer & Updater
# Run all cells to install or update Governly in this Microsoft Fabric workspace.

# %% tags=["parameters"]
REPO_URL = "https://github.com/MarcoOesterlin/governly-observability-fabric.git"
REPO_BRANCH = "main"
WORKSPACE_ID = ""  # Leave blank to auto-detect current Fabric workspace
SCHEDULE_INTERVAL_MINUTES = 36
TRIGGER_INITIAL_RUN = True

# %%
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import json
import os
import platform
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
from typing import Any


def get_fabric_token() -> str:
    for mod_name in ("notebookutils", "mssparkutils"):
        try:
            mod = __import__(mod_name)
            return mod.credentials.getToken("https://api.fabric.microsoft.com")
        except Exception:
            continue
    raise RuntimeError("Could not acquire Fabric API token from notebookutils.credentials.")


def detect_workspace_id(override: str = "") -> str:
    if override and override.strip():
        return override.strip()
    for mod_name in ("notebookutils", "mssparkutils"):
        try:
            mod = __import__(mod_name)
            ctx = mod.runtime.context
            wid = ctx.get("currentWorkspaceId") if isinstance(ctx, dict) else getattr(ctx, "currentWorkspaceId", None)
            if wid:
                return str(wid)
        except Exception:
            continue
    try:
        from pyspark.sql import SparkSession
        spark = SparkSession.getActiveSession()
        if spark:
            wid = spark.conf.get("trident.workspace.id", "")
            if wid:
                return str(wid)
    except Exception:
        pass
    raise RuntimeError("Could not auto-detect WORKSPACE_ID; please set WORKSPACE_ID parameter.")


def fabric_request(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method.upper(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
            body = json.loads(raw) if raw.strip() else {}
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, body, headers
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Fabric API {method} {url} failed ({exc.code}): {err_body}") from exc


def wait_for_lro(location_url: str, token: str, timeout_sec: int = 300) -> dict[str, Any]:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        status_code, body, _ = fabric_request("GET", location_url, token)
        state = str(body.get("status") or "").lower()
        if state in ("succeeded", "completed"):
            return body
        if state in ("failed", "cancelled"):
            raise RuntimeError(f"Fabric LRO failed: {json.dumps(body)}")
        time.sleep(4)
    raise TimeoutError(f"Timed out waiting for Fabric operation {location_url}")


def extract_jwt_tid(token: str) -> str:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return ""
        payload = parts[1]
        padded = payload + "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        return str(claims.get("tid") or "")
    except Exception:
        return ""


def ensure_node_env(token: str, workspace_id: str) -> dict[str, str]:
    env = dict(os.environ)
    node_version = "v20.18.1"
    machine = platform.machine().lower()
    arch = "linux-arm64" if machine in ("aarch64", "arm64") else "linux-x64"
    portable_bin = f"/tmp/node-{node_version}-{arch}/bin"

    if os.path.isdir(portable_bin):
        env["PATH"] = f"{portable_bin}:{env.get('PATH', '')}"

    if not shutil.which("npm", path=env.get("PATH")):
        url = f"https://nodejs.org/dist/{node_version}/node-{node_version}-{arch}.tar.xz"
        tar_path = f"/tmp/node-{node_version}-{arch}.tar.xz"
        print(f"Node.js/npm not found in container PATH. Bootstrapping portable Node.js {node_version} ({arch})...")
        urllib.request.urlretrieve(url, tar_path)
        with tarfile.open(tar_path, "r:xz") as tar:
            tar.extractall("/tmp")
        env["PATH"] = f"{portable_bin}:{env.get('PATH', '')}"
        os.environ["PATH"] = env["PATH"]

    env["RAYFIN_TOKEN"] = token
    env["RAYFIN_WORKSPACE_ID"] = workspace_id
    tid = extract_jwt_tid(token)
    if tid:
        env["RAYFIN_TENANT_ID"] = tid
    env["RAYFIN_CONFIG_DIR"] = "/tmp/.rayfin"
    env["RAYFIN_TELEMETRY_OPTOUT"] = "1"
    env["CI"] = "1"
    return env


def run_cmd(cmd: list[str], cwd: str | None = None, env: dict[str, str] | None = None) -> None:
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if proc.stdout:
        print(proc.stdout)
    if proc.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed with exit code {proc.returncode}")


def ensure_node_and_repo(repo_url: str, branch: str, work_dir: str) -> str:
    if os.path.isdir(os.path.join(work_dir, ".git")):
        print(f"Updating existing repository clone in {work_dir}...")
        run_cmd(["git", "-C", work_dir, "fetch", "origin", branch])
        run_cmd(["git", "-C", work_dir, "reset", "--hard", f"origin/{branch}"])
    else:
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir)
        print(f"Cloning {repo_url} ({branch}) into {work_dir}...")
        run_cmd(["git", "clone", "--depth", "1", "-b", branch, repo_url, work_dir])
    return work_dir


def resolve_sql_endpoint_details(workspace_id: str, token: str) -> tuple[str, str]:
    _, items_resp, _ = fabric_request(
        "GET",
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items",
        token,
    )
    sql_items = [
        i for i in items_resp.get("value", [])
        if i.get("type") == "SQLDatabase"
    ]
    if not sql_items:
        raise RuntimeError("No SQLDatabase item found in workspace after Rayfin provisioning.")
    sql_id = sql_items[0]["id"]
    _, sql_detail, _ = fabric_request(
        "GET",
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/sqlDatabases/{sql_id}",
        token,
    )
    props = sql_detail.get("properties") or {}
    server_fqdn = str(props.get("serverFqdn") or "").split(",")[0].strip()
    db_name = str(props.get("databaseName") or "")
    if not server_fqdn or not db_name:
        raise RuntimeError(f"Could not read serverFqdn/databaseName from SQLDatabase {sql_id}: {sql_detail}")
    return server_fqdn, db_name


def upsert_compute_notebook(
    workspace_id: str,
    token: str,
    repo_dir: str,
    sql_server: str,
    sql_database: str,
) -> str:
    nb_name = "nb_governly_compute_publish"
    nb_path = os.path.join(repo_dir, "fabric", "notebooks", "nb_governly_compute_publish.ipynb")
    with open(nb_path, "r", encoding="utf-8") as f:
        nb_json = json.load(f)

    # Inject target workspace's SQL server and database into parameters cell
    for cell in nb_json.get("cells", []):
        if cell.get("cell_type") == "code":
            new_src = []
            for line in cell.get("source", []):
                if line.strip().startswith("APP_SQL_SERVER ="):
                    new_src.append(f'APP_SQL_SERVER = "{sql_server}"\n')
                elif line.strip().startswith("APP_SQL_DATABASE ="):
                    new_src.append(f'APP_SQL_DATABASE = "{sql_database}"\n')
                else:
                    new_src.append(line)
            cell["source"] = new_src

    b64_payload = base64.b64encode(json.dumps(nb_json, indent=1).encode("utf-8")).decode("ascii")
    definition = {
        "format": "ipynb",
        "parts": [
            {
                "path": "notebook-content.ipynb",
                "payload": b64_payload,
                "payloadType": "InlineBase64",
            }
        ],
    }

    _, items_resp, _ = fabric_request(
        "GET",
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items?type=Notebook",
        token,
    )
    existing = next(
        (i for i in items_resp.get("value", []) if i.get("displayName") == nb_name),
        None,
    )
    if existing:
        nb_id = existing["id"]
        print(f"Updating existing notebook {nb_name} ({nb_id})...")
        status, _, headers = fabric_request(
            "POST",
            f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items/{nb_id}/updateDefinition",
            token,
            {"definition": definition},
        )
        if status == 202 and headers.get("location"):
            wait_for_lro(headers["location"], token)
        return nb_id

    print(f"Creating notebook {nb_name} in workspace {workspace_id}...")
    status, body, headers = fabric_request(
        "POST",
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items",
        token,
        {
            "displayName": nb_name,
            "type": "Notebook",
            "definition": definition,
        },
    )
    if status == 202 and headers.get("location"):
        wait_for_lro(headers["location"], token)
        _, refreshed, _ = fabric_request(
            "GET",
            f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items?type=Notebook",
            token,
        )
        created = next(
            (i for i in refreshed.get("value", []) if i.get("displayName") == nb_name),
            None,
        )
        if created:
            return created["id"]
    return str(body.get("id") or "")


def ensure_notebook_schedule(
    workspace_id: str,
    notebook_id: str,
    token: str,
    interval_minutes: int = 36,
) -> None:
    sched_url = (
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}"
        f"/items/{notebook_id}/jobs/RunNotebook/schedules"
    )
    _, existing_resp, _ = fabric_request("GET", sched_url, token)
    schedules = existing_resp.get("value", [])
    now_utc = datetime.now(timezone.utc)
    start_str = (now_utc + timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_str = (now_utc + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
    config_payload = {
        "enabled": True,
        "configuration": {
            "type": "Cron",
            "startDateTime": start_str,
            "endDateTime": end_str,
            "localTimeZoneId": "UTC",
            "interval": interval_minutes,
        },
    }
    if schedules:
        sched_id = schedules[0]["id"]
        print(f"Schedule already exists ({sched_id}); ensuring enabled every {interval_minutes}m...")
        try:
            fabric_request("PATCH", f"{sched_url}/{sched_id}", token, config_payload)
        except Exception:
            pass
    else:
        print(f"Creating {interval_minutes}-minute recurring schedule on {notebook_id}...")
        fabric_request("POST", sched_url, token, config_payload)


def trigger_notebook_run(workspace_id: str, notebook_id: str, token: str) -> None:
    run_url = (
        f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}"
        f"/items/{notebook_id}/jobs/instances?jobType=RunNotebook"
    )
    print(f"Triggering immediate telemetry sync on nb_governly_compute_publish ({notebook_id})...")
    status, _, headers = fabric_request("POST", run_url, token, {})
    loc = headers.get("location")
    if status == 202 and loc:
        print(f"Notebook job queued ({loc}). Polling until initial telemetry publish completes...")
        deadline = time.time() + 420
        while time.time() < deadline:
            _, job_body, _ = fabric_request("GET", loc, token)
            st = str(job_body.get("status") or "InProgress")
            print(f"  [nb_governly_compute_publish] status = {st}")
            if st.lower() == "completed":
                print("Initial telemetry publish completed!")
                return
            if st.lower() in ("failed", "cancelled", "deduped"):
                raise RuntimeError(f"Initial telemetry run ended with status {st}: {job_body}")
            time.sleep(10)


# %%
if "spark" in globals() or os.environ.get("GOVERNLY_BOOTSTRAP_RUN") == "1":
    token = get_fabric_token()
    target_ws = detect_workspace_id(WORKSPACE_ID)
    print(f"=== Governly Installer & Updater · Target Workspace: {target_ws} ===")

    work_dir = "/tmp/governly-observability"
    node_env = ensure_node_env(token, target_ws)
    ensure_node_and_repo(REPO_URL, REPO_BRANCH, work_dir)

    print("Installing dependencies and running idempotent Rayfin deployment (npx rayfin up --yes)...")
    run_cmd(["npm", "install", "--no-fund", "--no-audit"], cwd=work_dir, env=node_env)
    run_cmd(
        ["npx", "rayfin", "up", "--yes", "--workspace-id", target_ws],
        cwd=work_dir,
        env=node_env,
    )

    sql_server, sql_database = resolve_sql_endpoint_details(target_ws, token)
    print(f"Resolved Workspace SQL Database: server={sql_server}, database={sql_database}")

    nb_id = upsert_compute_notebook(target_ws, token, work_dir, sql_server, sql_database)
    ensure_notebook_schedule(target_ws, nb_id, token, SCHEDULE_INTERVAL_MINUTES)

    if TRIGGER_INITIAL_RUN:
        trigger_notebook_run(target_ws, nb_id, token)

    print("=== Governly Installation / Update Complete! ===")
