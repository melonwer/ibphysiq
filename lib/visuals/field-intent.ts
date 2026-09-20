import {
  FieldEntitySpec,
  FieldMapPayload,
  FieldPathSpec,
  Point2D,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "./types";

export const FIELD_INTENT_SCHEMA_VERSION = "field-intent/0.1.0" as const;

export const FIELD_INTENT_TEMPLATE_IDS = [
  "linear-sources.v1",
  "parallel-equipotentials.v1",
  "two-charge-field-lines.v1",
  "radial-source.v1",
  "body-pair.v1",
] as const;

export type FieldIntentTemplateId = (typeof FIELD_INTENT_TEMPLATE_IDS)[number];

type SourceKind = "point-charge" | "point-mass" | "sphere";

export interface FieldIntentSource {
  id: string;
  kind: SourceKind;
  sign?: -1 | 1;
  relativeMagnitude: number;
  label: string;
  secondaryLabel?: string;
  relativeRadius?: number;
  appearance?: "semantic" | "dot";
  labelPlacement?: "above" | "below" | "left" | "right" | "center";
}

interface FieldIntentBase {
  schemaVersion: typeof FIELD_INTENT_SCHEMA_VERSION;
  id: string;
  scenarioRef: string;
  templateId: FieldIntentTemplateId;
  visibility?: {
    privateParameterIds?: string[];
    altTextMode?: "student-safe" | "teacher-complete";
  };
  provenance?: { sourceQuestionId?: string };
}

export interface LinearSourcesIntent extends FieldIntentBase {
  templateId: "linear-sources.v1";
  sources: [FieldIntentSource, FieldIntentSource];
  marker?: {
    id: string;
    label: string;
    appearance?: "dot" | "cross";
    labelPlacement?: "above" | "below" | "left" | "right";
    placement:
      | { kind: "between"; fractionFromLeft?: number }
      | { kind: "right-of-right" };
  };
  baselineStyle?: "solid" | "dashed";
  coordinateFrame?: "left-source-origin";
  dimensionExtensionStyle?: "solid" | "dashed";
  dimensions?: {
    total?: string;
    leftToMarker?: string;
    markerToRight?: string;
  };
  baselineLabel?: string;
}

export interface ParallelEquipotentialsIntent extends FieldIntentBase {
  templateId: "parallel-equipotentials.v1";
  labels: [string, string, string];
  marker: { id: string; label: string; lineIndex: 0 | 1 | 2 };
  spacingLabel?: string;
}

export type FieldLineVariant =
  "equal-density" | "flat-separatrix" | "inverted-null" | "strength-weighted";

export interface TwoChargeFieldLinesIntent extends FieldIntentBase {
  templateId: "two-charge-field-lines.v1";
  sources: [
    FieldIntentSource & { kind: "point-charge" },
    FieldIntentSource & { kind: "point-charge" },
  ];
  panels: Array<{ id: string; label: string; variant: FieldLineVariant }>;
  columns?: number;
}

export interface RadialSourceIntent extends FieldIntentBase {
  templateId: "radial-source.v1";
  source: FieldIntentSource & { kind: "point-charge" | "point-mass" };
  probe?: FieldIntentSource & { kind: "point-charge" | "point-mass" };
  separationLabel?: string;
}

export interface BodyPairIntent extends FieldIntentBase {
  templateId: "body-pair.v1";
  bodies: [
    FieldIntentSource & { kind: "sphere" },
    FieldIntentSource & { kind: "sphere" },
  ];
  separationLabel?: string;
}

export type FieldIntent =
  | LinearSourcesIntent
  | ParallelEquipotentialsIntent
  | TwoChargeFieldLinesIntent
  | RadialSourceIntent
  | BodyPairIntent;

export interface FieldIntentValidationResult {
  valid: boolean;
  issues: string[];
}

const SOURCE_KINDS: readonly SourceKind[] = [
  "point-charge",
  "point-mass",
  "sphere",
];
const FIELD_LINE_VARIANTS: readonly FieldLineVariant[] = [
  "equal-density",
  "flat-separatrix",
  "inverted-null",
  "strength-weighted",
];

export const FIELD_INTENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ibphysiq.local/schema/field-intent-0.1.0.json",
  title: "IBPhysiq coordinate-free field intent",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "scenarioRef", "templateId"],
  properties: {
    schemaVersion: { const: FIELD_INTENT_SCHEMA_VERSION },
    id: { type: "string", minLength: 1 },
    scenarioRef: { type: "string", minLength: 1 },
    templateId: { enum: FIELD_INTENT_TEMPLATE_IDS },
    sources: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { $ref: "#/$defs/source" },
    },
    source: { $ref: "#/$defs/source" },
    probe: { $ref: "#/$defs/source" },
    bodies: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { $ref: "#/$defs/source" },
    },
    marker: {
      oneOf: [
        { $ref: "#/$defs/linearMarker" },
        { $ref: "#/$defs/equipotentialMarker" },
      ],
    },
    dimensions: { $ref: "#/$defs/dimensions" },
    baselineLabel: { type: "string", minLength: 1 },
    baselineStyle: { enum: ["solid", "dashed"] },
    coordinateFrame: { const: "left-source-origin" },
    dimensionExtensionStyle: { enum: ["solid", "dashed"] },
    labels: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", minLength: 1 },
    },
    spacingLabel: { type: "string", minLength: 1 },
    panels: {
      type: "array",
      minItems: 2,
      items: { $ref: "#/$defs/panel" },
    },
    columns: { type: "integer", minimum: 1 },
    separationLabel: { type: "string", minLength: 1 },
    visibility: { $ref: "#/$defs/visibility" },
    provenance: { $ref: "#/$defs/provenance" },
  },
  allOf: [
    {
      if: { properties: { templateId: { const: "linear-sources.v1" } } },
      then: { required: ["sources"] },
    },
    {
      if: {
        properties: {
          templateId: { const: "parallel-equipotentials.v1" },
        },
      },
      then: { required: ["labels", "marker"] },
    },
    {
      if: {
        properties: {
          templateId: { const: "two-charge-field-lines.v1" },
        },
      },
      then: {
        required: ["sources", "panels"],
        properties: {
          sources: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              allOf: [
                { $ref: "#/$defs/source" },
                {
                  properties: {
                    kind: { const: "point-charge" },
                    sign: { const: 1 },
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      if: { properties: { templateId: { const: "radial-source.v1" } } },
      then: { required: ["source"] },
    },
    {
      if: { properties: { templateId: { const: "body-pair.v1" } } },
      then: {
        required: ["bodies"],
        properties: {
          bodies: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              allOf: [
                { $ref: "#/$defs/source" },
                { properties: { kind: { const: "sphere" } } },
              ],
            },
          },
        },
      },
    },
  ],
  $defs: {
    source: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "relativeMagnitude", "label"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { enum: SOURCE_KINDS },
        sign: { enum: [-1, 1] },
        relativeMagnitude: { type: "number", exclusiveMinimum: 0 },
        label: { type: "string", minLength: 1 },
        secondaryLabel: { type: "string", minLength: 1 },
        relativeRadius: { type: "number", exclusiveMinimum: 0 },
        appearance: { enum: ["semantic", "dot"] },
        labelPlacement: {
          enum: ["above", "below", "left", "right", "center"],
        },
      },
      allOf: [
        {
          if: { properties: { kind: { const: "point-charge" } } },
          then: { required: ["sign"] },
          else: { not: { required: ["sign"] } },
        },
        {
          if: { properties: { kind: { const: "sphere" } } },
          else: { not: { required: ["relativeRadius"] } },
        },
      ],
    },
    placement: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: { const: "between" },
            fractionFromLeft: {
              type: "number",
              exclusiveMinimum: 0,
              exclusiveMaximum: 1,
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "right-of-right" } },
        },
      ],
    },
    linearMarker: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label", "placement"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        appearance: { enum: ["dot", "cross"] },
        labelPlacement: { enum: ["above", "below", "left", "right"] },
        placement: { $ref: "#/$defs/placement" },
      },
    },
    equipotentialMarker: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label", "lineIndex"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        lineIndex: { enum: [0, 1, 2] },
      },
    },
    dimensions: {
      type: "object",
      additionalProperties: false,
      properties: {
        total: { type: "string", minLength: 1 },
        leftToMarker: { type: "string", minLength: 1 },
        markerToRight: { type: "string", minLength: 1 },
      },
    },
    panel: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label", "variant"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        variant: { enum: FIELD_LINE_VARIANTS },
      },
    },
    visibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        privateParameterIds: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        altTextMode: { enum: ["student-safe", "teacher-complete"] },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceQuestionId: { type: "string", minLength: 1 },
      },
    },
  },
} as const;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function allowed(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const unexpected = Object.keys(value).find((key) => !keys.includes(key));
  if (unexpected) throw new Error(`${path}.${unexpected} is not supported`);
}

