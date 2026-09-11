"""Constants for Share Space."""

DOMAIN = "share_space"

EVENT_HEATING_SHARED = f"{DOMAIN}_heating_shared"

SERVICE_TRIGGER_HEATING_SHARED = "trigger_heating_shared"
SERVICE_SET_CALENDAR = "set_calendar"
SERVICE_ASSIGN_PERSON_AREA = "assign_person_area"
SERVICE_SET_AREA_ACTION = "set_area_action"

EVENT_CALENDAR_UPDATED = f"{DOMAIN}_calendar_updated"
EVENT_PERSON_AREA_ASSIGNED = f"{DOMAIN}_person_area_assigned"

# Home Assistant's own `zone.*` domain means a GPS geofence -- this integration's "zone" was
# always really an Area (HA's Areas registry, the same concept the `area` selector edits), so
# it's named that way throughout to avoid colliding with the unrelated real thing.
ATTR_AREA = "area"
ATTR_TEMPERATURE = "temperature"
ATTR_CALENDAR = "calendar"
ATTR_PERSON = "person"
ATTR_ON_ACTION = "on_action"
ATTR_OFF_ACTION = "off_action"

STORAGE_VERSION = 1
STORAGE_KEY_PERSON_CALENDARS = f"{DOMAIN}.person_calendars"
STORAGE_KEY_PERSON_AREAS = f"{DOMAIN}.person_areas"
STORAGE_KEY_AREA_ACTIONS = f"{DOMAIN}.area_actions"
STORAGE_KEY_AREA_SCHEDULER_LINKS = f"{DOMAIN}.area_scheduler_links"
DATA_PERSON_CALENDAR_STORE = "person_calendar_store"
DATA_PERSON_AREA_STORE = "person_area_store"
DATA_AREA_ACTION_STORE = "area_action_store"
DATA_AREA_SCHEDULER_LINK_STORE = "area_scheduler_link_store"

# The scheduler-component (nielsfaber/scheduler-component) integration whose schedule entities
# we drive, rather than running our own time-based executor -- best-effort: an area with no
# action configured is simply never synced, and a missing `scheduler` integration is logged,
# not fatal.
SCHEDULER_DOMAIN = "scheduler"
SCHEDULER_SERVICE_ADD = "add"
SCHEDULER_SERVICE_EDIT = "edit"
SCHEDULER_SERVICE_REMOVE = "remove"

FRONTEND_SCRIPT_URL = f"/{DOMAIN}_frontend/components.js"
FRONTEND_JS_FILENAME = "components.js"

PANEL_URL_PATH = DOMAIN
PANEL_WEBCOMPONENT_NAME = "share-space-panel"
PANEL_SIDEBAR_TITLE = "Share Space"
PANEL_SIDEBAR_ICON = "mdi:calendar-clock"

# share_space/get_calendar: read one person's own raw calendar (for editing).
WS_TYPE_GET_CALENDAR = f"{DOMAIN}/get_calendar"
WS_TYPE_GET_PERSON_AREA = f"{DOMAIN}/get_person_area"
# share_space/get_area_schedule: read an area's *merged* schedule (every person assigned to
# it, combined) -- this is what an action-trigger step would read, not a raw calendar.
WS_TYPE_GET_AREA_SCHEDULE = f"{DOMAIN}/get_area_schedule"
# share_space/get_area_calendars: read every person assigned to an area with their own raw
# calendar (unmerged) -- for read-only per-person visualizations, unlike get_area_schedule's
# flattened on/off signal.
WS_TYPE_GET_AREA_CALENDARS = f"{DOMAIN}/get_area_calendars"
# share_space/get_area_action: read the on/off action pair configured for an area (for the
# card editor to prefill), or empty lists if never configured.
WS_TYPE_GET_AREA_ACTION = f"{DOMAIN}/get_area_action"
