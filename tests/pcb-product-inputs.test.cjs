const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const support = require("../packs/pcb/runtime/support.cjs");
test("generated receipts do not change input identity but source libraries do", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pcb-inputs-"));
  support.configure({ executeTask() {}, runtimeFiles: {
    projectFile: (project, relative) => path.join(project, relative),
    readBytes: (file) => fs.readFileSync(file),
  } });
  try {
    fs.writeFileSync(path.join(root, "board.kicad_pcb"), "board");
    const before = support.sources(root);
    for (const relative of ["session/actions.jsonl", ".pcb/checks/drc.json", ".pcb/state.json", ".pcb/gateway-results/result.json"]) {
      const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "evidence");
    }
    assert.deepEqual(support.sources(root), before);
    const library = path.join(root, ".pcb/libraries/part.kicad_sym");
    fs.mkdirSync(path.dirname(library), { recursive: true }); fs.writeFileSync(library, "pins");
    assert.ok(support.sources(root)[".pcb/libraries/part.kicad_sym"]);
    assert.notDeepEqual(support.sources(root), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
