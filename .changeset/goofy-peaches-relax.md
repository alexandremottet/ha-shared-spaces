---
"ha-share-space-heating-card": major
"ha-share-space-playground": major
"ha-share-space-space-panel": major
"ha-share-space-ui": major
"share-space-heating-integration": major
---

Rework to make easy to use Shared Space Automated System.
- add a notion of Space Admin and Technical Admin.
  - Technical Admin is a per-user "Technical tools" switch in Settings.
- make easy to use Panel for Space Admin: Space / Rules / Settings tabs.
- add Rules tab: block editor for heating rules with week preview, saved as HA automation.
  - Save, Undo last change, Reset to template (Office saver, Lunch room).
  - convert existing Office saver / Lunch room automations to rules.
  - detect automations edited in HA: Take back or Detach.
- add generic `rules.yaml` blueprint running the rules.
- add Zone target Jinja hook for Technical Admin, with template editor and help.
- playground: User / Space Admin / Technical Admin views, rule and template editor components.
