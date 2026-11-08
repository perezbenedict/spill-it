import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { appendFileSync } from 'node:fs';

const root = process.cwd();
const runE2E = !process.argv.includes('--load-only');
const runLoad = !process.argv.includes('--e2e-only');
const work = await mkdtemp(path.join(os.tmpdir(), 'spill-isolated-'));
const runId = randomUUID().slice(0, 8);
const output = path.join(root, 'artifacts', `isolated-${new Date().toISOString().replace(/[:.]/g, '-')}-${runId}`);
await mkdir(output, { recursive: true });
async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const workerPort = Number(process.env.SPILL_TEST_WORKER_PORT || await availablePort());
const appPort = Number(process.env.SPILL_TEST_APP_PORT || await availablePort());
const api = `http://127.0.0.1:${workerPort}`;
const site = `http://127.0.0.1:${appPort}`;
const secret = randomUUID();
const password = `Local-${randomUUID()}`;
const redact = value => String(value).replaceAll(secret, '[redacted]').replaceAll(password, '[redacted]')
  .replace(/(env\.SPILL_(?:API_SECRET|ADMIN_PASSWORD)\s+\()"[^"]*"/g, '$1"[redacted]"');
const persist = path.join(work, 'state');
const config = path.join(work, 'wrangler.json');
const children = new Set();
const serviceGroups = new Set();
const liveId = '11111111-1111-4111-8111-111111111111';
const ids = [1, 2, 3].map((n) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`);
const codes = ['ABCDEFGH', 'BCDEFGHJ', 'CDEFGHJK', 'DEFGHJKM'];
const fixtures = {
  SPILL_E2E_SESSION_CODE: codes[0], SPILL_E2E_LONG_SESSION_CODE: codes[0],
  SPILL_E2E_SECOND_SESSION_CODE: codes[3], SPILL_E2E_CLOSED_SESSION_CODE: codes[1],
  SPILL_E2E_ROOM_CODE: codes[0], SPILL_E2E_TOPIC: 'What makes a conversation meaningful?',
  SPILL_E2E_PRESENTED_TEXT: 'Selected projected contribution',
  SPILL_E2E_PROJECTION_IDS: ids.join(','), SPILL_E2E_ADMIN_PASSWORD: password,
  SPILL_E2E_ADMIN_SESSION_ID: liveId, SPILL_E2E_BULK_SUBMISSION_IDS: ids.join(','),
  SPILL_E2E_BULK_SESSION_IDS: [2, 3, 4].map(n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`).join(','),
  SPILL_E2E_RUN_LIFECYCLE: '1', SPILL_E2E_REQUIRED: '1',
  SPILL_E2E_WORKER_URL: api, SPILL_E2E_API_SECRET: secret,
};
// All values that could redirect application traffic override any local .env files.
const env = { ...process.env, ...fixtures, SPILL_API_URL: api, SPILL_API_SECRET: secret,
  NEXT_PUBLIC_SITE_URL: site, PLAYWRIGHT_BASE_URL: site, NEXT_TELEMETRY_DISABLED: '1' };
await writeFile(config, JSON.stringify({ name: `spill-tests-${runId}`, main: path.join(root, 'api/worker.js'),
  compatibility_date: '2026-01-01', vars: { SPILL_API_SECRET: secret, SPILL_ADMIN_PASSWORD: password },
  d1_databases: [{ binding: 'DB', database_name: 'spill-test', database_id: '00000000-0000-4000-8000-000000000000' }] }));

