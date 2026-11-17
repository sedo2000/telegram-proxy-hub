# Telegram Proxy Hub

A Telegram proxy discovery bot deployed on Vercel Serverless Functions, with Supabase persistence and an hourly GitHub Actions trigger.

## Architecture

- Vercel handles Telegram webhooks and HTTP endpoints.
- Supabase stores Telegram users and published SOCKS5/MTProto proxy records.
- GitHub Actions calls the protected scanner endpoint hourly.
- No always-on Node process or VPS is required.

## Features

- Forced public-channel subscription check.
- Delivers latest saved SOCKS5 and MTProto proxy links in private chat.
- Collects public SOCKS5 and MTProto text-list sources.\n- Ingests MTProto links posted in the configured Telegram source channel (`SOURCE_CHANNEL_USERNAME`, default `I5I5Ie`).
- Checks SOCKS5 connectivity to a Telegram endpoint.
- Checks MTProto server TCP reachability and preserves the MTProto secret.
- Publishes newly discovered proxies to the channel with Telegram connection links.
- Supabase persistence for users and proxy records.

## Required Vercel environment variables

- `BOT_TOKEN`: BotFather token. Keep it secret.
- `CHANNEL_ID`: channel username or numeric ID accepted by Telegram.
- `CHANNEL_URL`: public channel URL.
- `APP_URL`: `https://telegram-proxy-hub.vercel.app`.
- `TELEGRAM_WEBHOOK_SECRET`, `SETUP_SECRET`, `CRON_SECRET`: private random strings.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-side Supabase service-role secret.
- `PROXY_SOURCES`: comma-separated raw text SOCKS5 source URLs (optional if MTProto sources are configured).
- `SOURCE_CHANNEL_USERNAME`: source channel username without `@` (default `I5I5Ie`).\n- `MTPROTO_SOURCES`: comma-separated raw text MTProto source URLs (optional if SOCKS5 sources are configured). Each line may be a Telegram `t.me/proxy` / `tg://proxy` link or `host:port:secret`.

Optional:
- `MAX_LATENCY_MS` (default 1500)
- `MAX_PROXIES_PER_POST` (default 5)
- `MAX_SCAN_CANDIDATES` (default 100)

## Supabase setup

Run `supabase/schema.sql` in the Supabase SQL Editor. It is safe to re-run and upgrades the existing proxies table by changing `host` to text and adding the nullable `secret` column.

## Vercel and Telegram setup

1. Add required environment variables to Vercel Production.
2. Redeploy after changing environment variables.
3. Add the bot as a channel administrator with permission to post.
4. Call the protected `POST /api/setup` endpoint once using the `SETUP_SECRET`.

## Hourly scan

The GitHub Actions workflow runs hourly and can be triggered manually. Add the same `CRON_SECRET` value to GitHub Actions repository secrets and Vercel.

## MTProto validation limitation

MTProto entries are currently checked for TCP port reachability only. This is not a full MTProto handshake or proof that Telegram will accept the secret. The bot clearly labels this distinction. Public proxies are third-party; do not use them for sensitive accounts or confidential traffic.

## Endpoints

- `GET /api/health`: configuration status.
- `POST /api/setup`: protected Telegram webhook setup.
- `GET /api/cron`: protected proxy scan and channel publishing.
- `GET /api/stats`: protected statistics endpoint.
