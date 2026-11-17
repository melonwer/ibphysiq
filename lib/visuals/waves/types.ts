import {
  JsonSchema,
  SchemaNode,
  toJsonSchema,
} from "@/lib/generation-harness/schema";
import {
  StudentVisibilityPolicy,
  VisualValidationIssue,
  VisualValidationResult,
} from "@/lib/visuals/types";

export const WAVES_SCHEMA_VERSION = "waves-scenario/0.1.0" as const;

export const WAVES_SCENARIO_KINDS = [
  "progressive-wave",
  "standing-wave",
  "double-slit",
  "diffraction-grating",
  "single-slit",
  "doppler-effect",
  "malus-polarization",
] as const;

export type WavesScenarioKind = (typeof WAVES_SCENARIO_KINDS)[number];

export type WavesSyllabusLevel = "IB-SL" | "IB-HL" | "A-Level" | "NCUK";

export type ProgressiveProfileKind =
  | "displacement-position"
  | "displacement-time";

export type WavePropagationDirection = "right" | "left";

export type StandingWaveBoundaryKind =
  | "string-fixed-both"
  | "pipe-open-both"
  | "pipe-closed-one";

export type SourceMotionDirection =
  | "stationary"
  | "towards-observer"
  | "away-from-observer";

export type ObserverMotionDirection =
  | "stationary"
  | "towards-source"
  | "away-from-source";

export type IncidentPolarizationState = "polarized" | "unpolarized";

export type WavesQuantityKey =
  | "amplitudeM"
  | "crestToTroughM"
  | "wavelengthM"
  | "frequencyHz"
  | "periodS"
  | "waveSpeedMs"
  | "angularFrequencyRadS"
  | "wavenumberRadM"
  | "initialPhaseRad"
  | "snapshotTimeS"
  | "fixedPositionM"
  | "point1Coord"
  | "point2Coord"
  | "point1DisplacementM"
  | "point2DisplacementM"
  | "coordSeparation"
  | "fractionalCycles"
  | "phaseDifferenceRad"
  | "phaseDifferenceModulo2PiRad"
  | "principalPhaseDifferenceRad"
  | "phaseDifferenceDegrees"
  | "lengthM"
  | "endCorrectionM"
  | "effectiveLengthM"
  | "harmonicNumber"
  | "modeIndex"
  | "tensionN"
  | "linearDensityKgM"
  | "fundamentalFrequencyHz"
  | "harmonicFrequencyHz"
  | "nodeCount"
  | "antinodeCount"
  | "nodePositionsM"
  | "antinodePositionsM"
  | "adjacentNodeSpacingM"
  | "nodeToAntinodeSpacingM"
  | "slitSeparationM"
  | "screenDistanceM"
  | "slitWidthM"
  | "orderN"
  | "fringeSpacingM"
  | "nthOrderAngleRad"
  | "nthOrderAngleDegrees"
  | "nthBrightPositionM"
  | "nthBrightExactPositionM"
  | "firstDarkPositionM"
  | "pathDifferenceM"
  | "maxOrder"
  | "centralEnvelopeHalfWidthM"
  | "centralEnvelopeFullWidthM"
  | "slitSpacingM"
  | "linesPerMeter"
  | "linesPerMm"
  | "queryOrderN"
  | "querySinTheta"
  | "queryAngleRad"
  | "queryAngleDegrees"
  | "queryScreenPositionM"
  | "strictlySubNinetyMaxOrder"
  | "totalPrincipalMaxima"
  | "flatScreenMaximaCount"
  | "firstMinimumAngleRad"
  | "firstMinimumExactAngleRad"
  | "firstMinimumExactAngleDegrees"
  | "centralAngularWidthRad"
  | "centralHalfWidthM"
  | "centralFullWidthM"
  | "centralExactHalfWidthM"
  | "centralExactFullWidthM"
  | "firstSecondaryMaxRelativeIntensity"
  | "emittedFrequencyHz"
  | "sourceSpeedMs"
  | "observerSpeedMs"
  | "sourceMotion"
  | "observerMotion"
  | "observedFrequencyHz"
  | "observedPeriodS"
  | "frequencyShiftHz"
  | "fractionalFrequencyShift"
  | "emittedWavelengthM"
  | "mediumWavelengthTowardsObserverM"
  | "relativeWaveSpeedAtObserverMs"
  | "lowSpeedShiftApproximationHz"
  | "incidentIntensityWm2"
  | "analyzerAngleDegrees"
  | "intensityBeforeAnalyzerWm2"
  | "transmittedIntensityWm2"
  | "absorbedIntensityAtAnalyzerWm2"
  | "cosThetaSquared"
  | "amplitudeTransmissionFactor"
  | "overallTransmissionFraction";

