# CUDA qualification — 2026-10-08

This record covers the first AXPBY allocation on Linux amd64 / RTX 4090 SM 8.9,
driver 595.71.05. Source commit and installed runtime are separate identities:
reviewed private upstream commit `6e94914b5c857e69755c2362f1745d6599426009`;
immutable image `sha256:f40cdcaaa64645e95e7896eedbcb1b8e13c2fcb4830a8000ff37fed44dfdf1be`.
The exact prepared wrapper/protected-file inventory is pinned in
`locks/rtx4090-image.json`. Core worker modules match the upstream file hashes.
The image label records an earlier build commit; qualification uses the full
immutable image plus installed-file checks, not that label as a source assertion.

## Exercised native paths

- Both distinct MCP identities: authenticated Streamable HTTP initialization,
  tool discovery and readiness; real native stdio initialization/discovery/checks.
- Immutable reference profiling, CPU-only candidate compilation, five independent
  GPU correctness inputs, and exclusive GPU profiling against torch.compile.
- A valid compiled candidate produces passed correctness and measurement evidence;
  the original candidate does not meet the separate 5% speedup target.
- A syntax-error kernel fails compilation. A compiling subtraction kernel fails
  GPU correctness. Neither process/MCP completion upgrades the verdict.
- Changed local source cannot reuse its prior compiler ticket. Tokens, role,
  project, source, image, Verifier and Pack source identity remain bound.
- A real in-flight compilation cancellation stops the exact three owned workers;
  Docker inspection confirms all stopped. Explicit recovery restarts the same
  pinned allocation. Completed request receipts and compiler submissions survive
  service restart; interrupted requests cannot silently become accepted.

## Harness and source gates

The production `createProjectRuntime` / `IndustrialRuntime` and deterministic
Broker at Harness commit `371d2b43b103d929fc2860dc1c27dbfda9cc10e8` exercised the real
paired remote service with the maintained CUDA plugin. Missing approval and
out-of-scope calls failed. Native receipts were collected into canonical artifacts,
verified, and committed as Actions, States and Checkpoints. This developer path
injected the reviewed Pack registration; packaged consumers need the new immutable
release pin before discovering CUDA normally.

The source suite includes real HTTP/stdio MCP transports, role/project/ticket
boundaries, request replay/reuse, cancellation with delayed confirmed cleanup,
source/receipt substitution and contended-measurement rejection. The architecture
contract gate and complete JavaScript source suite pass. Private task files,
credentials, host addresses and full native logs remain in the private qualification
workspace; this public record carries only the exercised scope and pinned hashes.

## Local preparation GPU gate

The added read-only host preflight checks model, stable UUID, VRAM, driver and
compute capability before allocating native workers. The fixed 4090 host was
inspected successfully; unsupported model/driver/SM, missing or ambiguous device
information and explicit multi-GPU selection have source regression coverage.
Real host Compose configuration roundtrips confirmed one selected Evaluator GPU
reservation, GPU-free CPU workers and preserved isolation/security-profile paths.
This configuration check started no containers and ran no new GPU benchmark.
Remote-client mode skips local GPU detection. This is an installation admission
check, not additional native GPU or desktop-installer qualification.

## Limits

No H200, other GPU/driver, task corpus, generic GPU coordinator profile, desktop
bundle or real-model optimization trajectory is claimed. Harbor/OpenCode trajectory
validation is a separate protocol and is not synthesized from Harness MCP receipts.
At version 0.1.0, `qualifiedBundlePlatforms: []` kept CUDA out of desktop bundles;
the macOS remote client qualification below supersedes that client restriction. The qualification allocation is temporary and is removed after checks;
a reviewed administrator deployment must provision and configure the paired service.

## Independent project qualification — 2026-10-12

A self-authored square project computes `x*x+1`, independently of the legacy
AXPBY reference. Its four protected files have binding
`d9a0af7267b77b9e450cbb617aa3ed6154604faa4879d076619028569fe4c10b`.
Offline task preparation derived image
`sha256:e3ee35dad61cb823f7953b1ae9eb2e522af8d14feb98963cbafda4b67ffad2d1`
over the same locked worker base. The new allocation used the Pack's packaged
Compose and syscall profiles without reading a private upstream checkout. The
reference, bindings and measurement configuration are checked before native calls
and bound into both MCP identities, compiler tickets and native receipts.

On the same Linux amd64 / RTX 4090 SM 8.9 / driver 595.71.05 profile:

- Authenticated paired HTTP initialization, readiness, reference profiling, CPU
  compile, five independent GPU correctness inputs and exclusive GPU profiling
  all passed through the maintained Runtime plugin and its artifact collector.
- Speedup was `0.9672429481346678` against torch.compile; the bound `1.05` target
  was not met. Correctness and valid measurements do not imply optimization.
- The compiling `x*x+2` candidate failed the real GPU correctness verifier.
- Changing `model.py` caused the old allocation to reject its task binding.
- Active native compilation cancellation confirmed cleanup and quarantined the
  allocation. Explicit recovery allowed a fresh compile and five-input GPU
  verification to pass. The unique qualification allocation and volumes were
  removed afterward; no owned container remained.

Private full receipts and logs are retained in the local qualification workspace.
The project path is constrained by the unchanged positive API, compiler IR and
native verification contracts. This extends task binding, not the GPU/driver
qualification scope. Other GPUs and unrestricted Python programs are not claimed.

## macOS remote client qualification — 2026-10-12

macOS Apple Silicon ran the actual shared Harness `createProjectRuntime`,
`IndustrialRuntime`, deterministic Broker and canonical SQLite/artifact store
against the authenticated paired remote service over an SSH loopback tunnel.
Harness implementation commit `ad248a4` consumed CUDA resource snapshot
`ebb31af8139a79a18a2ceeaedde64af1540f87a41903a1623a58ff1cde3617d7`.
Both identity checks, baseline, CPU compile, five-input correctness and exclusive
profile completed. Speedup `0.9672727272727273` did not meet `1.05`. Canonical
accepted State `fb89390b-4ccb-4288-9b9d-602f3b4e71d7` remained verified with the
same input hashes after a further read-only evaluator check; changing derived
`.cuda` receipts did not make real engineering inputs stale. Owned remote workers
and volumes and the temporary tunnel were removed after the check.

`qualifiedBundlePlatforms: ["darwin-arm64"]` advertises the installed remote client
in normal Settings. It does not claim a local macOS CUDA service or automatic GPU
provisioning. The administrator must provide both authenticated endpoints and exact
reviewed identities in trusted host settings; candidate inputs never carry their
credentials. Public release pinning remains a separate consumer integration gate.
