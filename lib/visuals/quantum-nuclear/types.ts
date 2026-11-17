import {
  QuantumNuclearConstants,
  SpectralRegion,
  TimeUnit,
} from "./constants";

export type QuantumNuclearSyllabus = "ib" | "alevel" | "ncuk";
export type QuantumNuclearSyllabusLevel =
  | "SL"
  | "HL"
  | "Y12"
  | "Y13"
  | "IFY"
  | "IFY-S1"
  | "IFY-S2";

export interface QuantumNuclearBaseSpec {
  readonly id?: string;
  readonly title?: string;
  readonly syllabus?: QuantumNuclearSyllabus;
  readonly syllabusLevel?: QuantumNuclearSyllabusLevel;
  readonly constants?: Partial<QuantumNuclearConstants>;
  /**
   * Quantities whose numerical values MUST NEVER appear in student-facing SVG
   * text, callouts, axis intercepts, <title>, <desc>, aria-label, or attributes.
   */
  readonly hiddenQuantities?: readonly string[];
  /**
   * Quantities explicitly revealed as given in the question stem.
   * Derived solver outputs remain hidden unless listed here and absent from hiddenQuantities.
   */
  readonly givenQuantities?: readonly string[];
  /**
   * Optional visibility mode:
   * - "hide-listed" (default): input parameters are shown unless in hiddenQuantities;
   *   derived outputs are hidden unless in givenQuantities.
   * - "strict-allowlist": ONLY quantities explicitly in givenQuantities (and not in hiddenQuantities) are shown.
   */
  readonly visibilityMode?: "hide-listed" | "strict-allowlist";
  /**
   * Optional symbolic placeholder overrides for masked quantities (e.g. { "level:n=2": "E₂" }).
   */
  readonly placeholders?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// 1. Atomic Energy Levels & Spectra
// ---------------------------------------------------------------------------

export interface EnergyLevelInput {
  readonly id: string;
  readonly label: string;
  readonly energyValue: number;
  readonly energyUnit: "eV" | "J";
  readonly principalQuantumNumber?: number;
}

export interface EnergyTransitionInput {
  readonly id: string;
  readonly fromLevelId: string;
  readonly toLevelId: string;
  readonly label?: string;
}

export interface EnergyLevelsScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "energy-levels";
  readonly atomName?: string;
  readonly atomModel?: "custom" | "bohr-hydrogen";
  /** Atomic number Z for hydrogenic Bohr model (defaults to 1). */
  readonly atomicNumberZ?: number;
  /** Number of bound principal shells n = 1..maxPrincipalN when atomModel === "bohr-hydrogen". */
  readonly maxPrincipalN?: number;
  readonly includeContinuumZero?: boolean;
  readonly levels?: readonly EnergyLevelInput[];
  readonly transitions: readonly EnergyTransitionInput[];
  readonly initialBoundLevelId?: string;
  readonly continuumEnergyEv?: number;
  readonly displayEnergyUnit?: "eV" | "J";
  readonly showSpectralStrip?: boolean;
  readonly spectralStripMode?: "emission" | "absorption" | "auto";
}

export interface SolvedEnergyLevel {
  readonly id: string;
  readonly label: string;
  readonly energyEv: number;
  readonly energyJ: number;
  readonly principalQuantumNumber?: number;
  readonly isContinuum: boolean;
}

export interface SolvedEnergyTransition {
  readonly id: string;
  readonly label: string;
  readonly fromLevelId: string;
  readonly toLevelId: string;
  readonly process: "emission" | "absorption";
  readonly initialEnergyEv: number;
  readonly finalEnergyEv: number;
  readonly signedDeltaEnergyEv: number;
  readonly deltaEnergyEv: number;
  readonly photonEnergyJ: number;
  readonly frequencyHz: number;
  readonly wavelengthM: number;
  readonly wavelengthNm: number;
  readonly photonMomentumNs: number;
  readonly spectralRegion: SpectralRegion;
  readonly hydrogenSeries: string | null;
}

