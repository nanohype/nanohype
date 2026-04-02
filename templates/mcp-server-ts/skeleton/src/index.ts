import { createServer } from "./server.js";
import { start } from "./transports/__TRANSPORT__.js";

const server = createServer();

start(server).catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
