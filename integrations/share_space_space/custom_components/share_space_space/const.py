"""Constants for Share Space Space."""

DOMAIN = "share_space_space"

STORAGE_VERSION = 1
STORAGE_KEY_FLOORPLANS = f"{DOMAIN}.floorplans"
DATA_STORE = "store"

WS_TYPE_GET_FLOORPLANS = f"{DOMAIN}/get_floorplans"
WS_TYPE_SAVE_FLOORPLAN = f"{DOMAIN}/save_floorplan"
WS_TYPE_DELETE_FLOORPLAN = f"{DOMAIN}/delete_floorplan"

FRONTEND_JS_FILENAME = "space-panel.js"
FRONTEND_SCRIPT_URL = f"/{DOMAIN}_frontend/{FRONTEND_JS_FILENAME}"

PANEL_URL_PATH = "share-space"
PANEL_WEBCOMPONENT_NAME = "share-space-space"
PANEL_SIDEBAR_TITLE = "Space"
PANEL_SIDEBAR_ICON = "mdi:floor-plan"
