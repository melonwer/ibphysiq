import { Point2D } from "../types";

export const OPTICS_SHM_SCHEMA_VERSION = "optics-shm/0.1.0" as const;
export const DEFAULT_SPEED_OF_LIGHT_MS = 3.0e8;
export const DEFAULT_GRAVITY_MS2 = 9.81;
export const DEFAULT_PENDULUM_BOB_MASS_KG = 0.2;
export const MAX_SMALL_ANGLE_PENDULUM_DEG = 20;

export type OpticsShmScenarioKind =
  | "planar-refraction"
  | "multi-layer-slab"
  | "optical-fiber"
  | "thin-lens"
  | "mass-spring-shm"
  | "simple-pendulum-shm"
  | "kinematic-shm";

export type VisibilityMode = "all-except-hidden" | "allowlist";

export interface OpticsShmVisibilityControls {
  hiddenQuantities?: readonly string[];
  visibleQuantities?: readonly string[];
  visibilityMode?: VisibilityMode;
  mode?: "student" | "teacher";
  showSymbolicHiddenLabels?: boolean;
  customLabels?: Readonly<Record<string, string>>;
}

export interface OpticsShmRenderOptions extends OpticsShmVisibilityControls {
  width?: number;
  height?: number;
  showGrid?: boolean;
}

export interface PlanarRefractionSpec extends OpticsShmVisibilityControls {
  kind: "planar-refraction";
  id?: string;
  title?: string;
  n1: number;
  n2: number;
  incidentAngleDeg: number;
  medium1Name?: string;
  medium2Name?: string;
  vacuumWavelengthNm?: number;
  vacuumSpeedMs?: number;
  showPartialReflection?: boolean;
}

export interface SlabLayerSpec {
  name?: string;
  refractiveIndex: number;
  thicknessM?: number;
}

export interface MultiLayerSlabSpec extends OpticsShmVisibilityControls {
  kind: "multi-layer-slab";
  id?: string;
  title?: string;
  layers: readonly SlabLayerSpec[];
  incidentAngleDeg: number;
  vacuumWavelengthNm?: number;
  vacuumSpeedMs?: number;
}

export interface OpticalFiberSpec extends OpticsShmVisibilityControls {
  kind: "optical-fiber";
  id?: string;
  title?: string;
  nCore: number;
  nCladding: number;
  nExternal?: number;
  launchAngleDeg: number;
  fiberLengthM?: number;
  coreDiameterM?: number;
  vacuumSpeedMs?: number;
}

export type ThinLensType = "converging" | "diverging";

export interface ThinLensSpec extends OpticsShmVisibilityControls {
  kind: "thin-lens";
  id?: string;
  title?: string;
  lensType: ThinLensType;
  focalLengthM: number;
  objectDistanceM: number;
  objectHeightM?: number;
}

export type ShmPhaseConvention = "cosine" | "sine";
export type ShmPlotMode =
  | "time-series"
  | "energy-displacement"
  | "energy-time"
  | "phase-portrait";
export type ShmPhasePlotKind =
  | "velocity-displacement"
  | "acceleration-displacement";

export interface ShmCommonControls extends OpticsShmVisibilityControls {
  id?: string;
  title?: string;
  initialPhaseRad?: number;
  phaseConvention?: ShmPhaseConvention;
  queryTimeS?: number;
  queryDisplacementM?: number;
  cyclesToRender?: number;
  plotMode?: ShmPlotMode;
  phasePlotKind?: ShmPhasePlotKind;
}

export interface MassSpringShmSpec extends ShmCommonControls {
  kind: "mass-spring-shm";
  massKg: number;
  springConstantNm: number;
  amplitudeM: number;
  orientation?: "horizontal" | "vertical";
  gravityMs2?: number;
}

export interface SimplePendulumShmSpec extends ShmCommonControls {
  kind: "simple-pendulum-shm";
  lengthM: number;
  gravityMs2?: number;
  bobMassKg?: number;
  amplitudeM?: number;
  maxAngleDeg?: number;
}

export interface KinematicShmSpec extends ShmCommonControls {
  kind: "kinematic-shm";
  amplitudeM: number;
  periodS?: number;
  frequencyHz?: number;
  angularFrequencyRadS?: number;
  massKg?: number;
}

