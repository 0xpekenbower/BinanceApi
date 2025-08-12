#!/usr/bin/env node
// Persistent Market Data WebSocket App (now importable)
// Responsibilities:
// - Stable connection to Binance market data websocket (public only)
// - Pong reply mirroring ping payload ASAP (within same tick)
// - Unsolicited ping (empty payload) only if no ping for 50s (still mindful of 5 msg/sec limit)
// - 1 minute status output
// - 12h proactive reconnect (hard reset)
// - Cap streams at < 512 (custom safety) even though Binance allows 1024
// - Track connect/disconnect counts; exit process after 5 disconnects (PreProtection From Ban)
// - Exponential backoff with jitter for reconnect
// - Export start/stop to integrate with main server (npm run start)
// - Self-start only when executed directly, not when imported

import 'dotenv/config';
import WebSocket from 'ws';
import process from 'process';

// ---------------------------- Config ----------------------------
const argMap = Object.fromEntries(process.argv.slice(2).map(kv => kv.split('=')));
const SYMBOLS = (process.env.SYMBOLS || argMap.SYMBOLS || 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT').split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
const MAX_STREAMS = 512; // custom safety threshold (Binance limit 1024)
const DISPLAY_INTERVAL_MS = 10_000; // 1 minute
const HARD_RESET_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h
const ENDPOINT = 'wss://data-stream.binance.vision/stream'; // market data only
const TIME_UNIT = (process.env.TIME_UNIT || argMap.TIME_UNIT || '').toLowerCase(); // '' | 'microsecond'
const USE_ALL_MINI_THRESHOLD = 200; // switch to !miniTicker@arr if many symbols
const MAX_DISCONNECTS = 5; // after this exit (pre protection from ban)
const EXPECTED_PING_INTERVAL_MS = 60_000; // if no ping in this timeframe we proactively reconnect after grace
const GRACE_NO_PING_MS = 75_000; // allow some slack before restart
const UNSOLICITED_PING_AFTER_MS = 50_000; // send ping if no ping seen to prompt server

// ---------------------------- State ----------------------------
let ws = null;
let connectCount = 0;
let disconnectCount = 0;
let lastMessageTs = 0;
let lastPingTs = 0;
let lastPongTs = 0;
let shuttingDown = false;
let hardResetTimer = null;
let displayTimer = null;
let healthTimer = null;
let reconnectAttempts = 0;

// symbol -> miniTicker snapshot
const dataMap = new Map();

// ---------------------------- Helpers ----------------------------
function buildUrl() {
  // If too many symbols or user demanded, use aggregate miniTicker array
  if (SYMBOLS.length > USE_ALL_MINI_THRESHOLD) {
    return `${ENDPOINT}?streams=!miniTicker@arr${TIME_UNIT.startsWith('micro') ? '&timeUnit=MICROSECOND' : ''}`;
  }
  if (SYMBOLS.length > MAX_STREAMS) {
    console.error(`Too many symbols (${SYMBOLS.length}) > MAX_STREAMS (${MAX_STREAMS}). Trimming.`);
  }
  const limited = SYMBOLS.slice(0, MAX_STREAMS);
  const stream = limited.map(s => `${s}@miniTicker`).join('/');
  return `${ENDPOINT}?streams=${stream}${TIME_UNIT.startsWith('micro') ? '&timeUnit=MICROSECOND' : ''}`;
}

function humanDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h${m}m${sec}s`;
}

function scheduleDisplayLoop() {
  if (displayTimer) clearInterval(displayTimer);
  displayTimer = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    const age = (now - lastMessageTs) / 1000;
    const sincePing = lastPingTs ? ((now - lastPingTs) / 1000).toFixed(1) : 'N/A';
    const sincePong = lastPongTs ? ((now - lastPongTs) / 1000).toFixed(1) : 'N/A';
    process.stdout.write(`\n[${new Date().toISOString()}] MarketWatcher Status: symbols=${SYMBOLS.length} dataEntries=${dataMap.size} reconnectAttempts=${reconnectAttempts} connects=${connectCount} disconnects=${disconnectCount} lastMsgAge=${age.toFixed(1)}s lastPingAge=${sincePing}s lastPongAge=${sincePong}s`);

    // Print table of current miniTicker data (sorted by symbol). Controlled by DISPLAY_FULL (default on)
    const displayFull = (process.env.DISPLAY_FULL || '1') !== '0';
    if (displayFull && dataMap.size) {
      const headers = ['SYMBOL','LAST','OPEN','HIGH','LOW','VOLUME','QUOTE'];
      const rows = [];
      for (const [sym, d] of Array.from(dataMap.entries()).sort((a,b)=>a[0].localeCompare(b[0]))) {
        // miniTicker fields: c (close), o (open), h, l, v (base vol), q (quote vol)
        rows.push({
          SYMBOL: sym.toUpperCase(),
          LAST: d.c,
          OPEN: d.o,
          HIGH: d.h,
          LOW: d.l,
          VOLUME: d.v,
          QUOTE: d.q
        });
      }
      // simple fixed-width formatting
      const colWidths = headers.map(h => Math.max(h.length, ...rows.map(r => String(r[h]).length)));
      const line = (vals) => vals.map((v,i)=>String(v).padStart(colWidths[i])).join('  ');
      process.stdout.write(`\n${line(headers)}\n`);
      for (const r of rows) process.stdout.write(line(headers.map(h=>r[h])) + '\n');
    }
    process.stdout.write('\n');
  }, DISPLAY_INTERVAL_MS);
}

function scheduleHealthLoop() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    if (lastPingTs && now - lastPingTs > UNSOLICITED_PING_AFTER_MS && ws && ws.readyState === WebSocket.OPEN) {
      // Send an unsolicited ping with empty payload (counts toward limit) only once per interval
      try { ws.ping(); } catch {}
    }
    if (now - lastPingTs > GRACE_NO_PING_MS) {
      console.warn('[health] No ping from server in grace window. Reconnecting.');
      safeReconnect();
      return;
    }
  }, 10_000); // check every 10s
}

function scheduleHardReset() {
  if (hardResetTimer) clearTimeout(hardResetTimer);
  hardResetTimer = setTimeout(() => {
    if (shuttingDown) return;
    console.log('[lifecycle] 12h hard reset triggered.');
    safeReconnect();
  }, HARD_RESET_INTERVAL_MS);
}

function safeReconnect() {
  if (!ws) return connect();
  try { ws.terminate(); } catch {}
  // close handler will trigger reconnect
}

// ---------------------------- Connection Logic ----------------------------
function connect() {
  const url = buildUrl();
  ws = new WebSocket(url);
  connectCount += 1;
  console.log(`[connect] Opening WebSocket (#${connectCount}) url=${url}`);

  ws.on('open', () => {
    reconnectAttempts = 0;
    lastMessageTs = Date.now();
    console.log('[connect] WebSocket open.');
  });

  ws.on('ping', (payload) => {
    lastPingTs = Date.now();
    try { ws.pong(payload); lastPongTs = Date.now(); } catch {}
  });

  ws.on('pong', () => { lastPongTs = Date.now(); }); // in case server replies to our unsolicited ping

  ws.on('message', raw => {
    lastMessageTs = Date.now();
    try {
      const msg = JSON.parse(raw.toString());
      const payload = msg.data || msg;
      if (Array.isArray(payload)) {
        for (const entry of payload) {
          if (entry && entry.s) dataMap.set(entry.s, entry);
        }
      } else if (payload && payload.s) {
        dataMap.set(payload.s, payload);
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on('close', () => {
    disconnectCount += 1;
    console.warn(`[disconnect] WebSocket closed. disconnects=${disconnectCount}`);
    if (shuttingDown) return;
    if (disconnectCount >= MAX_DISCONNECTS) {
      console.error('PreProtection From Ban');
      process.exit(1);
    }
    attemptReconnect();
  });

  ws.on('error', err => {
    console.warn('[error] WebSocket error:', err?.message);
  });
}

function attemptReconnect() {
  reconnectAttempts += 1;
  const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), 15_000);
  const jitter = Math.random() * 500;
  console.log(`[reconnect] Attempt #${reconnectAttempts} in ${(delay + jitter).toFixed(0)}ms.`);
  setTimeout(() => { if (!shuttingDown) connect(); }, delay + jitter);
}

// ---------------------------- Startup ----------------------------
function startMarketWatcher() {
  if (ws) return; // already started
  scheduleDisplayLoop();
  scheduleHealthLoop();
  scheduleHardReset();
  connect();
  console.log(`[startup] MarketWatcher started with ${SYMBOLS.length} requested symbols (capped at ${MAX_STREAMS}). Hard reset every ${humanDuration(HARD_RESET_INTERVAL_MS)}.`);
}

// ---------------------------- Shutdown ----------------------------
function stopMarketWatcher(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(displayTimer);
  clearInterval(healthTimer);
  clearTimeout(hardResetTimer);
  try { ws?.close(); } catch {}
  console.log(`[shutdown] MarketWatcher stopping. connects=${connectCount} disconnects=${disconnectCount} dataEntries=${dataMap.size}`);
  if (code !== null) process.exit(code); // allow caller to omit exit by passing null
}

process.on('SIGINT', () => stopMarketWatcher(0));
process.on('SIGTERM', () => stopMarketWatcher(0));

if (import.meta.url === `file://${process.argv[1]}`) {
  startMarketWatcher();
}

export { startMarketWatcher, stopMarketWatcher };
