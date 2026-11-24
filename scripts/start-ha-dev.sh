#!/usr/bin/env bash
# Start a local Home Assistant Docker instance with this repo's three integrations
# (share_space, share_space_heating, share_space_space) bind-mounted in, onboarded and pre-configured.
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

# Fresh config: seed base configuration.yaml and Lovelace resources/dashboards.
if [ ! -d "$HA_CONFIG_DIR/.storage" ]; then
  echo "Seeding fresh dev config in $HA_CONFIG_DIR..."
  mkdir -p "$HA_CONFIG_DIR"
  cp -R "$SCRIPT_DIR/ha-dev/seed/." "$HA_CONFIG_DIR/"
fi
mkdir -p "$HA_CONFIG_DIR/themes"
# Configs seeded before the automation include existed: add it so saved rules survive a refresh.
[ -f "$HA_CONFIG_DIR/automations.yaml" ] || echo '[]' > "$HA_CONFIG_DIR/automations.yaml"
if ! grep -qE '^automation:' "$HA_CONFIG_DIR/configuration.yaml"; then
  printf '\nautomation: !include automations.yaml\n' >> "$HA_CONFIG_DIR/configuration.yaml"
fi

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
  -p "127.0.0.1:${HA_PORT}:8123" \
  -v "$HA_CONFIG_DIR:/config" \
  -v "$REPO_ROOT/themes/share_space_themes/themes:/config/themes/share_space:ro" \
  -v "$SCRIPT_DIR/ha-dev:/share_space_dev:ro" \
  -v "$REPO_ROOT/integrations/share_space/custom_components/share_space:/config/custom_components/share_space" \
  -v "$REPO_ROOT/integrations/share_space_heating/custom_components/share_space_heating:/config/custom_components/share_space_heating" \
  -v "$REPO_ROOT/integrations/share_space_space/custom_components/share_space_space:/config/custom_components/share_space_space" \
  "$HA_IMAGE" >/dev/null

echo "Waiting for Home Assistant, then onboarding and adding integrations..."
docker exec "$CONTAINER_NAME" python3 /share_space_dev/bootstrap.py "http://localhost:8123"

echo ""
echo "Home Assistant dev instance: http://localhost:${HA_PORT}"
echo "Logins: dev/dev (Space Admin), admin/admin (Technical Admin), user1/user1 and user2/user2 (users)."
echo "8 areas (2 bureaux, 3 cabanes, impression, visio, cuisine), each with simulated radiator plugs (2 in Bureau 1), a temperature sensor and a heating zone; everyone but admin opens on the Share Space panel."
echo "Rerun this script after JS or Python changes (it rebuilds and recreates the container)."
echo "Reset to a fresh instance: rm -rf $HA_CONFIG_DIR"
