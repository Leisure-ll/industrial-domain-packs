const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readProject, assertProject, validateBinding } = require('../packs/cuda/runtime/project.cjs');
const { prepareProject } = require('../packs/cuda/scripts/prepare-project.cjs');
const { validateIdentity, imageLock, sha256 } = require('../packs/cuda/runtime/protocol.cjs');
const { identity } = require('../packs/cuda/server/mcp.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuda-project-test-'));
  fs.cpSync(path.join(__dirname, '../packs/cuda/examples/square'), directory, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test('independent project binds reference, bindings and measurements; edits and links are rejected', t => {
  const directory = fixture(t), { binding } = readProject(directory);
  assertProject(directory, binding);
  fs.appendFileSync(path.join(directory, 'model.py'), '\n# changed reference');
  assert.throws(() => assertProject(directory, binding), /changed/);
  assert.throws(() => validateBinding({ ...binding, measurement: { profileIterations: 1, targetSpeedup: 1.05 } }), /binding/);
  fs.rmSync(path.join(directory, 'binding.cpp')); fs.symlinkSync('model.py', path.join(directory, 'binding.cpp'));
  assert.throws(() => readProject(directory), /ordinary/);
});
test('administrator preparation layers only project files over locked runtime and binds derived image identity', async t => {
  const directory = fixture(t), commands = [];
  const config = await prepareProject({ taskProjectDir: directory }, { run: async (command, args) => {
    commands.push(args);
    if (args[0] === 'build') {
      const root = args.at(-1), dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
      assert.ok(dockerfile.startsWith('FROM industrial-cuda-runtime-base:')); 
      assert.ok(dockerfile.includes('COPY model.py binding.cpp binding_registry.h cuda.project.json'));
      assert.equal(fs.readFileSync(path.join(root, 'model.py'), 'utf8'), fs.readFileSync(path.join(directory, 'model.py'), 'utf8'));
      return 'built';
    }
    return args[0] === 'image' && args.at(-1) === imageLock.imageId ? imageLock.imageId : 'sha256:' + 'd'.repeat(64);
  } });
  assert.equal(config.baseImageId, imageLock.imageId);
  assert.equal(config.taskSha256, sha256(fs.readFileSync(path.join(directory, 'model.py'))));
  assert.equal(config.protectedFiles['utils/compile.py'], imageLock.protectedFiles['utils/compile.py']);
  assert.ok(commands.find(args => args[0] === 'build').includes('--network')); 
  const service = identity({ ...config, gpuUuid: 'GPU-31ebe3bf-b2e5-5e2e-2350-131b6336dd39' }, 'compiler');
  assert.equal(validateIdentity(service, 'compiler').taskBinding.sha256, config.taskBinding.sha256);
  assert.throws(() => validateIdentity({ ...service, baseImageId: 'sha256:' + 'e'.repeat(64) }, 'compiler'), /base identity/);
});

test('packaged project allocation preserves CPU/GPU and filesystem isolation without an upstream checkout', () => {
  const { projectRecipe } = require('../packs/cuda/backend/recipe.cjs');
  const recipe = projectRecipe({ imageId: 'sha256:' + 'd'.repeat(64), gpuUuid: 'GPU-selected' });
  assert.deepEqual(recipe.services.evaluator.deploy.resources.reservations.devices[0].device_ids, ['GPU-selected']);
  assert.equal(recipe.services.evaluator.environment.CUDA_AGENT_EVALUATOR_GPU_UUID, 'GPU-selected');
  assert.equal(recipe.services.evaluator.read_only, true);
  assert.deepEqual(recipe.services.evaluator.cap_drop, ['ALL']);
  for (const role of ['main', 'compiler', 'evaluator']) {
    const worker = recipe.services[role];
    assert.equal(worker.network_mode, 'none');
    assert.ok(worker.volumes.every(mount => !mount.startsWith('/') && !mount.includes('docker.sock')));
    assert.equal(worker.pids_limit, 128);
    if (role !== 'evaluator') { assert.equal(worker.environment.NVIDIA_VISIBLE_DEVICES, 'void'); assert.equal(worker.deploy, undefined); }
  }
  assert.equal(recipe.services.compiler.healthcheck.retries, 30);
  assert.equal(recipe.services.evaluator.healthcheck.retries, 30);
});
