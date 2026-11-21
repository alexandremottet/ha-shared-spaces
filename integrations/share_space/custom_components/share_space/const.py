"""Constants for Share Space."""

DOMAIN = "share_space"

SERVICE_SET_CALENDAR = "set_calendar"
SERVICE_ASSIGN_PERSON_AREA = "assign_person_area"
SERVICE_SET_AREA_ACTIONS = "set_area_actions"
SERVICE_RUN_AREA_ACTIONS = "run_area_actions"
SERVICE_QUERY_OCCUPANCY = "query_occupancy"

SIGNAL_CALENDAR_CHANGED = f"{DOMAIN}_calendar_changed"
SIGNAL_AREAS_CHANGED = f"{DOMAIN}_areas_changed"

EVENT_CALENDAR_UPDATED = f"{DOMAIN}_calendar_updated"
EVENT_PERSON_AREA_ASSIGNED = f"{DOMAIN}_person_area_assigned"

# Home Assistant's own `zone.*` domain means a GPS geofence -- this integration's "zone" was
# always really an Area (HA's Areas registry, the same concept the `area` selector edits), so
# it's named that way throughout to avoid colliding with the unrelated real thing.
ATTR_AREA = "area"
ATTR_CALENDAR = "calendar"
ATTR_PERSON = "person"
ATTR_ON_ACTIONS = "on_actions"
ATTR_OFF_ACTIONS = "off_actions"
ATTR_ENABLED = "enabled"
ATTR_STATE = "state"

STORAGE_VERSION = 1
STORAGE_KEY_PERSON_CALENDARS = f"{DOMAIN}.person_calendars"
STORAGE_KEY_PERSON_AREAS = f"{DOMAIN}.person_areas"
STORAGE_VERSION_AREA_ACTIONS = 2
STORAGE_KEY_AREA_ACTIONS = f"{DOMAIN}.area_actions"
DATA_AREA_ACTIONS_STORE = "area_actions_store"
DATA_PERSON_CALENDAR_STORE = "person_calendar_store"
DATA_PERSON_AREA_STORE = "person_area_store"
DATA_AREA_LOCKS = "area_locks"

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
WS_TYPE_GET_AREA_ACTIONS = f"{DOMAIN}/get_area_actions"
WS_TYPE_LIST_AREAS = f"{DOMAIN}/list_areas"