async function command(bin, args, logName, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', async code => {
      children.delete(child);
      await writeFile(path.join(output, logName), redact(stdout + '\n' + stderr));
      resolve({ code, stdout, stderr });
    });
  });
}
function start(bin, args, name) {
  const child = spawn(bin, args, { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  serviceGroups.add(child);
  let pendingLog = '';
  const capture = chunk => {
    pendingLog += chunk;
    const lines = pendingLog.split('\n');
    pendingLog = lines.pop();
    if (lines.length) appendFileSync(path.join(output, name), redact(`${lines.join('\n')}\n`));
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('close', () => { children.delete(child); if (pendingLog) appendFileSync(path.join(output, name), redact(pendingLog)); });
  return child;
}
function stopChildren() {
  for (const child of children) {
    try {
      if (serviceGroups.has(child) && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch { /* the process may already have exited */ }
  }
}
function forceStopGroups() {
  for (const child of serviceGroups) {
    try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
}
async function shutdown(code) {
  stopChildren();
  await new Promise(resolve => setTimeout(resolve, 500));
  forceStopGroups();
  process.exit(code);
}
process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));
async function ready(url, child) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Local service exited: ${url}`);
    try { const res = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (res.ok) return; } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Local service failed readiness: ${url}`);
}
async function sql(source, label) {
  const file = path.join(work, `${label}.sql`);
  await writeFile(file, source);
  const result = await command('npx', ['wrangler', 'd1', 'execute', 'spill-test', '--config', config, '--local', '--persist-to', persist, '--file', file], `${label}.log`);
  if (result.code !== 0) throw new Error(`Local D1 ${label} failed; see ${output}`);
}
function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
async function seed() {
  let source = 'DELETE FROM discussion_sessions; DELETE FROM auth_rate_limits;\n';
  const names = ['Bulk Contribution Fixture', 'Delete Me Alpha', 'Delete Me Beta', 'Preserve Me Gamma'];
  for (let i = 0; i < 4; i++) {
    const id = i === 0 ? liveId : `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`;
    source += `INSERT INTO discussion_sessions (id,title,topic,welcome_message,public_code,status) VALUES (${quote(id)},${quote(names[i])},${quote(fixtures.SPILL_E2E_TOPIC)},'Everyone has something worth sharing.',${quote(codes[i])},${quote(['live','closed','draft','paused'][i])});\n`;
  }
  const contents = ['Selected projected contribution', 'Selected second contribution', 'Unselected contribution must survive'];
  for (let i = 0; i < 3; i++) source += `INSERT INTO submissions (id,session_id,participant_id,nickname,category,content,moderation_status,created_at) VALUES (${quote(ids[i])},${quote(liveId)},${quote(randomUUID())},'Fixture ${i}','question',${quote(contents[i])},'approved',${quote(`2026-01-01T12:00:0${i}.000Z`)});\n`;
  source += `INSERT INTO presentation_state (session_id,current_submission_id) VALUES (${quote(liveId)},${quote(ids[0])});`;
  await sql(source, 'seed');
}
const summary = { isolation: 'loopback Worker, disposable D1, generated local credentials', output, tests: [], loads: [] };
let failed = false;
let loadBrowser = null;
try {
  await sql(await readFile(path.join(root, 'api/schema.sql'), 'utf8'), 'schema');
  await seed();
  const worker = start('npx', ['wrangler', 'dev', '--config', config, '--local', '--persist-to', persist, '--port', String(workerPort)], 'worker.log');
  await ready(`${api}/health`, worker);
  if (process.argv.includes('--pages-preview')) {
    const previewPort = await availablePort();
    // Pages discovers the existing root configuration; it rejects custom
    // --config paths. CLI bindings override it with disposable local values.
    const preview = start('npx', ['wrangler', 'pages', 'dev', '.open-next', '--port', String(previewPort), '--ip', '127.0.0.1', '--persist-to', path.join(work, 'pages-state'),
      '--binding', `SPILL_API_URL=${api}`, '--binding', `SPILL_API_SECRET=${secret}`, '--binding', `NEXT_PUBLIC_SITE_URL=${site}`], 'pages.log');
    const previewURL = `http://127.0.0.1:${previewPort}`;
    await ready(`${previewURL}/admin/login`, preview);
    const routes = [];
    for (const route of ['/', '/admin/login', `/join/${codes[0]}`, `/qr/${codes[0]}`, `/room/${codes[0]}`]) {
      const response = await fetch(`${previewURL}${route}`);
      const html = await response.text();
      if (!response.ok || html.includes(secret)) throw new Error(`Cloudflare artifact smoke failed: ${route}`);
      routes.push({ route, status: response.status });
      if (route === '/') {
        const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))/g)].map(match => match[1]))];
        if (!assets.length) throw new Error('Cloudflare HTML has no emitted JS/CSS references.');
        for (const asset of assets) {
          const file = await fetch(`${previewURL}${asset}`);
          if (!file.ok || !(file.headers.get('content-type') || '').match(/javascript|css/)) throw new Error('Cloudflare static asset smoke failed.');
        }
        summary.previewAssets = assets.length;
      }
    }
    summary.preview = routes;
    summary.privateArtifacts = [];
    for (const route of ['/cloudflare/next-env.mjs', '/server-functions/default/index.mjs', '/worker.js', '/_worker.js']) {
      const response = await fetch(`${previewURL}${route}`);
      // Pages reserves _worker.js in production. Wrangler's local asset shim
      // returns ENOTDIR/502 for that reserved filename instead of its 404.
      if (response.status !== 404 && !(route === '/_worker.js' && response.status === 502)) throw new Error(`Private build artifact was not denied: ${route} (${response.status})`);
      summary.privateArtifacts.push({ route, status: response.status });
    }
    const login = await fetch(`${api}/admin/auth/login`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const adminToken = (await login.json()).token;
    const adminHeaders = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': adminToken, 'Content-Type': 'application/json' };
    async function votingCall(route, body) {
      const response = await fetch(`${api}${route}`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('Cloudflare voting artifact fixture failed.');
      return response.json();
    }
    let event = (await votingCall('/admin/voting', { title: 'Disposable artifact vote', questions: [{ text: 'Is the compiled voting route ready?', options: ['Yes', 'No'] }] })).event;
    event = (await votingCall(`/admin/voting/${event.id}`, { action: 'open', expectedRevision: event.revision })).event;
    const publicVoteURL = `${previewURL}/api/voting/public/${event.code}`;
    const publicRead = await fetch(publicVoteURL);
    const privateRead = await fetch(`${previewURL}/api/voting/admin/${event.id}`, { headers: { Cookie: `spill_admin_session=${adminToken}` } });
    if (!publicRead.ok || !privateRead.ok) throw new Error('Compiled voting read proxy failed.');
    const ballot = { questionId: event.questions[0].id, optionId: event.questions[0].options[0].id };
    const voteResponse = await fetch(`${publicVoteURL}/vote`, { method: 'POST', headers: { Origin: previewURL, 'Content-Type': 'application/json' }, body: JSON.stringify(ballot) });
    const cookies = voteResponse.headers.getSetCookie();
    if (!voteResponse.ok || !cookies.some(cookie => /HttpOnly/i.test(cookie))) throw new Error('Compiled anonymous vote or protected identity cookie failed.');
    const retry = await fetch(`${publicVoteURL}/vote`, { method: 'POST', headers: { Origin: previewURL, 'Content-Type': 'application/json', Cookie: cookies.map(cookie => cookie.split(';')[0]).join('; ') }, body: JSON.stringify(ballot) });
    if (!retry.ok || !(await retry.json()).duplicate) throw new Error('Compiled anonymous vote retry was not idempotent.');
    const pages = await Promise.all([`/vote/${event.code}`, `/vote/${event.code}/stage`].map(route => fetch(previewURL + route)));
    if (pages.some(response => !response.ok)) throw new Error('Compiled voting pages failed.');
    event = (await votingCall(`/admin/voting/${event.id}`, { action: 'close', expectedRevision: event.revision })).event;
    await votingCall(`/admin/voting/${event.id}`, { action: 'delete', expectedRevision: event.revision, password });
    summary.previewVoting = { publicRead: publicRead.status, adminRead: privateRead.status, vote: voteResponse.status, protectedCookie: true, duplicateRetry: true, voterPage: pages[0].status, projectorPage: pages[1].status };
    console.log(JSON.stringify({ cloudflarePreview: routes, assets: summary.previewAssets }));
  }
  if (runE2E) {
    const production = process.env.SPILL_TEST_DEV !== '1';
    if (production && process.env.SPILL_TEST_PRODUCTION !== '1') {
      const built = await command('npx', ['next', 'build'], 'build.log');
      if (built.code !== 0) throw new Error('Isolated application build failed.');
    }
    const app = start('npx', ['next', production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], 'next.log');
    await ready(`${site}/admin/login`, app);
  }
  if (runE2E) {
    const { readdir } = await import('node:fs/promises');
    const requestedSpecs = new Set((process.argv.includes('--spec') ? process.argv[process.argv.indexOf('--spec') + 1] : '').split(',').filter(Boolean));
    const specs = (await readdir(path.join(root, 'tests/e2e'))).filter(f => f.endsWith('.spec.js') && (!requestedSpecs.size || requestedSpecs.has(f))).sort();
    if (!specs.length) throw new Error('No matching E2E spec.');
    for (const spec of specs) {
      await seed();
      const report = path.join(output, `${spec}.json`);
      const result = await command('npx', ['playwright', 'test', spec, '--reporter=list,json', '--output', path.join(output, `${spec}-results`), ...(process.argv.includes('--update-snapshots') ? ['--update-snapshots=all'] : [])], `${spec}.log`, { PLAYWRIGHT_JSON_OUTPUT_FILE: report });
      let stats = null;
      try { stats = JSON.parse(await readFile(report, 'utf8')).stats; } catch { /* a missing report is a failed release gate */ }
      const passed = result.code === 0 && stats && stats.skipped === 0 && stats.unexpected === 0 && stats.expected > 0;
      summary.tests.push({ spec, passed, stats });
      if (!passed) failed = true;
      console.log(JSON.stringify({ spec, passed, stats }));
    }
  }
  if (runLoad) {
    if (runE2E) {
      const { chromium } = await import('@playwright/test');
      loadBrowser = await chromium.launch();
    }
    for (const concurrency of [10, 25, 50, 100]) {
      await seed();
      const response = await fetch(`${api}/admin/auth/login`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const auth = await response.json();
      if (!response.ok || !auth.token) throw new Error('Local admin token provisioning failed');
      const headers = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': auth.token, 'Content-Type': 'application/json' };
      const platformPath = `${api}/admin/sessions/${liveId}/platform`;
      async function platform(action, fields = {}) {
        const current = await (await fetch(platformPath, { headers })).json();
        return fetch(platformPath, { method: 'POST', headers, body: JSON.stringify({ action, expectedRevision: current.revision, ...fields }) });
      }
      const enqueue = await platform('enqueue', { submissionId: ids[1] });
      if (!enqueue.ok) throw new Error('Local queue load fixture could not be prepared');
      const projector = loadBrowser ? await loadBrowser.newPage({ reducedMotion: 'reduce' }) : null;
      if (projector) {
        await projector.goto(`${site}/room/${codes[0]}`);
        await projector.locator(`[data-current-contribution-id="${ids[0]}"]`).waitFor();
      }
      const submissionRun = command('node', ['scripts/load-submissions.mjs', '--target', api, '--api-secret', secret, '--admin-token', auth.token, '--session-code', codes[0], '--session-id', liveId, '--concurrency', String(concurrency)], `load-${concurrency}.log`);
      const polling = Promise.all(Array.from({ length: concurrency }, async () => {
        const samples = [];
        for (let i = 0; i < 3; i++) {
          const started = performance.now();
          const result = await fetch(`${api}/rooms?code=${codes[0]}`, { headers });
          samples.push({ status: result.status, latencyMs: Number((performance.now() - started).toFixed(1)) });
          await result.arrayBuffer();
        }
        return samples;
      }));
      const advanceStarted = performance.now();
      const moderateStarted = performance.now();
      const contribution = await (await fetch(`${api}/admin/submissions/${ids[2]}`, { headers })).json();
      const moderation = await fetch(`${api}/admin/submissions/${ids[2]}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: contribution.row.revision, discussed_at: new Date().toISOString() }) });
      const moderationLatencyMs = Number((performance.now() - moderateStarted).toFixed(1));
      const advance = await platform('advance');
      const moderationResponseMs = Number((performance.now() - advanceStarted).toFixed(1));
      const observed = await (await fetch(`${api}/rooms?code=${codes[0]}`, { headers })).json();
      const projectionObservedMs = Number((performance.now() - advanceStarted).toFixed(1));
      let browserProjection = null;
      if (projector) {
        await projector.waitForFunction(id => document.querySelector('[data-current-contribution-id]')?.getAttribute('data-current-contribution-id') === id, ids[1], { timeout: 15000 });
        browserProjection = { observedMs: Number((performance.now() - advanceStarted).toFixed(1)), correctPointer: true, reducedMotion: true };
        await projector.close();
      }
      const result = await submissionRun;
      const pollingSamples = (await polling).flat();
      let report = null;
      try { report = JSON.parse(result.stdout.trim()); } catch { /* fail if output is not measured JSON */ }
      if (report) {
        const latencies = pollingSamples.map(sample => sample.latencyMs).sort((a, b) => a - b);
        report.concurrentRoomPolling = { requests: pollingSamples.length, errors: pollingSamples.filter(sample => sample.status !== 200).length, p50Ms: latencies[Math.floor(latencies.length * 0.5)], p95Ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] };
        report.moderationAndProjection = { status: advance.status, moderationStatus: moderation.status, moderationLatencyMs, moderationResponseMs, projectionObservedMs, correctPointer: observed.currentId === ids[1] };
        report.browserProjection = browserProjection;
        await writeFile(path.join(output, `load-${concurrency}.json`), JSON.stringify(report, null, 2));
      }
      summary.loads.push({ concurrency, passed: result.code === 0 && !!report, report });
      if (result.code !== 0 || !report || report.concurrentRoomPolling.errors || !moderation.ok || !advance.ok || !report.moderationAndProjection.correctPointer) failed = true;
      console.log(JSON.stringify({ concurrency, report }));
    }
  }
} catch (error) {
  failed = true;
  summary.error = error.message;
  console.error(error.message);
} finally {
  if (loadBrowser) await loadBrowser.close();
  stopChildren();
  await new Promise(resolve => setTimeout(resolve, 500));
  forceStopGroups();
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Reports: ${output}`);
  // Keep disposable persistence for diagnosis; never delete an ambiguous path.
  process.exitCode = failed ? 1 : 0;
}
