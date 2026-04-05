import { Command } from "commander";
import { registerTenantCommands } from "./commands/tenant.js";
import { registerIngestCommand } from "./commands/ingest.js";
import { registerQueryCommand } from "./commands/query.js";
import { registerLintCommand } from "./commands/lint.js";
import { registerSchemaCommand } from "./commands/schema.js";

const program = new Command();

program
  .name("__PROJECT_NAME__")
  .description("LLM-powered wiki knowledge base")
  .version("0.1.0");

registerTenantCommands(program);
registerIngestCommand(program);
registerQueryCommand(program);
registerLintCommand(program);
registerSchemaCommand(program);

program.parse();
