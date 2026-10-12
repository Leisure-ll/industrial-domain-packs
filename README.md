# Industrial Domain Packs

Development boundary: [accepted architecture contract IH-ARCH-001](docs/architecture-contract.md).

[简体中文](README.zh-CN.md)

Maintained public source for Industrial Harness domains. Local and remote consumers pin this repository by an exact Git commit; domain execution, Skills, dependency locks, tool definitions, Verifiers and image recipes are developed here.

## Managed product release 0.6.0

A compatible Harness prepares native applications and prebuilt tool runtimes from the project Harbor. Normal design projects use domain Skills, tools and runtime without benchmark task seeds or scoring workflows. Docker and administrator-provided GPU service access remain explicit prerequisites. See [managed qualification](docs/managed-domain-runtime-validation.md), [PCB validation](docs/pcb-product-validation.md), [CUDA qualification](packs/cuda/QUALIFICATION.md) and [distribution identities](provenance/runtime-distribution.json). Earlier version notes below are historical; deployed consumers must pin this release to adopt it.

| Pack | Included implementation | Execution boundary |
| --- | --- | --- |
| Chip | Managed structured EDA, RTL assertions/VCD, synthesis, Skills and native reports | Harbor runtime; Docker; physical flows need project-owned technology inputs |
| Godot | Typed scene edits, native import, independent scene readback and frame checks | Harbor-prepared Godot 4.7.2 on macOS Apple Silicon; structural workflow |
| PCB | 88 independent schematic/PCB design tools, component resources and native checks | Harbor runtime and KiCad 10.0.6; Docker; macOS Apple Silicon desktop |
| CAD / FreeCAD | Parametric solids and managed DXF create/inspect/verify in one CAD runtime | Harbor FreeCAD and DXF image; Docker for DXF; explicit geometric expectations |
| CUDA | User-owned kernel projects, reference bindings, remote compile/correctness/profile | Administrator-prepared private Harbor runtime and authenticated RTX 4090 service; no client GPU |
| CAD guidance | Shared drawing methodology, ezdxf operating references, optional AutoCAD guidance | Reused by the CAD product; AutoCAD is optional for DWG/live desktop work |

The original migration imported committed source: Harness `371b011b41417d5cb0c29bc9a0fd4c8bfa4bf75e` and FreeCAD PR29 `62510b22b47803e0841825ec1c2b34fae48b3b15`. Exact imports are recorded in [provenance](provenance/domain-migration.json). Subsequent releases vendor the reusable PCB actor with its provenance. Current `harness-pack.json` files are executable installation/runtime declarations; preserved legacy manifests and bootstrap notes are historical references. Current availability is defined by the managed release and qualification records above.

## Consumers

```sh
npm install --ignore-scripts 'https://codeload.github.com/Zhiman-BJ/industrial-domain-packs/tar.gz/<full-reviewed-commit>'
```

The package `@zhiman-bj/industrial-domain-packs` exports `catalog`, `identity`, `getSandboxProfile()` and integrity checks. `content-lock.json` identifies maintained code and metadata. Pin the full commit in both package.json and package-lock.json. No npm registry publication is required for this Git dependency.

The remote service consumes the trusted `chip-pack/rtl-cpu` profile, including its descriptor, Verifier, native entry, bounded artifact exporter and Dockerfile. It checks the sandbox's content identity before native execution. The native entry calls the same EDA `semantic.prepare` and `semantic.observe` used by local execution; both canonical adapters use `runtime/verifier.cjs`. Image versions and Pack identities are part of capability disclosure and persisted jobs. The local Harness consumer transition remains separate; existing installations do not change automatically.

## Development and validation

```sh
npm ci --ignore-scripts
npm test
npm run lock:check
uv sync --frozen --directory packs/chip/eda-harness
uv run --frozen --directory packs/chip/eda-harness pytest -q
uv run --frozen --directory packs/chip/eda-harness python ../scripts/mcp-smoke.py

docker buildx build --platform linux/amd64 --load \
  -f packs/chip/images/Dockerfile.rtl-cpu -t industrial-domain-rtl:0.2.0 .
./validate.sh packs/chip/examples/rtl --image industrial-domain-rtl:0.2.0
```

`validate.sh` starts one isolated ephemeral container per task, checks real simulation completion, native verification and VCD structure, and writes `result.json`. See [qualification](docs/migration-validation.md) for exercised paths and limits. Images are validated locally; source CI does not build or publish tool images.

