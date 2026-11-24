# End-to-end tests

Browser tests against a real Home Assistant with the Share Space integrations, on a phone and a desktop viewport.

```sh
HA_CONFIG_DIR=$PWD/.ha-dev/e2e-config pnpm ha:dev   # fresh dev HA, seeded test accounts only
pnpm --filter ha-share-space-e2e exec playwright install chromium   # once
pnpm test:e2e
```

Use a fresh config folder: the tests check what a new install does, such as Home Assistant opening on Share Space after login. `HA_URL` points them at another instance.
