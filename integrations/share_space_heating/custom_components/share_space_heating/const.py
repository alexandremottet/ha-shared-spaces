"""Constants for Share Space Heating."""
DOMAIN = "share_space_heating"

CONF_CLIMATE_ENTITY = "climate_entity"
CONF_PRESENCE_ENTITY = "presence_entity"
CONF_COMFORT_TEMP = "comfort_temp"
CONF_ECO_TEMP = "eco_temp"
CONF_DEFAULT_OVERRIDE_HOURS = "default_override_hours"
CONF_MAX_OVERRIDE_HOURS = "max_override_hours"
CONF_FROST_TEMP = "frost_temp"
CONF_OFF_MODE = "off_mode"
CONF_TARGET_TEMPLATE = "target_template"

DEFAULT_COMFORT_TEMP = 21.0
DEFAULT_ECO_TEMP = 17.0
DEFAULT_OVERRIDE_HOURS = 3.0
DEFAULT_MAX_OVERRIDE_HOURS = 12.0
DEFAULT_FROST_TEMP = 7.0
OFF_MODE_FROST = "frost"
OFF_MODE_HVAC_OFF = "hvac_off"
OFF_MODES = [OFF_MODE_FROST, OFF_MODE_HVAC_OFF]
DEFAULT_OFF_MODE = OFF_MODE_FROST

STORAGE_KEY_OVERRIDES = "share_space_heating.overrides"
STORAGE_VERSION = 1

DATA_STORE = "store"
DATA_ZONES = "zones"

MODE_SCHEDULE = "schedule"
MODE_OVERRIDE = "override"
MODE_MANUAL_ONLY = "manual_only"
MODE_AUTOMATION = "automation"
MODE_TEMPLATE = "template"

TEMPLATE_RULE = "Template"

SERVICE_SET_OVERRIDE = "set_override"
SERVICE_EXTEND_OVERRIDE = "extend_override"
SERVICE_CLEAR_OVERRIDE = "clear_override"
SERVICE_SET_BASE_TARGET = "set_base_target"
SERVICE_RUN_RULES = "run_rules"

BLUEPRINT_DIR = "blueprints/automation/share_space"
