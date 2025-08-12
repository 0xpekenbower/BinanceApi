export default async function (fastify) {
  const tags = ['market'];

  // Ping
  fastify.get('/ping', { schema: { tags, summary: 'Test connectivity to the Rest API.' } }, async () => {
    return fastify.binance.publicGet('/api/v3/ping');
  });

  // Server time
  fastify.get('/time', { schema: { tags, summary: 'Current server time.' } }, async () => {
    return fastify.binance.publicGet('/api/v3/time');
  });

  // Exchange Info
  fastify.get('/exchangeInfo', {
    schema: {
      tags,
      summary: 'Exchange information.',
      querystring: {
        type: 'object',
        properties: { symbol: { type: 'string' }, symbols: { type: 'string' } },
      },
    },
  }, async (req) => fastify.binance.publicGet('/api/v3/exchangeInfo', req.query));

  // Order book
  fastify.get('/depth', {
    schema: {
      tags,
      summary: 'Order book (depth).',
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
          limit: { type: 'integer', minimum: 5, maximum: 5000 },
        },
      },
    },
  }, async (req) => fastify.binance.publicGet('/api/v3/depth', req.query));

  // Recent trades
  fastify.get('/trades', {
    schema: {
      tags,
      summary: 'Recent trades.',
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: { symbol: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } },
      },
    },
  }, async (req) => fastify.binance.publicGet('/api/v3/trades', req.query));

  // Klines
  fastify.get('/klines', {
    schema: {
      tags,
      summary: 'Kline/candlestick data.',
      querystring: {
        type: 'object',
        required: ['symbol', 'interval'],
        properties: {
          symbol: { type: 'string' },
          interval: { type: 'string' },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  }, async (req) => fastify.binance.publicGet('/api/v3/klines', req.query));
};
