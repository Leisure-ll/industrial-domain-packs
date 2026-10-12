"use strict";
// Product declarations adapt the complete, immutable upstream tool inventory.
// Benchmark submission is kept in that inventory for provenance/compatibility;
// it is not a capability of an ordinary design workspace.
const upstream = require("./bench-upstream.json");
const DERIVED_INPUTS = Object.freeze([
  "session", ".pcb/state.json", ".pcb/checks", ".pcb/reports", ".pcb/views",
  ".pcb/history", ".pcb/routes", ".pcb/branches", ".pcb/eco",
  ".pcb/claim-attempts", ".pcb/extensions", ".pcb/observations", ".pcb/gateway-results",
]);
const summaries = {
  project_status: "Inspect current CAD, declared design requirements, analyses and revision-bound findings.",
  set_requirements: "Set design constraints, postroute checks, power trees, interfaces and applicable analyses; preserve separately bound user requirements when present.",
  run_analysis: "Run the declared simulations and analyses at schematic or final stage; report models, assertions, revision binding and missing evidence explicitly.",
  generate_pcb: "Freshly check the schematic, then generate an unrouted PCB and explicit project rules. An explained prototype scope permits missing electrical evidence; failed checks block generation.",
  verify_design: "Run fresh ERC, DRC, schematic/PCB parity, electrical facts and declared analyses; report each check separately and retain UNKNOWN when evidence is missing.",
};
function productTools() {
  return upstream.tools.filter((tool) => tool.name !== "finalize_claims").map((tool) => ({
    ...tool,
    id: "pcb.design." + tool.name,
    summary: summaries[tool.name] || tool.summary,
    ...(tool.verification ? { verification: ["pcb.design.receipts.v1"] } : {}),
  }));
}
function productObservation(value) {
  if (Array.isArray(value)) return value.map(productObservation);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "eligible_for_circuit_training" || key === "functional_coverage") continue;
    const name = key === "task" ? "requirementsBinding" : key === "public_requirements" ? "requirements" : key;
    result[name] = productObservation(item);
  }
  return result;
}
module.exports = { productTools, productObservation, DERIVED_INPUTS };
