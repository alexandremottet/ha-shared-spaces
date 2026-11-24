"""Make a copied HA config safe to run on this machine: nothing in it can reach real devices or services.

Usage: python3 prepare.py <config dir>   (edits the copy in place, never the export)
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

# Integrations that stay on: Share Space, what it reads, and built-ins that touch nothing outside HA.
KEEP = {
    "share_space", "share_space_heating", "share_space_space", "scheduler", "generic_thermostat",
    "group", "template", "sun", "met", "workday", "tod", "local_calendar", "local_todo",
    "derivative", "threshold", "min_max", "utility_meter", "statistics", "trend", "backup",
    # its radio stick stays on the Pi: setup only retries, and its entities keep their areas
    "zha",
}
# Storage of integrations that talk to the outside world without a config entry.
DROP_STORAGE = ("cloud", "hassio", "mobile_app", "http.auth")


def main(config: Path) -> None:
    storage = config / ".storage"
    entries_file = storage / "core.config_entries"
    data = json.loads(entries_file.read_text())
    off = []
    for entry in data["data"]["entries"]:
        if entry["domain"] not in KEEP and entry.get("disabled_by") is None:
            entry["disabled_by"] = "user"
            off.append(entry["domain"])
    entries_file.write_text(json.dumps(data, indent=2))
    for name in DROP_STORAGE:
        (storage / name).unlink(missing_ok=True)
    for name in (".cloud", ".ha_run.lock"):
        target = config / name
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink(missing_ok=True)

    # Certificates live on the Pi; without them HA would not serve its UI here.
    conf = config / "configuration.yaml"
    text = conf.read_text()
    text = re.sub(r"^(\s*)(ssl_certificate|ssl_key)\b", r"\1# replica: \2", text, flags=re.M)
    conf.write_text(text)

    print(f"Turned off {len(off)} integrations: {', '.join(sorted(set(off))) or 'none'}")
    yaml_notify = re.findall(r"^\s*- platform: (\w+)", text, flags=re.M)
    if yaml_notify:
        print(f"YAML platforms still on (check none reach a real service): {', '.join(sorted(set(yaml_notify)))}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
