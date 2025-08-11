"use strict";

const fp = require('fastify-plugin');

module.exports = fp(async function errorHandling(fastify) {
  fastify.setErrorHandler((err, request, reply) => {
    const status = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = fastify.config?.server?.exposeErrors || process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error';
    fastify.log.error({ err, url: request.url, method: request.method }, 'Request failed');
    reply.status(status).send({ error: { code, message } });
  });
});