export interface EnergyLevelsSolution {
  readonly kind: "energy-levels";
  readonly atomName: string;
  readonly levels: readonly SolvedEnergyLevel[];
  readonly groundStateId: string;
  readonly groundStateEnergyEv: number;
  readonly groundStateEnergyJ: number;
  readonly referenceBoundLevelId: string;
  readonly continuumEnergyEv: number;
  readonly ionizationEnergyEv: number;
  readonly ionizationEnergyJ: number;
  readonly ionizationFrequencyHz: number;
  readonly ionizationWavelengthM: number;
  readonly ionizationWavelengthNm: number;
  readonly transitions: readonly SolvedEnergyTransition[];
}

// ---------------------------------------------------------------------------
// 2. Photoelectric Effect
// ---------------------------------------------------------------------------

export type PhotoelectricPlotMode =
  | "ek-ev-vs-f"
  | "ek-j-vs-f"
  | "stopping-potential-vs-f";

export interface PhotoelectricScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "photoelectric-effect";
  readonly metalName?: string;
  readonly workFunctionEv?: number;
  readonly workFunctionJ?: number;
  readonly incidentFrequencyHz?: number;
  readonly incidentWavelengthNm?: number;
  readonly incidentPhotonEnergyEv?: number;
  readonly comparisonMetalName?: string;
  readonly comparisonWorkFunctionEv?: number;
  readonly plotMode?: PhotoelectricPlotMode;
  readonly showExtrapolation?: boolean;
  readonly showOperatingPoint?: boolean;
  readonly schematicAxes?: boolean;
}

export interface PhotoelectricSolution {
  readonly kind: "photoelectric-effect";
  readonly metalName: string;
  readonly workFunctionEv: number;
  readonly workFunctionJ: number;
  readonly thresholdFrequencyHz: number;
  readonly thresholdWavelengthM: number;
  readonly thresholdWavelengthNm: number;
  readonly incidentFrequencyHz: number;
  readonly incidentWavelengthM: number;
  readonly incidentWavelengthNm: number;
  readonly photonEnergyEv: number;
  readonly photonEnergyJ: number;
  readonly emitsPhotoelectrons: boolean;
  readonly signedEnergyBalanceEv: number;
  readonly maxKineticEnergyEv: number;
  readonly maxKineticEnergyJ: number;
  readonly stoppingPotentialV: number;
  readonly maxElectronSpeedMs: number;
  readonly plotMode: PhotoelectricPlotMode;
  readonly graphSlope: number;
  readonly graphSlopeUnit: "eV s" | "J s" | "V s";
  readonly yIntercept: number;
  readonly comparison?: {
    readonly metalName: string;
    readonly workFunctionEv: number;
    readonly thresholdFrequencyHz: number;
    readonly yIntercept: number;
  };
}

// ---------------------------------------------------------------------------
// 3. Matter Waves & Electron Diffraction
// ---------------------------------------------------------------------------

export type MatterWaveParticleKind =
  | "electron"
  | "proton"
  | "neutron"
  | "alpha"
  | "custom";

export interface MatterWavesScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "matter-waves";
  readonly particle: MatterWaveParticleKind;
  readonly particleLabel?: string;
  readonly massKg?: number;
  readonly chargeMagnitudeC?: number;
  readonly acceleratingVoltageV?: number;
  readonly kineticEnergyEv?: number;
  readonly kineticEnergyJ?: number;
  readonly speedMs?: number;
  readonly momentumNs?: number;
  readonly latticeSpacingM?: number;
  readonly screenDistanceM?: number;
}

export interface MatterWavesSolution {
  readonly kind: "matter-waves";
  readonly particle: MatterWaveParticleKind;
  readonly particleLabel: string;
  readonly massKg: number;
  readonly chargeMagnitudeC: number;
  readonly acceleratingVoltageV: number | null;
  readonly kineticEnergyJ: number;
  readonly kineticEnergyEv: number;
  readonly speedMs: number;
  readonly momentumNs: number;
  readonly deBroglieWavelengthM: number;
  readonly deBroglieWavelengthNm: number;
  readonly deBroglieWavelengthPm: number;
  readonly diffraction?: {
    readonly latticeSpacingM: number;
    readonly screenDistanceM: number | null;
    readonly sinTheta: number;
    readonly firstOrderAngleRad: number;
    readonly firstOrderAngleDeg: number;
    readonly ringRadiusM: number | null;
  };
}

