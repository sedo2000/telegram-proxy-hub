const axios = require("axios");

function config() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return { url, key };
}

async function db(method, table, params, data) {
  const { url, key } = config();
  const response = await axios({
    method,
    url: url + "/rest/v1/" + table + (params ? "?" + params : ""),
    data,
    timeout: 10000,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=exact" : "resolution=merge-duplicates,return=representation"
    }
  });
  return response.data;
}

async function hasPublished(id) {
  const rows = await db("GET", "proxies",
    "select=id&proxy_key=eq." + encodeURIComponent(id) + "&limit=1");
  return Array.isArray(rows) && rows.length > 0;
}

async function saveProxy(proxy) {\n  await db("POST", "proxies", "on_conflict=proxy_key", {\n    proxy_key: proxy.id, type: proxy.type || "mtproto", host: proxy.host, port: proxy.port,\n    secret: proxy.secret || null, latency_ms: proxy.latency,\n    checked_at: proxy.checkedAt || new Date().toISOString(), active: true\n  });\n}\n\nasync function markPublished(proxy) {
  await db("POST", "proxies", "on_conflict=proxy_key", {
    proxy_key: proxy.id,
    type: proxy.type || "socks5",
    host: proxy.host,
    port: proxy.port,
    secret: proxy.secret || null,
    latency_ms: proxy.latency,
    checked_at: proxy.checkedAt || new Date().toISOString(),
    published_at: new Date().toISOString(),
    active: true
  });
}

async function getLatestProxies(limit = 5) {
  const rows = await db("GET", "proxies",
    "select=proxy_key,type,host,port,secret,latency_ms,checked_at&active=eq.true&order=latency_ms.asc&limit=" +
    Math.max(1, Math.min(10, Number(limit) || 5)));
  return (rows || []).map(row => ({
    id: row.proxy_key,
    type: row.type,
    host: row.host,
    port: row.port,
    secret: row.secret,
    latency: row.latency_ms,
    checkedAt: row.checked_at
  }));
}

async function saveUser(user) {
  if (!user || !user.id) return;
  await db("POST", "users", "on_conflict=telegram_id", {
    telegram_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    last_seen_at: new Date().toISOString()
  });
}

async function getStats() {
  const { url, key } = config();
  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
    Prefer: "count=exact",
    Range: "0-0"
  };
  const [users, proxies] = await Promise.all([
    axios.get(url + "/rest/v1/users?select=telegram_id", { headers, timeout: 8000 }),
    axios.get(url + "/rest/v1/proxies?select=id&active=eq.true", { headers, timeout: 8000 })
  ]);
  const count = response => {
    const range = response.headers["content-range"] || "";
    const total = range.split("/")[1];
    return total && total !== "*" ? Number(total) : (response.data || []).length;
  };
  return { users: count(users), activeProxies: count(proxies) };
}

module.exports = { hasPublished, markPublished, saveProxy, getLatestProxies, saveUser, getStats };
