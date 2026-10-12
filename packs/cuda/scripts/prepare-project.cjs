// Administrator-only preparation: layer a protected task over the locked runtime.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execute } = require('../server/backend.cjs');
const { imageLock, sha256 } = require('../runtime/protocol.cjs');
const { readProject } = require('../runtime/project.cjs');
async function prepareProject(config, { run = execute } = {}) {
  if (!path.isAbsolute(config.taskProjectDir || '')) throw Error('Bind an absolute CUDA project definition before allocation.');
  const { files, binding } = readProject(config.taskProjectDir);
  const protectedFiles = { ...imageLock.protectedFiles, ...binding.files };
  const manifest = Object.entries(protectedFiles).sort().map(([file, digest]) => `${digest}  ${file}\n`).join('');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuda-project-image-'));
  const docker = config.docker || '/usr/bin/docker';
  const baseTag = 'industrial-cuda-runtime-base:' + require('node:crypto').randomUUID();
  try {
    const distribution = require('../locks/runtime-distribution.json');
    if (distribution.imageId !== imageLock.imageId) throw Error('CUDA distribution differs from its qualified base.');
    await require('./runtime-image.cjs').ensureRuntimeImage(distribution, { docker, run });
    const baseId = (await run(docker, ['image', 'inspect', '--format', '{{.Id}}', imageLock.imageId], undefined, { timeout: 10000 })).trim();
    if (baseId !== imageLock.imageId) throw Error('Locked CUDA runtime base is unavailable.');
    await run(docker, ['tag', imageLock.imageId, baseTag], undefined, { timeout: 10000 });
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'protected.sha256'), manifest);
    fs.writeFileSync(path.join(directory, 'Dockerfile'), `FROM ${baseTag}\nUSER root\nCOPY model.py binding.cpp binding_registry.h cuda.project.json /app/\nCOPY model.py binding.cpp binding_registry.h cuda.project.json /opt/cuda-agent-workspace/\nCOPY protected.sha256 /opt/cuda-agent-lock/protected.sha256\nRUN chmod 0444 /app/model.py /app/binding.cpp /app/binding_registry.h /app/cuda.project.json /opt/cuda-agent-workspace/model.py /opt/cuda-agent-workspace/binding.cpp /opt/cuda-agent-workspace/binding_registry.h /opt/cuda-agent-workspace/cuda.project.json /opt/cuda-agent-lock/protected.sha256\nLABEL tech.zhiman.cuda.project=${binding.sha256}\n`);
    const tag = 'industrial-cuda-project:' + binding.sha256;
    await run(docker, ['build', '--network', 'none', '--pull=false', '-t', tag, directory], undefined, { timeout: 120000 });
    const imageId = (await run(docker, ['image', 'inspect', '--format', '{{.Id}}', tag], undefined, { timeout: 10000 })).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw Error('Derived CUDA project image has no immutable identity.');
    return { ...config, imageId, baseImageId: imageLock.imageId, taskSha256: binding.files['model.py'], taskBinding: binding, protectedFiles, protectedManifestSha256: sha256(manifest) };
  } finally { await run(docker, ['image', 'rm', baseTag], undefined, { timeout: 10000 }).catch(() => {}); fs.rmSync(directory, { recursive: true, force: true }); }
}
module.exports = { prepareProject };