// ---------------------------------------------------------------------------
// 4. Radioactive Exponential Decay & Background Radiation
// ---------------------------------------------------------------------------

export interface RadioactiveDecayScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "radioactive-decay";
  readonly nuclideLabel?: string;
  readonly timeUnit?: TimeUnit;
  readonly halfLife?: number;
  readonly decayConstant?: number;
  readonly elapsedTime: number;
  readonly initialNuclei?: number;
  readonly initialActivityBq?: number;
  readonly initialNetCountRate?: number;
  readonly initialTotalCountRate?: number;
  readonly backgroundCountRate?: number;
  readonly countRateUnitLabel?: string;
  readonly plotQuantity?: "nuclei" | "activity" | "count-rate";
  readonly plotSpanHalfLives?: number;
  readonly showHalfLifeGuides?: boolean;
  readonly schematicAxes?: boolean;
}

export interface RadioactiveDecaySolution {
  readonly kind: "radioactive-decay";
  readonly nuclideLabel: string;
  readonly timeUnit: TimeUnit;
  readonly halfLife: number;
  readonly halfLifeS: number;
  readonly decayConstant: number;
  readonly decayConstantPerS: number;
  readonly elapsedTime: number;
  readonly elapsedTimeS: number;
  readonly numberOfHalfLives: number;
  readonly remainingFraction: number;
  readonly decayedFraction: number;
  readonly initialNuclei: number | null;
  readonly remainingNuclei: number | null;
  readonly decayedNuclei: number | null;
  readonly initialActivityBq: number | null;
  readonly remainingActivityBq: number | null;
  readonly backgroundCountRate: number;
  readonly initialNetCountRate: number | null;
  readonly initialTotalCountRate: number | null;
  readonly remainingNetCountRate: number | null;
  readonly remainingTotalCountRate: number | null;
}

// ---------------------------------------------------------------------------
// 5. Nuclear Decay Equations & N-Z / A-Z Stability Chart
// ---------------------------------------------------------------------------

export type NuclearDecayMode =
  | "alpha"
  | "beta-minus"
  | "beta-plus"
  | "gamma"
  | "electron-capture"
  | "neutron-emission";

export interface NuclideSpec {
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly symbol?: string;
}

export interface DecayStepInput {
  readonly id: string;
  readonly mode: NuclearDecayMode;
  readonly label?: string;
}

export interface NuclearDecayChainScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "nuclear-decay-chain";
  readonly parentNuclide: NuclideSpec;
  readonly steps: readonly DecayStepInput[];
  readonly chartAxes?: "N-vs-Z" | "A-vs-Z";
  readonly showStabilityLine?: boolean;
}

export interface SolvedChainNuclide {
  readonly stepIndex: number;
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly neutronNumberN: number;
  readonly symbol: string;
  readonly notation: string;
}

export interface SolvedDecayStep {
  readonly id: string;
  readonly mode: NuclearDecayMode;
  readonly parent: SolvedChainNuclide;
  readonly daughter: SolvedChainNuclide;
  readonly deltaA: number;
  readonly deltaZ: number;
  readonly deltaN: number;
  readonly emittedParticles: readonly string[];
  readonly equationText: string;
  readonly conservesNucleonNumber: true;
  readonly conservesCharge: true;
}

export interface NuclearDecayChainSolution {
  readonly kind: "nuclear-decay-chain";
  readonly nuclides: readonly SolvedChainNuclide[];
  readonly steps: readonly SolvedDecayStep[];
  readonly totalAlphaCount: number;
  readonly totalBetaMinusCount: number;
  readonly totalBetaPlusCount: number;
  readonly totalGammaCount: number;
  readonly netDeltaA: number;
  readonly netDeltaZ: number;
  readonly netDeltaN: number;
}

// ---------------------------------------------------------------------------
// 6. Nuclear Mass Defect, Binding Energy & Fission/Fusion Q-Value
// ---------------------------------------------------------------------------

export interface ReactionSpeciesInput {
  readonly id: string;
  readonly symbol: string;
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly count?: number;
  readonly massU?: number;
  readonly bindingEnergyPerNucleonMeV?: number;
}