function positive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be positive and finite`);
  }
  return value;
}

function assertSource(value: unknown, path: string): FieldIntentSource {
  const source = record(value, path);
  allowed(
    source,
    [
      "id",
      "kind",
      "sign",
      "relativeMagnitude",
      "label",
      "secondaryLabel",
      "relativeRadius",
      "appearance",
      "labelPlacement",
    ],
    path,
  );
  nonEmpty(source.id, `${path}.id`);
  nonEmpty(source.label, `${path}.label`);
  if (source.secondaryLabel !== undefined) {
    nonEmpty(source.secondaryLabel, `${path}.secondaryLabel`);
  }
  if (
    source.appearance !== undefined &&
    source.appearance !== "semantic" &&
    source.appearance !== "dot"
  ) {
    throw new Error(`${path}.appearance is not supported`);
  }
  if (
    source.labelPlacement !== undefined &&
    !["above", "below", "left", "right", "center"].includes(
      source.labelPlacement as string,
    )
  ) {
    throw new Error(`${path}.labelPlacement is not supported`);
  }
  if (!SOURCE_KINDS.includes(source.kind as SourceKind)) {
    throw new Error(`${path}.kind is not supported`);
  }
  positive(source.relativeMagnitude, `${path}.relativeMagnitude`);
  if (source.relativeRadius !== undefined) {
    positive(source.relativeRadius, `${path}.relativeRadius`);
    if (source.kind !== "sphere") {
      throw new Error(`${path}.relativeRadius is only valid for a sphere`);
    }
  }
  if (
    source.kind === "point-charge" &&
    source.sign !== -1 &&
    source.sign !== 1
  ) {
    throw new Error(`${path}.sign is required for a point charge`);
  }
  if (source.kind !== "point-charge" && source.sign !== undefined) {
    throw new Error(`${path}.sign is only valid for a point charge`);
  }
  return source as unknown as FieldIntentSource;
}

function assertSourcePair(value: unknown, path: string): FieldIntentSource[] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${path} must contain exactly two sources`);
  }
  const sources = value.map((item, index) =>
    assertSource(item, `${path}[${index}]`),
  );
  if (sources[0].id === sources[1].id) {
    throw new Error(`${path} source IDs must be unique`);
  }
  return sources;
}

