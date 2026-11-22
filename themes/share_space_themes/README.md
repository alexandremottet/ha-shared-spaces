# Share Space Themes

Home Assistant themes, each with a light and a dark mode:

- **Share Space Frosted** — frosted glass on a pastel / dusk gradient.
- **Le Portemine** — blue and gold glass.

## Install

1. Copy `themes/share_space.yaml` into your HA `config/themes/` folder (or add this repo to HACS as a *Theme*).
2. Make sure `configuration.yaml` loads themes:

   ```yaml
   frontend:
     themes: !include_dir_merge_named themes
   ```

3. Restart HA (or call `frontend.reload_themes`), then pick the theme in your profile.

Share Space cards get the glass blur on their own. For core HA cards too, install [card-mod](https://github.com/thomasloven/lovelace-card-mod) (HACS → Frontend); the themes already include its `card-mod-card` styles and work unchanged without it.
