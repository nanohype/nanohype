import type { Command } from "commander";
import { loadSchema } from "../../schema/parser.js";

export function registerSchemaCommand(program: Command): void {
  const schema = program
    .command("schema")
    .description("Wiki schema utilities");

  schema
    .command("validate <path>")
    .description("Validate a wiki-schema.yaml file")
    .action((path: string) => {
      try {
        const result = loadSchema(path);
        console.log(`Schema "${result.name}" is valid.`);
        console.log(`  Description: ${result.description}`);
        console.log(`  Page types:  ${result.pageTypes.map((t) => t.name).join(", ")}`);
        console.log(`  Index:       ${result.structure.index}`);
        console.log(`  LLM:         ${result.llm.provider} / ${result.llm.model}`);
      } catch (err) {
        console.error(`Schema validation failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
