# Runtime distribution v2

> Current product policy: Harness downloads Domain Packs. Native applications and
> private native runtime directories are prepared externally and detected/associated.
> Users install Docker separately; explicit container preparation in Harness may
> fetch the declared pinned image, or use an existing local image. Pack installation
> never implicitly installs dependencies or pulls images. Native archive URLs and
> earlier managed native-install descriptions remain compatibility, maintainer and
> historical qualification records, not native installation actions.

This release separates software preparation from domain source distribution.
`pack.json` and `harness-pack.json` remain the maintained declarations;
`content-lock.json` remains the exact source identity. No additional manual catalog
is introduced. Existing tools, Verifiers, upstream byte identities and protected
Runtime semantics are retained.

## Product catalog

`consumerMetadata()` offers Chip, PCB, Godot and CAD with concise purpose and
profile-specific requirements. `hostPacks()` and the product Skill catalog exclude
CUDA. `withdrawnDomains: ["cuda"]` tells consumers to suppress previously installed
CUDA product entries as well. Consumers apply this explicit withdrawal list to
managed entries instead of treating the offered-domain catalog as a whitelist;
third-party domains remain available. Standalone CUDA sources, packaging, `getPack()` and `sourceDirectory()`
remain available for existing integrations. Its paired-service declarations below
are legacy standalone contracts, not a product installation option.

## Execution profiles

Each executable provider declares `executionProfiles` with `id`, `label`, `kind`
(`native`, `container`, `remote`), `platforms`, `qualified`, `toolIds`, `assetIds`,
and optional `description`. Tool IDs bind the existing canonical descriptors;
asset IDs bind `runtimeAssets` in the same manifest. Profiles describe qualified
scope, not live readiness or permission. Host backends still own process/container
lifecycle, cancellation and limits. Capability checks intersect profile tool IDs,
platform qualification and the Broker allowlist at execution time.

Native assets add `discoveryPaths`: application bundle root candidates under
`/Applications` and `~/Applications`, with `~` expanded by the consumer, and
`installUrl`: an official manual installation entry. Discovery is read-only and
version/ABI probing remains required. Existing pinned `url`/`sha256` fields retain compatibility and maintainer
identities only. Current consumers offer detection/association and external
native preparation links, without native runtime download/install actions.
Container image preparation is a separate explicit action requiring user-installed Docker.

`native-runtime-zip` declares a private runtime `directory` and its relative
`executable`, plus pinned URL, SHA-256, sizes, platform and environment binding.
`native-executable` supports association with an existing executable file without
inventing a managed download. Both use a fixed `probeId`: `version` maps to
`--version`, and `version-short` maps to `-V`. These generic probes accept no
arbitrary command arguments; existing application-specific probes remain
compatible. A runtime archive is an ordinary directory, not a fabricated `.app`.

Godot structural and FreeCAD native profiles are qualified on macOS ARM64.
DXF offers a qualified private native runtime archive on macOS Apple Silicon
and retains its container profile. PCB design uses its existing container on
the exercised macOS host.
PCB native covers only the bounded `pcb.kicad.*` tools. Chip managed containers
cover exercised macOS ARM64/Linux x64 RTL and synthesis; native detection is
explicitly unqualified with no executable tools. Physical EDA flows are not newly
qualified. CUDA declares only the existing paired remote RTX 4090 service profile;
its `platforms` list describes exercised clients (macOS ARM64);
`executionPlatforms` separately describes the Linux x64 service. CUDA `connection.kind: runtime-managed` declares the existing paired-service
environment variable names and validation types (`endpoint`, `secret`, `sha256`),
plus `verification: runtime-handshake`. It retains the local canonical Runtime
with remote MCP workers; generic coordinator RemoteSettings is a separate protocol.
Presence and format checks establish only `configured`/executable status, never
remote readiness. The existing plugin validates both service identities and
Verifier bindings before engineering calls. Existing configured clients may select
their unique runtime-managed profile implicitly during migration; explicit UI
binding persists only the profile and a local configuration fingerprint, never
credentials. Secret-derived fingerprints must remain local and must not appear
in public catalogs, traces or source artifacts. Remote readiness requires
existing authenticated service configuration and checks, never local detection.
CAD guidance remains a source/Skill pack without a fabricated runtime provider.

## Generated components

Run `npm run package:components -- chip --ref <full-reviewed-commit> --output dist/components`.
The builder reads only Git objects at that commit and verifies every selected
source against its committed content lock. Uncommitted changes never enter release
archives. Generated per-Pack release indexes bind the manifest hash, content digest,
source commit, execution profiles, external runtime asset identities and archive
hashes/sizes. They are output artifacts and are not hand-maintained source files.
Consumers can call exported `inspectComponentRelease(indexPath, trustedIndexSha256)`
to verify the pinned index and every archive/dependency before assembly. This API
does not extract archives or load code from an untrusted service.

