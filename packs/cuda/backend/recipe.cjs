// Complete domain-owned allocation profile; no upstream task checkout required.
const path = require('node:path');
function projectRecipe(config) {
  const healthcheck = socket => ({ test: ['CMD-SHELL', 'test -S ' + socket], interval: '1s', timeout: '1s', retries: 30 });
  const seccomp = name => 'seccomp:' + path.join(__dirname, name + '-worker-seccomp.json');
  const worker = { image: config.imageId, network_mode: 'none', working_dir: '/app', user: 'root', pids_limit: 128 };
  return { services: {
    main: { ...worker, entrypoint: [], command: ['/usr/bin/sleep', 'infinity'], user: '10001:10001', cpus: '1.0', mem_limit: '1g', environment: { NVIDIA_VISIBLE_DEVICES: 'void' }, security_opt: [seccomp('candidate')], volumes: ['compiler_socket:/run/cuda-agent'] },
    compiler: { ...worker, healthcheck: healthcheck('/run/cuda-agent/compiler.sock'), command: ['python', '/opt/cuda-agent/candidate_compiler.py'], cpus: '4.0', mem_limit: '16g', environment: { NVIDIA_VISIBLE_DEVICES: 'void' }, security_opt: ['no-new-privileges:true', seccomp('candidate')], volumes: ['compiler_socket:/run/cuda-agent', 'evaluator_socket:/run/cuda-agent-private'] },
    evaluator: { ...worker, healthcheck: healthcheck('/run/cuda-agent-private/evaluator.sock'), command: ['python', '/opt/cuda-agent/candidate_server.py'], read_only: true, cpus: '6.0', mem_limit: '64g', cap_drop: ['ALL'], cap_add: ['CHOWN', 'DAC_OVERRIDE', 'KILL', 'FOWNER', 'SETGID', 'SETUID'], security_opt: ['no-new-privileges:true', seccomp('evaluator')], environment: { NVIDIA_VISIBLE_DEVICES: config.gpuUuid, CUDA_AGENT_EVALUATOR_GPU_UUID: config.gpuUuid, TORCH_CUDA_ARCH_LIST: '8.9', CUDA_AGENT_GPU_CONTENTION_MODE: 'record' }, volumes: ['evaluator_socket:/run/cuda-agent-private'], tmpfs: ['/tmp:rw,noexec,nosuid,nodev,size=256m', '/dev/shm:rw,noexec,nosuid,nodev,size=512m', '/scratch:rw,noexec,nosuid,nodev,size=256m,mode=0711', '/var/lib/cuda-agent:rw,noexec,nosuid,nodev,size=3328m,mode=0700', '/run/cuda-agent-worker-extension:rw,exec,nosuid,nodev,size=64m,mode=0711', '/run/cuda-agent-worker-cache:rw,exec,nosuid,nodev,size=1g,mode=0711'], deploy: { resources: { reservations: { devices: [{ driver: 'nvidia', device_ids: [config.gpuUuid], capabilities: ['gpu'] }] } } } },
  }, volumes: { compiler_socket: {}, evaluator_socket: {} } };
}
module.exports = { projectRecipe };
