module.exports = async function handler(req, res) {
  const required = [
    "BOT_TOKEN", "CHANNEL_ID", "CHANNEL_URL", "TELEGRAM_WEBHOOK_SECRET",
    "SETUP_SECRET", "CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
  ];
  const missing = required.filter(key => !process.env[key]);
  return res.status(missing.length ? 503 : 200).json({
    service: "telegram-proxy-hub",
    status: missing.length ? "configuration_required" : "configured",
    runtime: "vercel-serverless",
    missing,
    configured: {
      botToken: Boolean(process.env.BOT_TOKEN),
      channel: Boolean(process.env.CHANNEL_ID && process.env.CHANNEL_URL),
      webhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      cronSecret: Boolean(process.env.CRON_SECRET),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    },
    timestamp: new Date().toISOString()
  });
};