export type HiddenQuantityId = WavesQuantityKey | (string & {});

export interface WavesScenarioBase {
  schemaVersion?: typeof WAVES_SCHEMA_VERSION;
  id?: string;
  title?: string;
  hiddenQuantities?: readonly HiddenQuantityId[];
  visibility?: Partial<StudentVisibilityPolicy>;
  customLabels?: Partial<Record<WavesQuantityKey, string>>;
}

export interface ProgressiveWaveScenarioSpec extends WavesScenarioBase {
  kind: "progressive-wave";
  profileKind: ProgressiveProfileKind;
  amplitudeM: number;
  wavelengthM: number;
  frequencyHz: number;
  direction?: WavePropagationDirection;
  initialPhaseRad?: number;
  snapshotTimeS?: number;
  fixedPositionM?: number;
  cyclesShown?: number;
  point1Coord?: number;
  point2Coord?: number;
}

export interface StandingWaveScenarioSpec extends WavesScenarioBase {
  kind: "standing-wave";
  boundaryKind: StandingWaveBoundaryKind;
  lengthM: number;
  harmonicNumber: number;
  waveSpeedMs?: number;
  tensionN?: number;
  linearDensityKgM?: number;
  endCorrectionM?: number;
  amplitudeM?: number;
}

export interface DoubleSlitScenarioSpec extends WavesScenarioBase {
  kind: "double-slit";
  wavelengthM: number;
  slitSeparationM: number;
  screenDistanceM: number;
  slitWidthM?: number;
  orderN?: number;
}

export interface DiffractionGratingScenarioSpec extends WavesScenarioBase {
  kind: "diffraction-grating";
  wavelengthM: number;
  slitSpacingM: number;
  linesPerMm?: number;
  queryOrderN?: number;
  screenDistanceM?: number;
}

export interface SingleSlitScenarioSpec extends WavesScenarioBase {
  kind: "single-slit";
  wavelengthM: number;
  slitWidthM: number;
  screenDistanceM: number;
}

export interface DopplerEffectScenarioSpec extends WavesScenarioBase {
  kind: "doppler-effect";
  emittedFrequencyHz: number;
  waveSpeedMs: number;
  sourceSpeedMs: number;
  sourceMotion: SourceMotionDirection;
  observerSpeedMs: number;
  observerMotion: ObserverMotionDirection;
}

export interface MalusPolarizationScenarioSpec extends WavesScenarioBase {
  kind: "malus-polarization";
  incidentIntensityWm2: number;
  analyzerAngleDegrees: number;
  incidentPolarization?: IncidentPolarizationState;
}

export type WavesScenarioSpec =
  | ProgressiveWaveScenarioSpec
  | StandingWaveScenarioSpec
  | DoubleSlitScenarioSpec
  | DiffractionGratingScenarioSpec
  | SingleSlitScenarioSpec
  | DopplerEffectScenarioSpec
  | MalusPolarizationScenarioSpec;

export type WavesValidationIssue = VisualValidationIssue;
export type WavesValidationResult = VisualValidationResult;

export interface ProgressiveWaveSolution {
  kind: "progressive-wave";
  profileKind: ProgressiveProfileKind;
  direction: WavePropagationDirection;
  amplitudeM: number;
  crestToTroughM: number;
  wavelengthM: number;
  frequencyHz: number;
  periodS: number;
  waveSpeedMs: number;
  angularFrequencyRadS: number;
  wavenumberRadM: number;
  initialPhaseRad: number;
  snapshotTimeS: number;
  fixedPositionM: number;
  cyclesShown: number;
  axisDomainMax: number;
  point1Coord: number;
  point2Coord: number;
  point1DisplacementM: number;
  point2DisplacementM: number;
  coordSeparation: number;
  fractionalCycles: number;
  phaseDifferenceRad: number;
  phaseDifferenceModulo2PiRad: number;
  principalPhaseDifferenceRad: number;
  phaseDifferenceDegrees: number;
  quantities: Record<string, number>;
}

export interface StandingWaveSolution {
  kind: "standing-wave";
  boundaryKind: StandingWaveBoundaryKind;
  lengthM: number;
  endCorrectionM: number;
  effectiveLengthM: number;
  harmonicNumber: number;
  modeIndex: number;
  waveSpeedMs: number;
  tensionN?: number;
  linearDensityKgM?: number;
  wavelengthM: number;
  fundamentalFrequencyHz: number;
  harmonicFrequencyHz: number;
  periodS: number;
  nodeCount: number;
  antinodeCount: number;
  nodePositionsM: number[];
  antinodePositionsM: number[];
  adjacentNodeSpacingM: number;
  nodeToAntinodeSpacingM: number;
  amplitudeM: number;
  quantities: Record<string, number>;
}

