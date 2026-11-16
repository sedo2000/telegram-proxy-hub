# Telegram Proxy Hub

A Telegram SOCKS5 proxy bot deployed on Vercel Serverless Functions, with Supabase persistence and an hourly GitHub Actions trigger.

## Architecture

- Vercel handles Telegram webhooks and HTTP endpoints.
- Supabase stores Telegram users and published proxy records.
- GitHub Actions calls the protected scanner endpoint hourly.
- No Docker, VPS, always-on Node process, or Express keep-alive server is required.

## Features

- Forced public-channel subscription check.
- Delivers the latest saved SOCKS5 proxy links in private chat after membership verification.
- Collects public SOCKS5 lists and checks SOCKS5 connectivity to a Telegram endpoint.
- Publishes newly discovered proxies to the Telegram channel.
- Supabase persistence for users and proxy records.
- Protected setup, health, scan, and stats endpoints.

## Required Vercel environment variables

- `BOT_TOKEN`: BotFather token. Keep it secret.
- `CHANNEL_ID`: numeric channel ID, normally starts with `-100`.
- `CHANNEL_URL`: public channel URL, e.g. `https://t.me/YourChannel`.
- `APP_URL`: `https://telegram-proxy-hub.vercel.app`.
- `TELEGRAM_WEBHOOK_SECRET`: random string using letters, digits, underscore or hyphen.
- `SETUP_SECRET`: long random secret for the setup and stats endpoints.
- `CRON_SECRET`: long random secret for the scanner endpoint.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role secret. Server-side only; never commit it or expose it to clients.
- `PROXY_SOURCES`: comma-separated raw text SOCKS5 source URLs.

Optional:
- `MAX_LATENCY_MS` (default 1500)
- `MAX_PROXIES_PER_POST` (default 5)
- `MAX_SCAN_CANDIDATES` (default 100)

## Supabase setup

1. Open the Supabase project's SQL Editor.
2. Run the complete SQL in `supabase/schema.sql`.
3. Copy the project URL and the service-role key into Vercel environment variables. Do not use the publishable/anon key for this server-side service-role integration.

## Vercel and Telegram setup

1. Add the required environment variables to the Production environment in Vercel.
2. Redeploy the project after saving the variables.
3. Add the bot as a channel administrator and grant permission to post messages.
4. Call the protected setup endpoint once:

```bash
curl -X POST "https://telegram-proxy-hub.vercel.app/api/setup" \
  -H "Authorization: Bearer YOUR_SETUP_SECRET"
```

The setup endpoint verifies the bot token and its channel posting permission before registering the Telegram webhook.

## Hourly scan

Create a GitHub Actions repository secret named `CRON_SECRET` at:
Settings > Secrets and variables > Actions.

Use the exact same value as Vercel's `CRON_SECRET`. The workflow in `.github/workflows/proxy-scan.yml` runs hourly and can also be triggered manually from the Actions tab.

## Endpoints

- `GET /api/health`: configuration status.
- `POST /api/setup`: protected Telegram webhook setup.
- `GET /api/cron`: protected proxy scan and channel publishing.
- `GET /api/stats`: protected user and active-proxy counts. Send `Authorization: Bearer YOUR_SETUP_SECRET`.

## Validation

```bash
npm install
npm run check
```

## Limitations and safety

- This deployment currently supports SOCKS5 text-list sources. It does not run a private MTProto server or validate MTProto secret links.
- A successful SOCKS5 connection test is not a guarantee of service on every ISP, nor a security or anonymity audit.
- Public proxies are operated by third parties. Do not use them for sensitive accounts or confidential traffic.
- GitHub Actions scheduled execution depends on repository/account usage limits and may be delayed. It is not a contractual 24/7 service.
- The Supabase service-role key bypasses Row Level Security. Keep it only in Vercel server-side environment variables.
