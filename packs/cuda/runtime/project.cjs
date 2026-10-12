// Trusted project definition. Candidate requests cannot change this snapshot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const names = ['binding.cpp', 'binding_registry.h', 'cuda.project.json', 'model.py'];
function bindingDigest(binding) {
  return hash(JSON.stringify({ schemaVersion: binding.schemaVersion, files: Object.fromEntries(Object.entries(binding.files).sort()), measurement: binding.measurement }));
}
function validateBinding(binding) {
  if (binding?.schemaVersion !== 1 || !binding.files || Object.keys(binding.files).sort().join() !== names.join() ||
      Object.values(binding.files).some(value => !/^[a-f0-9]{64}$/.test(value)) ||
      !Number.isSafeInteger(binding.measurement?.profileIterations) || binding.measurement.profileIterations < 10 || binding.measurement.profileIterations > 10000 ||
      !Number.isFinite(binding.measurement.targetSpeedup) || binding.measurement.targetSpeedup < 1 || binding.measurement.targetSpeedup > 100 ||
      binding.sha256 !== bindingDigest(binding)) throw Error('Invalid immutable CUDA project binding.');
  return binding;
}
function readProject(projectDir) {
  const root = fs.realpathSync(projectDir), files = {}, hashes = {};
  for (const name of names) {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw Error('CUDA project definition needs bounded ordinary files.');
    files[name] = fs.readFileSync(file); hashes[name] = hash(files[name]);
  }
  const manifest = JSON.parse(files['cuda.project.json']);
  if (manifest.schemaVersion !== 1 || Object.keys(manifest).sort().join() !== 'measurement,schemaVersion' ||
      Object.keys(manifest.measurement || {}).sort().join() !== 'profileIterations,targetSpeedup') throw Error('Invalid CUDA project manifest.');
  const binding = { schemaVersion: 1, files: hashes, measurement: manifest.measurement };
  binding.sha256 = bindingDigest(binding);
  validateBinding(binding);
  return { files, binding };
}
function assertProject(projectDir, binding) {
  validateBinding(binding);
  if (readProject(projectDir).binding.sha256 !== binding.sha256) throw Error('CUDA reference, bindings or measurement configuration changed; allocate a new immutable task.');
}
module.exports = { readProject, assertProject, validateBinding, bindingDigest, names };
