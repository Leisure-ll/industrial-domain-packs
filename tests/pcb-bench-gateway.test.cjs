const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GatewaySession, gatewaySession, sessionDirectory, bridgeProvider } = require("../packs/pcb/runtime/bench-gateway.cjs");
const snapshot = require("../packs/pcb/runtime/bench-upstream.json");
const manifest = require("../packs/pcb/harness-pack.json");
const image = { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" };
const response = (value, images = [], isError = false) => ({ content: [{ type: "text", text: JSON.stringify(value) }, ...images], isError });
async function fixture(callTool) {
  const session = new GatewaySession({}, {
    openToolSession: async (config) => {
      assert.equal(config.expectedServerName, "industrial-pcb-gateway");
      return { callTool, close: async () => {} };
    },
  });
  await session.start();
  return session;
}
test("product bridge preserves full upstream fingerprint while allowing design operations", () => {
  const provider = bridgeProvider(manifest.provider, snapshot);
  assert.equal(provider.tools.length, 89);
  assert.equal(provider.allowedToolIds.length, 88);
  assert.ok(!provider.allowedToolIds.includes("pcb.bench.finalize_claims"));
  assert.equal(provider.publicToolIds["pcb.bench.project_status"], "pcb.design.project_status");
  assert.equal(provider.toolSchemaSha256, snapshot.toolSchemaSha256);
});
test("session directory is private and stable", () => {
  const first = sessionDirectory("/tmp");
  assert.equal(first, sessionDirectory("/tmp"));
  assert.equal(fs.statSync(first).mode & 0o777, 0o700);
});
test("gateway forwards real image blocks and exposes design observations", async () => {
  const signal = new AbortController().signal;
  const session = await fixture(async (name, args, options) => {
    assert.equal(options.signal, signal);
    return response({ toolId: "pcb.design.view_design", result: { task: {}, public_requirements: null }, images: [{ forwarded: true, delivered: false }] }, [image]);
  });
  const result = await session.callTool("domain_tool_call", {}, signal);
  assert.deepEqual(result.content[1], image);
  assert.deepEqual(result.payload.result, { requirementsBinding: {}, requirements: null });
  assert.equal(result.payload.images[0].delivered, false);
  await session.close();
});
test("paged responses retain the original image blocks", async () => {
  const session = await fixture(async (name) => name === "domain_tool_call"
    ? response({ paged: true, responseId: "1" }, [image])
    : response({ text: JSON.stringify({ result: { status: "PASS" } }), nextOffset: null }));
  const result = await session.callTool("domain_tool_call", {});
  assert.equal(result.payload.result.status, "PASS");
  assert.equal(result.content[1], image);
  await session.close();
});
test("gateway error stays an execution failure", async () => {
  const session = await fixture(async () => response({ error: "outside scope" }, [], true));
  await assert.rejects(session.callTool("domain_tool_call", {}), /outside scope/);
  await session.close();
});
test("cancelled calls never reach the backend", async () => {
  let calls = 0;
  const session = await fixture(async () => { calls++; });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(session.callTool("domain_tool_call", {}, controller.signal), /cancelled/);
  assert.equal(calls, 0);
  await session.close();
});
test("concurrent first calls share one Harness session startup", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pcb-product-session-"));
  let starts = 0;
  const runtimeApi = { openToolSession: async (config) => {
    starts++;
    assert.equal(config.runtime.kind, "docker");
    assert.match(config.runtime.image, /^harbor\.pvg2\.zhiman\.tech\/.+@sha256:/);
    assert.equal(config.command[0], "/opt/pcb-gateway/bin/python3");
    assert.equal(config.mounts[0].source, fs.realpathSync(root));
    await new Promise((resolve) => setImmediate(resolve));
    return { callTool: async () => response({}), close: async () => {} };
  } };
  try {
    const values = await Promise.all([gatewaySession({ projectDir: root, runtimeApi }), gatewaySession({ projectDir: root, runtimeApi })]);
    assert.equal(starts, 1); assert.equal(values[0], values[1]);
    await values[0].close();
    const fresh = await gatewaySession({ projectDir: root, runtimeApi });
    assert.equal(starts, 2); await fresh.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("older Harness receives update guidance without shell setup instructions", async () => {
  await assert.rejects(gatewaySession({ projectDir: "/tmp", runtimeApi: {} }), /Update Harness/);
});
