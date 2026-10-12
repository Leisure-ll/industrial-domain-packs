# PCB product validation — 2026-10-12

The independent product path was exercised on macOS 26.5.1 Apple Silicon with Docker Engine 29.5.2 and its Linux amd64/Rosetta execution. The gateway image was referenced by its immutable Harbor identity `harbor.pvg2.zhiman.tech/industrial-runtime-assets/industrial-pcb-gateway@sha256:5170d4755fa0c9ccefd0f8a9127f13339b9e922227ffa38319a5dcb35881819b`; its config identity is `sha256:c231ae82f7d6941bb5df53cfd855a1fe8ed741151eaa9bf7598e3f1f5c5d7e87`. It retains the pinned original actor and KiCad/pcbnew 10.0.6 and adds the locked gateway Python/MCP dependencies.

The native integration test uses the consumer-owned `openToolSession` backend. It creates a fresh 40×30 mm prototype, adds a standard R1 resistor with explicit intentional NC pins, declares all six geometry rules, and generates native schematic and PCB files. No external requirements document, benchmark seed or evaluator is bound.

| Exercised operation | Observed evidence |
| --- | --- |
| New project and atomic edits | Native intent/CAD files persisted; tool source/schema/version checks retained |
| ERC | Valid native report, PASS, zero violations |
| PCB generation/parity | Native schematic/PCB membership PASS; provisional placement retained |
| DRC | Valid native report, PASS, zero errors/violations |
| Final design check | UNKNOWN; missing device/electrical/analysis coverage remains explicit |
| Native views | Two actual PNG image blocks, source/image hash receipts; forwarded true, delivered false |
| Queued mutation cancellation | Queued R1 value change never executed; value remained 1k |
| Active cancellation | Read-only long-running calculation interrupted; backend cleanup completed |
| Recovery | Same project reconnected; native board observed without replaying interrupted operation |
| Cleanup | No `industrial-session-*` container remained after the test |

A separate real execution without explicit `board_rules` was rejected before any PCB was created. The initial comprehensive test used an insufficient 150-second overall budget during concurrent Rosetta workloads and exposed a Docker auto-remove cleanup race; it was not counted as a pass. The final integration test used a 300-second test budget, retained 45/60-second per-call transport limits and completed in 87.9 seconds.

Run the native test explicitly with the maintained Harness backend module:

```sh
PCB_TEST_RUNTIME_BACKEND=/absolute/harness/packages/domain-runtime/src/tool-session.cjs \
  node --test tests/pcb-product-native.test.cjs
```

Ordinary `npm test` skips that native integration test when the backend is not supplied. Its remaining tests cover declarations, complete upstream hashes, shared startup, image block forwarding, failure propagation and generated-evidence/input separation; fixtures do not establish engineering acceptance. The product operation receipt Verifier remains `not_run`, independently of the native check results above. These examples qualify neither circuit function, a commercial device, manufacturing readiness nor another desktop platform.
