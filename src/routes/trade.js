"use strict";

module.exports = async function (fastify) {
  const tags = ['trade'];

  // New order (SIGNED)
  fastify.post('/order', {
    schema: {
      tags,
      summary: 'Create a new order (SIGNED).',
      security: [{ binanceApiKey: [] }],
      body: {
        type: 'object',
        required: ['symbol', 'side', 'type'],
        properties: {
          symbol: { type: 'string' },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          type: { type: 'string' },
          timeInForce: { type: 'string' },
          quantity: { type: 'number' },
          quoteOrderQty: { type: 'number' },
          price: { type: 'number' },
          newClientOrderId: { type: 'string' },
          stopPrice: { type: 'number' },
          icebergQty: { type: 'number' },
          newOrderRespType: { type: 'string' },
        },
      },
    },
  }, async (req) => fastify.binance.privatePost('/api/v3/order', req.body));

  // Test new order (SIGNED but no order placed)
  fastify.post('/order/test', {
    schema: {
      tags,
      summary: 'Test new order (SIGNED).',
      security: [{ binanceApiKey: [] }],
      body: {
        type: 'object',
        required: ['symbol', 'side', 'type'],
        properties: {
          symbol: { type: 'string' },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          type: { type: 'string' },
          timeInForce: { type: 'string' },
          quantity: { type: 'number' },
          quoteOrderQty: { type: 'number' },
          price: { type: 'number' },
          newClientOrderId: { type: 'string' },
          stopPrice: { type: 'number' },
          icebergQty: { type: 'number' },
          newOrderRespType: { type: 'string' },
        },
      },
    },
  }, async (req) => fastify.binance.privatePost('/api/v3/order/test', req.body));

  // Query order
  fastify.get('/order', {
    schema: {
      tags,
      summary: 'Query order (SIGNED).',
      security: [{ binanceApiKey: [] }],
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
          orderId: { type: 'number' },
          origClientOrderId: { type: 'string' },
        },
      },
    },
  }, async (req) => fastify.binance.privateGet('/api/v3/order', req.query));

  // Cancel order
  fastify.delete('/order', {
    schema: {
      tags,
      summary: 'Cancel order (SIGNED).',
      security: [{ binanceApiKey: [] }],
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
          orderId: { type: 'number' },
          origClientOrderId: { type: 'string' },
          newClientOrderId: { type: 'string' },
          cancelRestrictions: { type: 'string' },
        },
      },
    },
  }, async (req) => fastify.binance.privateDelete('/api/v3/order', req.query));

  // Current open orders
  fastify.get('/openOrders', {
    schema: {
      tags,
      summary: 'Current open orders (SIGNED).',
      security: [{ binanceApiKey: [] }],
      querystring: {
        type: 'object',
        properties: { symbol: { type: 'string' } },
      },
    },
  }, async (req) => fastify.binance.privateGet('/api/v3/openOrders', req.query));
};
