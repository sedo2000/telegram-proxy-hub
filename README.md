# Telegram Proxy Hub — MTProto

A Telegram bot dedicated to MTProto proxy discovery, deployed on Vercel with Supabase persistence.

## Included features
- MTProto-only source collection and display.
- Channel subscription check.
- Fastest and newest proxy sorting.
- Direct Telegram connection and share links.
- User favourites.
- `/check <t.me/proxy link>` reachability check.
- Public user/proxy statistics.
- Owner-only `/admin` command (configure `ADMIN_IDS`).
- Protected `GET /api/admin` JSON endpoint (Bearer `SETUP_SECRET`).
- Hourly scan and duplicate-safe channel publishing.

## Validation limitation
The current checker measures TCP reachability only. It is not a full MTProto handshake and does not prove Telegram accepts a proxy. Public proxies are third-party; do not use them for sensitive traffic.

## Vercel variables
Required: `BOT_TOKEN`, `CHANNEL_ID`, `CHANNEL_URL`, `APP_URL`, `TELEGRAM_WEBHOOK_SECRET`, `SETUP_SECRET`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MTPROTO_SOURCES`.
Recommended: `SOURCE_CHANNEL_USERNAME=I5I5Ie`, `ADMIN_IDS` (comma-separated numeric Telegram user IDs), `MAX_LATENCY_MS=1500`, `MAX_PROXIES_PER_POST=5`, `MAX_SCAN_CANDIDATES=100`.

Never commit secrets. Keep the Supabase service-role key only in Vercel server-side environment variables.

## Database
Run `supabase/schema.sql` in Supabase SQL Editor to create the favourites table and MTProto index. Existing proxy records are retained.

## Setup
1. Add the variables to Vercel Production and redeploy.
2. Add the bot as channel administrator with post permission.
3. Call `POST /api/setup` with `Authorization: Bearer <SETUP_SECRET>`.
4. Add `CRON_SECRET` to GitHub Actions secrets.
5. Set `ADMIN_IDS` to the owner's numeric Telegram user ID and redeploy.

## Endpoints
- `GET /api/health`
- `POST /api/setup`
- `GET /api/cron` (Bearer `CRON_SECRET`)
- `GET /api/stats` (Bearer `SETUP_SECRET`)
- `GET /api/admin` (Bearer `SETUP_SECRET`)
