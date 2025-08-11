"use strict";

// Bootstrap Fastify app
require('dotenv').config();

const path = require('path');
const Fastify = require('fastify');
const sensible = require('@fastify/sensible');
const helmet = require('@fastify/helmet');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const swagger = require('@fastify/swagger');
const swaggerUI = require('@fastify/swagger-ui');

const buildApp = () => {
	const app = Fastify({
		logger: {
			level: process.env.LOG_LEVEL || 'info',
			transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
		},
		trustProxy: true,
	});

	// Global decorators / config
	app.decorate('config', {
		binance: {
			baseURL: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
			apiKey: process.env.BINANCE_API_KEY || '',
			apiSecret: process.env.BINANCE_API_SECRET || '',
		},
		server: {
			port: Number(process.env.PORT || 8080),
			host: process.env.HOST || '0.0.0.0',
		},
	});

	return app;
};

async function start() {
	const app = buildApp();

	// Plugins
	await app.register(sensible);
	await app.register(helmet, { contentSecurityPolicy: false });
	await app.register(cors, { origin: true, credentials: true });
	await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

	// Swagger
	await app.register(swagger, {
		openapi: {
			info: {
				title: 'Binance Fastify Service',
				description: 'Fastify service integrating Binance REST API (Market, Trading, Account, User Data Streams).',
				version: '1.0.0',
			},
			servers: [{ url: '/' }],
			components: {
				securitySchemes: {
					binanceApiKey: {
						type: 'apiKey',
						in: 'header',
						name: 'X-MBX-APIKEY',
					},
				},
			},
			security: [{ binanceApiKey: [] }],
		},
	});
	await app.register(swaggerUI, {
		routePrefix: '/docs',
		uiConfig: { docExpansion: 'list', deepLinking: false },
	});

	// Internal plugins and routes
	await app.register(require('./src/plugins/binanceClient'));
	await app.register(require('./src/plugins/errorHandling'));

	await app.register(require('./src/routes/health'), { prefix: '/health' });
	await app.register(require('./src/routes/market'), { prefix: '/api/market' });
	await app.register(require('./src/routes/account'), { prefix: '/api/account' });
	await app.register(require('./src/routes/trade'), { prefix: '/api/trade' });
	await app.register(require('./src/routes/userStream'), { prefix: '/api/user-stream' });

	// Root
	app.get('/', {
		schema: {
			tags: ['meta'],
			summary: 'Service status',
			response: {
				200: {
					type: 'object',
					properties: { name: { type: 'string' }, status: { type: 'string' } },
				},
			},
		},
	}, async () => ({ name: 'binance-service', status: 'ok' }));

	const { port, host } = app.config.server;
	try {
		await app.ready();
		await app.listen({ port, host });
		app.log.info(`Docs available at http://${host}:${port}/docs`);
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}

if (require.main === module) {
	start();
}

module.exports = { buildApp };
