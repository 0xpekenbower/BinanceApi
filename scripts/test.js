#!/usr/bin/env node
import { buildApp, registerApp } from '../server.js';

async function main () {
  const app = buildApp();
  await registerApp(app);
  await app.ready();

  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }

  test('GET /health/live', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    if (res.statusCode !== 200) throw new Error('Expected 200');
    if (res.json().status !== 'alive') throw new Error('Alive mismatch');
  });

  test('GET /health/ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    if (res.statusCode !== 200) throw new Error('Expected 200');
    if (res.json().status !== 'ready') throw new Error('Ready mismatch');
  });

  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('✔', t.name); }
    catch (e) { failed++; console.error('✖', t.name, e.message); }
  }
  await app.close();
  if (failed) process.exit(1);
  console.log('All tests passed');
}

main().catch(e => { console.error(e); process.exit(1); });
