# FreeCAD native Domain Pack

Harness-owned fixed FreeCAD 1.1.4 bridge: parametric recipes, constrained rectangle/circle sketches, pads, holes, boxes, cylinders and boolean solids. Shared Desktop/CLI Runtime tools preserve actions, artifacts and separate-process readback verification. Native execution is qualified on macOS arm64 only.

Versioned edits change known parameters or feature dimensions, profile and origin from a hash-bound recipe. Originals remain intact. Outputs include BREP and source-bound native sketch companions for the official OCCT AIS/V3d WebGL2 Viewer. A separate FreeCAD process reopens the saved FCStd and exports actual geometry, constraint references/dimensions and fully-constrained status, not recipe-derived display guesses. The Viewer is bundled with Desktop separately from this native Pack.

A compatible Harness Pack Manager prepares the pinned official FreeCAD application on macOS Apple Silicon. For standalone development or older consumers, install upstream FreeCAD separately and set `INDUSTRIAL_HARNESS_FREECAD_CMD` if it is outside `/Applications`. This Pack does not bundle FreeCAD, Python macros, paid services or an independent MCP execution server. Geometry validation does not establish strength or manufacturability.

See [integration and limits](../../doc/freecad-domain-pack.md). Run native acceptance with:

```bash
node --test tests/integration/freecad-runtime.test.cjs
pnpm --filter @industrial-agent-harness/desktop test:cad
```

`scripts/setup-freecad.cjs` prepares the pinned official runtime for macOS arm64 CI. Its upstream download SHA and provenance are recorded in the integration guide.

Apple Silicon packaged Desktop offers this Pack on first launch and automatically prepares the pinned official FreeCAD. Settings → Domains supports readiness and repair. Development command overrides remain supported outside the managed install. See [installation flow](../../doc/macos-cad-distribution.md).

## Automatic result presentation

The 1.1.4-pack.5 production path declares model/export/preview relationships and independent diagnostics. Input snapshots bind edits and inspection reports to an exact source version. Failed/cancelled operations expose only actual readable output; they do not replace a successful model. Harness contract presentation schema 1 is optional for older consumers, whose existing Artifact references remain valid.

Distribution 1.1.4-pack.7 combines these result declarations with the managed native installation recipe and measured footprint from pack.6. The Runtime sources remain identical to pack.5; installation metadata does not change geometry or verification semantics.

Distribution 1.1.4-pack.8 makes the user-path containment check case-insensitive on macOS, where the default filesystem resolves directory names in any casing while `realpath` keeps the caller's spelling. Registered project paths whose case differs from the on-disk entry no longer fail every action with "FreeCAD user paths escaped the Action directory". Linux comparisons stay exact, and genuine escapes (including through symlinks) remain rejected.

## Managed FreeCAD and DXF installation

The compatible Harness prepares FreeCAD 1.1.4 and a private native DXF runtime
on macOS Apple Silicon. `cad.dxf.create`, `cad.dxf.inspect` and `cad.dxf.verify`
use the trusted `INDUSTRIAL_HARNESS_DXF_EXECUTABLE` binding when prepared. The
existing pinned Docker profile remains available. No host Python/ezdxf installation
is needed. The single CAD
runtime exposes these alongside the existing FreeCAD tools. Create supports
bounded lines, circles, polylines and text in millimetres, and hash-checks any
replacement. Verification checks the saved drawing against explicit expectations.
The ezdxf readback is not an independent CAD engine. AutoCAD remains optional for
DWG and live desktop sessions; it is not part of this managed prerequisite set.

Maintainers build the native archive with Python 3.12+ and `uv`:

```sh
python3 scripts/build-dxf-native-runtime.py
DXF_TEST_HARNESS_ROOT=/absolute/path/to/industrial-agent-harness DXF_TEST_EXECUTABLE=/absolute/path/to/extracted/dxf-runtime/bin/harness-dxf node --test tests/dxf-native.test.cjs
```

The archive contains a pinned standalone CPython 3.13.13 interpreter, hash-locked
binary ezdxf dependencies, component licenses and source/file hashes. Independent clean builds produce the
same archive SHA-256. Unused dependency CLI launchers are excluded. The launcher
ignores ambient Python configuration and runs inside the canonical Runtime's
bounded local sandbox. Qualification exercises real create/inspect, incorrect
geometry, native failure, in-flight cancellation and successful recovery. A local
association selects the extracted launcher file; no `.app` wrapper is involved.
