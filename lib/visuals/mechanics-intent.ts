import {
  SchemaNode,
  toJsonSchema,
  validateSchemaValue,
} from "../generation-harness/schema";
import {
  MechanicsLabel,
  MechanicsPanel,
  Point2D,
  VisualSpec,
  VISUAL_SCHEMA_VERSION,
} from "./types";

export const MECHANICS_INTENT_SCHEMA_VERSION =
  "mechanics-intent/0.1.0" as const;
interface IntentBase {
  schemaVersion: typeof MECHANICS_INTENT_SCHEMA_VERSION;
  id: string;
  scenarioRef: string;
  labels: MechanicsLabel[];
  privateParameterIds: string[];
}
export type MechanicsIntent = IntentBase &
  (
    | { template: "projectile"; launchAngleDegrees: number }
    | { template: "collision" }
    | { template: "vertical-circle" }
    | { template: "incline"; angleDegrees: number; showStartEnd: boolean }
    | { template: "pendulum" }
    | { template: "elastic-rope" }
    | { template: "accelerometer"; angleDegrees: number }
  );
const text: SchemaNode = { kind: "string", minLength: 1 };
const base = {
  schemaVersion: { kind: "string", values: [MECHANICS_INTENT_SCHEMA_VERSION] },
  id: text,
  scenarioRef: text,
  labels: {
    kind: "array",
    items: { kind: "object", properties: { parameterId: text, text } },
  },
  privateParameterIds: { kind: "array", items: text },
} satisfies Record<string, SchemaNode>;
const definition = (
  template: MechanicsIntent["template"],
  properties: Record<string, SchemaNode> = {},
): SchemaNode => ({
  kind: "object",
  properties: {
    ...base,
    template: { kind: "string", values: [template] },
    ...properties,
  },
});
const angle: SchemaNode = { kind: "number", minimum: 0.01, maximum: 89.99 };
const schemas = {
  projectile: definition("projectile", { launchAngleDegrees: angle }),
  collision: definition("collision"),
  "vertical-circle": definition("vertical-circle"),
  incline: definition("incline", {
    angleDegrees: angle,
    showStartEnd: { kind: "boolean" },
  }),
  pendulum: definition("pendulum"),
  "elastic-rope": definition("elastic-rope"),
  accelerometer: definition("accelerometer", { angleDegrees: angle }),
} satisfies Record<MechanicsIntent["template"], SchemaNode>;
export const MECHANICS_INTENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ibphysiq.local/schema/mechanics-intent-0.1.0.json",
  oneOf: Object.values(schemas).map(toJsonSchema),
};
const labelIds: Record<MechanicsIntent["template"], readonly string[]> = {
  projectile: ["body", "speed", "angle"],
  collision: ["cart-x", "cart-y", "speed-x"],
  "vertical-circle": ["body", "radius"],
  incline: ["body", "angle", "length", "height"],
  pendulum: ["body", "length", "target", "combined", "rise"],
  "elastic-rope": ["release", "point-a", "point-b", "length", "extension"],
  accelerometer: ["body", "angle", "motion", "radius", "station"],
};
export function parseMechanicsIntent(value: unknown): MechanicsIntent {
  if (
    value === null ||
    typeof value !== "object" ||
    !("template" in value) ||
    typeof value.template !== "string" ||
    !Object.hasOwn(schemas, value.template)
  )
    throw new Error("Unsupported mechanics intent template");
  const schema = schemas[value.template as MechanicsIntent["template"]];
  const validation = validateSchemaValue(schema, value);
  if (!validation.valid)
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  const intent = value as MechanicsIntent;
  const ids = intent.labels.map((label) => label.parameterId);
  if (
    new Set(ids).size !== ids.length ||
    new Set(intent.privateParameterIds).size !==
      intent.privateParameterIds.length
  )
    throw new Error("Mechanics label IDs must be unique");
  if (
    ids.some(
      (id) =>
        !labelIds[intent.template].includes(id) ||
        intent.privateParameterIds.includes(id),
    )
  )
    throw new Error("Unsupported or private mechanics label");
  if (intent.labels.some((label) => !label.text.trim()))
    throw new Error("Mechanics labels must contain visible text");
  return intent;
}
export function compileMechanicsIntent(
  input: MechanicsIntent,
): VisualSpec<"mechanics_scene"> {
  const intent = parseMechanicsIntent(input);
  const label = (id: string) =>
    intent.labels.find((item) => item.parameterId === id);
  const panels: MechanicsPanel[] = [];
  let panel: MechanicsPanel = {
    id: "scene",
    bodies: [],
    paths: [],
    vectors: [],
    angles: [],
  };
  const start = (id: string) => {
    panel = { id, bodies: [], paths: [], vectors: [], angles: [] };
    panels.push(panel);
  };
  const body = (
    id: string,
    kind: "block" | "ball" | "cart",
    position: Point2D,
    labelId: string | undefined,
    angleDegrees = 0,
  ) =>
    panel.bodies.push({
      id,
      kind,
      position,
      angleDegrees,
      label: labelId ? label(labelId) : undefined,
    });
  const path = (
    id: string,
    kind: MechanicsPanel["paths"][number]["kind"],
    points: Point2D[],
    labelId?: string,
    dashed = false,
  ) =>
    panel.paths.push({
      id,
      kind,
      points,
      label: labelId ? label(labelId) : undefined,
      dashed,
    });
  const vector = (
    id: string,
    originRef: string,
    direction: Point2D,
    labelId: string,
  ) => panel.vectors.push({ id, originRef, direction, label: label(labelId) });
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  start("scene");
  switch (intent.template) {
    case "projectile": {
      const a = radians(intent.launchAngleDegrees);
      const launch = { x: 0.15, y: 0.78 };
      body("projectile", "ball", launch, "body");
      path("ground", "surface", [
        { x: 0.07, y: 0.8 },
        { x: 0.93, y: 0.8 },
      ]);
      const range = Math.min(0.7, 2.4 / Math.tan(a));
      path(
        "flight-path",
        "trajectory",
        Array.from({ length: 41 }, (_, i) => {
          const t = i / 40;
          return {
            x: launch.x + range * t,
            y: launch.y - range * Math.tan(a) * t * (1 - t),
          };
        }),
        undefined,
        true,
      );
      vector(
        "initial-velocity",
        "projectile",
        { x: 0.26 * Math.cos(a), y: -0.26 * Math.sin(a) },
        "speed",
      );
      const angleLabel = label("angle");
      if (angleLabel)
        panel.angles.push({
          id: "launch-angle",
          vertex: launch,
          startDegrees: 0,
          endDegrees: intent.launchAngleDegrees,
          label: angleLabel,
        });
      break;
    }
    case "collision":
      body("cart-x", "cart", { x: 0.28, y: 0.6 }, "cart-x");
      body("cart-y", "cart", { x: 0.73, y: 0.6 }, "cart-y");
      path("track", "surface", [
        { x: 0.08, y: 0.66 },
        { x: 0.92, y: 0.66 },
      ]);
      vector("velocity-x", "cart-x", { x: 0.23, y: 0 }, "speed-x");
      break;
    case "vertical-circle": {
      path(
        "circle",
        "trajectory",
        Array.from({ length: 65 }, (_, i) => ({
          x: 0.5 + 0.28 * Math.cos((i * Math.PI) / 32),
          y: 0.46 + 0.28 * Math.sin((i * Math.PI) / 32),
        })),
        undefined,
        true,
      );
      body("mass", "ball", { x: 0.5, y: 0.74 }, "body");
      path(
        "string",
        "connector",
        [
          { x: 0.5, y: 0.46 },
          { x: 0.5, y: 0.74 },
        ],
        "radius",
      );
      break;
    }
    case "incline": {
      const a = radians(intent.angleDegrees);
      const upper = { x: 0.14, y: 0.82 - 0.62 * Math.sin(a) };
      const lower = { x: 0.14 + 0.62 * Math.cos(a), y: 0.82 };
      path("ramp", "surface", [upper, lower]);
      path(
        "baseline",
        "surface",
        [{ x: upper.x, y: lower.y }, lower],
        undefined,
        true,
      );
      const onRamp = (fraction: number) => ({
        x: upper.x + 0.62 * fraction * Math.cos(a) + 0.035 * Math.sin(a),
        y: upper.y + 0.62 * fraction * Math.sin(a) - 0.035 * Math.cos(a),
      });
      body("block", "block", onRamp(0), "body", intent.angleDegrees);
      if (intent.showStartEnd)
        body("final-block", "block", onRamp(1), "body", intent.angleDegrees);
      const lengthOffset = label("body") ? 0.2 : 0.16;
      if (label("length"))
        path(
          "ramp-length",
          "dimension",
          [
            { x: upper.x - 0.02, y: upper.y - lengthOffset },
            { x: lower.x - 0.02, y: lower.y - lengthOffset },
          ],
          "length",
        );
      if (label("height"))
        path(
          "height",
          "dimension",
          [
            { x: lower.x + 0.09, y: upper.y },
            { x: lower.x + 0.09, y: lower.y },
          ],
          "height",
        );
      const angleLabel = label("angle");
      if (angleLabel)
        panel.angles.push({
          id: "incline-angle",
          vertex: lower,
          startDegrees: 180 - intent.angleDegrees,
          endDegrees: 180,
          label: angleLabel,
        });
      break;
    }
    case "pendulum": {
      const pivot = { x: 0.55, y: 0.24 };
      const initial = { x: 0.1, y: 0.24 },
        low = { x: 0.55, y: 0.69 };
      path("support", "surface", [
        { x: 0.45, y: 0.22 },
        { x: 0.65, y: 0.22 },
      ]);
      path("initial-string", "connector", [pivot, initial], "length");
      path("bottom-string", "connector", [pivot, low], undefined, true);
      path(
        "swing-path",
        "trajectory",
        Array.from({ length: 33 }, (_, i) => ({
          x: pivot.x - 0.45 * Math.cos((i * Math.PI) / 64),
          y: pivot.y + 0.45 * Math.sin((i * Math.PI) / 64),
        })),
        undefined,
        true,
      );
      body("initial-bob", "ball", initial, "body");
      body("bottom-bob", "ball", low, undefined);
      body("target", "ball", { x: 0.6, y: 0.69 }, "target");
      start("after-collision");
      path("support", "surface", [
        { x: 0.35, y: 0.22 },
        { x: 0.55, y: 0.22 },
      ]);
      path("string", "connector", [
        { x: 0.45, y: 0.24 },
        { x: 0.73, y: 0.59 },
      ]);
      path(
        "lowest-level",
        "trajectory",
        [
          { x: 0.35, y: 0.69 },
          { x: 0.89, y: 0.69 },
        ],
        undefined,
        true,
      );
      body("combined", "ball", { x: 0.73, y: 0.59 }, "combined");
      body("joined-target", "ball", { x: 0.77, y: 0.59 }, undefined);
      path(
        "rise",
        "dimension",
        [
          { x: 0.86, y: 0.59 },
          { x: 0.86, y: 0.69 },
        ],
        "rise",
      );
      break;
    }
    case "elastic-rope": {
      panels.length = 0;
      for (const [id, bottom, labelId] of [
        ["release", 0.23, "release"],
        ["taut", 0.61, "point-a"],
        ["extended", 0.83, "point-b"],
      ] as const) {
        start(id);
        path("support", "surface", [
          { x: 0.3, y: 0.2 },
          { x: 0.68, y: 0.2 },
        ]);
        body("ball", "ball", { x: 0.47, y: bottom }, labelId);
        if (id !== "release")
          path("rope", "connector", [
            { x: 0.47, y: 0.2 },
            { x: 0.47, y: bottom },
          ]);
        if (id === "taut")
          path(
            "length",
            "dimension",
            [
              { x: 0.75, y: 0.2 },
              { x: 0.75, y: 0.61 },
            ],
            "length",
          );
        if (id === "extended") {
          path(
            "reference-a",
            "trajectory",
            [
              { x: 0.35, y: 0.61 },
              { x: 0.9, y: 0.61 },
            ],
            undefined,
            true,
          );
          path(
            "extension",
            "dimension",
            [
              { x: 0.75, y: 0.61 },
              { x: 0.75, y: bottom },
            ],
            "extension",
          );
        }
      }
      break;
    }
    case "accelerometer": {
      const a = radians(intent.angleDegrees);
      const pivot = { x: 0.6, y: 0.18 };
      const bob = {
        x: pivot.x - 0.5 * Math.sin(a),
        y: pivot.y + 0.5 * Math.cos(a),
      };
      path("support", "surface", [
        { x: 0.2, y: 0.18 },
        { x: 0.8, y: 0.18 },
      ]);
      path(
        "vertical",
        "connector",
        [pivot, { x: pivot.x, y: 0.78 }],
        undefined,
        true,
      );
      path("string", "connector", [pivot, bob]);
      body("bob", "ball", bob, "body");
      vector("motion", "bob", { x: 0.29, y: 0 }, "motion");
      const angleLabel = label("angle");
      if (angleLabel)
        panel.angles.push({
          id: "deflection",
          vertex: pivot,
          startDegrees: -90 - intent.angleDegrees,
          endDegrees: -90,
          label: angleLabel,
        });
      start("circular-road");
      path(
        "road",
        "trajectory",
        Array.from({ length: 49 }, (_, i) => ({
          x: 0.36 + 0.36 * Math.sin((i * Math.PI) / 48),
          y: 0.5 - 0.36 * Math.cos((i * Math.PI) / 48),
        })),
      );
      path(
        "radius",
        "dimension",
        [
          { x: 0.36, y: 0.5 },
          { x: 0.72, y: 0.5 },
        ],
        "radius",
      );
      body("truck", "cart", { x: 0.36, y: 0.14 }, "body");
      body("station", "block", { x: 0.36, y: 0.86 }, "station");
      break;
    }
    default: {
      const exhaustive: never = intent;
      throw new Error(`Unsupported mechanics intent: ${exhaustive}`);
    }
  }
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: intent.id,
    scenarioRef: intent.scenarioRef,
    family: "mechanics_scene",
    templateId: "scene.mechanics.v1",
    coordinateSpace: "scene",
    payload: { panels },
    composition: {
      kind: panels.length === 1 ? "single" : "panel-grid",
      columns: panels.length,
    },
    visibility: {
      publicParameterIds: intent.labels.map((item) => item.parameterId),
      privateParameterIds: [...intent.privateParameterIds],
      labelMode: "allowlist",
      altTextMode: "student-safe",
    },
    provenance: { rendererVersion: "mechanics-svg/0.1.0" },
  };
}
