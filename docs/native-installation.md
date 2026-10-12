# Managed native dependency declarations

Consumer release 0.6.0 provides Harbor-hosted native applications and immutable prebuilt domain runtimes for qualified macOS Apple Silicon clients. A compatible Harness Pack Manager consumes these trusted declarations; this repository does not own installation UI, download execution, canonical readiness state or a second installer. The developer `setup-native.cjs` scripts remain optional diagnostic entry points.

| Domain | Native archive | Download bytes | App payload bytes | Required executables |
| --- | --- | ---: | ---: | --- |
| CAD | FreeCAD 1.1.4 arm64 DMG | 649760538 | 2625114576 | `freecadcmd` |
| PCB | KiCad 10.0.6 universal DMG | 1404303659 | 5104942382 | `kicad-cli`, bundled `python3.9` with pcbnew |
| Godot | Godot 4.7.2 stable universal ZIP | 170622178 | 353682925 | `Godot` |

All default download URLs point to the project Harbor; exact SHA-256 digests and original upstream URLs are retained in the host manifests and distribution lock. The mirrored bytes are the original vendor archives. On 2026-10-09 the three existing official archives were independently hashed and their byte sizes checked. KiCad and FreeCAD app sizes were measured from read-only official DMG contents; Godot's app size matches its ZIP entries. `installedSize` is the sum of regular-file bytes and symbolic-link target-text bytes without following links. It describes the app payload, not exact filesystem allocation, free-space admission, temporary extraction space, the retained download cache or project outputs. Harness should label displayed installed sizes accordingly.

`app` is the installed bundle basename. `archiveApp` identifies its bounded location inside the archive (`KiCad/KiCad.app` in the KiCad DMG, `Godot.app` in the Godot ZIP). `executable` and each `environmentExecutables` value are relative to the installed app. The primary `environment` mapping is unchanged; KiCad additionally maps `INDUSTRIAL_HARNESS_KICAD_PYTHON` to `Contents/Frameworks/Python.framework/Versions/3.9/bin/python3.9`. This makes both native entry points available through the shared manager without user shell or environment setup. Version probes use `--version`; FreeCAD retains its existing compatibility flag and private profile directories.

The original KiCad and Godot bundles passed `codesign --verify --deep --strict`, and their real version commands returned 10.0.6 and 4.7.2 stable official. Manifest tests enforce agreement with the existing qualified dependency locks, required executable mappings, download sizes and unchanged platform boundaries. These checks validate source declarations and original native bundles; the updated Harness consumer must separately exercise real managed install, cancellation, repair, restart and native task flows. They do not publish an installer or qualify a new platform or engineering task.

Chip now declares a prebuilt managed EDA image, including Python and native tools.
PCB additionally declares its complete prebuilt design gateway environment. CAD
composes FreeCAD and a pinned Python/ezdxf image. Docker must be available; users
do not build these images or install their Python dependencies. Container manifests
pin the registry manifest, config digest, architecture, compressed download and
expanded root filesystem sizes. Expanded size is measured separately from Docker
Desktop's compressed content-store size.

CUDA is a qualified macOS remote client for user-owned kernel projects. It enters
normal domain bundles and needs no local GPU. Administrators provide authenticated
paired services and immutable project bindings; private worker images are acquired
from the private Harbor project without disclosing registry credentials to clients.
The qualified GPU profile remains RTX 4090. Godot export templates, AutoCAD and
project-owned PDK/technology inputs are outside automatic installation.

The compatible Harness installer was exercised with real Harbor downloads,
archive/image identity checks, signature/version probes and ready receipts. Cold
native probes permit 120 seconds while retaining process cancellation/cleanup.
See [managed qualification](managed-domain-runtime-validation.md),
[PCB qualification](pcb-product-validation.md) and
[CUDA qualification](../packs/cuda/QUALIFICATION.md) for actual engineering scope.
These results do not qualify every physical design flow, manufacturing check,
game subsystem or additional desktop/GPU platform.