export type OpticsShmScenarioSpec =
  | PlanarRefractionSpec
  | MultiLayerSlabSpec
  | OpticalFiberSpec
  | ThinLensSpec
  | MassSpringShmSpec
  | SimplePendulumShmSpec
  | KinematicShmSpec;

export type RefractionRegime =
  | "refraction"
  | "critical-angle"
  | "total-internal-reflection";

export interface PlanarRefractionSolution {
  kind: "planar-refraction";
  n1: number;
  n2: number;
  incidentAngleDeg: number;
  snellInvariant: number;
  criticalAngleDeg: number | null;
  regime: RefractionRegime;
  isTotalInternalReflection: boolean;
  isCriticalAngle: boolean;
  refractedAngleDeg: number | null;
  reflectedAngleDeg: number;
  deviationAngleDeg: number;
  signedDeviationDeg: number | null;
  speed1Ms: number;
  speed2Ms: number;
  speedRatioV2OverV1: number;
  wavelengthRatio2Over1: number;
  frequencyHz: number | null;
  wavelength1Nm: number | null;
  wavelength2Nm: number | null;
}

export interface SlabLayerStep {
  layerIndex: number;
  name: string;
  refractiveIndex: number;
  angleDeg: number;
  speedMs: number;
  wavelengthNm: number | null;
  thicknessM: number | null;
  transverseShiftM: number | null;
}

export interface MultiLayerSlabSolution {
  kind: "multi-layer-slab";
  incidentAngleDeg: number;
  snellInvariant: number;
  steps: SlabLayerStep[];
  transmittedToFinalLayer: boolean;
  tirInterfaceIndex: number | null;
  tirCriticalAngleDeg: number | null;
  emergentAngleDeg: number | null;
  totalInteriorThicknessM: number;
  totalTransverseShiftM: number;
  lateralDisplacementM: number | null;
}

export type OpticalFiberRegime =
  | "guided-tir"
  | "critical-grazing"
  | "cladding-leakage";

export interface OpticalFiberSolution {
  kind: "optical-fiber";
  nCore: number;
  nCladding: number;
  nExternal: number;
  launchAngleDeg: number;
  numericalAperture: number;
  acceptanceAngleDeg: number;
  criticalAngleDeg: number;
  coreAxisAngleDeg: number;
  wallIncidentAngleDeg: number;
  claddingRefractedAngleDeg: number | null;
  isGuidedByTir: boolean;
  regime: OpticalFiberRegime;
  fiberLengthM: number;
  axialTransitTimeS: number;
  maxGuidedTransitTimeS: number;
  modalDispersionDelayS: number;
  rayPathLengthM: number;
  rayTransitTimeS: number;
  reflectionCount: number | null;
}

export type ImageNature = "real" | "virtual" | "at-infinity";
export type ImageOrientation = "inverted" | "upright" | "none";
export type ImageSizeClassification =
  | "diminished"
  | "same-size"
  | "magnified"
  | "infinite";

export interface PrincipalRayGeometry {
  id: "parallel-focus" | "optical-center" | "focus-parallel";
  incidentStart: Point2D;
  lensHit: Point2D;
  transmittedDirection: Point2D;
  virtualExtensionEnd: Point2D | null;
  frontFocusGuideStart: Point2D | null;
}

export interface ThinLensSolution {
  kind: "thin-lens";
  lensType: ThinLensType;
  focalLengthM: number;
  focalLengthMagnitudeM: number;
  opticalPowerD: number;
  objectDistanceM: number;
  objectHeightM: number;
  isImageAtInfinity: boolean;
  imageDistanceM: number | null;
  magnification: number | null;
  absMagnification: number | null;
  imageHeightM: number | null;
  objectImageSeparationM: number | null;
  imageNature: ImageNature;
  orientation: ImageOrientation;
  sizeClassification: ImageSizeClassification;
  principalRays: PrincipalRayGeometry[];
}

export interface ShmTimeSample {
  timeS: number;
  displacementM: number;
  velocityMs: number;
  accelerationMs2: number;
  kineticEnergyJ: number;
  potentialEnergyJ: number;
  totalEnergyJ: number;
}

