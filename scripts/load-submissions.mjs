import { performance } from "node:perf_hooks";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const ALLOWED_LEVELS = new Set([10, 25, 50, 100]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[index].toFixed(1));
}

function latencySummary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    minMs: Number((sorted[0] ?? 0).toFixed(1)),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(1)),
  };
}

async function readSubmissionTotal({ target, apiSecret, adminToken, sessionId, signal }) {
  const url = new URL("/admin/submissions", target);
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      "X-Admin-Token": adminToken,
    },
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Number.isInteger(body?.total)) {
    throw new Error(`Could not read submission total (HTTP ${response.status})`);
  }
  return body.total;
}

async function submit({ target, apiSecret, payload, timeoutMs }) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/submissions", target), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      duplicate: body?.duplicate === true,
      error: response.ok ? null : body?.error || "unreadable error response",
      latencyMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      duplicate: false,
      error: error?.name === "AbortError" ? "timeout" : "network error",
      latencyMs: performance.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const targetUrl = new URL(required(values, "target"));
  if (targetUrl.protocol !== "http:" || !LOCAL_HOSTS.has(targetUrl.hostname)) {
    throw new Error("--target must be an isolated local http://localhost or 127.0.0.1 Worker");
  }
  const target = targetUrl.toString();
  const apiSecret = required(values, "api-secret");
  const adminToken = required(values, "admin-token");
  const sessionCode = required(values, "session-code").trim().toUpperCase();
  const sessionId = required(values, "session-id");
  const concurrency = Number.parseInt(required(values, "concurrency"), 10);
  if (!ALLOWED_LEVELS.has(concurrency)) {
    throw new Error("--concurrency must be one of 10, 25, 50, or 100");
  }
  const timeoutMs = Number.parseInt(values["timeout-ms"] || "15000", 10);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error("--timeout-ms must be between 1000 and 60000");
  }

  const totalController = new AbortController();
  const totalTimeout = setTimeout(() => totalController.abort(), timeoutMs);
  const shared = { target, apiSecret, adminToken, sessionId, signal: totalController.signal };
  const before = await readSubmissionTotal(shared);
  clearTimeout(totalTimeout);

  const runTag = Date.now().toString(36);
  const payloads = Array.from({ length: concurrency }, (_, index) => ({
    sessionCode,
    participant_id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    nickname: `Load-${runTag}-${String(index).padStart(3, "0")}`,
    category: "question",
    content: `Load test ${runTag} participant ${index}: a unique disposable contribution.`,
  }));

  const startedAt = performance.now();
  const results = await Promise.all(
    payloads.map((payload) => submit({ target, apiSecret, payload, timeoutMs }))
  );
  const wallTimeMs = performance.now() - startedAt;

  // Two concurrent copies of one additional logical attempt must both report
  // success while the database gains exactly one row.
  const duplicatePayload = {
    sessionCode,
    participant_id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    nickname: `Retry-${runTag}`,
    category: "question",
    content: `Retry probe ${runTag}: this logical attempt is sent twice concurrently.`,
  };
  const retryResults = await Promise.all([
    submit({ target, apiSecret, payload: duplicatePayload, timeoutMs }),
    submit({ target, apiSecret, payload: duplicatePayload, timeoutMs }),
  ]);

  const afterController = new AbortController();
  const afterTimeout = setTimeout(() => afterController.abort(), timeoutMs);
  const after = await readSubmissionTotal({
    target,
    apiSecret,
    adminToken,
    sessionId,
    signal: afterController.signal,
  });
  clearTimeout(afterTimeout);

  const successes = results.filter((result) => result.ok).length;
  const errors = results.filter((result) => !result.ok);
  const expectedDelta = concurrency + 1;
  const actualDelta = after - before;
  const report = {
    concurrency,
    requests: results.length,
    successes,
    errors: errors.length,
    successRate: Number(((successes / results.length) * 100).toFixed(2)),
    wallTimeMs: Number(wallTimeMs.toFixed(1)),
    throughputPerSecond: Number(((results.length / wallTimeMs) * 1000).toFixed(2)),
    latency: latencySummary(results.map((result) => result.latencyMs)),
    statusCounts: Object.fromEntries(
      [...new Set(results.map((result) => result.status))]
        .sort((a, b) => a - b)
        .map((status) => [status, results.filter((result) => result.status === status).length])
    ),
    errorSamples: errors.slice(0, 5).map(({ status, error }) => ({ status, error })),
    database: { before, after, expectedDelta, actualDelta, countMatches: actualDelta === expectedDelta },
    duplicateProbe: {
      statuses: retryResults.map((result) => result.status),
      allSuccessful: retryResults.every((result) => result.ok),
      replayRecognized: retryResults.some((result) => result.duplicate),
      exactlyOneRow: actualDelta === expectedDelta,
    },
  };
  console.log(JSON.stringify(report));

  if (errors.length > 0 || !report.database.countMatches || !report.duplicateProbe.allSuccessful) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
