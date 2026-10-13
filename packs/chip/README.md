# Chip design runtime

The installed Pack runs `chip.rtl.verify`, `chip.environment.check`,
`chip.project.describe` and `chip.eda.execute` through the trusted Harness backend.
The managed profile is qualified on macOS ARM64 and Linux x64 with a Docker
linux/amd64 container. Install Docker separately, then explicitly prepare the
pinned EDA image in Harness or provide it locally. Harness verifies its identity;
Domain Pack installation alone never pulls images or prepares dependencies. Drawing/EDA execution requires no host
Python, virtual environment or Verilator installation. No benchmark task is required.

A project declares `eda.yaml`, source files and typed action parameters. Describe
the supported operations before executing a declared action. The outer Harness
snapshots inputs, owns container resources/cancellation and preserves native
reports as canonical artifacts. Runtime scripts cannot choose images, host mounts,
resource overrides or arbitrary project commands. Physical flows additionally
require project-owned PDK/technology inputs. The image excludes bundled PDKs and
sample designs. Presence of a tool does not qualify every physical flow.

The maintained EDA 0.6.1 source, locks, 25-tool standalone MCP, Skills and licenses
remain available for direct developer integrations. This standalone service is a
separate integration surface; its persisted state is not the installed Harness's
canonical state. `legacy-harness-pack.json` records that earlier surface.

Developer source checks (not end-user installation):

```sh
uv sync --frozen --directory packs/chip/eda-harness
uv run --frozen --directory packs/chip/eda-harness python ../scripts/mcp-smoke.py
uv run --frozen --directory packs/chip/eda-harness pytest -q
```

See [provenance](PROVENANCE.md) for source origin and retained licenses.
Native qualification records identify exactly the exercised operations; a successful
process alone never establishes engineering acceptance.
