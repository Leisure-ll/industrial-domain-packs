---
name: pcb-kicad-native
description: Bounded native KiCad board edits and independent DRC/task verification through Industrial Runtime (macOS local profile, no container).
---

# Public KiCad board tasks

Use industrial_tool_describe / industrial_action_call with `pcb.kicad.edit` and `pcb.kicad.verify`. Read current source SHA-256 with `project.files.read` first. Every mutation enters the scoped Domain Runtime; native Bash and legacy `pcb.bench.*` tools are not an integrated editing path.

First release: KiCad 10.0.6 on macOS Apple Silicon; a single rectangular Edge.Cuts outline and positioning/rotation of existing footprints. Supply `rectangle={origin:[x,y],size:[width,height]}` or `moves=[{reference,position:[x,y],rotation}]` with `file` and `expectedSha256`. Do not replace routing, schematic/ERC, library authoring, impedance, electrical or manufacturing acceptance with this profile.

Edits invalidate previous acceptance and preserve before/after board artifacts. Verify in a separate action with `expect={bounds:[x,y,width,height],footprints:[{reference,position:[x,y]}],maxWarnings}`. Independent native readback must match these explicit requirements, DRC errors and unconnected items must be zero, and all reports/warnings/ignored checks remain visible. Project-configured DRC rules are used; this is not a claim that every possible physical rule was enabled. Reinspect after every edit, resolve a new scope, and do not reuse a stale input hash. A process completion is not engineering acceptance.

A compatible Harness prepares KiCad 10.0.6 and its bundled Python from the project's Harbor when PCB is installed; use Settings → Domains to repair missing runtime assets. Users do not install KiCad separately or set environment variables. Developers running this native profile outside the managed product may explicitly supply `INDUSTRIAL_HARNESS_KICAD_CLI` and `INDUSTRIAL_HARNESS_KICAD_PYTHON`; the Python API requires the matching bundled wx/pcbnew modules. Inputs are bounded, ordinary project files without symlinks or hard links; native processes are offline and write only to fresh Runtime storage. This bounded native profile needs no benchmark task or evaluator; the Pack's separate PCB design tools retain their imported source and licensing provenance.