export interface DoubleSlitSolution {
  kind: "double-slit";
  wavelengthM: number;
  slitSeparationM: number;
  screenDistanceM: number;
  slitWidthM?: number;
  orderN: number;
  fringeSpacingM: number;
  nthOrderAngleRad: number;
  nthOrderAngleDegrees: number;
  nthBrightPositionM: number;
  nthBrightExactPositionM: number;
  firstDarkPositionM: number;
  pathDifferenceM: number;
  maxOrder: number;
  centralEnvelopeHalfWidthM?: number;
  centralEnvelopeFullWidthM?: number;
  firstMissingOrder?: number | null;
  quantities: Record<string, number>;
}

export interface DiffractionGratingSolution {
  kind: "diffraction-grating";
  wavelengthM: number;
  slitSpacingM: number;
  linesPerMeter: number;
  linesPerMm: number;
  maxOrder: number;
  strictlySubNinetyMaxOrder: number;
  totalPrincipalMaxima: number;
  flatScreenMaximaCount: number;
  orderAnglesRad: number[];
  orderAnglesDegrees: number[];
  queryOrderN: number;
  querySinTheta: number;
  queryAngleRad: number;
  queryAngleDegrees: number;
  screenDistanceM?: number;
  queryScreenPositionM?: number;
  quantities: Record<string, number>;
}

export interface SingleSlitSolution {
  kind: "single-slit";
  wavelengthM: number;
  slitWidthM: number;
  screenDistanceM: number;
  firstMinimumAngleRad: number;
  firstMinimumExactAngleRad: number;
  firstMinimumExactAngleDegrees: number;
  centralAngularWidthRad: number;
  centralHalfWidthM: number;
  centralFullWidthM: number;
  centralExactHalfWidthM: number;
  centralExactFullWidthM: number;
  firstSecondaryMaxRelativeIntensity: number;
  quantities: Record<string, number>;
}

export interface DopplerEffectSolution {
  kind: "doppler-effect";
  emittedFrequencyHz: number;
  waveSpeedMs: number;
  sourceSpeedMs: number;
  sourceMotion: SourceMotionDirection;
  observerSpeedMs: number;
  observerMotion: ObserverMotionDirection;
  observedFrequencyHz: number;
  observedPeriodS: number;
  frequencyShiftHz: number;
  fractionalFrequencyShift: number;
  emittedWavelengthM: number;
  mediumWavelengthTowardsObserverM: number;
  relativeWaveSpeedAtObserverMs: number;
  lowSpeedShiftApproximationHz: number;
  quantities: Record<string, number>;
}

export interface MalusPolarizationSolution {
  kind: "malus-polarization";
  incidentIntensityWm2: number;
  analyzerAngleDegrees: number;
  incidentPolarization: IncidentPolarizationState;
  intensityBeforeAnalyzerWm2: number;
  transmittedIntensityWm2: number;
  absorbedIntensityAtAnalyzerWm2: number;
  cosThetaSquared: number;
  amplitudeTransmissionFactor: number;
  overallTransmissionFraction: number;
  quantities: Record<string, number>;
}

export type WavesSolution =
  | ProgressiveWaveSolution
  | StandingWaveSolution
  | DoubleSlitSolution
  | DiffractionGratingSolution
  | SingleSlitSolution
  | DopplerEffectSolution
  | MalusPolarizationSolution;

export interface WavesRenderOptions {
  width?: number;
  height?: number;
  hiddenQuantities?: readonly HiddenQuantityId[];
  visibility?: Partial<StudentVisibilityPolicy>;
  showSolvedQuantities?: boolean;
  significantFigures?: number;
}

export interface WavesSamplingOptions {
  seed?: number | string;
  rng?: () => number;
  kind?: WavesScenarioKind;
  kinds?: readonly WavesScenarioKind[];
  syllabusLevel?: WavesSyllabusLevel;
  hideTargetQuantity?: boolean;
}

export interface SampledWavesScenarioPackage {
  spec: WavesScenarioSpec;
  solution: WavesSolution;
  targetQuantity: WavesQuantityKey;
  syllabusLevels: readonly WavesSyllabusLevel[];
}

const optionalString: SchemaNode = {
  kind: "string",
  minLength: 1,
  optional: true,
};

