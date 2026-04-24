import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from "zod";

// ── OpenAPI 3.1 Spec Generator ──────────────────────────────────────
//
// Builds an OpenAPI 3.1 spec object by walking Zod schema shapes.
// Supports string, number, boolean, array, and object types. No
// external dependency — the spec is hand-built as a plain JSON object.
//
// Route metadata is defined inline. Add new routes to the `routes`
// array to include them in the generated spec.
//

// ── Zod-to-JSON-Schema Conversion ──────────────────────────────────

// Walks a Zod schema via the internal `_def` property. Zod v4 exposes
// the same shape through `_def.innerType` / `_def.in` / `_def.out` / etc.;
// verify these still exist before bumping major.
function zodTypeToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  // Unwrap optionals and defaults.
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodTypeToJsonSchema((schema as any)._def.innerType);
  }

  // Zod v4 unified `.transform()` and `.pipe()` under two classes —
  // `ZodTransform` for `.transform()` and `ZodPipe` for `.pipe()`.
  if (schema instanceof z.ZodTransform) {
    // `.transform()` — output type cannot be introspected at the schema
    // level. Fall back to a generic string type; callers who need a
    // precise output type should use .pipe() instead.
    return { type: "string" };
  }

  if (schema instanceof z.ZodPipe) {
    // For `.pipe()` chains, expose the output schema (e.g.
    // z.coerce.number().pipe(z.number().int()) appears as "integer").
    const out = zodTypeToJsonSchema((schema as any)._def.out);
    if (out.type === "number") {
      return { ...out, type: "integer" };
    }
    return out;
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodTypeToJsonSchema((schema as any)._def.type),
    };
  }

  if (schema instanceof z.ZodObject) {
    return zodObjectToJsonSchema(schema);
  }

  // Fallback for unsupported types
  return {};
}

function zodObjectToJsonSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const fieldSchema = value as ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(fieldSchema);

    // A field is required unless it's ZodOptional or ZodDefault
    const isOptional = fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault;
    if (!isOptional) {
      required.push(key);
    }
  }

  const result: Record<string, unknown> = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

// ── Route Metadata ──────────────────────────────────────────────────

interface RouteDefinition {
  path: string;
  method: string;
  summary: string;
  tags?: string[];
  requestSchema?: ZodObject<ZodRawShape>;
  responseSchema?: Record<string, unknown>;
  responseStatus?: number;
  parameters?: Array<{
    name: string;
    in: "path" | "query";
    required: boolean;
    schema: Record<string, unknown>;
    description?: string;
  }>;
}

// Import schemas for route definitions
import { CreateItemSchema, UpdateItemSchema } from "./schemas/example.js";

const routes: RouteDefinition[] = [
  {
    path: "/health",
    method: "get",
    summary: "Health check",
    tags: ["health"],
    responseSchema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        service: { type: "string" },
        timestamp: { type: "string", format: "date-time" },
      },
      required: ["status", "service", "timestamp"],
    },
  },
  {
    path: "/api/items",
    method: "get",
    summary: "List all items",
    tags: ["items"],
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100 },
        description: "Maximum number of items to return",
      },
      {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0 },
        description: "Number of items to skip",
      },
    ],
    responseSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { $ref: "#/components/schemas/Item" },
        },
      },
    },
  },
  {
    path: "/api/items/{id}",
    method: "get",
    summary: "Get an item by ID",
    tags: ["items"],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responseSchema: { $ref: "#/components/schemas/Item" },
  },
  {
    path: "/api/items",
    method: "post",
    summary: "Create a new item",
    tags: ["items"],
    requestSchema: CreateItemSchema,
    responseStatus: 201,
    responseSchema: { $ref: "#/components/schemas/Item" },
  },
  {
    path: "/api/items/{id}",
    method: "patch",
    summary: "Update an existing item",
    tags: ["items"],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    requestSchema: UpdateItemSchema,
    responseSchema: { $ref: "#/components/schemas/Item" },
  },
  {
    path: "/api/items/{id}",
    method: "delete",
    summary: "Delete an item by ID",
    tags: ["items"],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responseSchema: {
      type: "object",
      properties: { deleted: { type: "boolean" } },
    },
  },
];

// ── Spec Builder ────────────────────────────────────────────────────

export function getOpenApiSpec(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (!paths[route.path]) {
      paths[route.path] = {};
    }

    const operation: Record<string, unknown> = {
      summary: route.summary,
    };

    if (route.tags) {
      operation.tags = route.tags;
    }

    if (route.parameters) {
      operation.parameters = route.parameters;
    }

    if (route.requestSchema) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: zodObjectToJsonSchema(route.requestSchema),
          },
        },
      };
    }

    const statusCode = String(route.responseStatus ?? 200);
    operation.responses = {
      [statusCode]: {
        description: "Successful response",
        content: {
          "application/json": {
            schema: route.responseSchema ?? {},
          },
        },
      },
    };

    paths[route.path][route.method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "__PROJECT_NAME__",
      description: "__DESCRIPTION__",
      version: "0.1.0",
    },
    paths,
    components: {
      schemas: {
        Item: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "name", "createdAt", "updatedAt"],
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                statusCode: { type: "integer" },
              },
              required: ["code", "message", "statusCode"],
            },
          },
        },
      },
    },
  };
}
