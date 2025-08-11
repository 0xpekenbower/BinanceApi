"use strict";

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildApp } = require('..//server');

async function main() {
  const app = buildApp();
  await app.register(require('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'Binance Fastify Service',
        description: 'Fastify service integrating Binance REST API (Market, Trading, Account, User Data Streams).',
        version: '1.0.0',
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          binanceApiKey: { type: 'apiKey', in: 'header', name: 'X-MBX-APIKEY' },
        },
      },
      security: [{ binanceApiKey: [] }],
    },
  });

  // Register routes minimally to populate schema
  await app.register(require('../src/plugins/binanceClient'));
  await app.register(require('../src/plugins/errorHandling'));
  await app.register(require('../src/routes/health'), { prefix: '/health' });
  await app.register(require('../src/routes/market'), { prefix: '/api/market' });
  await app.register(require('../src/routes/account'), { prefix: '/api/account' });
  await app.register(require('../src/routes/trade'), { prefix: '/api/trade' });
  await app.register(require('../src/routes/userStream'), { prefix: '/api/user-stream' });

  await app.ready();
  const openapi = app.swagger();

  const outDir = path.join(__dirname, '../docs');
  fs.mkdirSync(outDir, { recursive: true });
  const openapiPath = path.join(outDir, 'openapi.json');
  fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));
  const collection = openapiToPostman(openapi);
  const postmanPath = path.join(outDir, 'postman-collection.json');
  fs.writeFileSync(postmanPath, JSON.stringify(collection, null, 2));

  console.log(`Exported:\n- ${openapiPath}\n- ${postmanPath}`);
  await app.close();
}

function openapiToPostman(openapi) {
  const collection = {
    info: {
      name: openapi.info?.title || 'API',
      description: openapi.info?.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [],
    variable: [
      { key: 'baseUrl', value: 'http://localhost:8080' },
      { key: 'BINANCE_API_KEY', value: '' },
    ],
  };

  const paths = openapi.paths || {};
  for (const [route, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const name = op.summary || `${method.toUpperCase()} ${route}`;
      const url = `{{baseUrl}}${route}`;
      const headers = [];
      const requiresKey = Array.isArray(op.security) && op.security.length > 0;
      if (requiresKey) headers.push({ key: 'X-MBX-APIKEY', value: '{{BINANCE_API_KEY}}' });
      const item = {
        name,
        request: {
          method: method.toUpperCase(),
          header: headers,
          url,
        },
      };
      collection.item.push(item);
    }
  }
  return collection;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
