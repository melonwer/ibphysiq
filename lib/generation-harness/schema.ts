/**
 * Dependency-free runtime schema toolkit for the generation harness.
 *
 * The harness needs two things from each contract: runtime validation of model
 * output, and a JSON Schema document for constrained decoding. Both are derived
 * from one declarative definition so the validator and the exported document
 * cannot drift apart -- a divergence there would let a model satisfy the schema
 * it was decoded against while still producing a record the harness rejects.
 *
 * This is hand-rolled rather than pulled from a schema library: the repository
 * depends on none directly, and reaching into a transitive one would break on an
 * unrelated upgrade.
 */

export type SchemaKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

/**
 * A node in a schema tree. Objects are strict by default: unknown keys are
 * reported, which is what constrained decoding needs.
 */
export interface SchemaNode {
  kind: SchemaKind;
  description?: string;
  /** Object properties are optional unless this is false. Ignored elsewhere. */
  optional?: boolean;
  /** Ordinal-only marker for top-level contracts; validated as a string enum. */
  values?: readonly string[];
  minLength?: number;
  minimum?: number;
  maximum?: number;
  items?: SchemaNode;
  minItems?: number;
  properties?: Record<string, SchemaNode>;
  /** Set to true to allow keys that are not declared in `properties`. */
  allowAdditionalProperties?: boolean;
}

export type SchemaIssueCode =
  | "expected-string"
  | "expected-number"
  | "expected-integer"
  | "expected-boolean"
  | "expected-array"
  | "expected-object"
  | "min-length"
  | "not-allowed-value"
  | "too-few-items"
  | "missing-required"
  | "unexpected-property"
  | "number-out-of-range";

export interface SchemaIssue {
  code: SchemaIssueCode;
  message: string;
  path: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
}

export type JsonSchema = Record<string, unknown>;

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a value against a schema node, reporting every issue with a
 * JSON-path so callers can hand a precise failure back to a model.
 */
export function validateSchemaNode(
  node: SchemaNode,
  value: unknown,
  path = "$",
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const unexpected = (expected: string): SchemaIssue[] => [
    {
      code: `expected-${expected}` as SchemaIssueCode,
      message: `${path} must be a ${expected}, received ${describeValue(value)}`,
      path,
    },
  ];

  switch (node.kind) {
    case "string": {
      if (typeof value !== "string") return unexpected("string");
      if (node.minLength !== undefined && value.length < node.minLength) {
        issues.push({
          code: "min-length",
          message: `${path} must be at least ${node.minLength} character(s)`,
          path,
        });
      }
      if (node.values && !node.values.includes(value)) {
        issues.push({
          code: "not-allowed-value",
          message: `${path} must be one of: ${node.values.join(", ")}`,
          path,
        });
      }
      return issues;
    }

    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return unexpected(node.kind);
      }
      if (node.kind === "integer" && !Number.isInteger(value)) {
        return unexpected("integer");
      }
      const belowMinimum = node.minimum !== undefined && value < node.minimum;
      const aboveMaximum = node.maximum !== undefined && value > node.maximum;
      if (belowMinimum || aboveMaximum) {
        issues.push({
          code: "number-out-of-range",
          message:
            `${path} must be between ${node.minimum ?? "-Infinity"} and ` +
            `${node.maximum ?? "Infinity"}, received ${value}`,
          path,
        });
      }
      return issues;
    }

    case "boolean": {
      if (typeof value !== "boolean") return unexpected("boolean");
      return issues;
    }

    case "array": {
      if (!Array.isArray(value)) return unexpected("array");
      if (node.minItems !== undefined && value.length < node.minItems) {
        issues.push({
          code: "too-few-items",
          message: `${path} must contain at least ${node.minItems} item(s)`,
          path,
        });
      }
      if (node.items) {
        value.forEach((item, index) => {
          issues.push(
            ...validateSchemaNode(node.items as SchemaNode, item, `${path}[${index}]`),
          );
        });
      }
      return issues;
    }

    case "object": {
      if (!isPlainObject(value)) return unexpected("object");
      const properties = node.properties ?? {};

      for (const [key, child] of Object.entries(properties)) {
        const childValue = value[key];
        if (childValue === undefined) {
          if (!child.optional) {
            issues.push({
              code: "missing-required",
              message: `${path}.${key} is required`,
              path: `${path}.${key}`,
            });
          }
          continue;
        }
        issues.push(
          ...validateSchemaNode(child, childValue, `${path}.${key}`),
        );
      }

      if (!node.allowAdditionalProperties) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) {
            issues.push({
              code: "unexpected-property",
              message: `${path}.${key} is not part of the schema`,
              path: `${path}.${key}`,
            });
          }
        }
      }

      return issues;
    }
  }
}

export function validateSchemaValue(
  node: SchemaNode,
  value: unknown,
): SchemaValidationResult {
  const issues = validateSchemaNode(node, value);
  return { valid: issues.length === 0, issues };
}

/**
 * Render a schema node as a JSON Schema document suitable for constrained
 * decoding. Object properties are marked required unless flagged optional.
 */
export function toJsonSchema(node: SchemaNode): JsonSchema {
  const schema: JsonSchema = {};

  if (node.description) schema.description = node.description;

  switch (node.kind) {
    case "string":
      schema.type = "string";
      if (node.values) schema.enum = [...node.values];
      if (node.minLength !== undefined) schema.minLength = node.minLength;
      return schema;

    case "number":
    case "integer":
      schema.type = node.kind;
      if (node.minimum !== undefined) schema.minimum = node.minimum;
      if (node.maximum !== undefined) schema.maximum = node.maximum;
      return schema;

    case "boolean":
      schema.type = "boolean";
      return schema;

    case "array":
      schema.type = "array";
      if (node.items) schema.items = toJsonSchema(node.items);
      if (node.minItems !== undefined) schema.minItems = node.minItems;
      return schema;

    case "object": {
      const properties = node.properties ?? {};
      schema.type = "object";
      schema.properties = Object.fromEntries(
        Object.entries(properties).map(([key, child]) => [
          key,
          toJsonSchema(child),
        ]),
      );
      schema.required = Object.entries(properties)
        .filter(([, child]) => !child.optional)
        .map(([key]) => key);
      if (!node.allowAdditionalProperties) schema.additionalProperties = false;
      return schema;
    }
  }
}
