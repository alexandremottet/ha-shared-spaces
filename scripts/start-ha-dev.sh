#!/usr/bin/env bash
# Start a local Home Assistant Docker instance with this repo's three integrations
# (share_space, share_space_heating, share_space_space) bind-mounted in, for visually testing cards/panel.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER_NAME="ha-share-space-dev"
HA_CONFIG_DIR="${HA_CONFIG_DIR:-$REPO_ROOT/.ha-dev/config}"
HA_PORT="${HA_PORT:-8123}"
HA_IMAGE="${HA_IMAGE:-homeassistant/home-assistant:stable}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$HA_CONFIG_DIR"

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "Installing workspace dependencies..."
  (cd "$REPO_ROOT" && pnpm install)
fi

echo "Building frontend bundle..."
(cd "$REPO_ROOT" && pnpm run build)

# Always recreate: a symlink or bind-mount set up inside the container's /config
# is baked in at `docker run` time, so reusing a stale container via `docker start`
# would silently keep old (or wrong) mounts. HA's own state lives in $HA_CONFIG_DIR
# on the host, so recreating the container loses nothing.
if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing existing container to apply current config..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

WWW_DIR="$HA_CONFIG_DIR/www/share_space"
mkdir -p "$WWW_DIR"
cp "$REPO_ROOT"/frontend/{planning-cards,heating-card,dashboard-strategy}/dist/*.js "$WWW_DIR/"

echo "Creating container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HA_PORT}:8123" \
  -v "$HA_CONFIG_DIR:/config" \
  -v "$REPO_ROOT/integrations/share_space/custom_components/share_space:/config/custom_components/share_space" \
  -v "$REPO_ROOT/integrations/share_space_heating/custom_components/share_space_heating:/config/custom_components/share_space_heating" \
  -v "$REPO_ROOT/integrations/share_space_space/custom_components/share_space_space:/config/custom_components/share_space_space" \
  "$HA_IMAGE" >/dev/null

echo ""
echo "Home Assistant dev instance: http://localhost:${HA_PORT}"
echo "First run needs onboarding. Then: Settings > Devices & Services > Add Integration > Share Space, Share Space Heating, Share Space Space."
echo "Add Lovelace resources (module):"
echo "  /local/share_space/share-space-planning-cards.js"
echo "  /local/share_space/share-space-heating-card.js"
echo "  /local/share_space/share-space-dashboard.js  (then new dashboard, raw config: strategy: {type: custom:share-space})"
echo "The Space panel (/share-space) needs no resource."
echo "Rerun this script after JS or Python changes (it rebuilds and recreates the container)."
echo "Your HA config/onboarding in $HA_CONFIG_DIR persists across recreation."