export interface SingleNuclideBindingSpec extends QuantumNuclearBaseSpec {
  readonly kind: "nuclear-binding";
  readonly calculationMode: "single-nuclide";
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly symbol?: string;
  readonly nuclearMassU?: number;
  readonly atomicMassU?: number;
  readonly diagramStyle?: "binding-curve" | "mass-energy-balance";
}

export interface NuclearReactionBindingSpec extends QuantumNuclearBaseSpec {
  readonly kind: "nuclear-binding";
  readonly calculationMode: "reaction";
  readonly reactionType: "fission" | "fusion" | "decay" | "transmutation";
  readonly reactants: readonly ReactionSpeciesInput[];
  readonly products: readonly ReactionSpeciesInput[];
  readonly diagramStyle?: "binding-curve" | "mass-energy-balance";
}

export type NuclearBindingScenarioSpec =
  | SingleNuclideBindingSpec
  | NuclearReactionBindingSpec;

export interface SingleNuclideBindingSolution {
  readonly kind: "nuclear-binding";
  readonly calculationMode: "single-nuclide";
  readonly symbol: string;
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly neutronNumberN: number;
  readonly nuclearMassU: number;
  readonly constituentMassU: number;
  readonly massDefectU: number;
  readonly massDefectKg: number;
  readonly bindingEnergyMeV: number;
  readonly bindingEnergyJ: number;
  readonly bindingEnergyPerNucleonMeV: number;
  readonly bindingEnergyPerNucleonJ: number;
}

export interface NuclearReactionBindingSolution {
  readonly kind: "nuclear-binding";
  readonly calculationMode: "reaction";
  readonly reactionType: "fission" | "fusion" | "decay" | "transmutation";
  readonly equationText: string;
  readonly totalReactantA: number;
  readonly totalProductA: number;
  readonly totalReactantZ: number;
  readonly totalProductZ: number;
  readonly method: "rest-mass" | "binding-energy";
  readonly massDifferenceU: number;
  readonly massDifferenceKg: number;
  readonly qValueMeV: number;
  readonly qValueJ: number;
  readonly isExothermic: boolean;
  readonly reactantTotalBindingMeV: number | null;
  readonly productTotalBindingMeV: number | null;
}

export type NuclearBindingSolution =
  | SingleNuclideBindingSolution
  | NuclearReactionBindingSolution;

// ---------------------------------------------------------------------------
// 7. Rutherford Closest Approach & Nuclear Radius
// ---------------------------------------------------------------------------

export interface RutherfordScatteringScenarioSpec
  extends QuantumNuclearBaseSpec {
  readonly kind: "rutherford-scattering";
  readonly projectileLabel?: string;
  readonly projectileChargeZ: number;
  readonly targetSymbol?: string;
  readonly targetChargeZ: number;
  readonly targetMassNumberA: number;
  readonly kineticEnergyMeV?: number;
  readonly kineticEnergyJ?: number;
  readonly showDeflectedPaths?: boolean;
}

export interface RutherfordScatteringSolution {
  readonly kind: "rutherford-scattering";
  readonly projectileLabel: string;
  readonly projectileChargeZ: number;
  readonly projectileChargeC: number;
  readonly targetSymbol: string;
  readonly targetChargeZ: number;
  readonly targetChargeC: number;
  readonly targetMassNumberA: number;
  readonly initialKineticEnergyMeV: number;
  readonly initialKineticEnergyJ: number;
  readonly closestApproachM: number;
  readonly closestApproachFm: number;
  readonly estimatedNuclearRadiusM: number;
  readonly estimatedNuclearRadiusFm: number;
  readonly nuclearDensityKgM3: number;
  readonly penetratesStrongForceRange: boolean;
}

// ---------------------------------------------------------------------------
// 8. Special Relativity & Minkowski Spacetime Diagrams
// ---------------------------------------------------------------------------

export interface SpacetimeEventInput {
  readonly id: string;
  readonly label: string;
  readonly xLightSeconds: number;
  readonly ctLightSeconds: number;
  readonly showProjections?: boolean;
}

export interface MinkowskiWorldlineInput {
  readonly id: string;
  readonly label: string;
  readonly beta: number;
  readonly x0LightSeconds?: number;
  readonly isPhoton?: boolean;
}

