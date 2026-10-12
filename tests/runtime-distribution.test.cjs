const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { download, hashFile } = require('../scripts/mirror-runtime-assets.cjs');

test('Harbor verifier rejects invalid pins, corrupted bytes and manifest substitution', () => {
  const result = spawnSync('python3', [path.join(__dirname, 'verify-harbor-artifact.test.py')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('mirror stages streamed bytes and calculates the complete local hash', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'industrial-mirror-test-'));
  const target = path.join(directory, 'installer');
  const original = global.fetch;
  const chunks = [Buffer.alloc(100_000, 'a'), Buffer.alloc(125_000, 'b')];
  const digest = crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } }));
  try {
    assert.deepEqual(await download('https://registry.example/installer', target, 225_000), { sha256: digest, bytes: 225_000 });
    assert.equal(await hashFile(target), digest);
  } finally {
    global.fetch = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
