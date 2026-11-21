# Share Space dashboard strategy

Auto-generated Lovelace dashboard: "Me" view, one view per area, "Heating" view.

1. Add resource `/local/share_space/share-space-dashboard.js` (type: JavaScript module), plus the card bundles you use.
2. Create a dashboard (Settings > Dashboards), open it, then menu > Raw configuration editor.
3. Replace content with:

```yaml
strategy:
  type: custom:share-space
  # areas: [office]       # optional: restrict areas
  # show_heating: true
  # show_actions: true    # admin-only automations section
```
