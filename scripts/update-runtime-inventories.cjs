// Maintainer release step: regenerate exact source identities, never hand-edit hashes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const name of fs.readdirSync(path.join(root, 'packs'))) {
  const directory = path.join(root, 'packs', name);
  const file = path.join(directory, 'harness-pack.json');
  if (!fs.existsSync(file)) continue;
  const manifest = JSON.parse(fs.readFileSync(file));
  const provider = manifest.provider;
  if (!provider?.resourceRoots?.length) continue;
  const files = [];
  function visit(relative) {
    const target = path.join(directory, relative), stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw Error('Runtime resource is a symlink: ' + relative);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) {
        if (entry !== '__pycache__' && entry !== '.DS_Store' && !entry.endsWith('.pyc')) visit(relative + '/' + entry);
      }
    } else if (stat.isFile()) files.push(relative);
    else throw Error('Runtime resource is not an ordinary file: ' + relative);
  }
  provider.resourceRoots.forEach(visit);
  provider.sourceFiles = Object.fromEntries(files.sort().map(relative => [relative, hash(fs.readFileSync(path.join(directory, relative)))]));
  provider.sourceSha256 = hash(JSON.stringify(provider.sourceFiles));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}