const baseProperties: Record<string, SchemaNode> = {
  schemaVersion: {
    kind: "string",
    values: [WAVES_SCHEMA_VERSION],
    optional: true,
  },
  id: optionalString,
  title: optionalString,
  hiddenQuantities: {
    kind: "array",
    items: { kind: "string", minLength: 1 },
    optional: true,
  },
  visibility: {
    kind: "object",
    optional: true,
    properties: {
      publicParameterIds: {
        kind: "array",
        items: { kind: "string", minLength: 1 },
        optional: true,
      },
      privateParameterIds: {
        kind: "array",
        items: { kind: "string", minLength: 1 },
        optional: true,
      },
      labelMode: {
        kind: "string",
        values: ["all-public", "allowlist"],
        optional: true,
      },
      altTextMode: {
        kind: "string",
        values: ["student-safe", "teacher-complete"],
        optional: true,
      },
    },
  },
  customLabels: {
    kind: "object",
    optional: true,
    allowAdditionalProperties: true,
    properties: {},
  },
};

function scenarioSchema(
  kind: WavesScenarioKind,
  properties: Record<string, SchemaNode>,
): SchemaNode {
  return {
    kind: "object",
    properties: {
      ...baseProperties,
      kind: { kind: "string", values: [kind] },
      ...properties,
    },
  };
}

export const WAVES_SCENARIO_SCHEMAS: Record<WavesScenarioKind, SchemaNode> = {
  "progressive-wave": scenarioSchema("progressive-wave", {
    profileKind: {
      kind: "string",
      values: ["displacement-position", "displacement-time"],
    },
    amplitudeM: { kind: "number" },
    wavelengthM: { kind: "number" },
    frequencyHz: { kind: "number" },
    direction: {
      kind: "string",
      values: ["right", "left"],
      optional: true,
    },
    initialPhaseRad: { kind: "number", optional: true },
    snapshotTimeS: { kind: "number", optional: true },
    fixedPositionM: { kind: "number", optional: true },
    cyclesShown: { kind: "number", minimum: 0.5, maximum: 8, optional: true },
    point1Coord: { kind: "number", optional: true },
    point2Coord: { kind: "number", optional: true },
  }),
  "standing-wave": scenarioSchema("standing-wave", {
    boundaryKind: {
      kind: "string",
      values: ["string-fixed-both", "pipe-open-both", "pipe-closed-one"],
    },
    lengthM: { kind: "number" },
    harmonicNumber: { kind: "integer", minimum: 1, maximum: 15 },
    waveSpeedMs: { kind: "number", optional: true },
    tensionN: { kind: "number", optional: true },
    linearDensityKgM: { kind: "number", optional: true },
    endCorrectionM: { kind: "number", optional: true },
    amplitudeM: { kind: "number", optional: true },
  }),
  "double-slit": scenarioSchema("double-slit", {
    wavelengthM: { kind: "number" },
    slitSeparationM: { kind: "number" },
    screenDistanceM: { kind: "number" },
    slitWidthM: { kind: "number", optional: true },
    orderN: { kind: "integer", minimum: 1, maximum: 50, optional: true },
  }),
  "diffraction-grating": scenarioSchema("diffraction-grating", {
    wavelengthM: { kind: "number" },
    slitSpacingM: { kind: "number" },
    linesPerMm: { kind: "number", optional: true },
    queryOrderN: { kind: "integer", minimum: 0, maximum: 100, optional: true },
    screenDistanceM: { kind: "number", optional: true },
  }),
  "single-slit": scenarioSchema("single-slit", {
    wavelengthM: { kind: "number" },
    slitWidthM: { kind: "number" },
    screenDistanceM: { kind: "number" },
  }),
  "doppler-effect": scenarioSchema("doppler-effect", {
    emittedFrequencyHz: { kind: "number" },
    waveSpeedMs: { kind: "number" },
    sourceSpeedMs: { kind: "number" },
    sourceMotion: {
      kind: "string",
      values: ["stationary", "towards-observer", "away-from-observer"],
    },
    observerSpeedMs: { kind: "number" },
    observerMotion: {
      kind: "string",
      values: ["stationary", "towards-source", "away-from-source"],
    },
  }),
  "malus-polarization": scenarioSchema("malus-polarization", {
    incidentIntensityWm2: { kind: "number" },
    analyzerAngleDegrees: { kind: "number", minimum: 0, maximum: 180 },
    incidentPolarization: {
      kind: "string",
      values: ["polarized", "unpolarized"],
      optional: true,
    },
  }),
};

export const WAVES_SCENARIO_JSON_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://sixthphysics.local/schema/waves-scenario-0.1.0.json",
  oneOf: Object.values(WAVES_SCENARIO_SCHEMAS).map(toJsonSchema),
};
