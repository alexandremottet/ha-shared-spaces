"""Onboard the dev HA instance and seed users, areas, zones and sidebars; safe to rerun.

Runs inside the HA container (uses its aiohttp): docker exec <container> python3 bootstrap.py
"""
from __future__ import annotations

import asyncio
import sys

import aiohttp

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123"
CLIENT_ID = f"{BASE}/"
REDIRECT_URI = f"{BASE}/?auth_callback=1"

# Space Admin = HA admin; Technical Admin = HA admin with Share Space "technical tools" on.
# Everyone lands on the Share Space panel (the integration sets it on install), except the Technical Admin (full HA).
OWNER = {"username": "dev", "password": "dev", "name": "Dev"}
USERS = [
    {"username": "admin", "password": "admin", "name": "Admin", "group": "system-admin", "technical": True, "full_ha": True},
    {"username": "user1", "password": "user1", "name": "User 1", "group": "system-users", "area": "bureau_1"},
    {"username": "user2", "password": "user2", "name": "User 2", "group": "system-users", "area": "cabane_1"},
]
# area_id: (name, heater switches, temperature sensor), all from seed/configuration.yaml
AREAS = {
    area_id: (
        name,
        [f"switch.radiateur_{area_id}_{i}" for i in (1, 2)] if area_id == "bureau_1" else [f"switch.radiateur_{area_id}"],
        f"sensor.temperature_{area_id}",
    )
    for area_id, name in (
        ("bureau_1", "Bureau 1"),
        ("bureau_2", "Bureau 2"),
        ("cabane_1", "Cabane 1"),
        ("cabane_2", "Cabane 2"),
        ("cabane_3", "Cabane 3"),
        ("salle_d_impression", "Salle d'impression"),
        ("salle_visio", "Salle visio"),
        ("cuisine", "Cuisine"),
    )
}
HOME_PANEL = "share-space"
VISIBLE_PANELS = {HOME_PANEL, "profile"}
WORK_WEEK = {
    day: [{"start": "09:00", "end": "12:30"}, {"start": "13:30", "end": "18:00"}]
    for day in ("monday", "tuesday", "wednesday", "thursday", "friday")
}


class HA:
    """REST + WebSocket session authenticated as one user."""

    def __init__(self, http: aiohttp.ClientSession, token: str) -> None:
        self.http = http
        self.token = token
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self._id = 0

    async def rest(self, method: str, path: str, body=None):
        async with self.http.request(
            method, BASE + path, json=body, headers={"Authorization": f"Bearer {self.token}"}
        ) as resp:
            resp.raise_for_status()
            return await resp.json() if resp.content_type == "application/json" else None

    async def call(self, msg_type: str, **payload):
        if self.ws is None:
            self.ws = await self.http.ws_connect(BASE.replace("http", "ws", 1) + "/api/websocket")
            await self.ws.receive_json()
            await self.ws.send_json({"type": "auth", "access_token": self.token})
            if (await self.ws.receive_json())["type"] != "auth_ok":
                sys.exit("WebSocket auth failed")
        self._id += 1
        await self.ws.send_json({"id": self._id, "type": msg_type, **payload})
        while True:
            msg = await self.ws.receive_json()
            if msg.get("id") == self._id and msg["type"] == "result":
                if not msg["success"]:
                    sys.exit(f"{msg_type} failed: {msg['error']}")
                return msg["result"]

    async def close(self) -> None:
        if self.ws is not None:
            await self.ws.close()


async def wait_until_up(http: aiohttp.ClientSession, timeout: float = 300) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        try:
            async with http.get(BASE + "/"):
                return
        except aiohttp.ClientError as err:
            if asyncio.get_running_loop().time() > deadline:
                sys.exit(f"Timed out waiting for {BASE}: {err}")
            await asyncio.sleep(2)


async def exchange_code(http: aiohttp.ClientSession, code: str) -> str:
    form = {"grant_type": "authorization_code", "code": code, "client_id": CLIENT_ID}
    async with http.post(BASE + "/auth/token", data=form) as resp:
        resp.raise_for_status()
        return (await resp.json())["access_token"]


async def login(http: aiohttp.ClientSession, username: str, password: str) -> HA:
    body = {"client_id": CLIENT_ID, "handler": ["homeassistant", None], "redirect_uri": REDIRECT_URI}
    async with http.post(BASE + "/auth/login_flow", json=body) as resp:
        flow = await resp.json()
    body = {"username": username, "password": password, "client_id": CLIENT_ID}
    async with http.post(BASE + f"/auth/login_flow/{flow['flow_id']}", json=body) as resp:
        result = await resp.json()
    if result.get("type") != "create_entry":
        sys.exit(f"Login as {username!r} failed: {result}")
    return HA(http, await exchange_code(http, result["result"]))


