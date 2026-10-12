# PCB design Runtime Pack

The product capability is PCB design: create a project, inspect and edit KiCad schematics and boards, prepare sourced components, route copper, run native checks and applicable analyses, and retain CAD, reports and views. Existing projects and empty workspaces are both valid inputs. Ordinary users need no benchmark task, seed board, evaluator or submission.

A compatible Harness Pack Manager installs KiCad 10.0.6 and the prebuilt PCB design environment from `harbor.pvg2.zhiman.tech`. It verifies the declared archive hash or immutable OCI digest. Users do not build an image, prepare Python, run dependency synchronization or download from official KiCad sources. Docker is required for the design container; Harness reports a missing Docker installation before execution. The optional native mounting-board profile uses the managed KiCad app on macOS Apple Silicon. Other desktop platforms and remote execution remain unqualified.

## Product and reused implementation

`pcb.design.*` exposes 88 atomic tools in seven stage capabilities: core, components, schematic, pcb, verification, delivery and operate. `pcb.design.e2e` resolves to the product Skill at `skills/pcb-design/SKILL.md`. It reuses the complete engineering references, tools and runtime imported from PCB-bench. The original `pcb-agent/` (101 files) and `skills/pcb-design-e2e/` (11 files) remain byte-for-byte pinned in `runtime/bench-upstream.json`, with their provenance and source/schema identities. Internal `pcb.bench.*` aliases and historical filenames identify that source; they are absent from the product capability catalog. Benchmark claim submission (`finalize_claims`) is excluded from the product allowlist.

The product path does not mount a fixed task requirements file or load an evaluator. The user's brief drives the work; `spec.json` records editable intent, constraints and analyses. Native ERC, DRC, parity and simulations retain their own evidence and scope. Separately bound immutable requirements are an optional standalone integration and cannot be waived by changing model intent.

## Execution and evidence

Harness injects `runtimeApi.openToolSession`, `executeTask` and `runtimeFiles`. Its backend allocates the immutable Linux amd64 container, applies CPU/memory/process limits, mounts the bound project and trusted adapter files, and confirms cleanup after cancellation. The domain gateway runs inside that already allocated container and starts the native controller there; it has no nested Docker client or socket. No host Python environment is needed. This trusted profile explicitly permits bridge networking for sourced datasheet/CAD/model acquisition; it does not receive host networking, a Docker socket or credentials. Individual acquisition tools still validate sources and retain provenance. Controller/root and native-tool identities remain separated, the workspace has an exclusive process-held lease, and interrupted operations retain pending/completed receipts rather than being replayed.

The bridge verifies the full original actor/Skill inventory, live tool schema, KiCad CLI and pcbnew versions, and KiCad package versions before accepting operations. Calls are bounded to 64 KiB of arguments and 45 seconds of transport execution; large responses are paged. Images are forwarded as actual MCP image blocks with byte/hash receipts. `forwarded` records transport forwarding; `delivered: false` deliberately does not claim the model received or interpreted the image. Harness chooses whether the model supports image input.

Source observation excludes generated `session/` receipts and explicit `.pcb` evidence/cache paths. It retains schematic/board sources, project rules, editable intent, downloads and `.pcb` libraries, models and authoring inputs. Read-only status or rendering does not stale input identity merely by creating a receipt; a real design/dependency change does. Runtime/Verifier bytes remain part of the identity.

A successful operation is not engineering acceptance. `pcb.design.receipts.v1` returns `not_run` because the operation receipt alone does not qualify a design. Read each current native check, its report validity, actual violations, analysis assumptions and missing evidence. ERC, DRC, parity, simulations, assembly geometry and hardware/manufacturing qualification are distinct. Candidate-authored tests are explicit diagnostics; missing coverage remains UNKNOWN. A preview, zero exit code or mock never supplies a design PASS.

## Bounded native profile

`pcb.kicad.edit` changes one rectangular Edge.Cuts outline or moves existing footprints on a protected snapshot with expected source hashes. `pcb.kicad.verify` independently runs native DRC and pcbnew readback against explicit bounds and placement expectations. Its versioned Verifier requires KiCad 10.0.6, zero errors/unconnected items, no excluded violations, 0.001 mm geometry tolerance and the caller's optional warning bound. The self-authored mounting-board example retains two library warnings; it does not claim schematic, electrical or manufacturing signoff.

Projects remain bounded to 128 MiB, 16 MiB per input/output, 10,000 scan entries and depth 24. Symlinks, hardlinks, escaping paths and stale source hashes are rejected. The reserved `runtime-identity` namespace cannot be shadowed. Source edits invalidate prior independent verification.

## Maintainer validation

Image construction and dependency synchronization are maintainer release operations, separate from installation. `Dockerfile.local-dev`, the frozen standalone bridge and historical setup script remain diagnostic/reproducibility resources. The production image and native app are selected by `harness-pack.json`; no user instruction should substitute a development image or mutable tag.

Run `npm test`, `npm run test:architecture-contract` and `npm run lock` after reviewed source changes. Contract tests validate product declarations, input boundaries, image forwarding and shared startup; they do not establish native engineering acceptance. Record real container checks and their limits separately in the release evidence. See `PROVENANCE.md` for the complete retained import history.
