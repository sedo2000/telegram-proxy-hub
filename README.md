# Telegram Proxy Hub

Telegram bot and scheduled SOCKS5 proxy publisher built for Vercel Serverless Functions.

## Architecture

This repository uses Telegram webhooks and Vercel Cron. It does not run a permanent Express server, Docker daemon, long-polling worker, or in-process hourly timer. Vercel invokes the scanner on the schedule in `vercel.json`.

A private MTProto proxy is a separate service and must run on a VPS or another persistent container host. Vercel is not a Docker host.

## Features

- Telegram webhook protected by Telegram's secret-token header.
- Mandatory channel membership check before the bot offers access.
- Fetches public SOCKS5 text lists and checks SOCKS5 connectivity to a Telegram endpoint.
- Publishes a limited number of newly seen proxies to the channel.
- Optional Upstash Redis deduplication (7 days).
- Health endpoint: `/api/health`.
- Protected webhook registration endpoint: `POST /api/setup`.
- Protected scan endpoint: `GET /api/cron`.

## Required Vercel environment variables

- `BOT_TOKEN`: Telegram bot token from BotFather.
- `CHANNEL_ID`: numeric Telegram channel ID (usually starts with `-100`).
- `CHANNEL_URL`: public channel URL, e.g. `https://t.me/YourChannel`.
- `CHANNEL_USERNAME`: channel username including `@`.
- `APP_URL`: production Vercel URL.
- `TELEGRAM_WEBHOOK_SECRET`: random secret (Telegram accepts 1-256 characters from A-Z, a-z, 0-9, underscore and hyphen).
- `SETUP_SECRET`: long random secret protecting webhook registration.
- `CRON_SECRET`: long random secret protecting the scan endpoint.
- `PROXY_SOURCES`: comma-separated raw text SOCKS5 lists.

Optional, recommended for reliable deduplication:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Without Upstash Redis, duplicate tracking is best-effort and can reset when a serverless instance is recycled.

## Setup after deployment

1. Import this GitHub repository into Vercel.
2. Add all required environment variables in Project Settings > Environment Variables.
3. Redeploy after adding variables.
4. Register the Telegram webhook once:

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/setup" \
  -H "Authorization: Bearer YOUR_SETUP_SECRET"
```

5. Check:

```bash
curl "https://YOUR-APP.vercel.app/api/health"
```

6. Make the bot an administrator in the channel with permission to post messages.

## Local syntax check

```bash
npm install
npm run check
```

## Important limitations

- The current scanner supports SOCKS5 lists only. It does not parse or validate MTProto secrets.
- A successful SOCKS5 handshake to a Telegram endpoint is only a connectivity check. It is not a security audit, anonymity guarantee, or guarantee of access on every ISP.
- Public proxies are operated by third parties. Do not use them for confidential traffic or sensitive accounts.
- Vercel Cron frequency depends on the Vercel plan. The current schedule is hourly; verify that your plan allows hourly cron execution.
- Public proxy lists may change format, disappear, or include malicious endpoints. Review sources before use.
