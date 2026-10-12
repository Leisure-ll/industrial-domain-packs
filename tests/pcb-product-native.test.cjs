const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gatewaySession } = require("../packs/pcb/runtime/bench-gateway.cjs");
// The consumer owns this backend. Supply its maintained module explicitly for
// native integration validation; ordinary source tests never fake native PASS.
const backendModule = process.env.PCB_TEST_RUNTIME_BACKEND;
test("native managed PCB: new design, checks, images, queued cancellation and recovery", { skip: !backendModule, timeout: 300000 }, async () => {
  const runtimeApi = require(path.resolve(backendModule));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "pcb-product-native-"));
  let session;
  const call = async (name, args = {}, signal) => {
    process.stdout.write("native PCB " + name + "\n");
    const response = await session.callTool("domain_tool_call", { toolId: "pcb.design." + name, arguments: args }, signal);
    return { ...response, native: response.payload.result.result };
  };
  try {
    session = await gatewaySession({ projectDir: project, runtimeApi });
    const initial = await call("project_status");
    assert.equal(initial.payload.requirementsBound, false);
    assert.deepEqual(initial.native.files, {});
    await call("new_project", { width_mm: 40, height_mm: 30 });
    await call("add_component", { ref: "R1", symbol: "Device:R", value: "1k", footprint: "Resistor_SMD:R_0603_1608Metric" });
    await call("add_no_connect", { ref: "R1", pin: "1" });
    await call("add_no_connect", { ref: "R1", pin: "2" });
    await call("set_requirements", { section: "constraints", value: { board_rules: {
      clearance_mm: 0.2, track_mm: 0.25, via_mm: 0.6, drill_mm: 0.3, edge_mm: 0.3, hole_mm: 0.25,
    } } });
    await call("generate_schematic");
    assert.equal((await call("run_erc")).native.status, "PASS");
    assert.equal((await call("generate_pcb", { cad_only_reason: "CAD prototype for managed runtime validation" })).native.status, "PASS");
    const drc = (await call("run_drc")).native;
    assert.equal(drc.status, "PASS");
    assert.equal(drc.report.report_valid, true);
    assert.equal(drc.report.counts.error, 0);
    // CAD checks must not invent electrical/device qualification.
    assert.equal((await call("verify_design")).native.status, "UNKNOWN");
    const view = await call("view_design");
    assert.equal(view.content.filter((block) => block.type === "image").length, 2);
    assert.ok(view.payload.images.every((receipt) => receipt.forwarded && receipt.delivered === false));
    const active = new AbortController();
    const queued = new AbortController();
    const running = call("run_python", { code: "while True: pass" }, active.signal);
    // Register the rejection before cancelling, including while queued.
    const runningRejected = assert.rejects(running);
    const waiting = call("set_component_value", { ref: "R1", value: "99k" }, queued.signal);
    const waitingRejected = assert.rejects(waiting);
    queued.abort();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    active.abort();
    await Promise.all([runningRejected, waitingRejected]);
    await session.close();
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, "spec.json"))).parts[0].value, "1k");
    session = await gatewaySession({ projectDir: project, runtimeApi });
    const recovered = await call("project_status");
    assert.equal(recovered.payload.requirementsBound, false);
    assert.ok(recovered.native.files["board.kicad_pcb"]);
  } finally {
    await session?.close();
    fs.rmSync(project, { recursive: true, force: true });
  }
});
