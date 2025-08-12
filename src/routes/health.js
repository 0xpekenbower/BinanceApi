export default async function (fastify) {
  fastify.get('/live', {
    schema: {
      tags: ['meta'],
      summary: 'Liveness check',
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
    },
  }, async () => ({ status: 'alive' }));

  fastify.get('/ready', {
    schema: {
      tags: ['meta'],
      summary: 'Readiness check',
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
    },
  }, async () => ({ status: 'ready' }));
};
