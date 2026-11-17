const axios = require("axios");
const { SocksClient } = require("socks");
const net = require("net");

const MAX_LATENCY = Number(process.env.MAX_LATENCY_MS || 1500);
const MAX_CANDIDATES = Number(process.env.MAX_SCAN_CANDIDATES || 100);

function isPublicIPv4(host) {
  if (net.isIP(host) !== 4) return false;
  const p = host.split(".").map(Number);
  if (p.length !== 4 || p.some(n => n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  return true;
}

function validHost(host) {
  if (!host || host.length > 253) return false;
  if (net.isIP(host) === 4) return isPublicIPv4(host);
  if (net.isIP(host) === 6) return false;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}

async function fetchText(url) {
  const response = await axios.get(url, {
    timeout: 12000,
    responseType: "text",
    maxContentLength: 3 * 1024 * 1024,
    headers: { "User-Agent": "Telegram-Proxy-Hub/1.1" }
  });
  return String(response.data);
}

function parseSocksLine(line) {
  const value = String(line || "").trim();
  if (!value || value.startsWith("#")) return null;
  const match = value.match(/^(?:socks5:\/\/)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/i);
  if (!match) return null;
  const host = match[1], port = Number(match[2]);
  if (!isPublicIPv4(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { id: "socks5:" + host + ":" + port, type: "socks5", host, port };
}

function parseMtprotoLine(line) {
  const value = String(line || "").trim();
  if (!value || value.startsWith("#")) return null;
  let params;
  try {
    if (/^(https?:\/\/)?t\.me\/proxy\?/i.test(value) || /^tg:\/\/proxy\?/i.test(value)) {
      const normalized = value.startsWith("tg://") ? value : value.startsWith("http") ? value : "https://" + value;
      params = new URL(normalized).searchParams;
    } else {
      const match = value.match(/^([^\s:]+):(\d{1,5}):([a-z0-9_-]{16,64})$/i);
      if (!match) return null;
      params = new URLSearchParams({ server: match[1], port: match[2], secret: match[3] });
    }
  } catch (_) { return null; }
  const host = (params.get("server") || "").trim().toLowerCase();
  const port = Number(params.get("port"));
  const secret = (params.get("secret") || "").trim();
  if (!validHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!/^(?:[a-f0-9]{32}|[a-z0-9_-]{16,64})$/i.test(secret)) return null;
  const id = "mtproto:" + host + ":" + port + ":" + secret;
  return { id, type: "mtproto", host, port, secret };
}

async function fetchSource(url) {
  const body = await fetchText(url);
  return body.split(/\r?\n/);
}

function testTcp(proxy) {
  return new Promise(resolve => {
    const started = Date.now();
    const socket = net.createConnection({ host: proxy.host, port: proxy.port });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(4500);
    socket.once("connect", () => {
      const latency = Date.now() - started;
      if (latency > MAX_LATENCY) return finish(null);
      finish({ ...proxy, latency, checkedAt: new Date().toISOString() });
    });
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

function testSocksProxy(proxy) {
  return new Promise(resolve => {
    const started = Date.now();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 4500);
    SocksClient.createConnection({
      proxy: { host: proxy.host, port: proxy.port, type: 5 },
      command: "connect",
      destination: { host: "149.154.167.51", port: 443 },
      timeout: 4000
    }).then(result => {
      const latency = Date.now() - started;
      result.socket.destroy();
      if (latency > MAX_LATENCY) return finish(null);
      finish({ ...proxy, latency, checkedAt: new Date().toISOString() });
    }).catch(() => finish(null));
  });
}

async function mapLimit(items, limit, worker) {
  const output = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        const result = await worker(items[index]);
        if (result) output.push(result);
      } catch (_) {}
    }
  });
  await Promise.all(workers);
  return output;
}

async function collectByType(envName, parser, tester) {
  const sources = String(process.env[envName] || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!sources.length) return [];
  const sourceResults = await Promise.all(sources.map(async url => {
    try { return (await fetchSource(url)).map(parser).filter(Boolean); }
    catch (error) {
      console.error(envName + " source failed:", url, error.message);
      return [];
    }
  }));
  const unique = new Map();
  for (const list of sourceResults) for (const proxy of list) unique.set(proxy.id, proxy);
  const candidates = [...unique.values()].slice(0, MAX_CANDIDATES);
  return (await mapLimit(candidates, 15, tester)).sort((a, b) => a.latency - b.latency);
}

async function collectWorkingProxies() {
  const [socks5, mtproto] = await Promise.all([
    collectByType("PROXY_SOURCES", parseSocksLine, testSocksProxy),
    collectByType("MTPROTO_SOURCES", parseMtprotoLine, testTcp)
  ]);
  if (!process.env.PROXY_SOURCES && !process.env.MTPROTO_SOURCES) {
    throw new Error("Set PROXY_SOURCES and/or MTPROTO_SOURCES");
  }
  return { socks5, mtproto };
}

module.exports = { collectWorkingProxies, parseMtprotoLine };