Three archives partition locked sources: `skills` includes every nested Skill
resource; `bridge` includes `mcp/`, legacy `bridge/` and `server/` implementations;
`source` includes domain tools, Runtime adapters, Verifiers, locks and image recipes.
Bridge and Skill archives declare a dependency on the same release's source archive;
these archives are independently distributable, not independently executable.
Archive paths retain repository-relative layout so matching components can be
assembled in one root. Source includes package dependency metadata; full-package
consumers assemble all declared packs before using the shared catalog/integrity API.
Each contains repository license/provenance notices. Software apps, archives,
image layers, binaries and local environments are rejected. Dockerfiles are source
recipes, not images. Runtime software remains external, pinned by `runtimeAssets`.
The old full source archive command remains compatible.

`packs/{chip,pcb,godot}/mcp/index.cjs` is the consumed stable MCP distribution facade;
`lib/consumer.cjs` loads it, while legacy bridge paths preserve compatibility.
Existing source paths and upstream PCB actor bytes remain unchanged. Containers
still build from the complete pinned repository context. A Go `environment-probe` platform component now executes only fixed owner-declared
Godot/KiCad/FreeCAD version probes. It is independently built with
`python3 scripts/build-platform-probe.py` for macOS ARM64 and Linux x64; its generated
index binds platform binary hashes and exact Go source hashes. The exported
`createVersionProbe({binary, sha256})` validates the pinned binary and accepts
`(asset, executable, {signal, timeout, cwd, env})`, returning stdout. The integrating
RuntimeEnvironmentManager supplies trusted selected application paths. Arbitrary
arguments, shell commands and project inputs are unavailable. Unix process groups,
120-second maximum timeout and 64 KiB per-output limits bound the probe.
This is an environment detector, not a domain MCP rewrite.
No generic Go replacement is advertised: a future Go transport must call the same real domain workers and
preserve authorization, schemas, receipts, errors, cancellation and cleanup before
platform binaries are qualified. Cross compilation or `tools/list` alone is not
such qualification.

## Host publisher and installed consumer API

The Host publisher builds the platform probe from a trusted checkout of the exact
owner commit using `scripts/build-platform-probe.py`; the end-user npm installation
does not run Go or download build tools. `dist/platform-probe/platform-probe-index.json`
is a generated `platform-components` index with `sourceCommit`, `sourceState`,
`sourceFiles` and `components[{id, platform, file, sha256, sizeBytes}]`. Production
publication requires `sourceState: committed` and a reviewed source commit. The
publisher verifies the component hash and size, copies the matching platform binary
into its signed hpack, and declares:

```json
{
  "platformProbe": {
    "schemaVersion": 1,
    "platform": "darwin-arm64",
    "file": "components/darwin-arm64/industrial-environment-probe",
    "sha256": "<binary SHA-256>",
    "sizeBytes": 0
  }
}
```

The example size/hash are placeholders; the publisher uses generated actual values.
The installed consumer verifies the signed bundle, bounds `file` to its installation
root, rejects symlinks and platform mismatch, checks size/hash, then injects
`owner.createVersionProbe({binary: resolvedPath, sha256})` as the shared environment
manager's `versionProbe`. Association still requires the existing application
signature, executable mapping, ABI and version checks. Detection never grants tool
permission. Source checkouts may explicitly retain a development probe fallback;
production bundles must not silently use it when their declared component is missing.

Source/Skill/bridge release components use a separate generated
`domain-pack-release` index. `inspectComponentRelease(indexPath, trustedIndexSha256)`
checks its exact trusted index hash, regular archive files, sizes, archive hashes
and declared component dependencies without loading code. The caller owns safe
assembly and must preserve repository-relative paths. Neither an unsigned remote
index nor a successful version probe authorizes executable code or engineering
acceptance.

## Product catalog cleanup validation (2026-10-12)

`npm run test:architecture-contract` passed 11 tests. `npm test` passed
85 tests with two opt-in native qualification tests skipped (managed CAD/Chip
containers and managed PCB). The suite exercised real HTTP MCP and both CUDA
stdio MCP initialization/tool-discovery paths, preserving standalone compatibility.
`npm run lock:check` passed after regenerating the changed consumer source hashes.
No deployment, native engineering run or additional platform qualification was
performed for this metadata-only product change.