function assertIntent(value: unknown): asserts value is FieldIntent {
  const intent = record(value, "intent");
  const shared = [
    "schemaVersion",
    "id",
    "scenarioRef",
    "templateId",
    "visibility",
    "provenance",
  ];
  if (intent.schemaVersion !== FIELD_INTENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported field intent schema: ${String(intent.schemaVersion)}`,
    );
  }
  nonEmpty(intent.id, "intent.id");
  nonEmpty(intent.scenarioRef, "intent.scenarioRef");
  if (
    !FIELD_INTENT_TEMPLATE_IDS.includes(
      intent.templateId as FieldIntentTemplateId,
    )
  ) {
    throw new Error(
      `Unsupported field intent template: ${String(intent.templateId)}`,
    );
  }
  if (intent.visibility !== undefined) {
    const visibility = record(intent.visibility, "intent.visibility");
    allowed(
      visibility,
      ["privateParameterIds", "altTextMode"],
      "intent.visibility",
    );
    if (
      visibility.privateParameterIds !== undefined &&
      (!Array.isArray(visibility.privateParameterIds) ||
        visibility.privateParameterIds.some(
          (item) => typeof item !== "string" || !item,
        ))
    ) {
      throw new Error("intent.visibility.privateParameterIds must be strings");
    }
    if (
      Array.isArray(visibility.privateParameterIds) &&
      new Set(visibility.privateParameterIds).size !==
        visibility.privateParameterIds.length
    ) {
      throw new Error("intent.visibility.privateParameterIds must be unique");
    }
    if (
      visibility.altTextMode !== undefined &&
      visibility.altTextMode !== "student-safe" &&
      visibility.altTextMode !== "teacher-complete"
    ) {
      throw new Error("intent.visibility.altTextMode is not supported");
    }
  }
  if (intent.provenance !== undefined) {
    const provenance = record(intent.provenance, "intent.provenance");
    allowed(provenance, ["sourceQuestionId"], "intent.provenance");
    if (provenance.sourceQuestionId !== undefined) {
      nonEmpty(
        provenance.sourceQuestionId,
        "intent.provenance.sourceQuestionId",
      );
    }
  }
  switch (intent.templateId) {
    case "linear-sources.v1": {
      allowed(
        intent,
        [
          ...shared,
          "sources",
          "marker",
          "dimensions",
          "baselineLabel",
          "baselineStyle",
          "coordinateFrame",
          "dimensionExtensionStyle",
        ],
        "intent",
      );
      assertSourcePair(intent.sources, "intent.sources");
      if (intent.marker !== undefined) {
        const marker = record(intent.marker, "intent.marker");
        allowed(
          marker,
          ["id", "label", "appearance", "labelPlacement", "placement"],
          "intent.marker",
        );
        nonEmpty(marker.id, "intent.marker.id");
        nonEmpty(marker.label, "intent.marker.label");
        if (
          marker.appearance !== undefined &&
          marker.appearance !== "dot" &&
          marker.appearance !== "cross"
        ) {
          throw new Error("intent.marker.appearance is not supported");
        }
        if (
          marker.labelPlacement !== undefined &&
          !["above", "below", "left", "right"].includes(
            marker.labelPlacement as string,
          )
        ) {
          throw new Error("intent.marker.labelPlacement is not supported");
        }
        const placement = record(marker.placement, "intent.marker.placement");
        allowed(
          placement,
          ["kind", "fractionFromLeft"],
          "intent.marker.placement",
        );
        if (
          placement.kind !== "between" &&
          placement.kind !== "right-of-right"
        ) {
          throw new Error("intent.marker.placement.kind is not supported");
        }
        if (
          placement.kind === "right-of-right" &&
          placement.fractionFromLeft !== undefined
        ) {
          throw new Error("right-of-right marker cannot have a fraction");
        }
        if (
          placement.fractionFromLeft !== undefined &&
          (typeof placement.fractionFromLeft !== "number" ||
            placement.fractionFromLeft <= 0 ||
            placement.fractionFromLeft >= 1)
        ) {
          throw new Error(
            "marker fraction must lie strictly between zero and one",
          );
        }
      }
      if (intent.dimensions !== undefined) {
        const dimensions = record(intent.dimensions, "intent.dimensions");
        allowed(
          dimensions,
          ["total", "leftToMarker", "markerToRight"],
          "intent.dimensions",
        );
        for (const [key, value] of Object.entries(dimensions)) {
          nonEmpty(value, `intent.dimensions.${key}`);
        }
        if (
          intent.marker === undefined &&
          (dimensions.leftToMarker !== undefined ||
            dimensions.markerToRight !== undefined)
        ) {
          throw new Error(
            "segment dimensions require a marker between the sources",
          );
        }
      }
      if (intent.baselineLabel !== undefined) {
        nonEmpty(intent.baselineLabel, "intent.baselineLabel");
      }
      if (
        intent.baselineStyle !== undefined &&
        intent.baselineStyle !== "solid" &&
        intent.baselineStyle !== "dashed"
      ) {
        throw new Error("intent.baselineStyle is not supported");
      }
      if (
        intent.coordinateFrame !== undefined &&
        intent.coordinateFrame !== "left-source-origin"
      ) {
        throw new Error("intent.coordinateFrame is not supported");
      }
      if (
        intent.dimensionExtensionStyle !== undefined &&
        intent.dimensionExtensionStyle !== "solid" &&
        intent.dimensionExtensionStyle !== "dashed"
      ) {
        throw new Error("intent.dimensionExtensionStyle is not supported");
      }
      break;
    }
    case "parallel-equipotentials.v1": {
      allowed(
        intent,
        [...shared, "labels", "marker", "spacingLabel"],
        "intent",
      );
      if (!Array.isArray(intent.labels) || intent.labels.length !== 3) {
        throw new Error("intent.labels must contain exactly three labels");
      }
      intent.labels.forEach((item, index) =>
        nonEmpty(item, `intent.labels[${index}]`),
      );
      const marker = record(intent.marker, "intent.marker");
      allowed(marker, ["id", "label", "lineIndex"], "intent.marker");
      nonEmpty(marker.id, "intent.marker.id");
      nonEmpty(marker.label, "intent.marker.label");
      if (![0, 1, 2].includes(marker.lineIndex as number)) {
        throw new Error("intent.marker.lineIndex must be 0, 1, or 2");
      }
      if (intent.spacingLabel !== undefined) {
        nonEmpty(intent.spacingLabel, "intent.spacingLabel");
      }
      break;
    }
    case "two-charge-field-lines.v1": {
      allowed(intent, [...shared, "sources", "panels", "columns"], "intent");
      const sources = assertSourcePair(intent.sources, "intent.sources");
      if (sources.some((source) => source.kind !== "point-charge")) {
        throw new Error("field-line sources must be point charges");
      }
      if (sources.some((source) => source.sign !== 1)) {
        throw new Error(
          "two-charge field-line v0.1 supports positive sources only",
        );
      }
      if (!Array.isArray(intent.panels) || intent.panels.length < 2) {
        throw new Error("intent.panels must contain at least two panels");
      }
      const panelIds = new Set<string>();
      intent.panels.forEach((item, index) => {
        const panel = record(item, `intent.panels[${index}]`);
        allowed(panel, ["id", "label", "variant"], `intent.panels[${index}]`);
        const id = nonEmpty(panel.id, `intent.panels[${index}].id`);
        nonEmpty(panel.label, `intent.panels[${index}].label`);
        if (panelIds.has(id))
          throw new Error(`Duplicate field panel ID: ${id}`);
        panelIds.add(id);
        if (!FIELD_LINE_VARIANTS.includes(panel.variant as FieldLineVariant)) {
          throw new Error(`intent.panels[${index}].variant is not supported`);
        }
      });
      if (intent.columns !== undefined) {
        const columns = intent.columns;
        if (
          typeof columns !== "number" ||
          !Number.isInteger(columns) ||
          columns < 1 ||
          columns > intent.panels.length
        ) {
          throw new Error("intent.columns is outside the panel count");
        }
      }
      break;
    }
    case "radial-source.v1": {
      allowed(
        intent,
        [...shared, "source", "probe", "separationLabel"],
        "intent",
      );
      assertSource(intent.source, "intent.source");
      if (intent.probe !== undefined)
        assertSource(intent.probe, "intent.probe");
      if (intent.separationLabel !== undefined) {
        nonEmpty(intent.separationLabel, "intent.separationLabel");
      }
      if (intent.separationLabel !== undefined && intent.probe === undefined) {
        throw new Error("intent.separationLabel requires a probe");
      }
      break;
    }
    case "body-pair.v1": {
      allowed(intent, [...shared, "bodies", "separationLabel"], "intent");
      const bodies = assertSourcePair(intent.bodies, "intent.bodies");
      if (bodies.some((source) => source.kind !== "sphere")) {
        throw new Error("body-pair entries must be spheres");
      }
      if (intent.separationLabel !== undefined) {
        nonEmpty(intent.separationLabel, "intent.separationLabel");
      }
      break;
    }
  }
}

export function validateFieldIntent(
  value: unknown,
): FieldIntentValidationResult {
  try {
    assertIntent(value);
    return { valid: true, issues: [] };
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

interface BuildContext {
  publicParameterIds: string[];
  prefix: string;
}

function labelId(context: BuildContext, id: string, suffix = "label"): string {
  const parameterId = `${context.prefix}-${id}-${suffix}`;
  context.publicParameterIds.push(parameterId);
  return parameterId;
}

function entity(
  source: FieldIntentSource,
  position: Point2D,
  context: BuildContext,
): FieldEntitySpec {
  return {
    id: source.id,
    kind: source.kind,
    position,
    sign: source.sign,
    relativeMagnitude: source.relativeMagnitude,
    size:
      source.kind === "sphere"
        ? { x: 0.11 * (source.relativeRadius ?? 1), y: 0.11 }
        : undefined,
    label: source.label,
    labelParameterId: labelId(context, source.id),
    secondaryLabel: source.secondaryLabel,
    secondaryLabelParameterId: source.secondaryLabel
      ? labelId(context, source.id, "secondary-label")
      : undefined,
    appearance: source.appearance === "dot" ? "dot" : "default",
    labelPlacement: source.labelPlacement,
  };
}

function dimension(
  id: string,
  from: Point2D,
  to: Point2D,
  label: string,
  context: BuildContext,
): FieldPathSpec {
  return {
    id,
    kind: "dimension",
    points: [from, to],
    label,
    labelParameterId: labelId(context, id),
    labelAt: "middle",
    labelPlacement: "above",
  };
}

function linearPayload(
  intent: LinearSourcesIntent,
  context: BuildContext,
): FieldMapPayload {
  const left = { x: 0.18, y: 0.46 };
  const right = { x: 0.82, y: 0.46 };
  const entities = [
    entity(intent.sources[0], left, context),
    entity(intent.sources[1], right, context),
  ];
  const paths: FieldPathSpec[] = [];
  paths.push({
    id: "baseline",
    kind: "guide",
    points: [
      { x: 0.08, y: 0.46 },
      { x: 0.94, y: 0.46 },
    ],
    lineStyle:
      intent.coordinateFrame === "left-source-origin"
        ? "dashed"
        : (intent.baselineStyle ?? "dashed"),
    showArrow: intent.coordinateFrame === "left-source-origin",
  });
  if (intent.coordinateFrame === "left-source-origin") {
    paths.push({
      id: "vertical-axis",
      kind: "guide",
      points: [
        { x: left.x, y: 0.86 },
        { x: left.x, y: 0.12 },
      ],
      lineStyle: "dashed",
      showArrow: true,
    });
  }
  let markerX: number | undefined;
  if (intent.marker) {
    markerX =
      intent.marker.placement.kind === "right-of-right"
        ? 0.94
        : left.x +
          (intent.marker.placement.fractionFromLeft ?? 0.64) *
            (right.x - left.x);
    entities.push({
      id: intent.marker.id,
      kind: "point-marker",
      position: { x: markerX, y: 0.46 },
      label: intent.marker.label,
      labelParameterId: labelId(context, intent.marker.id),
      appearance: intent.marker.appearance ?? "dot",
      labelPlacement: intent.marker.labelPlacement ?? "above",
    });
  }
  if (intent.dimensions?.total) {
    paths.push(
      dimension(
        "total",
        { x: left.x, y: 0.78 },
        { x: right.x, y: 0.78 },
        intent.dimensions.total,
        context,
      ),
    );
  }
  if (markerX !== undefined && intent.dimensions?.leftToMarker) {
    paths.push(
      dimension(
        "left-segment",
        { x: left.x, y: 0.7 },
        { x: markerX, y: 0.7 },
        intent.dimensions.leftToMarker,
        context,
      ),
    );
  }
  if (markerX !== undefined && intent.dimensions?.markerToRight) {
    paths.push(
      dimension(
        "right-segment",
        { x: markerX, y: 0.7 },
        { x: right.x, y: 0.7 },
        intent.dimensions.markerToRight,
        context,
      ),
    );
  }
  if (intent.dimensions) {
    const extensionY = intent.dimensions.total ? 0.78 : 0.7;
    const extensionStyle = intent.dimensionExtensionStyle ?? "solid";
    const extensionXs = new Set<number>([left.x]);
    if (intent.dimensions.total || intent.dimensions.markerToRight) {
      extensionXs.add(right.x);
    }
    if (
      markerX !== undefined &&
      (intent.dimensions.leftToMarker || intent.dimensions.markerToRight)
    ) {
      extensionXs.add(markerX);
    }
    [...extensionXs].forEach((x, index) => {
      paths.push({
        id: `dimension-extension-${index + 1}`,
        kind: "guide",
        points: [
          { x, y: 0.49 },
          { x, y: extensionY + 0.03 },
        ],
        lineStyle: extensionStyle,
      });
    });
  }
  const annotations = intent.baselineLabel
    ? [
        {
          id: "baseline-label",
          position: { x: 0.08, y: 0.4 },
          label: intent.baselineLabel,
          labelParameterId: labelId(context, "baseline"),
          textAnchor: "start" as const,
        },
      ]
    : undefined;
  return { entities, paths, annotations };
}

function equipotentialPayload(
  intent: ParallelEquipotentialsIntent,
  context: BuildContext,
): FieldMapPayload {
  const xs = [0.22, 0.5, 0.78];
  const paths = intent.labels.map((_, index): FieldPathSpec => ({
    id: `equipotential-${index + 1}`,
    kind: "equipotential",
    points: [
      { x: xs[index], y: 0.1 },
      { x: xs[index], y: 0.78 },
    ],
  }));
  if (intent.spacingLabel) {
    paths.push(
      dimension(
        "spacing-left",
        { x: xs[0], y: 0.27 },
        { x: xs[1], y: 0.27 },
        intent.spacingLabel,
        context,
      ),
    );
    paths.push(
      dimension(
        "spacing-right",
        { x: xs[1], y: 0.27 },
        { x: xs[2], y: 0.27 },
        intent.spacingLabel,
        context,
      ),
    );
  }
  return {
    entities: [
      {
        id: intent.marker.id,
        kind: "point-marker",
        position: { x: xs[intent.marker.lineIndex], y: 0.5 },
        label: intent.marker.label,
        labelParameterId: labelId(context, intent.marker.id),
        appearance: "dot",
        labelPlacement: "right",
      },
    ],
    paths,
    annotations: intent.labels.map((label, index) => ({
      id: `equipotential-label-${index + 1}`,
      position: { x: xs[index], y: 0.88 },
      label,
      labelParameterId: labelId(context, `equipotential-${index + 1}`),
    })),
  };
}

function integratedFieldPath(
  id: string,
  center: Point2D,
  angle: number,
  sources: readonly { position: Point2D; magnitude: number }[],
): FieldPathSpec {
  const bounds = { left: 0.025, right: 0.975, top: 0.045, bottom: 0.955 };
  const startRadius = 0.038;
  const step = 0.007;
  const points: Point2D[] = [
    {
      x: center.x + Math.cos(angle) * startRadius,
      y: center.y + Math.sin(angle) * startRadius,
    },
  ];
  const directionAt = (point: Point2D): Point2D | undefined => {
    let fieldX = 0;
    let fieldY = 0;
    for (const source of sources) {
      const dx = point.x - source.position.x;
      const dy = point.y - source.position.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1e-8) return undefined;
      const scale =
        source.magnitude / (distanceSquared * Math.sqrt(distanceSquared));
      fieldX += dx * scale;
      fieldY += dy * scale;
    }
    const fieldMagnitude = Math.hypot(fieldX, fieldY);
    if (!Number.isFinite(fieldMagnitude) || fieldMagnitude < 1e-8) {
      return undefined;
    }
    return { x: fieldX / fieldMagnitude, y: fieldY / fieldMagnitude };
  };
  for (let iteration = 0; iteration < 360; iteration += 1) {
    const current = points[points.length - 1];
    const k1 = directionAt(current);
    if (!k1) break;
    const k2 = directionAt({
      x: current.x + (step * k1.x) / 2,
      y: current.y + (step * k1.y) / 2,
    });
    const k3 = k2
      ? directionAt({
          x: current.x + (step * k2.x) / 2,
          y: current.y + (step * k2.y) / 2,
        })
      : undefined;
    const k4 = k3
      ? directionAt({
          x: current.x + step * k3.x,
          y: current.y + step * k3.y,
        })
      : undefined;
    if (!k2 || !k3 || !k4) break;
    const next = {
      x: current.x + (step * (k1.x + 2 * k2.x + 2 * k3.x + k4.x)) / 6,
      y: current.y + (step * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)) / 6,
    };
    if (
      next.x < bounds.left ||
      next.x > bounds.right ||
      next.y < bounds.top ||
      next.y > bounds.bottom
    ) {
      points.push({
        x: Math.min(bounds.right, Math.max(bounds.left, next.x)),
        y: Math.min(bounds.bottom, Math.max(bounds.top, next.y)),
      });
      break;
    }
    points.push(next);
  }
  return {
    id,
    kind: "field-line",
    direction: "forward",
    points,
    smooth: true,
  };
}

function fieldLinePayload(
  intent: TwoChargeFieldLinesIntent,
  variant: FieldLineVariant,
  prefix: string,
  publicParameterIds: string[],
): FieldMapPayload {
  const context = { prefix, publicParameterIds };
  const left = { x: 0.31, y: 0.5 };
  const right = { x: 0.69, y: 0.5 };
  const effectiveMagnitudes =
    variant === "equal-density"
      ? [1, 1]
      : variant === "inverted-null"
        ? [
            intent.sources[1].relativeMagnitude,
            intent.sources[0].relativeMagnitude,
          ]
        : [
            intent.sources[0].relativeMagnitude,
            intent.sources[1].relativeMagnitude,
          ];
  const lineScale = 8;
  const leftCount =
    variant === "equal-density"
      ? 10
      : Math.max(8, Math.round(effectiveMagnitudes[0] * lineScale));
  const rightCount =
    variant === "equal-density"
      ? 10
      : Math.max(8, Math.round(effectiveMagnitudes[1] * lineScale));
  const paths: FieldPathSpec[] = [];
  const sources = [
    { position: left, magnitude: effectiveMagnitudes[0] },
    { position: right, magnitude: effectiveMagnitudes[1] },
  ];
  const addLines = (center: Point2D, count: number, side: string): void => {
    for (let index = 0; index < count; index += 1) {
      const angle = (2 * Math.PI * (index + 0.35)) / count;
      paths.push(
        integratedFieldPath(
          `${side}-line-${index + 1}`,
          center,
          angle,
          sources,
        ),
      );
    }
  };
  addLines(left, leftCount, "left");
  addLines(right, rightCount, "right");
  if (variant === "flat-separatrix") {
    paths.push(
      {
        id: "flat-separatrix-top",
        kind: "field-line",
        direction: "reverse",
        points: [
          { x: 0.48, y: 0.06 },
          { x: 0.48, y: 0.45 },
        ],
      },
      {
        id: "flat-separatrix-bottom",
        kind: "field-line",
        direction: "forward",
        points: [
          { x: 0.48, y: 0.55 },
          { x: 0.48, y: 0.94 },
        ],
      },
    );
  }
  return {
    entities: [
      entity(intent.sources[0], left, context),
      entity(intent.sources[1], right, context),
    ],
    paths,
  };
}

function radialPayload(
  intent: RadialSourceIntent,
  context: BuildContext,
): FieldMapPayload {
  const sourcePosition = { x: 0.26, y: 0.5 };
  const probePosition = { x: 0.76, y: 0.5 };
  const entities = [entity(intent.source, sourcePosition, context)];
  if (intent.probe) entities.push(entity(intent.probe, probePosition, context));
  const paths: FieldPathSpec[] = [];
  if (intent.separationLabel && intent.probe) {
    paths.push(
      dimension(
        "separation",
        { x: sourcePosition.x, y: 0.76 },
        { x: probePosition.x, y: 0.76 },
        intent.separationLabel,
        context,
      ),
    );
  }
  return { entities, paths };
}

function bodyPairPayload(
  intent: BodyPairIntent,
  context: BuildContext,
): FieldMapPayload {
  const left = { x: 0.2, y: 0.5 };
  const right = { x: 0.8, y: 0.5 };
  const paths = intent.separationLabel
    ? [
        dimension(
          "separation",
          { x: left.x, y: 0.8 },
          { x: right.x, y: 0.8 },
          intent.separationLabel,
          context,
        ),
      ]
    : [];
  return {
    entities: [
      entity(intent.bodies[0], left, context),
      entity(intent.bodies[1], right, context),
    ],
    paths,
  };
}

export function compileFieldIntent(
  intent: FieldIntent,
): VisualSpec<"field_map"> {
  assertIntent(intent);
  const publicParameterIds: string[] = [];
  const payloads: FieldMapPayload[] = [];
  const panelLabels: string[] = [];
  if (intent.templateId === "two-charge-field-lines.v1") {
    intent.panels.forEach((panel, index) => {
      payloads.push(
        fieldLinePayload(
          intent,
          panel.variant,
          `${intent.id}-p${index + 1}`,
          publicParameterIds,
        ),
      );
      panelLabels.push(panel.label);
    });
  } else {
    const context = { prefix: intent.id, publicParameterIds };
    if (intent.templateId === "linear-sources.v1")
      payloads.push(linearPayload(intent, context));
    if (intent.templateId === "parallel-equipotentials.v1")
      payloads.push(equipotentialPayload(intent, context));
    if (intent.templateId === "radial-source.v1")
      payloads.push(radialPayload(intent, context));
    if (intent.templateId === "body-pair.v1")
      payloads.push(bodyPairPayload(intent, context));
  }
  const privateParameterIds = intent.visibility?.privateParameterIds ?? [
    `${intent.id}-answer`,
  ];
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: intent.id,
    family: "field_map",
    templateId: "field.map.v1",
    scenarioRef: intent.scenarioRef,
    coordinateSpace: "scene",
    payload: payloads[0],
    layers: payloads.slice(1).map((payload, index) => ({
      id: `${intent.id}-layer-${index + 2}`,
      family: "field_map",
      payload,
      zIndex: index + 1,
    })),
    composition:
      payloads.length === 1
        ? { kind: "single" }
        : {
            kind: "panel-grid",
            columns:
              intent.templateId === "two-charge-field-lines.v1"
                ? (intent.columns ?? 2)
                : 2,
            panelLabels,
          },
    visibility: {
      publicParameterIds: [...new Set(publicParameterIds)],
      privateParameterIds,
      labelMode: "allowlist",
      altTextMode: intent.visibility?.altTextMode ?? "student-safe",
    },
    provenance: {
      sourceQuestionId: intent.provenance?.sourceQuestionId,
      rendererVersion: "field-svg/0.1.0",
    },
  };
}
