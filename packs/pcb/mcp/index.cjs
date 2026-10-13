// Stable distribution entry; existing domain/protected bridge semantics are preserved.
const api = require("../bridge/pcb-runtime.cjs");
module.exports = { providerRuntime: api.pcbRuntime, gatewayConfig: api.pcbGatewayConfig };
