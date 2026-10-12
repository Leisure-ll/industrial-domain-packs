// Read reviewed component releases without loading executable metadata.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inspectComponentRelease(indexFile, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '')) throw Error('A trusted release index digest is required.');
  const indexPath = path.resolve(indexFile);
  if (!fs.lstatSync(indexPath).isFile() || fs.lstatSync(indexPath).isSymbolicLink()) throw Error('Release index must be a regular file.');
  const bytes = fs.readFileSync(indexPath);
  if (hash(bytes) !== expectedSha256) throw Error('Release index identity mismatch.');
  const index = JSON.parse(bytes);
  if (index.schemaVersion !== 2 || index.kind !== 'domain-pack-release' || !/^[a-f0-9]{40}$/.test(index.sourceCommit) ||
      !/^[a-f0-9]{64}$/.test(index.contentSha256) || !/^[a-f0-9]{64}$/.test(index.manifestSha256) || !Array.isArray(index.components))
    throw Error('Invalid component release index.');
  const seen = new Set();
  const components = index.components.map(component => {
    if (!['source', 'skills', 'bridge'].includes(component.id) || seen.has(component.id) ||
        typeof component.file !== 'string' || path.basename(component.file) !== component.file ||
        component.file.includes('\\') || !component.file.endsWith('.tar.gz') ||
        !/^[a-f0-9]{64}$/.test(component.sha256) || !Array.isArray(component.requires)) throw Error('Invalid component identity.');
    seen.add(component.id);
    const file = path.join(path.dirname(indexPath), component.file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== component.sizeBytes || hash(fs.readFileSync(file)) !== component.sha256)
      throw Error('Component archive identity mismatch: ' + component.id);
    return { ...component, path: file };
  });
  for (const component of components) {
    if (component.requires.some(id => !seen.has(id) || id === component.id)) throw Error('Missing component dependency.');
  }
  return { ...index, components };
}
module.exports = { inspectComponentRelease };
