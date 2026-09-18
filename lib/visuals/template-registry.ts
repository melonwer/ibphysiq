import {
  CoordinateSpace,
  VISUAL_FAMILY_IDS,
  VISUAL_SCHEMA_VERSION,
  VisualFamilyId,
  VisualSpec,
  VisualTemplateDefinition,
  VisualValidationResult,
} from "./types";

const commonChecks = [
  "schema-valid",
  "finite-geometry",
  "public-private-parameter-disjointness",
  "student-visible-label-allowlist",
  "readable-at-target-size",
] as const;

export const VISUAL_TEMPLATE_REGISTRY = {
  cartesian_plot: {
    family: "cartesian_plot",
    templateId: "plot.cartesian.v1",
    coordinateSpace: "cartesian",
    requiredPrimitives: [
      "axis",
      "tick",
      "data-series",
      "curve",
      "region",
      "label",
    ],
    scenarioContract: [
      "axis quantities and units",
      "domains",
      "series data or model",
      "interpretation mode",
    ],
    validationChecks: [
      ...commonChecks,
      "axis-domain-valid",
      "series-within-domain",
      "tick-precision-sufficient",
      "square-grid-cell-aspect",
      "tick-label-spacing",
    ],
    implementationStatus: "pilot",
  },
  circuit_network: {
    family: "circuit_network",
    templateId: "network.circuit.v1",
    coordinateSpace: "network",
    requiredPrimitives: [
      "wire",
      "junction",
      "component",
      "meter",
      "source",
      "label",
    ],
    scenarioContract: [
      "electrical nodes",
      "two-terminal components",
      "component states",
      "visible quantities",
    ],
    validationChecks: [
      ...commonChecks,
      "terminals-connected",
      "junctions-explicit",
      "meter-placement-valid",
    ],
    implementationStatus: "pilot",
  },
  vector_force: {
    family: "vector_force",
    templateId: "vector.force.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "object",
      "vector",
      "origin",
      "coordinate-axis",
      "label",
    ],
    scenarioContract: [
      "body reference",
      "signed vector quantities",
      "coordinate convention",
    ],
    validationChecks: [
      ...commonChecks,
      "vector-origin-resolves",
      "direction-convention-consistent",
    ],
    implementationStatus: "planned",
  },
  ray_wave: {
    family: "ray_wave",
    templateId: "path.ray-wave.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "boundary",
      "ray",
      "wavefront",
      "normal",
      "angle",
      "label",
    ],
    scenarioContract: [
      "media or wave regions",
      "boundaries",
      "paths or wavefronts",
      "wavelength/frequency when quantitative",
    ],
    validationChecks: [
      ...commonChecks,
      "boundary-path-intersections-valid",
      "angle-convention-consistent",
    ],
    implementationStatus: "planned",
  },
  field_map: {
    family: "field_map",
    templateId: "field.map.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "source",
      "field-line",
      "equipotential",
      "vector",
      "label",
    ],
    scenarioContract: [
      "field sources",
      "domain exclusions",
      "sign convention",
      "representation mode",
    ],
    validationChecks: [
      ...commonChecks,
      "singularities-excluded",
      "field-direction-consistent",
    ],
    implementationStatus: "pilot",
  },
  experimental_apparatus: {
    family: "experimental_apparatus",
    templateId: "scene.apparatus.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "apparatus",
      "connector",
      "sensor",
      "sample",
      "dimension",
      "label",
    ],
    scenarioContract: [
      "apparatus entities",
      "physical connections",
      "measured quantities",
      "relevant dimensions",
    ],
    validationChecks: [
      ...commonChecks,
      "connections-resolve",
      "measurement-path-complete",
    ],
    implementationStatus: "planned",
  },
  data_table: {
    family: "data_table",
    templateId: "data.table.v1",
    coordinateSpace: "table",
    requiredPrimitives: ["table", "header", "cell", "uncertainty", "unit"],
    scenarioContract: [
      "column quantities",
      "units",
      "measured rows",
      "uncertainties when applicable",
    ],
    validationChecks: [
      ...commonChecks,
      "row-shapes-consistent",
      "units-dimensionally-consistent",
    ],
    implementationStatus: "planned",
  },
  energy_level: {
    family: "energy_level",
    templateId: "levels.energy.v1",
    coordinateSpace: "scene",
    requiredPrimitives: ["level", "transition", "particle", "label"],
    scenarioContract: [
      "ordered energy levels",
      "transitions",
      "zero/reference convention",
    ],
    validationChecks: [
      ...commonChecks,
      "levels-ordered",
      "transition-energy-consistent",
    ],
    implementationStatus: "planned",
  },
  particle_interaction: {
    family: "particle_interaction",
    templateId: "particle.interaction.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "particle",
      "track",
      "vertex",
      "interaction-line",
      "label",
    ],
    scenarioContract: [
      "particles",
      "interaction vertices",
      "direction convention",
      "conserved quantities",
    ],
    validationChecks: [
      ...commonChecks,
      "vertices-resolve",
      "conservation-check-linked",
    ],
    implementationStatus: "planned",
  },
  material_particle_model: {
    family: "material_particle_model",
    templateId: "matter.particle-model.v1",
    coordinateSpace: "scene",
    requiredPrimitives: ["particle", "bond", "container", "piston", "label"],
    scenarioContract: [
      "particle populations",
      "container or lattice geometry",
      "state variables",
    ],
    validationChecks: [
      ...commonChecks,
      "population-count-valid",
      "state-representation-consistent",
    ],
    implementationStatus: "planned",
  },
  mechanics_scene: {
    family: "mechanics_scene",
    templateId: "scene.mechanics.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "object",
      "surface",
      "connector",
      "path",
      "dimension",
      "angle",
      "vector",
      "label",
    ],
    scenarioContract: [
      "bodies and supports",
      "contact and connector relationships",
      "motion paths",
      "dimensions and visible quantities",
    ],
    validationChecks: [
      ...commonChecks,
      "contact-relationships-resolve",
      "motion-constraints-consistent",
    ],
    implementationStatus: "pilot",
  },
  electromagnetic_scene: {
    family: "electromagnetic_scene",
    templateId: "scene.electromagnetic.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "source",
      "object",
      "surface",
      "path",
      "vector",
      "dimension",
      "label",
    ],
    scenarioContract: [
      "charges, conductors, or magnets",
      "field regions and directions",
      "particle or conductor paths",
      "dimensions and visible quantities",
    ],
    validationChecks: [
      ...commonChecks,
      "source-signs-consistent",
      "field-force-directions-consistent",
    ],
    implementationStatus: "pilot",
  },
  thermal_energy_scene: {
    family: "thermal_energy_scene",
    templateId: "scene.thermal-energy.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "object",
      "surface",
      "region",
      "path",
      "dimension",
      "label",
    ],
    scenarioContract: [
      "thermal bodies or regions",
      "temperatures and material properties",
      "energy-transfer paths",
      "system boundary",
    ],
    validationChecks: [
      ...commonChecks,
      "energy-flow-directions-consistent",
      "thermal-boundary-resolves",
    ],
    implementationStatus: "planned",
  },
  spatial_orbital: {
    family: "spatial_orbital",
    templateId: "scene.spatial-orbital.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "body",
      "orbit",
      "path",
      "dimension",
      "angle",
      "label",
    ],
    scenarioContract: [
      "bodies",
      "relative positions",
      "paths/orbits",
      "scale interpretation",
    ],
    validationChecks: [
      ...commonChecks,
      "body-references-resolve",
      "distance-convention-consistent",
    ],
    implementationStatus: "planned",
  },
  geometry_scene: {
    family: "geometry_scene",
    templateId: "scene.geometry.v1",
    coordinateSpace: "scene",
    requiredPrimitives: [
      "object",
      "surface",
      "path",
      "dimension",
      "angle",
      "vector",
      "label",
    ],
    scenarioContract: [
      "entities",
      "spatial relationships",
      "dimensions",
      "coordinate convention",
    ],
    validationChecks: [
      ...commonChecks,
      "relationships-resolve",
      "dimensions-positive",
    ],
    implementationStatus: "pilot",
  },
  annotated_image: {
    family: "annotated_image",
    templateId: "image.annotated.v1",
    coordinateSpace: "image",
    requiredPrimitives: ["image", "callout", "scale-bar", "region", "label"],
    scenarioContract: [
      "licensed source asset",
      "annotation anchors",
      "scale metadata when quantitative",
    ],
    validationChecks: [
      ...commonChecks,
      "asset-resolves",
      "annotations-in-bounds",
      "scale-bar-valid",
    ],
    implementationStatus: "planned",
  },
} as const satisfies Record<VisualFamilyId, VisualTemplateDefinition>;

