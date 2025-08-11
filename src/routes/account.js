"use strict";

module.exports = async function (fastify) {
  const tags = ['account'];

  fastify.get('/info', {
    schema: { tags, summary: 'Account information (SIGNED).', security: [{ binanceApiKey: [] }] },
  }, async (req) => fastify.binance.privateGet('/api/v3/account', {}));

  fastify.get('/status', {
    schema: { tags, summary: 'Account status (SIGNED).', security: [{ binanceApiKey: [] }] },
  }, async () => fastify.binance.privateGet('/sapi/v1/account/status', {}));

  fastify.get('/apiTradingStatus', {
    schema: { tags, summary: 'API trading status (SIGNED).', security: [{ binanceApiKey: [] }] },
  }, async () => fastify.binance.privateGet('/sapi/v1/account/apiTradingStatus', {}));
};
