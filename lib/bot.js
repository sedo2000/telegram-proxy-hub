const { Telegraf, Markup } = require("telegraf");

let instance;

function getBot() {
  if (instance) return instance;
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not configured");
  const bot = new Telegraf(token);
  const channelId = process.env.CHANNEL_ID;
  const channelUrl = process.env.CHANNEL_URL;
  const channelUsername = process.env.CHANNEL_USERNAME;
  if (!channelId || !channelUrl || !channelUsername) {
    throw new Error("CHANNEL_ID, CHANNEL_URL and CHANNEL_USERNAME are required");
  }

  async function subscribed(userId) {
    try {
      const member = await bot.telegram.getChatMember(channelId, userId);
      return ["creator", "administrator", "member"].includes(member.status) ||
        (member.status === "restricted" && member.is_member === true);
    } catch (error) {
      console.error("Membership check failed:", error.message);
      return false;
    }
  }

  function joinKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.url("📢 اشترك بالقناة", channelUrl)],
      [Markup.button.callback("✅ تحققت من الاشتراك", "CHECK_SUBSCRIPTION")]
    ]);
  }

  function connectUrl(proxy) {
    return "tg://socks?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port;
  }

  function proxyText(proxy) {
    return [
      "🚀 <b>بروكسي تيليجرام متاح</b>",
      "",
      "🛡 <b>النوع:</b> SOCKS5",
      "🌐 <b>العنوان:</b> <code>" + proxy.host + "</code>",
      "🔌 <b>المنفذ:</b> <code>" + proxy.port + "</code>",
      "⚡ <b>زمن الاتصال المقاس:</b> " + proxy.latency + " ms",
      "",
      "🟢 نجح اختبار اتصال SOCKS5 إلى نقطة اتصال تيليجرام وقت الفحص.",
      "⚠️ بروكسي عام من مصدر خارجي؛ لا تستخدمه للمعلومات الحساسة."
    ].join("\n");
  }

  function proxyButtons(proxy) {
    const connect = connectUrl(proxy);
    const share = "https://t.me/share/url?url=" + encodeURIComponent(connect) +
      "&text=" + encodeURIComponent("رابط بروكسي تيليجرام");
    return Markup.inlineKeyboard([
      [Markup.button.url("🔗 اتصال بالبروكسي", connect)],
      [Markup.button.url("📤 مشاركة", share)]
    ]);
  }

  async function sendLatest(ctx) {
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("🔒 اشترك بالقناة أولاً ثم اضغط زر التحقق.", joinKeyboard());
    }
    return ctx.reply(
      "لا أحتفظ بقائمة لحظية داخل ذاكرة البوت. استخدم أحدث منشور في القناة للحصول على الروابط المتاحة.",
      Markup.inlineKeyboard([[Markup.button.url("📢 فتح القناة", channelUrl)]])
    );
  }

  bot.start(async ctx => {
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply(
        "أهلاً بك في Telegram Proxy Hub 🇮🇶\n\nاشترك بالقناة أولاً للحصول على روابط البروكسيات والتحديثات.",
        joinKeyboard()
      );
    }
    return ctx.reply(
      "أهلاً بك! ⚡\n\nاستخدم الزر لفتح أحدث البروكسيات المنشورة.",
      Markup.inlineKeyboard([
        [Markup.button.url("⚡ أحدث البروكسيات", channelUrl)],
        [Markup.button.callback("🔄 التحقق من الاشتراك", "CHECK_SUBSCRIPTION")]
      ])
    );
  });

  bot.command("latest", sendLatest);

  bot.action("CHECK_SUBSCRIPTION", async ctx => {
    await ctx.answerCbQuery();
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("لم يظهر اشتراكك بعد. اشترك بالقناة ثم أعد المحاولة.", joinKeyboard());
    }
    return ctx.reply("✅ تم التحقق من اشتراكك. افتح القناة للحصول على أحدث البروكسيات.", {
      ...Markup.inlineKeyboard([[Markup.button.url("⚡ فتح القناة", channelUrl)]])
    });
  });

  bot.catch((error, ctx) => {
    console.error("Bot update error:", error.message);
    if (ctx && ctx.chat) {
      return ctx.reply("حدث خطأ مؤقت. حاول مرة أخرى بعد قليل.").catch(() => {});
    }
  });

  instance = bot;
  return bot;
}

module.exports = { getBot };
