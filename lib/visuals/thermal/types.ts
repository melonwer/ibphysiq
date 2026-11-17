/**
 * Strict TypeScript domain models for Thermal Physics, Ideal Gases & Thermodynamics
 * (IB SL/HL, UK A-Level, and NCUK IFY Physics).
 */

export const THERMAL_SCHEMA_VERSION = "thermal-spec/1.0.0" as const;

export type ThermalScenarioKind =
  | "thermodynamic-process"
  | "carnot-cycle"
  | "phase-change-curve"
  | "calorimetry-mixing"
  | "kinetic-theory"
  | "thermal-radiation";

export type ThermalDiagramPlane = "PV" | "PT" | "VT";

export type ThermalProcessKind =
  | "isobaric"
  | "isochoric"
  | "isothermal"
  | "adiabatic";

export type MatterPhase = "solid" | "liquid" | "gas";

export type PhaseStageKind =
  | "solid"
  | "melting"
  | "liquid"
  | "boiling"
  | "gas"
  | "condensing"
  | "freezing";

export interface ThermalValidationIssue {
  code: string;
  message: string;
  path: string;
}

export interface ThermalValidationResult {
  valid: boolean;
  issues: ThermalValidationIssue[];
}

export interface ThermalRenderOptions {
  width?: number;
  height?: number;
  mode?: "student-safe" | "teacher-complete";
  /**
   * Additional quantity identifiers that MUST NEVER leak numerically in the
   * rendered SVG (merged with `spec.hiddenQuantities`).
   */
  hiddenQuantities?: readonly string[];
  /**
   * Optional allowlist of quantity identifiers explicitly permitted to be
   * shown as numeric callouts (merged with `spec.visibleQuantities`).
   */
  visibleQuantities?: readonly string[];
}

