const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("installed Godot bridges load Pack-local validation and reject resource substitution", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "godot-installed-layout-"),
  );
  try {
    const installed = path.join(root, "domain-packs/godot");
    fs.cpSync(path.resolve(__dirname, "../packs/godot"), installed, {
      recursive: true,
      filter: (file) =>
        ![".venv", "__pycache__", ".DS_Store"].includes(path.basename(file)) &&
        !file.endsWith(".pyc"),
    });
    assert.equal(fs.existsSync(path.join(root, "lib")), false);
    execFileSync(
      process.execPath,
      [
        "-e",
        `
      const assert = require('node:assert/strict');
      const fs = require('node:fs'); const path = require('node:path');
      const installed = fs.realpathSync(process.argv[1]);
      // External npm peers are fixtures for module-loading only. The actual
      // Pack-local module resolver and resource validator remain exercised.
      const Module = require('node:module'), load = Module._load;
      Module._load = function(name, ...args) {
        if (name === 'ajv') return class Ajv {};
        if (name.startsWith('@modelcontextprotocol/sdk/')) return {};
        if (name === '@industrial-agent-harness/domain-runtime') return {};
        return load.call(this, name, ...args);
      };
      assert.equal(typeof require(path.join(installed, 'bridge/godot-gateway.cjs')).createGodotGateway, 'function');
      Module._load = load;
      require('node:child_process').spawnSync = () => ({status:0, stdout:'4.7.2.fixture'});
      const {godotRuntime} = require(path.join(installed, 'bridge/godot-runtime.cjs'));
      const provider = {...require(path.join(installed, 'harness-pack.json')).provider, installedDirectory:installed};
      const environment = {INDUSTRIAL_HARNESS_GODOT_BIN:process.execPath};
      assert.equal(godotRuntime(provider, environment).packDir, installed);
      const file = path.join(installed, Object.keys(provider.sourceFiles)[0]);
      const original = fs.readFileSync(file); fs.appendFileSync(file, '\\nmodified');
      assert.throws(() => godotRuntime(provider, environment), /differs from the registered snapshot/);
      fs.writeFileSync(file, original); fs.renameSync(file, file+'.saved'); fs.symlinkSync(file+'.saved', file);
      assert.throws(() => godotRuntime(provider, environment), /cannot contain symlinks/);
    `,
        installed,
      ],
      { cwd: root, env: { ...process.env, NODE_PATH: "" }, stdio: "pipe" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
