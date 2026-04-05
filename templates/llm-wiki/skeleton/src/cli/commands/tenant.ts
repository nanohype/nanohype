import type { Command } from "commander";
import { createTenant, listTenants, deleteTenant } from "../../tenant/registry.js";

export function registerTenantCommands(program: Command): void {
  const tenant = program
    .command("tenant")
    .description("Manage wiki tenants");

  tenant
    .command("create <id>")
    .description("Create a new tenant")
    .requiredOption("--name <name>", "Display name for the tenant")
    .option("--description <desc>", "Tenant description", "")
    .requiredOption("--schema <path>", "Path to wiki-schema.yaml file")
    .action((id: string, opts: { name: string; description: string; schema: string }) => {
      try {
        const result = createTenant({
          id,
          name: opts.name,
          description: opts.description,
          schema: opts.schema,
        });
        console.log(`Tenant created: ${result.id}`);
        console.log(`  Name:   ${result.name}`);
        console.log(`  Schema: ${result.schemaPath}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  tenant
    .command("list")
    .description("List all tenants")
    .action(() => {
      const tenants = listTenants();
      if (tenants.length === 0) {
        console.log("No tenants configured.");
        return;
      }
      for (const t of tenants) {
        console.log(`${t.id}  ${t.name}  (schema: ${t.schemaPath})`);
      }
    });

  tenant
    .command("delete <id>")
    .description("Delete a tenant")
    .action((id: string) => {
      try {
        deleteTenant(id);
        console.log(`Tenant "${id}" deleted.`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
