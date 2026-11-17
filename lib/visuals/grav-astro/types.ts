import { Point2D } from "@/lib/visuals/types";

export const GRAV_ASTRO_SCENARIO_KINDS = [
  "conical-pendulum",
  "flat-curve",
  "banked-curve",
  "vertical-circle",
  "planetary-field-potential",
  "circular-orbit-energy",
  "two-body-null-point",
  "stellar-radiation",
  "hr-diagram",
  "stellar-parallax",
  "cosmological-redshift",
] as const;

export type GravAstroScenarioKind = (typeof GRAV_ASTRO_SCENARIO_KINDS)[number];

export interface GravAstroVisibilitySpec {
  /**
   * Quantity keys whose numeric values (and unit-converted companions) MUST NEVER
   * appear anywhere in student-facing SVG text, <title>, <desc>, aria-label, or attributes.
   */
  hiddenQuantities?: readonly string[];
  /**
   * Explicit allowlist of quantity keys permitted to show numeric values when
   * labelMode is "allowlist", or additional derived quantities to show in "blacklist" mode.
   */
  visibleQuantities?: readonly string[];
  /**
   * - "blacklist" (default): shows input givens not in hiddenQuantities; derived quantities
   *   are symbolic unless listed in visibleQuantities or showDerivedValues is true.
   * - "allowlist": ONLY quantities in visibleQuantities (and not in hiddenQuantities) show values.
   * - "symbolic-only": all labels render symbols only with zero numeric values.
   */
  labelMode?: "blacklist" | "allowlist" | "symbolic-only";
  /**
   * When true in "blacklist" mode, derived quantities not in hiddenQuantities also show values.
   * Defaults to false so student diagrams only show given inputs by default.
   */
  showDerivedValues?: boolean;
  /**
   * Whether hidden quantities still show their algebraic symbol (e.g. "T", "v", "x₀")
   * instead of omitting the text label completely. Defaults to true.
   */
  showSymbolsForHidden?: boolean;
  /**
   * Optional custom label strings keyed by quantity key. Validated to prevent leaking hidden values.
   */
  customLabels?: Readonly<Record<string, string>>;
}

export interface GravAstroScenarioBase {
  id?: string;
  title?: string;
  hiddenQuantities?: readonly string[];
  visibility?: GravAstroVisibilitySpec;
}

export interface ConicalPendulumScenario extends GravAstroScenarioBase {
  kind: "conical-pendulum";
  massKg: number;
  stringLengthM: number;
  semiVerticalAngleDeg: number;
  gravityMs2?: number;
}

export interface FlatCurveScenario extends GravAstroScenarioBase {
  kind: "flat-curve";
  massKg: number;
  radiusM: number;
  speedMs: number;
  staticFrictionCoeff: number;
  gravityMs2?: number;
  requireNoSkid?: boolean;
}

export type BankedFrictionDirection = "down-slope" | "up-slope" | "none";

export interface BankedCurveScenario extends GravAstroScenarioBase {
  kind: "banked-curve";
  massKg: number;
  radiusM: number;
  bankAngleDeg: number;
  staticFrictionCoeff: number;
  /** Vehicle speed in m s⁻¹. Defaults to the frictionless design speed sqrt(g r tan θ). */
  speedMs?: number;
  gravityMs2?: number;
  requireNoSkid?: boolean;
}

export type VerticalCircleMotionMode = "uniform" | "energy-conserving";
export type VerticalCircleConstraintKind =
  | "string"
  | "inside-track"
  | "rigid-rod"
  | "over-crest";
export type VerticalCirclePosition = "top" | "bottom";

export interface VerticalCircleScenario extends GravAstroScenarioBase {
  kind: "vertical-circle";
  massKg: number;
  radiusM: number;
  motionMode: VerticalCircleMotionMode;
  constraintKind?: VerticalCircleConstraintKind;
  referencePosition?: VerticalCirclePosition;
  referenceSpeedMs: number;
  gravityMs2?: number;
}