After deliberate source changes, stage reviewed files under packs/ and lib/ and run `npm run lock`. This changes the release identity. Build consumer and sandbox images from the same pinned package, then drain the old coordinator before switching.

Build a committed **source-only** archive for any Pack with `python3 scripts/package-pack.py chip --output dist` (also godot, pcb, freecad, cad, cuda). Archives contain import notices and file hashes; executable images use the complete pinned package as their build context.

## Ownership and license

This repository owns domain code. [Industrial Agent Harness](https://github.com/Zhiman-BJ/industrial-agent-harness) owns canonical contracts, generic Runtime, Broker, Kimi integration, CLI, Desktop and Viewer framework. The private remote service owns authentication, snapshots, grants, bounded scheduling and sandbox lifecycle. Workloads receive no Docker socket or Kubernetes credentials. Process success never substitutes for canonical verification.

Original contributions and imported Harness contributions use MIT; preserve [notices](THIRD_PARTY_NOTICES.md) and `licenses/industrial-agent-harness.MIT`. Native tools retain their own terms. Customer projects, credentials, deployment endpoints, PDKs, private PCB actor source, native binaries and archived runs are outside this public source repository.

See [architecture](docs/architecture.md), [release identity](docs/release-format.md), and [migration](docs/migration.md).

## Harness consumer release

Version 0.3.0 adds `consumerMetadata()`, `hostPacks()`, `sourceDirectory()` and `skillResource()`. The maintained package now owns the host declarations, capability/Skill catalog and verified source resources used by Harness packaging. Canonical Pack IDs are shared with the existing catalog. Harness imports this exact package; it must not maintain a second domain registry or source tree. See [consumer release](docs/harness-consumer.md).

Version 0.4.0 adds the CUDA Pack. Configure both authenticated remote MCP endpoints in trusted host settings. Local worker preparation requires a GPU/profile preflight and explicit evaluator UUID; remote clients need no local GPU. See [deployment and client setup](packs/cuda/README.md).

Version 0.4.0 also introduces the [PCB/Godot professional Runtime profiles](docs/professional-runtime.md), replacing integrated legacy MCP disclosure with canonical Runtime Actions. Installed Packs use the Harness-injected backend outside development repositories. No new remote or other-platform qualification is asserted.

Version 0.4.1 declares managed official KiCad and Godot downloads alongside FreeCAD for a compatible Harness Pack Manager on macOS Apple Silicon. Installation sizes, version probes and both KiCad executables are declared by the owner; users do not need shell commands or environment variables on this managed path. Chip still requires its external toolchain and CUDA requires administrator-provided remote services. See [native installation metadata and limits](docs/native-installation.md). Existing public installers do not gain these recipes until their consumer pin and generic installer are updated and qualified.

FreeCAD now declares version-bound result groups for models, previews, exports and diagnostics. Inspect results reference their exact input snapshot; edits explicitly replace the input version only after successful native generation. Harness binds local output names to registered Artifacts. Selection is optional; model geometry acceptance still requires the existing Verifier.

[All-domain result declarations and expansion plan](docs/result-presentation-plan.md), with [schema-checked examples](docs/result-presentation-examples.json), cover the five domains and six Packs. This is preparation: other Pack producers, snapshot-version binding and CUDA consumer adoption remain to be implemented and qualified.

Version 0.5.1 combines these managed installation recipes with the 0.5.0 result declarations. FreeCAD distribution 1.1.4-pack.7 retains the complete installation recipe from pack.6 and the source presentation behavior from pack.5; published earlier Pack versions keep their original bytes. PCB and Godot versions and qualified platform limits are unchanged. Consumers must update their immutable pin and qualify the combined application.

Version 0.5.2 retains the managed installation recipes and FreeCAD result declarations while incorporating the latest Godot typed scene-edit checks and tool guidance. Godot distribution 0.2.2 combines those reviewed Runtime sources with the existing managed native recipe; other Pack versions and contents are unchanged. Earlier distribution versions keep their original immutable identities.

PCB distribution 0.3.0 provides independent `pcb.design.*` capabilities and a product Skill while retaining the complete pinned upstream implementation and references. A compatible Harness automatically installs its prebuilt design environment and KiCad from Harbor. Ordinary workspaces require no benchmark seed, evaluator or submission. See [PCB design](packs/pcb/README.md).
