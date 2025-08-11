"use strict";

const crypto = require('crypto');
const axios = require('axios');
const fp = require('fastify-plugin');

function createSignature(secret, queryString) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

module.exports = fp(async function binanceClient(fastify) {
  const { baseURL, apiKey, apiSecret } = fastify.config.binance;

  const http = axios.create({
    baseURL,
    timeout: 10_000,
    headers: { 'User-Agent': 'fastify-binance-service/1.0' },
  });

  async function publicGet(path, params = {}) {
    const qs = toQuery(params);
    const url = qs ? `${path}?${qs}` : path;
    const { data } = await http.get(url);
    return data;
  }

  async function signedRequest(method, path, params = {}) {
    if (!apiKey || !apiSecret) {
      throw fastify.httpErrors.unauthorized('Missing BINANCE_API_KEY / BINANCE_API_SECRET');
    }
    const timestamp = Date.now();
    const recvWindow = Number(process.env.BINANCE_RECV_WINDOW || 5000);
    const payload = { ...params, timestamp };
    if (recvWindow) payload.recvWindow = recvWindow;
    const query = toQuery(payload);
    const signature = createSignature(apiSecret, query);
    const url = `${path}?${query}&signature=${signature}`;
    const headers = { 'X-MBX-APIKEY': apiKey };
    const { data } = await http.request({ method, url, headers });
    return data;
  }

  async function apiKeyRequest(method, path, params = {}) {
    if (!apiKey) {
      throw fastify.httpErrors.unauthorized('Missing BINANCE_API_KEY');
    }
    const qs = toQuery(params);
    const url = qs ? `${path}?${qs}` : path;
    const headers = { 'X-MBX-APIKEY': apiKey };
    const { data } = await http.request({ method, url, headers });
    return data;
  }

  fastify.decorate('binance', {
    publicGet,
    privateGet: (path, params) => signedRequest('GET', path, params),
    privatePost: (path, params) => signedRequest('POST', path, params),
    privatePut: (path, params) => signedRequest('PUT', path, params),
    privateDelete: (path, params) => signedRequest('DELETE', path, params),
    apiKeyGet: (path, params) => apiKeyRequest('GET', path, params),
    apiKeyPost: (path, params) => apiKeyRequest('POST', path, params),
    apiKeyPut: (path, params) => apiKeyRequest('PUT', path, params),
    apiKeyDelete: (path, params) => apiKeyRequest('DELETE', path, params),
  });
});
