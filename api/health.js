module.exports = async function handler(req, res) {
  return res.status(200).json({
    service: "telegram-proxy-hub",
    status: "online",
    runtime: "vercel-serverless",
    configured: {
      botToken: Boolean(process.env.BOT_TOKEN),
      channel: Boolean(process.env.CHANNEL_ID),
      webhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      cronSecret: Boolean(process.env.CRON_SECRET),
      redis: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    },
    timestamp: new Date().toISOString()
  });
};
