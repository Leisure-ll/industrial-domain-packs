// Stable distribution entry; existing domain/protected bridge semantics are preserved.
const api = require("../bridge/godot-runtime.cjs");
module.exports = { providerRuntime: api.godotRuntime, gatewayConfig: api.godotGatewayConfig };
