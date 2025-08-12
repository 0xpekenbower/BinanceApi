export default async function (fastify) {
  const tags = ['user-stream'];

  fastify.post('/listenKey', {
    schema: {
      tags,
      summary: 'Create a listen key (SIGNED).',
      security: [{ binanceApiKey: [] }],
    },
  }, async () => fastify.binance.apiKeyPost('/api/v3/userDataStream', {}));

  fastify.put('/listenKey', {
    schema: {
      tags,
      summary: 'Keepalive a listen key (SIGNED).',
      security: [{ binanceApiKey: [] }],
      querystring: { type: 'object', required: ['listenKey'], properties: { listenKey: { type: 'string' } } },
    },
  }, async (req) => fastify.binance.apiKeyPut('/api/v3/userDataStream', req.query));

  fastify.delete('/listenKey', {
    schema: {
      tags,
      summary: 'Close a listen key (SIGNED).',
      security: [{ binanceApiKey: [] }],
      querystring: { type: 'object', required: ['listenKey'], properties: { listenKey: { type: 'string' } } },
    },
  }, async (req) => fastify.binance.apiKeyDelete('/api/v3/userDataStream', req.query));
};