export interface SpecialRelativityScenarioSpec extends QuantumNuclearBaseSpec {
  readonly kind: "special-relativity";
  /** Relative frame speed v/c in (-1, 1); provide either beta or frameSpeedMs. */
  readonly beta?: number;
  readonly frameSpeedMs?: number;
  readonly properTimeS?: number;
  readonly properLengthM?: number;
  /** Object velocity u/c measured in unprimed frame S, in [-1, 1]. */
  readonly objectVelocityFractionC?: number;
  /** Object velocity u'/c measured in primed frame S', in [-1, 1]. */
  readonly objectVelocityPrimeFractionC?: number;
  readonly events?: readonly SpacetimeEventInput[];
  readonly worldlines?: readonly MinkowskiWorldlineInput[];
  readonly domainLightSeconds?: number;
  readonly symmetricTimeAxis?: boolean;
  readonly showLightCone?: boolean;
  readonly showPrimedAxes?: boolean;
  readonly schematicAxes?: boolean;
}

export interface TransformedSpacetimeEvent {
  readonly id: string;
  readonly label: string;
  readonly xLightSeconds: number;
  readonly ctLightSeconds: number;
  readonly xPrimeLightSeconds: number;
  readonly ctPrimeLightSeconds: number;
  readonly invariantIntervalSquaredLs2: number;
  readonly causalClassification: "timelike" | "lightlike" | "spacelike";
}

export interface SpecialRelativitySolution {
  readonly kind: "special-relativity";
  readonly beta: number;
  readonly frameSpeedMs: number;
  readonly lorentzFactor: number;
  readonly minkowskiAxisAngleRad: number;
  readonly minkowskiAxisAngleDeg: number;
  readonly properTimeS: number | null;
  readonly dilatedTimeS: number | null;
  readonly properLengthM: number | null;
  readonly contractedLengthM: number | null;
  readonly objectVelocityFractionC: number | null;
  readonly objectVelocityMs: number | null;
  readonly transformedVelocityFractionC: number | null;
  readonly transformedVelocityMs: number | null;
  readonly events: readonly TransformedSpacetimeEvent[];
}

// ---------------------------------------------------------------------------
// Discriminated Unions & Validation / Render Contracts
// ---------------------------------------------------------------------------

export type QuantumNuclearScenarioSpec =
  | EnergyLevelsScenarioSpec
  | PhotoelectricScenarioSpec
  | MatterWavesScenarioSpec
  | RadioactiveDecayScenarioSpec
  | NuclearDecayChainScenarioSpec
  | NuclearBindingScenarioSpec
  | RutherfordScatteringScenarioSpec
  | SpecialRelativityScenarioSpec;

export type QuantumNuclearScenarioKind = QuantumNuclearScenarioSpec["kind"];

export type QuantumNuclearSolution =
  | EnergyLevelsSolution
  | PhotoelectricSolution
  | MatterWavesSolution
  | RadioactiveDecaySolution
  | NuclearDecayChainSolution
  | NuclearBindingSolution
  | RutherfordScatteringSolution
  | SpecialRelativitySolution;

export interface QuantumNuclearValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface QuantumNuclearValidationResult {
  readonly valid: boolean;
  readonly issues: readonly QuantumNuclearValidationIssue[];
}

export interface QuantumNuclearRenderOptions {
  readonly width?: number;
  readonly height?: number;
  readonly hiddenQuantities?: readonly string[];
  readonly givenQuantities?: readonly string[];
  readonly visibilityMode?: "hide-listed" | "strict-allowlist";
  readonly placeholders?: Readonly<Record<string, string>>;
}

export interface QuantumNuclearGeneratorOptions {
  readonly kind?: QuantumNuclearScenarioKind;
  readonly syllabus?: QuantumNuclearSyllabus;
  readonly syllabusLevel?: QuantumNuclearSyllabusLevel;
  readonly hideTargetQuantities?: boolean;
}

export interface GeneratedQuantumNuclearPackage<
  S extends QuantumNuclearScenarioSpec = QuantumNuclearScenarioSpec,
> {
  readonly seed: string;
  readonly spec: S;
  readonly validation: QuantumNuclearValidationResult;
  readonly solution: QuantumNuclearSolution;
  readonly svg: string;
}