export interface ThermalVisibilityMixin {
  /**
   * Quantities that are unknown targets in the question and MUST NEVER leak
   * in student-facing SVG text, callouts, axis ticks, <title>, or aria-label.
   */
  hiddenQuantities?: readonly string[];
  /**
   * Optional allowlist of quantity identifiers explicitly permitted to be
   * shown as numeric callouts in student-facing diagrams.
   */
  visibleQuantities?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* 1. Thermodynamic Processes & Closed Cycles (P-V, P-T, V-T)                 */
/* -------------------------------------------------------------------------- */

export interface ThermalInitialStateSpec {
  stateId?: string;
  label?: string;
  pressurePa?: number;
  volumeM3?: number;
  temperatureK?: number;
}

export interface ThermalProcessStepSpec {
  process: ThermalProcessKind;
  toStateId?: string;
  toLabel?: string;
  targetPressurePa?: number;
  targetVolumeM3?: number;
  targetTemperatureK?: number;
  /** When true on the final step, closes the cycle onto initialState. */
  closeToInitial?: boolean;
}

export interface ThermodynamicProcessScenarioSpec
  extends ThermalVisibilityMixin {
  kind: "thermodynamic-process";
  id?: string;
  title?: string;
  moles?: number;
  particleCount?: number;
  gasConstantR?: number;
  boltzmannConstant?: number;
  initialState: ThermalInitialStateSpec;
  steps: readonly ThermalProcessStepSpec[];
  isClosedCycle?: boolean;
  diagramPlane?: ThermalDiagramPlane;
  showIsotherms?: boolean;
  showIsothermLabels?: boolean;
  showShadedWork?: boolean;
  showGrid?: boolean;
}

export interface CarnotCycleScenarioSpec extends ThermalVisibilityMixin {
  kind: "carnot-cycle";
  id?: string;
  title?: string;
  moles?: number;
  particleCount?: number;
  gasConstantR?: number;
  boltzmannConstant?: number;
  hotTemperatureK: number;
  coldTemperatureK: number;
  initialVolumeM3: number;
  isothermalExpansionVolumeM3: number;
  cycleDirection?: "heat-engine" | "refrigerator";
  diagramPlane?: ThermalDiagramPlane;
  showIsotherms?: boolean;
  showIsothermLabels?: boolean;
  showShadedWork?: boolean;
  showGrid?: boolean;
}

export interface SolvedGasState {
  stateIndex: number;
  stateId: string;
  label: string;
  pressurePa: number;
  volumeM3: number;
  temperatureK: number;
  internalEnergyJ: number;
}

export interface SolvedProcessLeg {
  legIndex: number;
  fromStateId: string;
  toStateId: string;
  fromLabel: string;
  toLabel: string;
  process: ThermalProcessKind;
  /** Work W done BY the gas (J); satisfies deltaUJ = heatJ - workJ. */
  workJ: number;
  /** Work W_on = -W done ON the gas (J). */
  workOnGasJ: number;
  /** Thermal energy Q supplied TO the gas (J); negative when rejected. */
  heatJ: number;
  /** Change in internal energy Delta U = U_to - U_from (J). */
  deltaUJ: number;
  /** Reversible entropy change Delta S (J K^-1) across the leg. */
  entropyChangeJK: number;
  /** Exact Delta S = Q / T (J K^-1) for isothermal steps; null otherwise. */
  isothermalEntropyChangeJK: number | null;
}

export interface ThermodynamicCycleMetrics {
  moles: number;
  particleCount: number;
  thermalCapacityConstantJK: number;
  adiabaticGamma: number;
  states: SolvedGasState[];
  legs: SolvedProcessLeg[];
  isClosedCycle: boolean;
  netWorkJ: number;
  netHeatJ: number;
  totalDeltaUJ: number;
  totalEntropyChangeJK: number;
  heatInputJ: number;
  heatRejectedJ: number;
  minTemperatureK: number;
  maxTemperatureK: number;
  /** eta = W_net / Q_in for closed heat-engine cycles (W_net > 0); null otherwise. */
  thermalEfficiency: number | null;
  /** Carnot limit 1 - T_min / T_max when closed cycle with T_max > T_min; null otherwise. */
  carnotEfficiency: number | null;
  /** Coefficient of performance Q_cold / |W_net| for reversed refrigerator cycles; null otherwise. */
  copCooling: number | null;
  quantities: Record<string, number>;
}

export interface ThermodynamicProcessSolution
  extends ThermodynamicCycleMetrics {
  kind: "thermodynamic-process";
}

export interface CarnotCycleSolution extends ThermodynamicCycleMetrics {
  kind: "carnot-cycle";
  hotTemperatureK: number;
  coldTemperatureK: number;
  cycleDirection: "heat-engine" | "refrigerator";
}

/* -------------------------------------------------------------------------- */
/* 2. Calorimetry Phase-Change Heating / Cooling Curves                       */
/* -------------------------------------------------------------------------- */

export interface PhaseChangeMaterialSpec {
  name?: string;
  massKg: number;
  meltingPointK: number;
  boilingPointK: number;
  specificHeatSolidJPerKgK?: number;
  specificHeatLiquidJPerKgK?: number;
  specificHeatGasJPerKgK?: number;
  latentHeatFusionJPerKg?: number;
  latentHeatVaporizationJPerKg?: number;
}

export interface PhaseChangeScenarioSpec extends ThermalVisibilityMixin {
  kind: "phase-change-curve";
  id?: string;
  title?: string;
  material: PhaseChangeMaterialSpec;
  initialTemperatureK: number;
  finalTemperatureK: number;
  initialPhase?: MatterPhase;
  finalPhase?: MatterPhase;
  heaterPowerW?: number;
  heaterEfficiency?: number;
  xAxisMode?: "energy" | "time";
  temperatureDisplayUnit?: "K" | "C";
  showGrid?: boolean;
  showPhaseAnnotations?: boolean;
}

export interface SolvedPhaseStage {
  stageIndex: number;
  stageKind: PhaseStageKind;
  isLatentPlateau: boolean;
  startTemperatureK: number;
  endTemperatureK: number;
  startTemperatureC: number;
  endTemperatureC: number;
  /** Positive magnitude of thermal energy transferred during this stage (J). */
  energyJ: number;
  /** Signed heat Q supplied to sample during this stage (+ heating, - cooling). */
  signedHeatJ: number;
  cumulativeEnergyStartJ: number;
  cumulativeEnergyEndJ: number;
  durationS: number | null;
  cumulativeTimeStartS: number | null;
  cumulativeTimeEndS: number | null;
  /** dT / d|Q| in K J^-1 (0 on latent plateaus). */
  slopeKPerJ: number;
  /** dT / dt in K s^-1 when heaterPowerW is specified; null otherwise. */
  slopeKPerS: number | null;
}

export interface PhaseChangeSolution {
  kind: "phase-change-curve";
  direction: "heating" | "cooling";
  initialPhase: MatterPhase;
  finalPhase: MatterPhase;
  initialTemperatureK: number;
  finalTemperatureK: number;
  initialTemperatureC: number;
  finalTemperatureC: number;
  stages: SolvedPhaseStage[];
  totalEnergyJ: number;
  signedTotalHeatJ: number;
  sensibleEnergyJ: number;
  latentEnergyJ: number;
  effectivePowerW: number | null;
  totalDurationS: number | null;
  quantities: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* 3. Calorimetry Thermal Equilibrium Mixing                                  */
/* -------------------------------------------------------------------------- */

export interface CalorimetryComponentSpec {
  id: string;
  label: string;
  massKg: number;
  initialTemperatureK: number;
  specificHeatJPerKgK?: number;
  initialPhase?: MatterPhase;
  meltingPointK?: number;
  boilingPointK?: number;
  specificHeatSolidJPerKgK?: number;
  specificHeatLiquidJPerKgK?: number;
  specificHeatGasJPerKgK?: number;
  latentHeatFusionJPerKg?: number;
  latentHeatVaporizationJPerKg?: number;
}

export interface CalorimetryMixingScenarioSpec extends ThermalVisibilityMixin {
  kind: "calorimetry-mixing";
  id?: string;
  title?: string;
  components: readonly CalorimetryComponentSpec[];
  /** Thermal energy lost from the mixture to surroundings (>= 0, default 0). */
  heatLossToSurroundingsJ?: number;
  temperatureDisplayUnit?: "K" | "C";
  diagramVariant?: "calorimeter-schematic" | "convergence-graph";
  showGrid?: boolean;
}

export interface SolvedMixingComponent {
  id: string;
  label: string;
  massKg: number;
  initialTemperatureK: number;
  initialTemperatureC: number;
  finalTemperatureK: number;
  finalTemperatureC: number;
  initialPhase: MatterPhase;
  finalPhase: MatterPhase | "solid-liquid" | "liquid-gas";
  /** Fraction in higher-enthalpy phase at transition temperature (0..1); null if single phase. */
  transitionFraction: number | null;
  /** Signed heat absorbed by this component (+ gained, - released) in J. */
  signedHeatJ: number;
  sensibleHeatJ: number;
  latentHeatJ: number;
}

export interface CalorimetryMixingSolution {
  kind: "calorimetry-mixing";
  equilibriumTemperatureK: number;
  equilibriumTemperatureC: number;
  isPhaseCoexistenceEquilibrium: boolean;
  components: SolvedMixingComponent[];
  heatLostByHotJ: number;
  heatGainedByColdJ: number;
  heatLossToSurroundingsJ: number;
  /** Exact enthalpy balance residual sum(Q_i) + Q_loss (0 to machine precision). */
  energyBalanceResidualJ: number;
  quantities: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* 4. Kinetic Theory of Ideal Gases                                           */
/* -------------------------------------------------------------------------- */

export interface KineticTheoryScenarioSpec extends ThermalVisibilityMixin {
  kind: "kinetic-theory";
  id?: string;
  title?: string;
  gasLabel?: string;
  temperatureK: number;
  molarMassKgPerMol?: number;
  particleMassKg?: number;
  moles?: number;
  volumeM3?: number;
  comparisonTemperatureK?: number;
  gasConstantR?: number;
  boltzmannConstant?: number;
  avogadroConstant?: number;
  showGrid?: boolean;
  showCharacteristicSpeeds?: boolean;
}

export interface KineticTheorySolution {
  kind: "kinetic-theory";
  temperatureK: number;
  molarMassKgPerMol: number;
  particleMassKg: number;
  rmsSpeedMs: number;
  meanSpeedMs: number;
  mostProbableSpeedMs: number;
  averageKineticEnergyJ: number;
  averageKineticEnergyEv: number;
  molarInternalEnergyJPerMol: number;
  pressurePa: number | null;
  densityKgPerM3: number | null;
  comparisonTemperatureK: number | null;
  comparisonRmsSpeedMs: number | null;
  comparisonMeanSpeedMs: number | null;
  comparisonMostProbableSpeedMs: number | null;
  comparisonAverageKineticEnergyJ: number | null;
  quantities: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* 5. Thermal Radiation & Blackbody / Greybody Spectra                        */
/* -------------------------------------------------------------------------- */

export interface ThermalRadiationScenarioSpec extends ThermalVisibilityMixin {
  kind: "thermal-radiation";
  id?: string;
  title?: string;
  bodyLabel?: string;
  temperatureK: number;
  emissivity?: number;
  surfaceAreaM2: number;
  ambientTemperatureK?: number;
  observerDistanceM?: number;
  comparisonTemperatureK?: number;
  comparisonEmissivity?: number;
  comparisonLabel?: string;
  wienConstantMK?: number;
  stefanBoltzmannConstant?: number;
  showVisibleBand?: boolean;
  showGrid?: boolean;
}

export interface ThermalRadiationSolution {
  kind: "thermal-radiation";
  temperatureK: number;
  emissivity: number;
  surfaceAreaM2: number;
  peakWavelengthM: number;
  peakWavelengthNm: number;
  radiatedPowerW: number;
  radiatedIntensityWm2: number;
  ambientTemperatureK: number | null;
  netRadiatedPowerW: number;
  observerDistanceM: number | null;
  intensityAtDistanceWm2: number | null;
  comparisonTemperatureK: number | null;
  comparisonEmissivity: number | null;
  comparisonPeakWavelengthM: number | null;
  comparisonRadiatedPowerW: number | null;
  comparisonPowerRatio: number | null;
  quantities: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* Discriminated Unions                                                       */
/* -------------------------------------------------------------------------- */

export type ThermalScenarioSpec =
  | ThermodynamicProcessScenarioSpec
  | CarnotCycleScenarioSpec
  | PhaseChangeScenarioSpec
  | CalorimetryMixingScenarioSpec
  | KineticTheoryScenarioSpec
  | ThermalRadiationScenarioSpec;

export type ThermalScenarioSolution =
  | ThermodynamicProcessSolution
  | CarnotCycleSolution
  | PhaseChangeSolution
  | CalorimetryMixingSolution
  | KineticTheorySolution
  | ThermalRadiationSolution;
