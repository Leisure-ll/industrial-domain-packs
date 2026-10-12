---
name: chip-eda-operate
description: Operate the managed Chip design runtime through structured EDA actions and native evidence.
---

Use the installed project-bound tools discovered through domain_tool_list,
domain_tool_describe and domain_tool_call. Start with chip.project.describe for
supported operations and their structured parameter schemas, then
chip.environment.check for the selected action. chip.rtl.verify runs the RTL
simulation declared in eda.yaml. chip.eda.execute runs a declared canonical
operation and its dependencies, for example rtl.lint or logic.synthesize.

Docker must be running. The compatible Harness installs the immutable EDA image
from Harbor, including Python and the native tools. A missing runtime is repaired
in Settings → Domains. Do not install host Python, fetch upstream images or launch
unmanaged tool processes. Physical flows require the user's technology/PDK inputs;
the runtime does not supply a process library or imply foundry qualification.

Read and edit the user's project and eda.yaml through canonical file tools. Use
structured action parameters; project command, script, image, resource and output
path overrides are not accepted by the managed profile. Describe operations to
learn their supported input references. No benchmark task or evaluator is needed.

Each invocation snapshots the design and runs inside a protected offline container.
Harness owns its limits, cancellation, reports and durable Action/Run records.
Inspect the resulting artifacts after execution. A native process exit or tool
response is not engineering acceptance: retain native verification, assertions,
waveforms and explicit expectations. Missing evidence remains insufficient_evidence.
Source edits invalidate previous acceptance. Never skip failed proof partitions,
CTS, LEC or missing PDK evidence to claim PASS.

The preserved standalone EDA MCP remains a developer integration with its own
installation and scoped operations; its eda.harness.* IDs are not aliases of the
installed canonical tools. Do not substitute that service for a missing managed tool.
