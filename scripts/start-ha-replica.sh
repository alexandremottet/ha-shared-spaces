#!/usr/bin/env bash
# Run a copy of a real Home Assistant (dropped in .ha-replica/source, never committed) with this repo's
# integrations, every outside-facing integration turned off and its devices simulated. Each run starts again from the export.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/.ha-replica/source"
RUN="$REPO_ROOT/.ha-replica/run"
CONFIG="$RUN/config"
CONTAINER_NAME="ha-share-space-replica"
HA_PORT="${HA_PORT:-8124}"

if [ ! -f "$SOURCE/configuration.yaml" ]; then
  echo "Put a copy of your HA /config folder in $SOURCE (configuration.yaml at its top)." >&2
  exit 1
fi
VERSION="$(cat "$SOURCE/.HA_VERSION" 2>/dev/null || echo stable)"
HA_IMAGE="${HA_IMAGE:-homeassistant/home-assistant:$VERSION}"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
rm -rf "$RUN"
mkdir -p "$CONFIG"
rsync -a \
  --exclude 'home-assistant_v2.db*' --exclude 'backups/' --exclude 'media/' --exclude 'tts/' \
  --exclude 'custom_components/share_space*' \
  "$SOURCE/" "$CONFIG/"
python3 -I "$SCRIPT_DIR/ha-replica/prepare.py" "$CONFIG"

(cd "$REPO_ROOT" && pnpm run build >/dev/null)
mkdir -p "$CONFIG/www/share_space" "$CONFIG/themes"
cp "$REPO_ROOT"/frontend/{planning-cards,heating-card,dashboard-strategy}/dist/*.js "$CONFIG/www/share_space/"

# A local admin for automated checks, only in this copy; your own account still works.
PASSWORD="$(openssl rand -hex 12)"
docker run --rm -v "$CONFIG:/config" "$HA_IMAGE" \
  python3 -m homeassistant --script auth -c /config add replica "$PASSWORD" >/dev/null
printf 'replica\n%s\n' "$PASSWORD" > "$RUN/login.txt"

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${HA_PORT}:8123" \
  -v "$CONFIG:/config" \
  -v "$REPO_ROOT/themes/share_space_themes/themes:/config/themes/share_space:ro" \
  -v "$SCRIPT_DIR:/share_space_scripts:ro" \
  -v "$REPO_ROOT/integrations/share_space/custom_components/share_space:/config/custom_components/share_space" \
  -v "$REPO_ROOT/integrations/share_space_heating/custom_components/share_space_heating:/config/custom_components/share_space_heating" \
  -v "$REPO_ROOT/integrations/share_space_space/custom_components/share_space_space:/config/custom_components/share_space_space" \
  "$HA_IMAGE" >/dev/null

echo "Waiting for Home Assistant, then adding Share Space and simulated device states..."
docker exec "$CONTAINER_NAME" python3 /share_space_scripts/ha-replica/setup.py "http://localhost:8123" replica "$PASSWORD"

echo "Replica ($HA_IMAGE): http://localhost:${HA_PORT}"
echo "Log in with your own account, or the local one in $RUN/login.txt."
echo "Rerun to start again from the export; stop with: docker rm -f $CONTAINER_NAME"
