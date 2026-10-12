"use strict";
// Domain adapter over the Harness-owned tool-session backend. The historical
// filename and upstream IDs remain compatibility/provenance details only.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resourceDirectory } = require("../bridge/resources.cjs");
const { productTools, productObservation } = require("./product.cjs");
const GATEWAY_MCP_VERSION = "1.29.1";
const STARTUP_TIMEOUT_MS = 150000;
const CALL_TIMEOUT_MS = 60000;
const IDLE_RECYCLE_MS = 15 * 60 * 1000;
function bridgeProvider(provider, snapshot) {
  const files = snapshot.sourceFiles;
  const compact = JSON.stringify(Object.fromEntries(Object.keys(files).sort().map((key) => [key, files[key]])));
  return {
    ...provider, installedDirectory: path.resolve(__dirname, ".."),
    tools: snapshot.tools, sourceCommit: snapshot.sourceCommit,
    toolSchemaSha256: snapshot.toolSchemaSha256, imageId: snapshot.imageId,
    sourceSha256: crypto.createHash("sha256").update(compact).digest("hex"),
    resourceRoots: ["pcb-agent", "skills/pcb-design-e2e"], sourceFiles: files,
    directoryEnv: "INDUSTRIAL_HARNESS_PCB_BENCH_DIR",
    pythonEnv: "INDUSTRIAL_HARNESS_PCB_GATEWAY_PYTHON",
    mcpVersion: GATEWAY_MCP_VERSION,
    allowedToolIds: productTools().map((tool) => "pcb.bench." + tool.name),
    publicToolIds: Object.fromEntries(productTools().map((tool) => ["pcb.bench." + tool.name, tool.id])),
  };
}
function sessionDirectory(project) {
  const identity = crypto.createHash("sha256").update(project).digest("hex").slice(0, 24);
  const directory = path.join(os.tmpdir(), "industrial-pcb-gateway", identity);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(directory), 0o700);
  fs.chmodSync(directory, 0o700);
  return directory;
}
class GatewaySession {
  constructor(config, runtimeApi) {
    this.config = config;
    this.runtimeApi = runtimeApi;
    this._closing = false;
    this.idle = null;
  }
  get closing() { return this._closing || Boolean(this.transport?.closing); }
  async start() {
    if (typeof this.runtimeApi?.openToolSession !== "function")
      throw Error("Update Harness to install and manage the PCB design environment.");
    this.transport = await this.runtimeApi.openToolSession({
      ...this.config, expectedServerName: "industrial-pcb-gateway",
      startupTimeoutMs: STARTUP_TIMEOUT_MS, callTimeoutMs: CALL_TIMEOUT_MS,
    });
  }
  async callTool(name, arguments_, signal) {
    if (signal?.aborted) throw Error("Action was cancelled before the PCB design call.");
    clearTimeout(this.idle);
    try {
      const result = await this.transport.callTool(name, arguments_, { signal, timeoutMs: CALL_TIMEOUT_MS });
      if (signal?.aborted) throw Error("Action was cancelled; inspect the operation receipt before editing again.");
      const block = (result.content || []).find((item) => item.type === "text");
      let payload = null;
      if (block) {
        try { payload = JSON.parse(block.text); } catch { payload = { text: block.text }; }
      }
      if (payload?.paged) payload = await this.readPaged(payload, signal);
      if (result.isError) throw Error("PCB design call failed: " + (payload?.error ?? JSON.stringify(payload).slice(0, 2000)));
      return { payload: productObservation(payload), content: result.content || [] };
    } finally {
      if (signal?.aborted) await this.close();
      else this.scheduleRecycle();
    }
  }
  async readPaged(payload, signal, budget = 256 * 1024) {
    let text = "", offset = 0, nextOffset = 0;
    do {
      if (signal?.aborted) throw Error("PCB response reading was cancelled.");
      const page = await this.transport.callTool("domain_tool_result_read", {
        responseId: payload.responseId, offset, limit: 4000,
      }, { signal, timeoutMs: 15000 });
      const block = (page.content || []).find((item) => item.type === "text");
      const data = block ? JSON.parse(block.text) : {};
      if (page.isError || data.error) throw Error("PCB response paging failed: " + (data.error || "transport error"));
      text += data.text || "";
      nextOffset = data.nextOffset;
      if (nextOffset && (!Number.isInteger(nextOffset) || nextOffset <= offset)) throw Error("PCB response cursor did not advance.");
      offset = nextOffset;
    } while (nextOffset && text.length < budget);
    try { return nextOffset ? { ...JSON.parse(text), truncated: true, nextOffset } : JSON.parse(text); }
    catch { return { text, truncated: Boolean(nextOffset), nextOffset }; }
  }
  scheduleRecycle() {
    if (this.closing) return;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { this.close().catch(() => {}); }, IDLE_RECYCLE_MS);
    this.idle.unref?.();
  }
  async close() {
    if (this._closing) return this.closePromise;
    this._closing = true;
    clearTimeout(this.idle);
    this.closePromise = this.transport?.close();
    await this.closePromise;
  }
}
const sessions = new WeakMap();
function gatewayConfig(project, environment) {
  const manifest = require("../harness-pack.json");
  const provider = bridgeProvider(manifest.provider, require("./bench-upstream.json"));
  resourceDirectory(provider, { ...environment, [provider.directoryEnv]: environment[provider.directoryEnv] || provider.installedDirectory });
  const asset = manifest.runtimeAssets.find((item) => item.type === "docker-image");
  if (!asset?.image || !asset.imageId) throw Error("PCB design image is missing from the trusted installation metadata.");
  const image = environment.INDUSTRIAL_HARNESS_PCB_RUNTIME_IMAGE || asset.image;
  if (image !== asset.image) throw Error("The installed PCB design environment differs from its declared release.");
  if (!/^harbor\.pvg2\.zhiman\.tech\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(image))
    throw Error("The managed PCB design image must be pinned to its Harbor digest.");
  const directory = sessionDirectory(project);
  const policyFile = path.join(directory, "pcb-design.policy.json");
  const bridge = path.resolve(__dirname, "../bridge");
  // Ordinary workspaces have no fixed task/evaluator/seed binding. Optional
  // external requirements use the standalone adapter, outside this product path.
  const policy = {
    schemaVersion: 1, ...provider, id: "pcb.design.tools", imageId: asset.imageId,
    projectDir: "/workspace", imageInput: environment.INDUSTRIAL_HARNESS_PCB_IMAGE_INPUT !== "0",
    cacheDir: "/workspace/.pcb/gateway-results", controller: "/harness/pcb-controller.py",
    inContainer: true,
  };
  fs.writeFileSync(policyFile, JSON.stringify(policy, null, 2), { mode: 0o600 });
  return {
    runtime: { kind: "docker", image, platform: "linux/amd64", cpus: 2, memoryMb: 4096, pids: 256, network: "bridge", capabilities: ["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"] },
    command: ["/opt/pcb-gateway/bin/python3", "-I", "/harness/pcb-gateway.py", "/harness/policy.json"],
    cwd: "/workspace",
    mounts: [
      { source: project, target: "/workspace", readOnly: false },
      { source: path.join(bridge, "pcb-controller.py"), target: "/harness/pcb-controller.py", readOnly: true },
      { source: path.join(bridge, "pcb-gateway.py"), target: "/harness/pcb-gateway.py", readOnly: true },
      { source: policyFile, target: "/harness/policy.json", readOnly: true },
    ],
    environment: { PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" },
  };
}
async function gatewaySession({ projectDir, environment = process.env, runtimeApi }) {
  if (typeof runtimeApi?.openToolSession !== "function") throw Error("Update Harness to install and manage the PCB design environment.");
  const project = fs.realpathSync(projectDir);
  let entries = sessions.get(runtimeApi);
  if (!entries) sessions.set(runtimeApi, entries = new Map());
  const existing = entries.get(project);
  if (existing && !existing.session?.closing) return existing.promise;
  // Register before resource checks/async startup, including after a recycle.
  const entry = {};
  entry.promise = Promise.resolve().then(async () => {
    const session = new GatewaySession(gatewayConfig(project, environment), runtimeApi);
    entry.session = session;
    try { await session.start(); session.scheduleRecycle(); return session; }
    catch (error) { await session.close(); throw error; }
  });
  entries.set(project, entry);
  try { return await entry.promise; }
  catch (error) { if (entries.get(project) === entry) entries.delete(project); throw error; }
}
module.exports = { bridgeProvider, gatewaySession, gatewayConfig, sessionDirectory, GatewaySession, GATEWAY_MCP_VERSION };