export function listVisualTemplates(): VisualTemplateDefinition[] {
  return VISUAL_FAMILY_IDS.map((family) => VISUAL_TEMPLATE_REGISTRY[family]);
}

export function getVisualTemplate(
  family: VisualFamilyId,
): VisualTemplateDefinition {
  return VISUAL_TEMPLATE_REGISTRY[family];
}

function isCoordinateSpace(value: unknown): value is CoordinateSpace {
  return ["cartesian", "network", "scene", "table", "image"].includes(
    String(value),
  );
}

export function validateVisualSpec(spec: VisualSpec): VisualValidationResult {
  const issues: VisualValidationResult["issues"] = [];
  if (spec.schemaVersion !== VISUAL_SCHEMA_VERSION) {
    issues.push({
      code: "schema-version",
      message: "Unsupported visual schema version",
      path: "schemaVersion",
    });
  }
  if (!VISUAL_FAMILY_IDS.includes(spec.family)) {
    issues.push({
      code: "family",
      message: "Unknown visual family",
      path: "family",
    });
    return { valid: false, issues };
  }
  const template = getVisualTemplate(spec.family);
  if (spec.templateId !== template.templateId) {
    issues.push({
      code: "template-family-mismatch",
      message: "Template does not match visual family",
      path: "templateId",
    });
  }
  if (
    !isCoordinateSpace(spec.coordinateSpace) ||
    spec.coordinateSpace !== template.coordinateSpace
  ) {
    issues.push({
      code: "coordinate-space",
      message: "Coordinate space does not match the template",
      path: "coordinateSpace",
    });
  }
  const privateParameters = new Set(spec.visibility.privateParameterIds);
  const leaked = spec.visibility.publicParameterIds.filter((parameter) =>
    privateParameters.has(parameter),
  );
  if (leaked.length > 0) {
    issues.push({
      code: "visibility-overlap",
      message: `Parameters cannot be both public and private: ${leaked.join(", ")}`,
      path: "visibility",
    });
  }
  if (!spec.id.trim()) {
    issues.push({ code: "id", message: "Visual ID is required", path: "id" });
  }
  if (!spec.scenarioRef.trim()) {
    issues.push({
      code: "scenario-ref",
      message: "Scenario reference is required",
      path: "scenarioRef",
    });
  }
  return { valid: issues.length === 0, issues };
}
