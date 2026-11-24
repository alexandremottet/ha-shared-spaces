"""Add Share Space to the replica and give devices that cannot run here simulated states.

Runs inside the HA container: python3 setup.py <base url> <username> <password>
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ha-dev"))
import aiohttp  # noqa: E402

import bootstrap  # noqa: E402

DOMAINS = ("share_space", "share_space_space")
# Integrations whose devices are on the Pi: their entities get a plausible state here.
SIMULATED = {"zha"}


def _registry(name: str) -> dict:
    return json.loads(Path(f"/config/.storage/{name}").read_text())["data"]


async def simulate(ha: bootstrap.HA) -> int:
    count = 0
    for e in _registry("core.entity_registry")["entities"]:
        domain = e["entity_id"].split(".")[0]
        if e["platform"] not in SIMULATED or e.get("disabled_by") or domain not in ("switch", "sensor", "binary_sensor"):
            continue
        attrs = {"friendly_name": e.get("name") or e.get("original_name") or e["entity_id"]}
        device_class = e.get("device_class") or e.get("original_device_class")
        if domain == "sensor":
            if device_class != "temperature":
                continue
            state = "19.5"
            attrs |= {"device_class": "temperature", "unit_of_measurement": "°C", "state_class": "measurement"}
        else:
            state = "off"
            if device_class:
                attrs["device_class"] = device_class
        await ha.rest("POST", f"/api/states/{e['entity_id']}", {"state": state, "attributes": attrs})
        count += 1
    return count


async def main(base: str, username: str, password: str) -> None:
    bootstrap.BASE = base
    bootstrap.CLIENT_ID = f"{base}/"
    bootstrap.REDIRECT_URI = f"{base}/?auth_callback=1"
    async with aiohttp.ClientSession() as http:
        await bootstrap.wait_until_up(http)
        ha = await bootstrap.login(http, username, password)
        try:
            entries = {e["domain"] for e in await ha.rest("GET", "/api/config/config_entries/entry")}
            for domain in DOMAINS:
                if domain not in entries:
                    await bootstrap.add_entry(ha, domain, {})
            await asyncio.sleep(5)
            print(f"Simulated {await simulate(ha)} device states")
        finally:
            await ha.close()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:4]))
