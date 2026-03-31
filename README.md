# PHOEBE POS

Tablet-first retail POS for PHOEBE Drugstore with inventory, restock, sales analytics, returns, and team access management.

## Local development

1. Copy `.env.local.example` to `.env.local`
2. Fill all required Supabase keys/URLs
3. Run:

```bash
npm install
npm run dev
```

## Production preflight

Before deploy, run:

```bash
npm run check:production
npm run build
```

This validates:
- required env vars exist
- `DEFAULT_TEAM_PASSWORD` is set and not default
- required migration files for latest features are present

## Deployment notes

- Set a strong `DEFAULT_TEAM_PASSWORD` in production.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Enable the login access code from Admin > Team page before going live.
- Apply the latest migrations (`005` to `008`) in your Supabase project.
