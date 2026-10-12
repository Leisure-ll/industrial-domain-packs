const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Match the hpack's domain-packs/<pack> layout in a fresh directory outside
// this checkout. The child cannot accidentally resolve repository-level lib/.
test("installed PCB product gateway and standalone bridge are self-contained and preserve resource confinement", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pcb-installed-layout-"));
  try {
    const installed = path.join(root, "domain-packs/pcb");
    fs.cpSync(path.resolve(__dirname, "../packs/pcb"), installed, {
      recursive: true,
      filter: (file) =>
        ![".venv", "__pycache__", ".pytest_cache", ".DS_Store"].includes(
          path.basename(file),
        ) && !file.endsWith(".pyc"),
    });
    assert.equal(fs.existsSync(path.join(root, "lib")), false);
    execFileSync(
      process.execPath,
      [
        "-e",
        `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const installed = fs.realpathSync(process.argv[1]);
      const { gatewayConfig, bridgeProvider, gatewaySession } = require(path.join(installed, 'runtime/bench-gateway.cjs'));
      const { pcbRuntime } = require(path.join(installed, 'bridge/pcb-runtime.cjs'));
      const { resourceDirectory } = require(path.join(installed, 'bridge/resources.cjs'));
      const manifest = require(path.join(installed, 'harness-pack.json'));
      const provider = bridgeProvider(manifest.provider, require(path.join(installed, 'runtime/bench-upstream.json')));
      const environment = { [provider.directoryEnv]: installed, [provider.pythonEnv]: process.execPath };
      const project = path.join(process.argv[2], 'project'); fs.mkdirSync(project);
      const config = gatewayConfig(project, environment);
      assert.equal(config.runtime.kind, 'docker');
      assert.equal(config.mounts[1].source, path.join(installed, 'bridge/pcb-controller.py'));
      assert.equal(pcbRuntime(provider, environment).sourceDir, fs.realpathSync(installed));
      assert.equal(resourceDirectory(provider, environment), fs.realpathSync(installed));
      const resource = Object.keys(provider.sourceFiles)[0];
      const file = path.join(installed, resource); const original = fs.readFileSync(file);
      fs.appendFileSync(file, '\\nchanged');
      assert.throws(() => gatewayConfig(project, environment), /differs from the registered snapshot/);
      fs.writeFileSync(file, original);
      const extra = path.join(installed, provider.resourceRoots[0], 'unexpected-resource.txt');
      fs.writeFileSync(extra, 'unexpected');
      assert.throws(() => gatewayConfig(project, environment), /inventory differs/);
      fs.unlinkSync(extra);
      fs.renameSync(file, file + '.saved'); fs.symlinkSync(file + '.saved', file);
      assert.throws(() => gatewayConfig(project, environment), /cannot contain symlinks/);
      fs.unlinkSync(file); fs.renameSync(file + '.saved', file);
      assert.throws(() => resourceDirectory({...provider, resourceRoots: ['../escape']}, environment), /Unsafe|Invalid/);
      assert.throws(() => resourceDirectory({...provider, sourceFiles: {'../escape': 'a'.repeat(64)}}, environment), /Unsafe/);
      const ancestor = path.join(installed, 'skills'); fs.renameSync(ancestor, ancestor + '.saved'); fs.symlinkSync(ancestor + '.saved', ancestor);
      assert.throws(() => gatewayConfig(project, environment), /cannot contain symlinks/);
      fs.unlinkSync(ancestor); fs.renameSync(ancestor + '.saved', ancestor);
      (async () => {
        let starts = 0;
        const session = await gatewaySession({projectDir: project, environment, runtimeApi: {
          openToolSession: async config => { starts++; assert.equal(config.runtime.kind, 'docker'); return {
            callTool: async () => ({content: [{type:'text', text: JSON.stringify({result:{status:'fixture'}})}]}), close: async () => {},
          }; },
        }});
        assert.equal(starts, 1);
        assert.equal((await session.callTool('domain_tool_call', {toolId:'pcb.design.project_status'})).payload.result.status, 'fixture');
        await session.close();
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `,
        installed,
        root,
      ],
      { cwd: root, env: { ...process.env, NODE_PATH: "" }, stdio: "pipe" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
