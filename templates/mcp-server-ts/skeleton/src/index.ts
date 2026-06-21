import { validateBootstrap } from "./bootstrap.js";
import { createServer } from "./server.js";
import { start } from "./transports/index.js";

validateBootstrap();

const server = createServer();

start(server).catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
