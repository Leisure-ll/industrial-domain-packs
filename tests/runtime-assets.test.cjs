const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const owner = require("../lib/index.cjs");

test("installed professional Packs export the exact qualified native downloads and executable mappings", () => {
  for (const domain of ["pcb", "godot"]) {
    const manifest = owner.hostPacks().find((pack) => pack.domain === domain);
    const lock = require(`../packs/${domain}/runtime/native-dependency.json`);
    assert.equal(manifest.runtimeAssets.length, domain === "pcb" ? 2 : 1);
    const asset = manifest.runtimeAssets[0];
    for (const key of ["url", "sha256", "version"])
      assert.equal(asset[key], lock[key]);
    assert.equal(asset.archiveApp, lock.bundle);
    assert.equal(asset.environment, lock.variable);
    assert.equal(path.posix.join(asset.app, asset.executable), lock.command);
    assert.equal(asset.platform, "darwin-arm64");
    assert.deepEqual(asset.versionArgs, ["--version"]);
    assert.equal(
      asset.type,
      domain === "pcb" ? "macos-app-dmg" : "macos-app-zip",
    );
    assert.equal(asset.size, domain === "pcb" ? 1404303659 : 170622178);
    assert.equal(
      asset.installedSize,
      domain === "pcb" ? 5104942382 : 353682925,
    );
    assert.equal(
      manifest.version,
      owner.consumerMetadata().domains.find((item) => item.id === domain).version,
    );
    assert.equal(manifest.version, owner.getPack(manifest.id).releaseVersion);
  }
  const pcb = owner.hostPacks().find((pack) => pack.domain === "pcb")
    .runtimeAssets[0];
  assert.deepEqual(pcb.environmentExecutables, {
    INDUSTRIAL_HARNESS_KICAD_PYTHON:
      "Contents/Frameworks/Python.framework/Versions/3.9/bin/python3.9",
  });
});

test("dependency metadata preserves platform limits, managed EDA/DXF and execution requirements", () => {
  const domains = owner.consumerMetadata().domains;
  const host = owner.hostPacks();
  const cad = host.find((pack) => pack.domain === "cad");
  assert.equal(cad.runtimeAssets[0].installedSize, 2625114576);
  assert.equal(cad.runtimeAssets[0].size, 649760538);
  for (const id of ["cad", "pcb", "godot"]) {
    assert.deepEqual(
      domains.find((d) => d.id === id).qualifiedBundlePlatforms,
      ["darwin-arm64"],
    );
    assert.equal(
      owner.getPack(host.find((p) => p.domain === id).id).remoteStatus,
      "not-qualified",
    );
  }
  assert.match(
    domains.find((d) => d.id === "chip").prerequisites.join(" "),
    /project-owned PDK/,
  );
  const chip = host.find(pack => pack.domain === "chip");
  const chipPlatforms = ["darwin-arm64", "linux-x64"];
  assert.deepEqual(domains.find(d => d.id === "chip").qualifiedBundlePlatforms, chipPlatforms);
  assert.deepEqual(owner.getPack(chip.id).nativePlatforms, chipPlatforms);
  assert.deepEqual(chip.runtimeAssets[0].platforms, chipPlatforms);
  assert.equal(chip.runtimeAssets[0].imagePlatform, "linux/amd64");
  const dxf = cad.runtimeAssets.find(a => a.id === 'cad-dxf');
  assert.equal(dxf.type, 'docker-image');
  assert.match(dxf.image, /^harbor\.pvg2\.zhiman\.tech\/industrial-runtime-assets\/.+@sha256:[a-f0-9]{64}$/);
  assert.equal(dxf.imageId, 'sha256:' + dxf.sha256);
  // A consumer may edit its display copy without changing the next install recipe.
  cad.runtimeAssets[0].installedSize = 1;
  assert.equal(
    owner.hostPacks().find((pack) => pack.domain === "cad").runtimeAssets[0]
      .installedSize,
    2625114576,
  );
});


test("PCB design installation pins its Harbor image and complete prebuilt gateway", () => {
  const asset = owner.hostPacks().find((p) => p.domain === "pcb").runtimeAssets.find((a) => a.type === "docker-image");
  assert.match(asset.image, /^harbor\.pvg2\.zhiman\.tech\/.+@sha256:[a-f0-9]{64}$/);
  assert.equal(asset.sha256, asset.imageId.slice(7));
  assert.equal(asset.imagePlatform, "linux/amd64");
  assert.ok(asset.size > 0 && asset.installedSize > 0);
});

test('every installed native or container runtime uses a verified own-source distribution', () => {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const distribution = require('../provenance/runtime-distribution.json');
  const assets = owner.hostPacks().flatMap(pack => pack.runtimeAssets || []);
  assert.ok(assets.length >= 6);
  for (const asset of assets) {
    const locator = asset.image || asset.url;
    assert.match(locator, /^(?:https:\/\/)?harbor\.pvg2\.zhiman\.tech\//);
    const published = distribution.assets.find(row => (row.image || row.url) === locator);
    assert.ok(published, 'Missing verified distribution: ' + asset.id);
    assert.ok(published.evidence, 'Missing download evidence: ' + asset.id);
    assert.ok(fs.existsSync(path.join(__dirname, '..', published.evidence)));
    assert.equal(asset.size, published.downloadSize || published.size);
    assert.equal(asset.installedSize, published.installedSize);
    if (asset.type === 'docker-image') {
      assert.equal(asset.imageId, published.imageConfigDigest);
      assert.equal(asset.sha256, published.imageConfigDigest.slice(7));
      assert.equal(asset.imagePlatform, published.imagePlatform);
    } else assert.equal(asset.sha256, published.sha256);
    if (published.entrySource) {
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', published.entrySource))).digest('hex'), published.entrySourceSha256);
    }
  }
});
