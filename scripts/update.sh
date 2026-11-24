#!/usr/bin/env sh
# Install or update Share Space in Home Assistant from a GitHub release.
# Run it in Home Assistant's Terminal (the "Terminal & SSH" add-on), then restart Home Assistant:
#   curl -fsSL https://raw.githubusercontent.com/alexandremottet/ha-shared-spaces/main/scripts/update.sh | sh
#   curl -fsSL .../update.sh | sh -s -- v1.1.0     # a given release instead of the latest
# CONFIG_DIR overrides where Home Assistant's config is (default /config, or /homeassistant).
set -eu

REPO="alexandremottet/ha-shared-spaces"
TAG="${1:-latest}"
INTEGRATIONS="share_space share_space_space share_space_heating"

if [ -n "${CONFIG_DIR:-}" ]; then :
elif [ -f /config/configuration.yaml ]; then CONFIG_DIR=/config
elif [ -f /homeassistant/configuration.yaml ]; then CONFIG_DIR=/homeassistant
else
  echo "Home Assistant's configuration.yaml not found: set CONFIG_DIR." >&2
  exit 1
fi

if [ "$TAG" = latest ]; then
  BASE="https://github.com/$REPO/releases/latest/download"
else
  BASE="https://github.com/$REPO/releases/download/$TAG"
fi

fetch() { # url file
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  else wget -qO "$2" "$1"
  fi
}

unpack() { # zip dir
  if command -v unzip >/dev/null 2>&1; then unzip -oq "$1" -d "$2"
  else python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Download everything first: a failed download leaves the current install untouched.
for name in $INTEGRATIONS share_space_themes; do
  echo "Downloading $name ($TAG)"
  fetch "$BASE/$name.zip" "$TMP/$name.zip"
done

for name in $INTEGRATIONS; do
  target="$CONFIG_DIR/custom_components/$name"
  mkdir -p "$TMP/$name"
  unpack "$TMP/$name.zip" "$TMP/$name"
  rm -rf "$target"
  mkdir -p "$CONFIG_DIR/custom_components"
  mv "$TMP/$name" "$target"
  version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$target/manifest.json")
  echo "Installed $name $version"
done

themes="$CONFIG_DIR/themes/share_space"
mkdir -p "$TMP/themes"
unpack "$TMP/share_space_themes.zip" "$TMP/themes"
rm -rf "$themes"
mkdir -p "$CONFIG_DIR/themes"
mv "$TMP/themes" "$themes"
echo "Installed themes in $themes"

if ! grep -qE '^[[:space:]]*themes:' "$CONFIG_DIR/configuration.yaml"; then
  echo
  echo "Themes need this in configuration.yaml (under frontend:):"
  echo "  frontend:"
  echo "    themes: !include_dir_merge_named themes"
fi
echo
echo "Done. Restart Home Assistant to load the new version."
