const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fixedArgs = { godot: ['--version'], kicad: ['--version'], freecad: ['--keep-deprecated-paths', '--version'], version: ['--version'], 'version-short': ['-V'] };
function createVersionProbe({ binary, sha256 }) {
  if (!path.isAbsolute(binary || '') || !/^[a-f0-9]{64}$/.test(sha256 || '')) throw Error('A pinned platform probe is required.');
  return async (asset, executable, options = {}) => {
    const probeId = asset.probeId ?? asset.id;
    if (!fixedArgs[probeId] || ((asset.versionArgs !== undefined || asset.probeId === undefined) && JSON.stringify(asset.versionArgs) !== JSON.stringify(fixedArgs[probeId]))) throw Error('Unsupported owner version probe.');
    if (!path.isAbsolute(executable || '')) throw Error('An absolute application executable is required.');
    const stat = fs.lstatSync(binary);
    if (!stat.isFile() || stat.isSymbolicLink() || hash(fs.readFileSync(binary)) !== sha256) throw Error('Platform probe identity mismatch.');
    if (options.signal?.aborted) throw Error('Version probe cancelled.');
    const timeout = options.timeout ?? 120000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 120000) throw Error('Invalid version probe timeout.');
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['--asset', probeId, '--executable', executable, '--timeout-ms', String(timeout)],
        { cwd: options.cwd, env: options.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', failed, killTimer;
      const abort = () => { failed = Error('Version probe cancelled.'); child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 2000); };
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const timer = setTimeout(() => { failed = Error('Version probe supervisor timeout.'); child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 2000); }, timeout + 2000);
      const append = (kind, data) => {
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + data.length > 200000) { failed = Error('Version probe output limit exceeded.'); child.kill('SIGTERM'); return; }
        if (kind === 'stdout') stdout += data; else stderr += data;
      };
      child.stdout.on('data', data => append('stdout', data)); child.stderr.on('data', data => append('stderr', data));
      child.once('error', error => { failed = error; });
      child.once('close', code => {
        clearTimeout(timer); clearTimeout(killTimer); options.signal?.removeEventListener('abort', abort);
        if (failed) return reject(failed);
        let result; try { result = JSON.parse(stdout); } catch { return reject(Error('Invalid platform probe response.')); }
        if (code !== 0 || !result.ok || result.timedOut || result.cancelled || result.truncated || typeof result.stdout !== 'string')
          return reject(Error(result.error || result.stderr || stderr || 'Native version probe failed.'));
        resolve(result.stdout);
      });
    });
  };
}
module.exports = { createVersionProbe };
