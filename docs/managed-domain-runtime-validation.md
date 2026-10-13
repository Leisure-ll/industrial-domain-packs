# Managed domain products: qualification and boundaries

> Current product policy: Harness downloads Domain Packs. Native applications and
> private native runtime directories are prepared externally and detected/associated.
> Users install Docker separately; explicit container preparation in Harness may
> fetch the declared pinned image, or use an existing local image. Pack installation
> never implicitly installs dependencies or pulls images. Native archive URLs and
> earlier managed native-install descriptions remain compatibility, maintainer and
> historical qualification records, not native installation actions.

## Delivery contract

The installed product prepares its declared native applications and prebuilt
runtimes from the project Harbor. Upstream URLs remain provenance, not automatic
fallback download locations. Every archive has a SHA-256 and every container has
an immutable manifest/config identity. Source builds remain maintainer workflows.
Docker itself and administrator-managed GPU services remain explicit prerequisites.

Domain Packs own Skills, typed tools, native report interpretation and image
recipes. Harness owns installation, bounded files, protected process/container
execution, cancellation and canonical evidence. Ordinary projects do not need
benchmark task seeds, scoring files or a benchmark evaluator. Preserved upstream
source names and reference fixtures are provenance, not the installed workflow.

## Chip

The managed profile ships Python and native EDA tools together. It snapshots a
user-owned `eda.yaml` and sources, prepares structured operations using the
maintained EDA implementation, runs offline in a bounded container and exports
actual native artifacts. It does not expose arbitrary command/image/host-mount
choices. Historical standalone MCP remains available separately.

Real execution on macOS ARM64 and Linux x64 with Docker linux/amd64 exercised project discovery,
environment checks, Verilator RTL assertions and VCD, and Yosys synthesis hierarchy
and connectivity checks. Canonical Harness integration exercised a deliberately
incorrect testbench assertion, active native cancellation and recovery after restoring the source. The native
example is `packs/chip/examples/managed-rtl`; lint targets the DUT while simulation
targets the timed testbench. No testbench is silently removed to pass lint.

Linux qualification used a fresh managed image store and the real signed installed
Pack. It exercised installation, RTL/VCD and synthesis, a failing assertion,
cancellation after native execution started, recovery, restart and same-version
repair. Runtime image 1.0.1 makes only the container-owned working copy writable
for its non-root user; the mounted input snapshot remains read-only. The same
immutable image passed the macOS native regression. Exact source/image identities
and reports are in the [distribution evidence](../provenance/runtime-distribution-evidence/chip-linux-managed-native.txt)
and [installed qualification](../provenance/runtime-distribution-evidence/chip-linux-installed-native.txt).

The image excludes bundled PDKs, sample designs, old run stores and credentials.
Physical implementation still requires project-owned technology inputs. Installed
tool presence is not evidence that every physical flow is qualified. Synthesis
checks do not prove equivalence or LVS, and RTL coverage is testbench-defined.

## CAD

One CAD runtime composes the existing FreeCAD tools and `cad.dxf.create`,
`cad.dxf.inspect`, `cad.dxf.verify`. DXF offers a private native CPython/ezdxf runtime on macOS Apple Silicon and
retains its pinned container profile; AutoCAD is
an optional existing desktop application, not a default prerequisite.

Actual DXF creation/readback checks passed for a millimetre drawing; an incorrect
circle diameter failed. The readback records the actual file hash, engine and
plane geometry. The verifier rejects mismatched reports, cancelled/changed inputs
and unsupported plane assumptions. Saved-file readback uses ezdxf itself, not an
independent CAD implementation. The exposed authoring recipe covers bounded lines,
circles, polylines and text; DWG/PDF conversion is not claimed by this profile.

The real Harness factory also verified that DXF inputs stay tracked when generic
workspace ignore/input rules exclude their directory: editing a verified drawing
makes its state stale. Hidden, dependency and evidence paths are rejected;
symlinks, excessive depth and input-inventory failures cannot produce acceptance.
Removing the invalid input and re-running restores normal verification. These
checks use the same published DXF image and the final CAD source adapter.

The Harbor-prepared FreeCAD binary also passed canonical box creation and independent
FCStd/STEP/BREP geometry readback. The expected 600 mm³ volume passed; an explicit
601 mm³ expectation failed.

## Godot

The Godot 4.7.2 archive was fetched from Harbor through the real generic installer,
SHA-256 checked, extracted and version-probed. One stalled transfer failed cleanly;
a retry completed. Initial cold native probes exceeded the previous 30-second
limit; the consumer now permits 120 seconds while retaining cancellation and
process-group cleanup. These changes do not disable signature/version checks.

The installed binary passed canonical native import, independent scene readback
and a bounded frame run with explicit BoxMesh dimensions. A deliberately wrong
size expectation failed. This qualifies the existing structural scene profile,
not arbitrary gameplay, export templates or every engine subsystem.

## Reproduction

Run repository tests and `npm run lock:check`, plus the Chip source pytest suite
and real stdio MCP smoke documented in its README. For real canonical container
qualification, use a compatible Harness source checkout with installed dependencies:

```sh
DOMAIN_RUNTIME_HOST_ROOT=/absolute/industrial-agent-harness \
  QUALIFY_MANAGED_DOMAIN=chip node --test tests/managed-native.test.cjs
DOMAIN_RUNTIME_HOST_ROOT=/absolute/industrial-agent-harness \
  QUALIFY_MANAGED_DOMAIN=cad node --test tests/managed-native.test.cjs
```

The opt-in tests use the exact image declared by each manifest. They are skipped
without the required native environment; a skip is not an acceptance result.
PCB and CUDA have separate native qualification records and explicit platform
boundaries. Runtime distribution locks and build recipes retain the image/source
identities used for each publication.

## Native DXF 1.0.1 qualification

`cad-dxf-native` is a real relocatable `native-runtime-zip`, with standalone
CPython 3.13.13 and hash-locked ezdxf 1.4.3 dependencies. Two independent builds
produced SHA-256 `10ff2481aea0661f6315c803bd14407634f240f77fdcadf80bf1cc709cf07318`.
The published Harbor blob was downloaded completely and verified anonymously;
see `provenance/runtime-distribution-evidence/cad-dxf-native.json`.

`tests/dxf-native.test.cjs` exercised the extracted artifact through the canonical
Harness local sandbox and runtime file API: saved creation, source inspection,
correct expectations, incorrect diameter, negative-radius process failure,
in-flight cancellation, preserved source hash and recovery. Private interpreter
relocation and hostile ambient Python settings also passed. Qualification details
are in `cad-dxf-native-qualification.json` beside the download evidence. This
profile needs neither Docker nor a host Python installation. FreeCAD remains the
default CAD profile and the DXF container profile remains independently selectable.
