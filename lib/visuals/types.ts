export const VISUAL_SCHEMA_VERSION = "visual-spec/0.1.0" as const;

export const VISUAL_FAMILY_IDS = [
  "cartesian_plot",
  "circuit_network",
  "vector_force",
  "ray_wave",
  "field_map",
  "experimental_apparatus",
  "data_table",
  "energy_level",
  "particle_interaction",
  "material_particle_model",
  "mechanics_scene",
  "electromagnetic_scene",
  "thermal_energy_scene",
  "spatial_orbital",
  "geometry_scene",
  "annotated_image",
] as const;

export type VisualFamilyId = (typeof VISUAL_FAMILY_IDS)[number];

export type VisualPrimitiveId =
  | "angle"
  | "apparatus"
  | "axis"
  | "body"
  | "bond"
  | "boundary"
  | "callout"
  | "cell"
  | "component"
  | "connector"
  | "container"
  | "coordinate-axis"
  | "curve"
  | "data-series"
  | "dimension"
  | "equipotential"
  | "field-line"
  | "header"
  | "image"
  | "interaction-line"
  | "junction"
  | "label"
  | "level"
  | "meter"
  | "normal"
  | "object"
  | "orbit"
  | "origin"
  | "particle"
  | "path"
  | "piston"
  | "ray"
  | "region"
  | "sample"
  | "scale-bar"
  | "sensor"
  | "source"
  | "surface"
  | "table"
  | "tick"
  | "track"
  | "transition"
  | "uncertainty"
  | "unit"
  | "vector"
  | "vertex"
  | "wavefront"
  | "wire";

export type CoordinateSpace =
  "cartesian" | "network" | "scene" | "table" | "image";

export interface Point2D {
  x: number;
  y: number;
}

export interface QuantityBinding {
  parameterId: string;
  symbol?: string;
  unit?: string;
  displayPrecision?: number;
}

export interface AxisSpec {
  id: string;
  label: string;
  unit?: string;
  scale: "linear" | "log";
  domain: [number, number];
  tickStrategy: "auto" | "fixed" | "source-matched";
  tickValues?: number[];
  tickLabels?: Record<string, string>;
  minorTickStep?: number;
}

export interface PlotSeriesSpec {
  id: string;
  kind:
    "analytical-curve" | "measured-points" | "histogram" | "step" | "waveform";
  xParameterId: string;
  yParameterId: string;
  dataRef: string;
  uncertaintyRef?: string;
  styleRole?: "primary" | "comparison" | "construction";
}

export interface CartesianPlotPayload {
  xAxis: AxisSpec;
  yAxis: AxisSpec;
  series: PlotSeriesSpec[];
  showGrid?: boolean;
  constructions?: Array<{
    kind: "tangent" | "intercept" | "shaded-region" | "threshold";
    targetSeriesId: string;
    parameterId?: string;
  }>;
}

export interface CircuitNodeSpec {
  id: string;
  kind: "junction" | "terminal" | "reference";
}

export interface CircuitComponentSpec {
  id: string;
  kind:
    | "cell"
    | "battery"
    | "resistor"
    | "variable-resistor"
    | "thermistor"
    | "capacitor"
    | "diode"
    | "lamp"
    | "switch"
    | "ammeter"
    | "voltmeter";
  terminals: [string, string];
  state?: "open" | "closed" | "active";
  quantityBindings?: QuantityBinding[];
}

export interface CircuitNetworkPayload {
  nodes: CircuitNodeSpec[];
  components: CircuitComponentSpec[];
  layoutHints?: {
    preferredDirection?: "left-to-right" | "top-to-bottom";
    branchOrder?: string[][];
  };
}

export interface VectorSpec {
  id: string;
  originRef: string;
  quantity: QuantityBinding;
  direction: Point2D | { angleRadians: number };
  sense: "positive" | "negative";
}

export interface SceneEntitySpec {
  id: string;
  kind: string;
  position?: Point2D;
  geometryRef?: string;
  quantityBindings?: QuantityBinding[];
}

export interface ScenePayload {
  entities: SceneEntitySpec[];
  vectors?: VectorSpec[];
  relationships: Array<{
    kind: string;
    from: string;
    to?: string;
    parameterId?: string;
  }>;
}

export interface TablePayload {
  columns: Array<{ id: string; label: string; unit?: string }>;
  rowDataRef: string;
  uncertaintyColumns?: string[];
}

export interface EnergyLevelPayload {
  levels: Array<{ id: string; energy: QuantityBinding; label?: string }>;
  transitions: Array<{ id: string; from: string; to: string; label?: string }>;
}

export interface AnnotatedImagePayload {
  assetRef: string;
  annotations: Array<{
    id: string;
    anchor: Point2D;
    label?: string;
    quantity?: QuantityBinding;
  }>;
  scaleBar?: QuantityBinding;
}

export interface VisualPayloadByFamily {
  cartesian_plot: CartesianPlotPayload;
  circuit_network: CircuitNetworkPayload;
  vector_force: ScenePayload;
  ray_wave: ScenePayload;
  field_map: ScenePayload;
  experimental_apparatus: ScenePayload;
  data_table: TablePayload;
  energy_level: EnergyLevelPayload;
  particle_interaction: ScenePayload;
  material_particle_model: ScenePayload;
  mechanics_scene: ScenePayload;
  electromagnetic_scene: ScenePayload;
  thermal_energy_scene: ScenePayload;
  spatial_orbital: ScenePayload;
  geometry_scene: ScenePayload;
  annotated_image: AnnotatedImagePayload;
}

export type VisualLayer = {
  [F in VisualFamilyId]: {
    id: string;
    family: F;
    payload: VisualPayloadByFamily[F];
    zIndex: number;
  };
}[VisualFamilyId];

export interface VisualComposition {
  kind: "single" | "overlay" | "panel-grid" | "sequence";
  panelLabels?: string[];
  columns?: number;
  sharedScale?: boolean;
}

export interface StudentVisibilityPolicy {
  publicParameterIds: string[];
  privateParameterIds: string[];
  labelMode: "all-public" | "allowlist";
  altTextMode: "student-safe" | "teacher-complete";
}

export interface VisualSpec<F extends VisualFamilyId = VisualFamilyId> {
  schemaVersion: typeof VISUAL_SCHEMA_VERSION;
  id: string;
  family: F;
  templateId: string;
  scenarioRef: string;
  coordinateSpace: CoordinateSpace;
  payload: VisualPayloadByFamily[F];
  layers?: VisualLayer[];
  composition?: VisualComposition;
  visibility: StudentVisibilityPolicy;
  layoutHints?: {
    aspectRatio?: number;
    compact?: boolean;
    sourceAssetRef?: string;
  };
  provenance?: {
    sourceQuestionId?: string;
    rendererVersion?: string;
  };
}

export interface VisualTemplateDefinition<
  F extends VisualFamilyId = VisualFamilyId,
> {
  family: F;
  templateId: string;
  coordinateSpace: CoordinateSpace;
  requiredPrimitives: readonly VisualPrimitiveId[];
  scenarioContract: readonly string[];
  validationChecks: readonly string[];
  implementationStatus: "planned" | "pilot" | "supported";
}

export interface VisualValidationIssue {
  code: string;
  message: string;
  path: string;
}

export interface VisualValidationResult {
  valid: boolean;
  issues: VisualValidationIssue[];
}
