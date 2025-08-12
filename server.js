// Bootstrap Fastify app (ESM)
import 'dotenv/config';
import path from 'path';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

const buildApp = () => {
	const app = Fastify({
		logger: {
			level: process.env.LOG_LEVEL || 'info',
			transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
		},
		trustProxy: true,
	});

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

// Register all plugins and routes (separated from build so tests can reuse)
async function registerApp(app) {
	await app.register(sensible);
	await app.register(helmet, { contentSecurityPolicy: false });
	await app.register(cors, { origin: true, credentials: true });
	await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

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

	await app.register((await import('./src/plugins/binanceClient.js')).default);
	await app.register((await import('./src/plugins/errorHandling.js')).default);

	await app.register((await import('./src/routes/health.js')).default, { prefix: '/health' });
	await app.register((await import('./src/routes/market.js')).default, { prefix: '/api/market' });
	await app.register((await import('./src/routes/account.js')).default, { prefix: '/api/account' });
	await app.register((await import('./src/routes/trade.js')).default, { prefix: '/api/trade' });
	await app.register((await import('./src/routes/userStream.js')).default, { prefix: '/api/user-stream' });

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

	return app;
}

async function start() {
	const app = buildApp();
	await registerApp(app);

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

if (import.meta.url === `file://${process.argv[1]}`) {
	start();
}

export { buildApp, registerApp };
