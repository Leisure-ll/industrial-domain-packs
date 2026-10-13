# freecad source provenance

Imported from committed public MIT source in Zhiman-BJ/industrial-agent-harness. Exact commits, source/destination paths and pre-adaptation hashes are in ../../provenance/domain-migration.json. Preserve ../../licenses/industrial-agent-harness.MIT. Maintained content, including layout adaptations, is identified by ../../content-lock.json.

Native executables and licensed project assets are installed separately and retain their own terms. Source migration does not qualify a new operating system or remote profile. FreeCAD uses the committed public PR29 snapshot; unfinished working files were not imported.

## Managed distribution (2026-10-12)

The CAD runtime adds maintained typed DXF tools backed by pinned ezdxf in a Harbor-distributed image. FreeCAD native archives are mirrored byte-for-byte, with their upstream URL retained for provenance. DXF audit/readback is from the same ezdxf engine and is not independent CAD validation.

The native DXF runtime recipe (`scripts/build-dxf-native-runtime.py`) pins Astral
python-build-standalone CPython 3.13.13 build 20260408 by archive SHA-256, and uses
the existing `images/dxf-requirements.txt` complete hash lock for ezdxf 1.4.3 and
binary dependencies. Shipped interpreter and wheel license files are retained;
`provenance.json` records original URLs, dependency lock and every runtime file
hash. The deterministic launcher uses this private interpreter in isolated mode.
No global Python, Homebrew state or end-user package manager is required.