async def onboard(http: aiohttp.ClientSession) -> tuple[HA, bool]:
    """Log in as the owner, onboarding first if needed; True when the owner was just created."""
    async with http.get(BASE + "/api/onboarding") as resp:
        if resp.status == 404:  # fully onboarded: HA no longer serves the onboarding API
            return await login(http, OWNER["username"], OWNER["password"]), False
        done = {s["step"] for s in await resp.json() if s["done"]}
    fresh = "user" not in done
    if not fresh:
        ha = await login(http, OWNER["username"], OWNER["password"])
    else:
        print("Creating dev user...")
        body = {"client_id": CLIENT_ID, "language": "fr", **OWNER}
        async with http.post(BASE + "/api/onboarding/users", json=body) as resp:
            resp.raise_for_status()
            ha = HA(http, await exchange_code(http, (await resp.json())["auth_code"]))
    for step, body in (
        ("core_config", {}),
        ("analytics", {}),
        ("integration", {"client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI}),
    ):
        if step not in done:
            await ha.rest("POST", f"/api/onboarding/{step}", body)
    return ha, fresh


async def wait_for_state(ha: HA, entity_id: str, timeout: float = 120) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        try:
            await ha.rest("GET", f"/api/states/{entity_id}")
            return
        except aiohttp.ClientResponseError:
            if asyncio.get_running_loop().time() > deadline:
                sys.exit(f"Timed out waiting for {entity_id}")
            await asyncio.sleep(1)


async def add_entry(ha: HA, domain: str, user_input: dict) -> None:
    flow = await ha.rest("POST", "/api/config/config_entries/flow", {"handler": domain})
    if flow.get("type") == "form":
        flow = await ha.rest("POST", f"/api/config/config_entries/flow/{flow['flow_id']}", user_input)
    if flow.get("type") != "create_entry":
        sys.exit(f"Setting up {domain} failed: {flow}")
    print(f"Added {domain} {flow.get('title', '')}")


async def seed_areas(ha: HA, fresh: bool) -> None:
    existing = {a["area_id"] for a in await ha.call("config/area_registry/list")}
    if fresh:  # drop the default areas onboarding creates (Salon, Chambre...)
        for area_id in existing - AREAS.keys():
            await ha.call("config/area_registry/delete", area_id=area_id)
    for area_id, (name, heaters, sensor) in AREAS.items():
        if area_id not in existing:
            created = await ha.call("config/area_registry/create", name=name)
            if created["area_id"] != area_id:
                sys.exit(f"Area {name} got id {created['area_id']}, expected {area_id}")
            print(f"Added area {name}")
        for device in (*heaters, sensor):
            await wait_for_state(ha, device)
            await ha.call("config/entity_registry/update", entity_id=device, area_id=area_id)


async def seed_entries(ha: HA) -> None:
    domains = {e["domain"] for e in await ha.rest("GET", "/api/config/config_entries/entry")}
    for domain in ("share_space", "share_space_space"):
        if domain not in domains:
            await add_entry(ha, domain, {})


async def seed_zones(ha: HA) -> None:
    """One heating zone per area, built like Settings does: heaters + sensor -> thermostat."""
    zoned = {z["area_id"] for z in await ha.call("share_space_heating/list_zones")}
    for area_id, (name, heaters, sensor) in AREAS.items():
        if area_id not in zoned:
            await ha.call("share_space_heating/create_area_zone", area_id=area_id, heaters=heaters, temperature_sensor=sensor)
            print(f"Added heating zone {name}")


async def seed_users(ha: HA) -> list[dict]:
    """Create missing users with their person; return the ones created now."""
    usernames = {u.get("username") for u in await ha.call("config/auth/list")}
    created = []
    for user in USERS:
        if user["username"] in usernames:
            continue
        ha_user = (await ha.call("config/auth/create", name=user["name"], group_ids=[user["group"]]))["user"]
        await ha.call(
            "config/auth_provider/homeassistant/create",
            user_id=ha_user["id"],
            username=user["username"],
            password=user["password"],
        )
        await ha.call("person/create", name=user["name"], user_id=ha_user["id"])
        created.append({**user, "user_id": ha_user["id"]})
        print(f"Added user {user['username']}")
    return created


async def seed_person_planning(ha: HA, user: dict) -> None:
    person = None
    deadline = asyncio.get_running_loop().time() + 30
    while person is None:
        states = await ha.rest("GET", "/api/states")
        person = next(
            (
                s["entity_id"]
                for s in states
                if s["entity_id"].startswith("person.") and s["attributes"].get("user_id") == user["user_id"]
            ),
            None,
        )
        if person is None:
            if asyncio.get_running_loop().time() > deadline:
                sys.exit(f"No person entity for {user['username']}")
            await asyncio.sleep(1)
    await ha.rest("POST", "/api/services/share_space/assign_person_area", {"person": person, "area": user["area"]})
    await ha.rest("POST", "/api/services/share_space/set_calendar", {"person": person, "calendar": WORK_WEEK})


async def seed_user_prefs(http: aiohttp.ClientSession, user: dict) -> None:
    ha = await login(http, user["username"], user["password"])
    try:
        if user["group"] == "system-users":
            panels = await ha.call("get_panels")
            hidden = sorted(p for p in panels if p not in VISIBLE_PANELS)
            await ha.call(
                "frontend/set_user_data",
                key="sidebar",
                value={"panelOrder": [HOME_PANEL], "hiddenPanels": hidden},
            )
        if user.get("technical"):
            await ha.call("frontend/set_user_data", key="share_space", value={"technical": True})
        if user.get("full_ha"):
            await ha.call("frontend/set_user_data", key="core", value={"default_panel": "lovelace"})
    finally:
        await ha.close()


async def main() -> None:
    async with aiohttp.ClientSession() as http:
        await wait_until_up(http)
        ha, fresh = await onboard(http)
        try:
            await seed_areas(ha, fresh)
            await seed_entries(ha)
            created = await seed_users(ha)
            for user in created:
                if "area" in user:
                    await seed_person_planning(ha, user)
            await seed_zones(ha)
            # zones loaded the heating integration: its settings command now exists
            await ha.call("share_space_heating/save_settings", outdoor_entity="sensor.outdoor_temperature")
            for user in created:
                await seed_user_prefs(http, user)
        finally:
            await ha.close()


if __name__ == "__main__":
    asyncio.run(main())
