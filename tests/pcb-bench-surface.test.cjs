const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const owner = require("../lib/index.cjs");

const packDirectory = owner.sourceDirectory("pcb-pack");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(packDirectory, "runtime/bench-upstream.json"), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(packDirectory, "harness-pack.json"), "utf8"),
);

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("bench snapshot pins a complete upstream identity", () => {
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(snapshot.imageId, /^sha256:[0-9a-f]{64}$/);
  assert.match(snapshot.toolSchemaSha256, /^[0-9a-f]{64}$/);
  assert.equal(snapshot.canonicalToolCount, 88);
  assert.equal(snapshot.sessionToolCount, 89);
  assert.equal(snapshot.tools.length, 89);
  assert.equal(snapshot.sourceCommit, manifest.provider.sourceCommit);
  assert.equal(snapshot.imageId, manifest.provider.imageId);
  assert.equal(snapshot.toolSchemaSha256, manifest.provider.toolSchemaSha256);
  assert.equal(Object.keys(snapshot.sourceFiles).length, 112);
  for (const [file, digest] of Object.entries(snapshot.sourceFiles))
    assert.match(digest, /^[0-9a-f]{64}$/, `${file} digest`);
});

test("bench tool registry is well formed and unique", () => {
  const ids = new Set();
  const names = new Set();
  for (const tool of snapshot.tools) {
    assert.match(tool.id, /^pcb\.bench\.[a-z0-9_]+$/);
    assert.ok(!ids.has(tool.id), `duplicate id ${tool.id}`);
    assert.ok(!names.has(tool.name), `duplicate name ${tool.name}`);
    ids.add(tool.id);
    names.add(tool.name);
    assert.ok(["read-only", "mutating"].includes(tool.risk), tool.id);
    assert.equal(typeof tool.summary, "string");
    assert.ok(tool.summary.length > 8, `${tool.id} summary is substantive`);
    if (tool.risk === "mutating") {
      assert.deepEqual(tool.verification, ["pcb.bench.receipts.v1"]);
    } else {
      assert.equal(tool.verification, undefined);
    }
  }
  assert.ok(names.has("run_python"));
  assert.equal(names.size - 1, snapshot.canonicalToolCount);
});

test("product capabilities expose design tools and isolate benchmark submission", () => {
  const tools = require("../packs/pcb/runtime/product.cjs").productTools();
  assert.equal(tools.length, 88);
  assert.ok(tools.every((t) => t.id.startsWith("pcb.design.")));
  assert.ok(!tools.some((t) => t.name === "finalize_claims"));
  assert.deepEqual(manifest.provider.tools.filter((t) => t.id.startsWith("pcb.design.")), tools);
  const covered = new Set(manifest.capabilities.flatMap((c) => c.tools.map((t) => t.id)));
  assert.ok(tools.every((t) => covered.has(t.id)));
  assert.ok(manifest.capabilities.every((c) => !c.id.includes("bench")));
});

test("vendored actor and skill files match the pinned upstream hashes", () => {
  const expected = Object.entries(snapshot.sourceFiles)
    .filter(([file]) => file.startsWith("skills/pcb-design-e2e/"))
    .map(([file]) => file.slice("skills/pcb-design-e2e/".length))
    .sort();
  assert.equal(expected.length, 11);
  assert.ok(expected.includes("SKILL.md"));
  assert.equal(expected.filter((n) => n.startsWith("references/")).length, 9);
  assert.equal(expected.filter((n) => n.startsWith("assets/")).length, 1);
  const actor = Object.keys(snapshot.sourceFiles).filter((file) =>
    file.startsWith("pcb-agent/"),
  );
  assert.equal(actor.length, 101);
  for (const file of Object.keys(snapshot.sourceFiles)) {
    const bytes = fs.readFileSync(path.join(packDirectory, file));
    assert.equal(hash(bytes), snapshot.sourceFiles[file], file);
  }
  const nativeSkill = fs.readFileSync(
    path.join(packDirectory, "skills/pcb-kicad-native/SKILL.md"),
    "utf8",
  );
  assert.match(nativeSkill, /^name: pcb-kicad-native$/m);
});

test("consumer metadata routes the new skill and version", () => {
  const metadata = owner.consumerMetadata();
  const domain = metadata.domains.find((d) => d.id === "pcb");
  assert.equal(domain.version, manifest.version);
  for (const id of ["pcb.design.e2e", "pcb.kicad.native", "pcb.layout.inspect"]) {
    const skill = metadata.skills.find((s) => s.id === id);
    assert.ok(skill, id);
    assert.equal(skill.packId, "pcb-pack");
    assert.ok(
      fs.existsSync(path.join(packDirectory, skill.resourcePath, "SKILL.md")),
      id,
    );
  }
});

test("runtime inventory and digest stay exact", () => {
  const provider = manifest.provider;
  const files = {};
  for (const root of ["bridge", "runtime"])
    for (const name of fs.readdirSync(path.join(packDirectory, root)))
      files[root + "/" + name] = hash(fs.readFileSync(path.join(packDirectory, root, name)));
  assert.deepEqual(provider.sourceFiles, files);
  const compact = JSON.stringify(
    Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]])),
  );
  assert.equal(provider.sourceSha256, hash(Buffer.from(compact)));
});

test("runtime plugin uses the managed product surface and truthful operation verification", () => {
  const { createRuntimePlugin } = require("../packs/pcb/runtime/index.cjs");
  const plugin = createRuntimePlugin({ runtimeApi: { executeTask: () => {}, runtimeFiles: {} } });
  assert.equal(plugin.tools.length, 90);
  assert.ok(!plugin.tools.some((t) => t.descriptor.id.includes("bench")));
  const track = plugin.tools.find((t) => t.descriptor.id === "pcb.design.add_track");
  assert.equal(track.descriptor.effect, "inputs");
  assert.deepEqual(track.descriptor.verification, ["pcb.design.receipts.v1"]);
  assert.equal(plugin.verifiers["pcb.design.receipts.v1"]().status, "not_run");
  assert.ok(!/uv sync|docker build|PCB-bench/.test(track.guide.description));
  assert.ok(plugin.workspaceInputs.ignore.includes("session"));
  assert.ok(!plugin.workspaceInputs.ignore.includes(".pcb"));
  const guide = owner.skillResource("pcb.design.e2e");
  assert.equal(guide.resourcePath, "skills/pcb-design");
  assert.match(fs.readFileSync(path.join(guide.directory, "SKILL.md"), "utf8"), /No seed board/);
});

test("published file whitelist carries the vendored skill tree and actor", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  );
  const expected = [
    "packs/pcb/runtime/bench-upstream.json",
    "packs/pcb/skills/pcb-kicad-native/SKILL.md",
    "packs/pcb/skills/pcb-design-e2e/assets/constraints.example.yaml",
    "packs/pcb/skills/pcb-design-e2e/references/tools.md",
    "packs/pcb/skills/pcb-design-e2e/references/verification.md",
    "packs/pcb/pcb-agent/tools/workspace.py",
    "packs/pcb/pcb-agent/tools/agent_session.py",
    "packs/pcb/pcb-agent/tools/kimi_mcp.py",
  ];
  for (const entry of expected) assert.ok(pkg.files.includes(entry), entry);
  const vendored = pkg.files.filter((entry) => entry.startsWith("packs/pcb/pcb-agent/"));
  assert.equal(vendored.length, 101);
});
