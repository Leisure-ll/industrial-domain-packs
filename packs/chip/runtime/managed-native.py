"""Run the maintained EDA tools inside an already allocated offline container.

The outer Harness supplies immutable inputs and owns container limits/cleanup.
No Docker client, credentials or benchmark task are needed by this entry.
"""
import hashlib
import json
from pathlib import Path
import shutil
import stat
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packs/chip/eda-harness/src"))
import yaml
from eda_harness.core.service import Harness
from eda_harness.core.models import Project
from eda_harness.core.workflow import catalog
from eda_harness.plugins.semantic import capabilities


def prepare(source, work):
    config = yaml.safe_load((source / "eda.yaml").read_text())
    if not isinstance(config, dict):
        raise ValueError("eda.yaml must contain a project object")
    # Support the shared small RTL example, and full user-owned EDA projects.
    config.setdefault("name", "chip-project")
    actions = config.setdefault("actions", {})
    if not isinstance(actions, dict):
        raise ValueError("actions must be an object")
    sim = actions.get("rtl.simulate", {}).get("parameters", {})
    config.setdefault("top", sim.get("top"))
    if "inputs" not in config:
        paths = [ref["path"] for action in actions.values()
                 for ref in action.get("parameters", {}).get("sources", []) if "path" in ref]
        config["inputs"] = {"rtl": sorted(set(paths))}
    config.setdefault("required_verification", [])
    runtime = {"kind": "local", "resources": {"cpu": 2, "memory_gb": 4,
               "timeout_seconds": 600, "build_jobs": 1, "pids": 128}}
    config["runtime"] = runtime
    for action in actions.values():
        if not isinstance(action, dict) or any(action.get(key) for key in ("script", "args", "outputs", "metrics_file", "verification_file")):
            raise ValueError("Managed EDA actions use structured parameters, not project command/script overrides")
        action["runtime"] = runtime
    Project.model_validate(config)
    destination = work / "project"
    shutil.copytree(source, destination)
    # Snapshot permissions are read-only. Only this owned working copy may be
    # edited by the non-root Linux container user; /inputs stays immutable.
    for entry in [destination, *destination.rglob("*")]:
        entry.chmod(stat.S_IMODE(entry.stat().st_mode) | stat.S_IWUSR)
    (destination / "eda.yaml").write_text(yaml.safe_dump(config, sort_keys=False))
    return destination, config


def main():
    source, work = Path(sys.argv[1]), Path(sys.argv[2])
    operation = sys.argv[3]
    target = sys.argv[4] if len(sys.argv) > 4 else "rtl.simulate"
    project, config = prepare(source, work)
    harness = Harness(project)
    if operation == "inspect":
        value = {"executionSucceeded": True, "capabilities": capabilities(),
                 "actions": sorted(catalog(Project.model_validate(config).workflow)), "artifacts": []}
    elif operation == "environment":
        from eda_harness.core.environment import check_environment
        value = {"executionSucceeded": True, "environment": check_environment(project, target=target), "artifacts": []}
    elif operation == "execute":
        # Existing EDA orchestration handles typed dependencies and genuine native evidence.
        run = harness.submit(target, workflow=True, background=False, force=True)
        state = harness.state(run.get("state_id")) if run.get("state_id") else None
        native = (state or {}).get("results", {}).get(target, {})
        artifacts = []
        for step in run.get("steps", []):
            for ident in step.get("artifacts", []):
                item = harness.store.get("artifact", ident)
                data = harness.store.read_blob(item["content_hash"])
                if len(data) > 16 * 1024 * 1024 or len(artifacts) >= 128:
                    raise ValueError("EDA evidence exceeds the managed artifact bound")
                name = "artifact-%03d" % len(artifacts)
                (work / name).write_bytes(data)
                artifacts.append({"file": name, "kind": item["type"], "sha256": hashlib.sha256(data).hexdigest()})
        value = {"executionSucceeded": run["status"] == "SUCCESS", "artifacts": artifacts,
                 "action": target, "nativeRunId": run["id"], "nativeVerification": native.get("verification"),
                 "nativeSteps": [{"action": step["action"], "status": step["status"]} for step in run.get("steps", [])],
                 "diagnostics": [run["error"]] if run.get("error") else [],
                 "toolIdentities": run.get("tool_identities", {})}
    else:
        raise ValueError("Unknown managed EDA operation")
    (work / "result.json").write_text(json.dumps(value, allow_nan=False))
    print(json.dumps({"executionSucceeded": value["executionSucceeded"]}))
    return 0 if value["executionSucceeded"] else 1


if __name__ == "__main__":
    sys.exit(main())