export interface ShmDisplacementSample {
  displacementM: number;
  speedMs: number;
  accelerationMs2: number;
  kineticEnergyJ: number;
  potentialEnergyJ: number;
  totalEnergyJ: number;
}

export interface ShmCoreKinematics {
  angularFrequencyRadS: number;
  periodS: number;
  frequencyHz: number;
  energyOscillationFrequencyHz: number;
  energyOscillationPeriodS: number;
  amplitudeM: number;
  initialPhaseRad: number;
  phaseConvention: ShmPhaseConvention;
  massKg: number;
  effectiveSpringConstantNm: number;
  maxSpeedMs: number;
  maxAccelerationMs2: number;
  maxRestoringForceN: number;
  totalEnergyJ: number;
  equalEnergyDisplacementM: number;
  queryTimeS: number;
  displacementAtQueryTimeM: number;
  velocityAtQueryTimeMs: number;
  accelerationAtQueryTimeMs2: number;
  restoringForceAtQueryTimeN: number;
  kineticEnergyAtQueryTimeJ: number;
  potentialEnergyAtQueryTimeJ: number;
  queryDisplacementM: number;
  speedAtQueryDisplacementMs: number;
  positiveVelocityAtQueryDisplacementMs: number;
  negativeVelocityAtQueryDisplacementMs: number;
  accelerationAtQueryDisplacementMs2: number;
  kineticEnergyAtQueryDisplacementJ: number;
  potentialEnergyAtQueryDisplacementJ: number;
  timeSeries: ShmTimeSample[];
  displacementSeries: ShmDisplacementSample[];
}

export interface MassSpringShmSolution extends ShmCoreKinematics {
  kind: "mass-spring-shm";
  orientation: "horizontal" | "vertical";
  springConstantNm: number;
  gravityMs2: number;
  staticEquilibriumExtensionM: number;
}

export interface SimplePendulumShmSolution extends ShmCoreKinematics {
  kind: "simple-pendulum-shm";
  lengthM: number;
  gravityMs2: number;
  bobMassKg: number;
  maxAngleRad: number;
  maxAngleDeg: number;
  equilibriumTensionN: number;
  extremeTensionN: number;
}

export interface KinematicShmSolution extends ShmCoreKinematics {
  kind: "kinematic-shm";
}

export type OpticsShmSolution =
  | PlanarRefractionSolution
  | MultiLayerSlabSolution
  | OpticalFiberSolution
  | ThinLensSolution
  | MassSpringShmSolution
  | SimplePendulumShmSolution
  | KinematicShmSolution;

export interface OpticsShmValidationIssue {
  code: string;
  message: string;
  path: string;
}

export interface OpticsShmValidationResult {
  valid: boolean;
  issues: OpticsShmValidationIssue[];
}

export type OpticsShmArchetype =
  | "planar-refraction-subcritical"
  | "planar-refraction-critical"
  | "planar-refraction-tir"
  | "multi-layer-parallel-slab"
  | "multi-layer-internal-tir"
  | "optical-fiber-guided"
  | "optical-fiber-leakage"
  | "thin-lens-converging-real-diminished"
  | "thin-lens-converging-real-magnified"
  | "thin-lens-converging-virtual"
  | "thin-lens-converging-focal"
  | "thin-lens-diverging-virtual"
  | "mass-spring-horizontal-time"
  | "mass-spring-vertical-energy"
  | "simple-pendulum-shm"
  | "kinematic-shm-phase-portrait";

export interface OpticsShmGeneratorOptions {
  archetype?: OpticsShmArchetype;
  syllabus?: "ib" | "alevel" | "ncuk";
  level?: "SL" | "HL" | "AS" | "A2" | "Y12" | "Y13" | "IFY";
  hideTargets?: boolean;
}

export interface GeneratedOpticsShmScenario {
  seed: string | number;
  archetype: OpticsShmArchetype;
  familyGroupKey: string;
  spec: OpticsShmScenarioSpec;
  solution: OpticsShmSolution;
  hiddenQuantities: string[];
}
