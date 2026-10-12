// Administrator qualification of the self-authored square example only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CudaService } = require('../server/mcp.cjs');
const { readSource, sha256 } = require('../runtime/protocol.cjs');
const { assess } = require('../runtime/verifier.cjs');
async function qualifyProject(config, { onStep = () => {} } = {}) {
  const directory = config.taskProjectDir;
  const kernel = path.join(directory, 'kernels/square.cu');
  const original = fs.readFileSync(kernel, 'utf8');
  if (!original.includes('input[index] * input[index] + 1.0f')) throw Error('Failure qualification is restricted to the supplied square example.');
  const service = new CudaService(config);
  const steps = [];
  const step = value => { steps.push(value); onStep(value); };
  async function call(role, name, extra = {}, signal) {
    const response = await service.call(role, name, { requestId: crypto.randomUUID(), projectId: config.projectId, ...extra }, signal);
    const verdict = assess(response.receipt, response.receipt);
    step({ tool: name, ...verdict, receiptSha256: sha256(JSON.stringify(response.receipt)) });
    return { response, verdict };
  }
  const compile = () => { const source = readSource(directory); return call('compiler', 'cuda_candidate_compile', { files: source.files, sourceSha256: source.sourceSha256 }); };
  try {
    const baseline = await call('evaluator', 'cuda_baseline_profile');
    if (baseline.verdict.status !== 'passed') throw Error('Reference profiling failed.');
    const compiled = await compile();
    if (compiled.verdict.status !== 'passed') throw Error('Correct candidate did not compile.');
    const verified = await call('evaluator', 'cuda_candidate_verify', { ticketId: compiled.response.ticketId });
    if (verified.verdict.status !== 'passed') throw Error('Correct candidate failed GPU correctness.');
    const measured = await call('evaluator', 'cuda_candidate_profile', { ticketId: compiled.response.ticketId });
    if (measured.verdict.status !== 'passed') throw Error('Exclusive measurement evidence failed.');
    fs.writeFileSync(kernel, original.replace('input[index] * input[index] + 1.0f', 'input[index] * input[index] + 2.0f'));
    const wrong = await compile();
    if (wrong.verdict.status !== 'passed') throw Error('Wrong-output candidate must compile before negative GPU check.');
    const rejected = await call('evaluator', 'cuda_candidate_verify', { ticketId: wrong.response.ticketId });
    if (rejected.verdict.status !== 'failed') throw Error('Wrong-output candidate was not rejected by GPU correctness.');
    fs.writeFileSync(kernel, original);
    const model = path.join(directory, 'model.py'), reference = fs.readFileSync(model);
    try {
      fs.appendFileSync(model, '\n# changed reference');
      let refused = false;
      try { await service.backend.check(); } catch (error) { if (/changed/.test(error.message)) refused = true; else throw error; }
      if (!refused) throw Error('Changed reference was accepted by the old allocation.');
      step({ test: 'changed-reference', status: 'passed' });
    } finally { fs.writeFileSync(model, reference); }
    const cancel = new AbortController(), source = readSource(directory);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const native = service.backend.native.bind(service.backend);
    service.backend.native = (role, request, signal) => { const result = native(role, request, signal); if (request.operation === 'compile') started(); return result; };
    const requestId = crypto.randomUUID();
    const running = service.call('compiler', 'cuda_candidate_compile', { requestId, projectId: config.projectId, files: source.files, sourceSha256: source.sourceSha256 }, cancel.signal);
    await ready;
    const failed = running.then(() => { throw Error('Cancellation unexpectedly completed.'); }, error => error);
    await new Promise(resolve => setTimeout(resolve, 100)); cancel.abort(); await failed;
    const entry = service.store.read(requestId);
    if (entry.status !== 'cancelled' || entry.cleanupConfirmed !== true) throw Error('Native cancellation cleanup was not confirmed.');
    step({ test: 'active-cancellation', status: 'passed', cleanupConfirmed: true });
    await service.recover();
    const recovered = await compile();
    if (recovered.verdict.status !== 'passed') throw Error('Recovered compiler failed.');
    const checked = await call('evaluator', 'cuda_candidate_verify', { ticketId: recovered.response.ticketId });
    if (checked.verdict.status !== 'passed') throw Error('Recovered evaluator failed.');
    step({ test: 'restart-recovery', status: 'passed' });
    return { schemaVersion: 1, profile: 'rtx4090-sm89', imageId: config.imageId, projectBinding: config.taskBinding.sha256, passed: true, steps };
  } finally { fs.writeFileSync(kernel, original); }
}
module.exports = { qualifyProject };
if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(process.argv[2]));
  qualifyProject(config, { onStep: value => process.stdout.write(JSON.stringify(value) + '\n') }).then(report => {
    fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  }).catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
}