export interface PlanetaryFieldPotentialScenario extends GravAstroScenarioBase {
  kind: "planetary-field-potential";
  centralMassKg: number;
  planetRadiusM: number;
  probeRadiusM: number;
  testMassKg?: number;
  gravitationalConstant?: number;
  plotQuantity?: "field-strength" | "potential";
}

export type OrbitDiagramVariant =
  | "energy-curves"
  | "orbit-schematic"
  | "split-orbit-energy";

export interface CircularOrbitEnergyScenario extends GravAstroScenarioBase {
  kind: "circular-orbit-energy";
  centralMassKg: number;
  centralRadiusM: number;
  satelliteMassKg: number;
  orbitRadiusM: number;
  targetOrbitRadiusM?: number;
  gravitationalConstant?: number;
  diagramVariant?: OrbitDiagramVariant;
}

export interface TwoBodyNullPointScenario extends GravAstroScenarioBase {
  kind: "two-body-null-point";
  primaryMassKg: number;
  primaryRadiusM: number;
  secondaryMassKg: number;
  secondaryRadiusM: number;
  separationM: number;
  probeDistanceFromPrimaryM?: number;
  testMassKg?: number;
  gravitationalConstant?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export interface ComparisonStarSpec {
  label?: string;
  surfaceTempK: number;
  stellarRadiusM: number;
}

export interface StellarRadiationScenario extends GravAstroScenarioBase {
  kind: "stellar-radiation";
  surfaceTempK: number;
  stellarRadiusM: number;
  distanceM: number;
  wienConstantMK?: number;
  stefanBoltzmannWm2K4?: number;
  diagramVariant?: "blackbody-curve" | "inverse-square";
  comparisonStar?: ComparisonStarSpec;
}

export type HrRegion =
  | "main-sequence"
  | "red-giant"
  | "supergiant"
  | "white-dwarf";

export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

export interface HrStarSpec {
  id: string;
  label: string;
  surfaceTempK: number;
  luminositySolar: number;
  region?: HrRegion;
}

export interface HrDiagramScenario extends GravAstroScenarioBase {
  kind: "hr-diagram";
  stars: readonly HrStarSpec[];
  targetStarId?: string;
  showEvolutionTrack?: boolean;
  showRadiusIsolines?: boolean;
  hideRegionNames?: boolean;
  stefanBoltzmannWm2K4?: number;
  wienConstantMK?: number;
}

export interface StellarParallaxScenario extends GravAstroScenarioBase {
  kind: "stellar-parallax";
  parallaxArcsec: number;
  baselineAu?: number;
  stellarLuminosityW?: number;
  parsecM?: number;
}

export interface CosmologicalRedshiftScenario extends GravAstroScenarioBase {
  kind: "cosmological-redshift";
  restWavelengthM: number;
  observedWavelengthM: number;
  hubbleConstantKmSMpc?: number;
  speedOfLightMs?: number;
  parsecM?: number;
  lowRedshiftApprox?: boolean;
  diagramVariant?: "spectral-shift" | "hubble-plot";
}

export type GravAstroScenario =
  | ConicalPendulumScenario
  | FlatCurveScenario
  | BankedCurveScenario
  | VerticalCircleScenario
  | PlanetaryFieldPotentialScenario
  | CircularOrbitEnergyScenario
  | TwoBodyNullPointScenario
  | StellarRadiationScenario
  | HrDiagramScenario
  | StellarParallaxScenario
  | CosmologicalRedshiftScenario;

export interface SolvedHrStar {
  id: string;
  label: string;
  surfaceTempK: number;
  luminositySolar: number;
  luminosityW: number;
  stellarRadiusM: number;
  radiusSolar: number;
  peakWavelengthM: number;
  peakWavelengthNm: number;
  spectralClass: SpectralClass;
  region: HrRegion;
  estimatedMainSequenceMassSolar: number;
  estimatedMainSequenceLifetimeSolar: number;
}

export interface GravAstroSolutionBase<K extends GravAstroScenarioKind> {
  kind: K;
  /** Flat map of all finite solved numeric quantities (in SI and standard syllabus units). */
  quantities: Record<string, number>;
  /** Symbolic / categorical classifications (e.g. frictionDirection, region, spectralClass). */
  classifications: Record<string, string | boolean>;
  /** Sampled exact physical curves for Cartesian / log-log diagram rendering. */
  curves?: Record<string, readonly Point2D[]>;
}

export interface ConicalPendulumSolution
  extends GravAstroSolutionBase<"conical-pendulum"> {
  details: {
    orbitRadiusM: number;
    verticalHeightM: number;
    weightN: number;
    tensionN: number;
    centripetalForceN: number;
    centripetalAccelMs2: number;
    linearSpeedMs: number;
    angularSpeedRadS: number;
    periodS: number;
    frequencyHz: number;
  };
}

export interface FlatCurveSolution extends GravAstroSolutionBase<"flat-curve"> {
  details: {
    weightN: number;
    normalForceN: number;
    centripetalAccelMs2: number;
    angularSpeedRadS: number;
    periodS: number;
    centripetalForceN: number;
    maxStaticFrictionN: number;
    frictionForceN: number;
    maxSafeSpeedMs: number;
    minRequiredFrictionCoeff: number;
    skids: boolean;
  };
}

export interface BankedCurveSolution
  extends GravAstroSolutionBase<"banked-curve"> {
  details: {
    idealSpeedMs: number;
    actualSpeedMs: number;
    weightN: number;
    normalForceN: number;
    centripetalAccelMs2: number;
    angularSpeedRadS: number;
    centripetalForceN: number;
    signedSlopeFrictionN: number;
    frictionForceN: number;
    maxStaticFrictionN: number;
    minSafeSpeedMs: number;
    maxSafeSpeedMs: number | null;
    frictionDirection: BankedFrictionDirection;
    withinSafeSpeedRange: boolean;
  };
}

export interface VerticalCircleSolution
  extends GravAstroSolutionBase<"vertical-circle"> {
  details: {
    speedTopMs: number;
    speedBottomMs: number;
    minSpeedTopMs: number;
    minSpeedBottomLoopMs: number;
    centripetalAccelTopMs2: number;
    centripetalAccelBottomMs2: number;
    angularSpeedTopRadS: number;
    angularSpeedBottomRadS: number;
    centripetalForceTopN: number;
    centripetalForceBottomN: number;
    supportForceTopN: number;
    supportForceBottomN: number;
    weightN: number;
    topForceState: "tension" | "normal" | "compression" | "zero";
  };
}

export interface PlanetaryFieldPotentialSolution
  extends GravAstroSolutionBase<"planetary-field-potential"> {
  details: {
    region: "interior" | "surface" | "exterior";
    surfaceFieldNkg: number;
    surfacePotentialJkg: number;
    surfaceEscapeSpeedMs: number;
    meanDensityKgM3: number;
    enclosedMassKg: number;
    fieldStrengthNkg: number;
    gravitationalPotentialJkg: number;
    escapeSpeedMs: number;
    gravitationalForceN?: number;
    potentialEnergyJ?: number;
  };
}

export interface CircularOrbitEnergySolution
  extends GravAstroSolutionBase<"circular-orbit-energy"> {
  details: {
    altitudeM: number;
    fieldStrengthNkg: number;
    gravitationalForceN: number;
    orbitalSpeedMs: number;
    escapeSpeedMs: number;
    angularSpeedRadS: number;
    orbitalPeriodS: number;
    keplerConstantS2M3: number;
    gravitationalPotentialJkg: number;
    kineticEnergyJ: number;
    potentialEnergyJ: number;
    totalEnergyJ: number;
    bindingEnergyJ: number;
    transfer?: {
      targetOrbitRadiusM: number;
      targetOrbitalSpeedMs: number;
      targetOrbitalPeriodS: number;
      targetKineticEnergyJ: number;
      targetPotentialEnergyJ: number;
      targetTotalEnergyJ: number;
      transferDeltaTotalEnergyJ: number;
      transferDeltaPotentialEnergyJ: number;
      transferDeltaKineticEnergyJ: number;
      hohmannSemiMajorAxisM: number;
      hohmannTransferTimeS: number;
      hohmannDeltaV1Ms: number;
      hohmannDeltaV2Ms: number;
    };
  };
}

export interface TwoBodyNullPointSolution
  extends GravAstroSolutionBase<"two-body-null-point"> {
  details: {
    nullPointFromPrimaryM: number;
    nullPointFromSecondaryM: number;
    nullPointFraction: number;
    potentialAtNullPointJkg: number;
    potentialAtPrimarySurfaceJkg: number;
    potentialAtSecondarySurfaceJkg: number;
    potentialBarrierFromPrimaryJkg: number;
    minTransferSpeedFromPrimaryMs: number;
    probeFieldXMs2?: number;
    probeFieldMagnitudeNkg?: number;
    probePotentialJkg?: number;
    probePotentialEnergyJ?: number;
    probeForceMagnitudeN?: number;
  };
}

export interface StellarRadiationSolution
  extends GravAstroSolutionBase<"stellar-radiation"> {
  details: {
    peakWavelengthM: number;
    peakWavelengthNm: number;
    surfaceFluxWm2: number;
    surfaceAreaM2: number;
    luminosityW: number;
    luminositySolar: number;
    radiusSolar: number;
    apparentBrightnessWm2: number;
    distancePc: number;
    comparison?: {
      peakWavelengthM: number;
      peakWavelengthNm: number;
      luminosityW: number;
      luminosityRatio: number;
      radiusRatio: number;
      tempRatio: number;
    };
  };
}

export interface HrDiagramSolution extends GravAstroSolutionBase<"hr-diagram"> {
  details: {
    targetStar: SolvedHrStar;
    stars: readonly SolvedHrStar[];
  };
}

export interface StellarParallaxSolution
  extends GravAstroSolutionBase<"stellar-parallax"> {
  details: {
    parallaxArcsec: number;
    parallaxMilliarcsec: number;
    parallaxDegrees: number;
    parallaxRadians: number;
    distancePc: number;
    distanceLy: number;
    distanceAu: number;
    distanceM: number;
    apparentBrightnessWm2?: number;
  };
}

export interface CosmologicalRedshiftSolution
  extends GravAstroSolutionBase<"cosmological-redshift"> {
  details: {
    restWavelengthM: number;
    observedWavelengthM: number;
    deltaWavelengthM: number;
    restWavelengthNm: number;
    observedWavelengthNm: number;
    deltaWavelengthNm: number;
    redshiftZ: number;
    scaleFactorRatioEmissionToNow: number;
    scaleFactorRatioNowToEmission: number;
    recessionSpeedMs: number;
    recessionSpeedKmS: number;
    relativisticSpeedMs: number;
    distanceMpc: number;
    distancePc: number;
    distanceLy: number;
    distanceM: number;
    hubbleConstantSiSInv: number;
    hubbleTimeS: number;
    hubbleTimeGyr: number;
  };
}

export type GravAstroSolution =
  | ConicalPendulumSolution
  | FlatCurveSolution
  | BankedCurveSolution
  | VerticalCircleSolution
  | PlanetaryFieldPotentialSolution
  | CircularOrbitEnergySolution
  | TwoBodyNullPointSolution
  | StellarRadiationSolution
  | HrDiagramSolution
  | StellarParallaxSolution
  | CosmologicalRedshiftSolution;

export interface GravAstroRenderOptions {
  width?: number;
  height?: number;
  /** Optional additional hidden quantities merged with scenario visibility rules. */
  hiddenQuantities?: readonly string[];
}
