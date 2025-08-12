// Bootstrap Fastify app (ESM)
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { startMarketWatcher, stopMarketWatcher } from './src/app/marketWatcher.js';

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
		// Auto-export OpenAPI + Postman collection
		try {
			const openapi = app.swagger();
			const docsDir = path.join(process.cwd(), 'docs');
			fs.mkdirSync(docsDir, { recursive: true });
			const openapiPath = path.join(docsDir, 'openapi.json');
			fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));
			// Minimal Postman conversion (subset) similar to previous script
			const collection = {
				info: {
					name: openapi.info?.title || 'API',
					description: openapi.info?.description || '',
					schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
				},
				item: [],
				variable: [
					{ key: 'baseUrl', value: 'http://localhost:' + port },
					{ key: 'BINANCE_API_KEY', value: '' }
				]
			};
			const paths = openapi.paths || {};
			for (const [route, methods] of Object.entries(paths)) {
				for (const [method, op] of Object.entries(methods)) {
					const name = op.summary || `${method.toUpperCase()} ${route}`;
					const requiresKey = Array.isArray(op.security) && op.security.length > 0;
					const headers = requiresKey ? [{ key: 'X-MBX-APIKEY', value: '{{BINANCE_API_KEY}}' }] : [];
					collection.item.push({
						name,
						request: { method: method.toUpperCase(), header: headers, url: `{{baseUrl}}${route}` }
					});
				}
			}
			fs.writeFileSync(path.join(docsDir, 'postman-collection.json'), JSON.stringify(collection, null, 2));
			app.log.info('Exported OpenAPI + Postman docs');
		} catch (docErr) {
			app.log.warn({ err: docErr }, 'Docs export failed');
		}
		await app.listen({ port, host });
		app.log.info(`Docs available at http://${host}:${port}/docs`);
		startMarketWatcher();
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	start();
}

export { buildApp, registerApp };
