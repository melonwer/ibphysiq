import {
  Point2D,
  VisualValidationIssue,
  VisualValidationResult,
} from "../types";

export const EM_INDUCTION_SCHEMA_VERSION = "em-induction/0.1.0" as const;

/** Standard pre-university data-booklet physical constants in SI units. */
export const VACUUM_PERMITTIVITY = 8.85e-12;
export const VACUUM_PERMEABILITY = 4 * Math.PI * 1e-7;
export const ELEMENTARY_CHARGE_C = 1.6e-19;
export const ELECTRON_MASS_KG = 9.11e-31;
export const PROTON_MASS_KG = 1.67e-27;
export const ATOMIC_MASS_UNIT_KG = 1.66e-27;

export const EM_INDUCTION_SCENARIO_KINDS = [
  "parallel-plate-capacitor",
  "capacitor-network",
  "rc-transient",
  "flux-faraday",
  "motional-emf-rails",
  "ac-generator",
  "transformer",
  "electric-deflection",
  "magnetic-cyclotron",
  "velocity-selector",
  "bainbridge-mass-spectrometer",
] as const;

export type EmInductionScenarioKind =
  (typeof EM_INDUCTION_SCENARIO_KINDS)[number];

export type MagneticFieldPageDirection = "into-page" | "out-of-page";
export type PlatePolarity = "positive" | "negative";
export type VerticalDirection = "up" | "down";
export type HorizontalDirection = "left" | "right";
export type RotationSense = "clockwise" | "counterclockwise";

export interface EmVisibilityControls {
  /**
   * Canonical quantity IDs or symbol aliases that must NEVER appear numerically
   * in student-facing SVG text, axis ticks, titles, descriptions, or attributes.
   */
  hiddenQuantities?: readonly string[];
  /**
   * Optional allowlist of quantity IDs/aliases permitted to show numerical values.
   * When omitted, given scenario inputs not in `hiddenQuantities` are shown and
   * derived solver outputs stay hidden unless `showDerivedLabels` is true.
   */
  visibleQuantities?: readonly string[];
  /**
   * When true, solved/derived quantities that are not in `hiddenQuantities`
   * (and permitted by `visibleQuantities` if set) may also be annotated.
   */
  showDerivedLabels?: boolean;
  /** Optional student-safe diagram heading (never auto-populated with answers). */
  title?: string;
}

export interface ParallelPlateAfterChangeSpec {
  constraint: "constant-voltage" | "isolated-charge";
  newSeparationM?: number;
  newRelativePermittivity?: number;
}

export interface ParallelPlateCapacitorSpec extends EmVisibilityControls {
  kind: "parallel-plate-capacitor";
  plateAreaM2: number;
  plateSeparationM: number;
  relativePermittivity?: number;
  permittivityFPerM?: number;
  voltageV: number;
  afterChange?: ParallelPlateAfterChangeSpec;
}

export type CapacitorNetworkTopologySpec =
  | {
      arrangement: "series";
      capacitancesF: readonly number[];
      supplyVoltageV: number;
    }
  | {
      arrangement: "parallel";
      capacitancesF: readonly number[];
      supplyVoltageV: number;
    }
  | {
      arrangement: "series-parallel";
      seriesCapacitanceF: number;
      parallelCapacitancesF: readonly number[];
      supplyVoltageV: number;
    }
  | {
      arrangement: "charge-sharing";
      c1F: number;
      c2F: number;
      v1InitialV: number;
      v2InitialV?: number;
      polarity?: "same" | "opposing";
    };

export interface CapacitorNetworkSpec extends EmVisibilityControls {
  kind: "capacitor-network";
  topology: CapacitorNetworkTopologySpec;
}

export type RcPlottedQuantity =
  | "capacitor-voltage"
  | "resistor-voltage"
  | "current"
  | "charge";

export interface RcTransientSpec extends EmVisibilityControls {
  kind: "rc-transient";
  mode: "charging" | "discharging";
  resistanceOhm: number;
  capacitanceF: number;
  supplyVoltageV: number;
  queryTimeS?: number;
  durationTimeConstants?: number;
  plottedQuantity?: RcPlottedQuantity;
  layout?: "circuit-and-graph" | "graph-only" | "circuit-only";
}

export interface FluxFaradaySpec extends EmVisibilityControls {
  kind: "flux-faraday";
  turns: number;
  coilAreaM2: number;
  initialFieldT: number;
  finalFieldT: number;
  initialAngleDegrees?: number;
  finalAngleDegrees?: number;
  angleReference?: "normal" | "plane";
  timeIntervalS: number;
  coilResistanceOhm?: number;
}

export interface MotionalEmfRailsSpec extends EmVisibilityControls {
  kind: "motional-emf-rails";
  magneticFieldT: number;
  fieldDirection: MagneticFieldPageDirection;
  railSeparationM: number;
  rodSpeedMs: number;
  rodDirection?: HorizontalDirection;
  loadResistanceOhm: number;
  rodResistanceOhm?: number;
}

export interface AcGeneratorSpec extends EmVisibilityControls {
  kind: "ac-generator";
  turns: number;
  coilAreaM2: number;
  magneticFieldT: number;
  angularSpeedRadS?: number;
  frequencyHz?: number;
  loadResistanceOhm?: number;
  initialPhaseRad?: number;
  cyclesShown?: number;
  queryTimeS?: number;
  showFluxCurve?: boolean;
}

export interface TransformerSpec extends EmVisibilityControls {
  kind: "transformer";
  primaryVoltageRmsV: number;
  primaryTurns: number;
  secondaryTurns: number;
  efficiency?: number;
  loadResistanceOhm?: number;
  secondaryCurrentRmsA?: number;
  supplyFrequencyHz?: number;
}

export interface ElectricDeflectionSpec extends EmVisibilityControls {
  kind: "electric-deflection";
  chargeC: number;
  massKg: number;
  initialSpeedMs: number;
  plateLengthM: number;
  plateSeparationM: number;
  plateVoltageV: number;
  topPlatePolarity?: PlatePolarity;
  entryOffsetYM?: number;
  driftDistanceAfterPlatesM?: number;
}

export interface MagneticCyclotronSpec extends EmVisibilityControls {
  kind: "magnetic-cyclotron";
  chargeC: number;
  massKg: number;
  magneticFieldT: number;
  fieldDirection: MagneticFieldPageDirection;
  speedMs?: number;
  acceleratingVoltageV?: number;
  arcSweepDegrees?: number;
}

export interface VelocitySelectorSpec extends EmVisibilityControls {
  kind: "velocity-selector";
  chargeC: number;
  massKg: number;
  electricFieldVm?: number;
  plateVoltageV?: number;
  plateSeparationM?: number;
  magneticFieldT: number;
  fieldDirection: MagneticFieldPageDirection;
  topPlatePolarity: PlatePolarity;
  particleSpeedMs?: number;
  selectorLengthM?: number;
}

export interface BainbridgeSpectrometerSpec extends EmVisibilityControls {
  kind: "bainbridge-mass-spectrometer";
  chargeC: number;
  massKg: number;
  comparisonMassKg?: number;
  selectorElectricFieldVm: number;
  selectorMagneticFieldT: number;
  deflectionMagneticFieldT?: number;
  deflectionFieldDirection?: MagneticFieldPageDirection;
  selectorTopPlatePolarity?: PlatePolarity;
}

export type EmInductionScenarioSpec =
  | ParallelPlateCapacitorSpec
  | CapacitorNetworkSpec
  | RcTransientSpec
  | FluxFaradaySpec
  | MotionalEmfRailsSpec
  | AcGeneratorSpec
  | TransformerSpec
  | ElectricDeflectionSpec
  | MagneticCyclotronSpec
  | VelocitySelectorSpec
  | BainbridgeSpectrometerSpec;

export interface ParallelPlateAfterChangeResult {
  constraint: "constant-voltage" | "isolated-charge";
  capacitanceF: number;
  voltageV: number;
  chargeC: number;
  electricFieldVm: number;
  storedEnergyJ: number;
  energyChangeJ: number;
}

export interface ParallelPlateCapacitorSolution {
  kind: "parallel-plate-capacitor";
  capacitanceF: number;
  chargeC: number;
  electricFieldVm: number;
  storedEnergyJ: number;
  energyDensityJm3: number;
  afterChange?: ParallelPlateAfterChangeResult;
  quantities: Record<string, number>;
}

export interface CapacitorElementState {
  id: string;
  capacitanceF: number;
  voltageV: number;
  chargeC: number;
  storedEnergyJ: number;
}

export interface CapacitorNetworkSolution {
  kind: "capacitor-network";
  arrangement: CapacitorNetworkTopologySpec["arrangement"];
  equivalentCapacitanceF: number;
  totalChargeC: number;
  totalStoredEnergyJ: number;
  elements: CapacitorElementState[];
  finalCommonVoltageV?: number;
  initialStoredEnergyJ?: number;
  energyDissipatedJ?: number;
  quantities: Record<string, number>;
}

export interface RcTransientSolution {
  kind: "rc-transient";
  mode: "charging" | "discharging";
  timeConstantS: number;
  halfTimeS: number;
  initialCurrentA: number;
  maxChargeC: number;
  maxStoredEnergyJ: number;
  queryTimeS: number;
  capacitorVoltageAtQueryV: number;
  resistorVoltageAtQueryV: number;
  currentAtQueryA: number;
  chargeAtQueryC: number;
  storedEnergyAtQueryJ: number;
  curves: {
    capacitorVoltage: Point2D[];
    resistorVoltage: Point2D[];
    current: Point2D[];
    charge: Point2D[];
  };
  quantities: Record<string, number>;
}

export interface FluxFaradaySolution {
  kind: "flux-faraday";
  initialNormalAngleDegrees: number;
  finalNormalAngleDegrees: number;
  initialFluxWb: number;
  finalFluxWb: number;
  fluxChangeWb: number;
  initialFluxLinkageWbTurns: number;
  finalFluxLinkageWbTurns: number;
  fluxLinkageChangeWbTurns: number;
  signedAverageEmfV: number;
  averageEmfMagnitudeV: number;
  averageInducedCurrentA?: number;
  inducedChargeC?: number;
  lenzOppositionSummary: string;
  quantities: Record<string, number>;
}

export interface MotionalEmfRailsSolution {
  kind: "motional-emf-rails";
  totalResistanceOhm: number;
  motionalEmfV: number;
  inducedCurrentA: number;
  terminalVoltageV: number;
  magneticBrakingForceN: number;
  mechanicalPowerW: number;
  electricalPowerW: number;
  higherPotentialEnd: "top" | "bottom";
  inducedCurrentDirection: RotationSense;
  magneticForceDirection: HorizontalDirection;
  quantities: Record<string, number>;
}

export interface AcGeneratorSolution {
  kind: "ac-generator";
  angularSpeedRadS: number;
  frequencyHz: number;
  periodS: number;
  peakFluxWb: number;
  peakFluxLinkageWbTurns: number;
  peakEmfV: number;
  peakToPeakEmfV: number;
  rmsVoltageV: number;
  queryTimeS: number;
  fluxAtQueryWb: number;
  fluxLinkageAtQueryWbTurns: number;
  emfAtQueryV: number;
  peakCurrentA?: number;
  rmsCurrentA?: number;
  currentAtQueryA?: number;
  peakPowerW?: number;
  meanPowerW?: number;
  powerAtQueryW?: number;
  curves: {
    emf: Point2D[];
    fluxLinkage: Point2D[];
  };
  quantities: Record<string, number>;
}

export interface TransformerSolution {
  kind: "transformer";
  classification: "step-up" | "step-down" | "isolation";
  turnsRatio: number;
  efficiency: number;
  primaryVoltageRmsV: number;
  primaryVoltagePeakV: number;
  secondaryVoltageRmsV: number;
  secondaryVoltagePeakV: number;
  secondaryCurrentRmsA?: number;
  primaryCurrentRmsA?: number;
  loadResistanceOhm?: number;
  inputPowerW?: number;
  outputPowerW?: number;
  powerLossW?: number;
  quantities: Record<string, number>;
}

export interface ElectricDeflectionSolution {
  kind: "electric-deflection";
  electricFieldMagnitudeVm: number;
  electricFieldYVPerM: number;
  electricForceYN: number;
  accelerationYMs2: number;
  hitsPlate: boolean;
  transitTimeS: number;
  exitXM: number;
  exitYM: number;
  plateDeflectionYM: number;
  exitVyMs: number;
  exitSpeedMs: number;
  deflectionAngleRadians: number;
  deflectionAngleDegrees: number;
  kineticEnergyGainJ: number;
  screenYM: number;
  deflectionDirection: VerticalDirection;
  trajectory: Point2D[];
  quantities: Record<string, number>;
}

export interface MagneticCyclotronSolution {
  kind: "magnetic-cyclotron";
  speedMs: number;
  equivalentAcceleratingVoltageV: number;
  magneticForceMagnitudeN: number;
  initialForceYN: number;
  centripetalAccelerationMs2: number;
  cyclotronRadiusM: number;
  orbitDiameterM: number;
  periodS: number;
  frequencyHz: number;
  angularSpeedRadS: number;
  specificChargeCPerKg: number;
  kineticEnergyJ: number;
  kineticEnergyEv: number;
  magneticWorkDoneJ: 0;
  arcTimeS: number;
  initialDeflectionDirection: VerticalDirection;
  rotationSense: RotationSense;
  trajectory: Point2D[];
  quantities: Record<string, number>;
}

export interface VelocitySelectorSolution {
  kind: "velocity-selector";
  electricFieldMagnitudeVm: number;
  electricFieldYVPerM: number;
  selectedSpeedMs: number;
  particleSpeedMs: number;
  electricForceYN: number;
  magneticForceYN: number;
  netForceYN: number;
  initialAccelerationYMs2: number;
  outcome: "undeflected" | "deflected-up" | "deflected-down";
  trajectory: Point2D[];
  quantities: Record<string, number>;
}

export interface BainbridgeSpectrometerSolution {
  kind: "bainbridge-mass-spectrometer";
  selectedSpeedMs: number;
  deflectionMagneticFieldT: number;
  primaryRadiusM: number;
  primaryDiameterM: number;
  primarySpecificChargeCPerKg: number;
  primaryKineticEnergyJ: number;
  comparisonRadiusM?: number;
  comparisonDiameterM?: number;
  strikeSeparationM?: number;
  massRatio?: number;
  deflectionDirection: VerticalDirection;
  primaryTrajectory: Point2D[];
  comparisonTrajectory?: Point2D[];
  quantities: Record<string, number>;
}

export type EmInductionSolution =
  | ParallelPlateCapacitorSolution
  | CapacitorNetworkSolution
  | RcTransientSolution
  | FluxFaradaySolution
  | MotionalEmfRailsSolution
  | AcGeneratorSolution
  | TransformerSolution
  | ElectricDeflectionSolution
  | MagneticCyclotronSolution
  | VelocitySelectorSolution
  | BainbridgeSpectrometerSolution;

export interface EmInductionRenderOptions {
  width?: number;
  height?: number;
}

export type EmInductionValidationIssue = VisualValidationIssue;
export type EmInductionValidationResult = VisualValidationResult;

const QUANTITY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  plateAreaM2: ["A", "area", "plateArea"],
  plateSeparationM: ["d", "separation", "plateSeparation"],
  relativePermittivity: ["epsilon_r", "epsilonR", "er", "dielectricConstant"],
  voltageV: ["V", "potentialDifferenceV"],
  capacitanceF: ["C", "capacitance"],
  chargeC: ["Q", "q", "charge"],
  electricFieldVm: ["E", "electricField", "electricFieldMagnitudeVm"],
  storedEnergyJ: ["U", "energyJ", "storedEnergy"],
  energyDensityJm3: ["uE", "energyDensity"],
  equivalentCapacitanceF: ["Ceq", "C_eq", "totalCapacitanceF"],
  totalChargeC: ["Qtotal", "Q_total"],
  totalStoredEnergyJ: ["Utotal", "U_total"],
  finalCommonVoltageV: ["Vf", "V_f", "commonVoltageV"],
  energyDissipatedJ: ["deltaU", "dissipatedEnergyJ", "energyLossJ"],
  resistanceOhm: ["R", "resistance"],
  supplyVoltageV: ["V0", "V_0", "emfV"],
  timeConstantS: ["tau", "RC"],
  halfTimeS: ["tHalf", "t_1/2", "halfLifeS"],
  initialCurrentA: ["I0", "I_0"],
  maxChargeC: ["Q0", "Q_0", "Qmax"],
  maxStoredEnergyJ: ["U0", "U_0", "Umax"],
  queryTimeS: ["t", "tQuery"],
  capacitorVoltageAtQueryV: ["Vc", "V_C", "voltageAtQueryV"],
  resistorVoltageAtQueryV: ["Vr", "V_R"],
  currentAtQueryA: ["I", "It", "currentA"],
  chargeAtQueryC: ["Qt", "Q_t"],
  storedEnergyAtQueryJ: ["Ut", "U_C"],
  turns: ["N"],
  coilAreaM2: ["A", "coilArea"],
  initialFieldT: ["B1", "B_1"],
  finalFieldT: ["B2", "B_2"],
  initialAngleDegrees: ["theta1", "theta", "angleDegrees"],
  finalAngleDegrees: ["theta2"],
  timeIntervalS: ["deltaT", "dt"],
  coilResistanceOhm: ["R", "resistanceOhm"],
  initialFluxWb: ["Phi1", "Phi", "fluxWb"],
  finalFluxWb: ["Phi2"],
  fluxChangeWb: ["deltaPhi"],
  fluxLinkageChangeWbTurns: ["deltaNPhi", "NPhi"],
  signedAverageEmfV: ["emf", "inducedEmfV"],
  averageEmfMagnitudeV: ["emf", "emfMagnitudeV", "inducedEmfV"],
  averageInducedCurrentA: ["I", "inducedCurrentA"],
  inducedChargeC: ["deltaQ", "inducedCharge"],
  magneticFieldT: ["B", "magneticField"],
  railSeparationM: ["L", "railLengthM"],
  rodSpeedMs: ["v", "speedMs"],
  loadResistanceOhm: ["R", "Rload", "R_s"],
  rodResistanceOhm: ["r", "internalResistanceOhm"],
  motionalEmfV: ["emf", "E_mot", "inducedEmfV"],
  inducedCurrentA: ["I", "currentA"],
  terminalVoltageV: ["Vterm", "terminalV"],
  magneticBrakingForceN: ["F", "F_B", "brakingForceN", "magneticForceN"],
  mechanicalPowerW: ["P", "Pmech", "powerW"],
  electricalPowerW: ["Pelec", "powerW"],
  angularSpeedRadS: ["omega"],
  frequencyHz: ["f", "frequency"],
  periodS: ["T", "period"],
  peakFluxWb: ["Phi0", "Phi_0"],
  peakFluxLinkageWbTurns: ["NPhi0", "Lambda0"],
  peakEmfV: ["V0", "E0", "emfPeakV", "V_0", "epsilon_0"],
  peakToPeakEmfV: ["Vpp", "V_pp"],
  rmsVoltageV: ["Vrms", "V_rms"],
  peakCurrentA: ["I0", "I_0"],
  rmsCurrentA: ["Irms", "I_rms"],
  meanPowerW: ["Pavg", "Pmean", "P_bar", "averagePowerW"],
  peakPowerW: ["P0", "Ppeak"],
  emfAtQueryV: ["emfAtQuery"],
  primaryVoltageRmsV: ["Vp", "V_p"],
  secondaryVoltageRmsV: ["Vs", "V_s"],
  primaryTurns: ["Np", "N_p"],
  secondaryTurns: ["Ns", "N_s"],
  turnsRatio: ["n", "Ns/Np"],
  efficiency: ["eta"],
  primaryCurrentRmsA: ["Ip", "I_p"],
  secondaryCurrentRmsA: ["Is", "I_s"],
  inputPowerW: ["Pin", "P_in"],
  outputPowerW: ["Pout", "P_out"],
  powerLossW: ["Ploss", "P_loss"],
  massKg: ["m", "m1", "m_1", "mass"],
  comparisonMassKg: ["m2", "m_2"],
  initialSpeedMs: ["v0", "v_0", "vx", "v"],
  plateLengthM: ["L"],
  plateVoltageV: ["V"],
  transitTimeS: ["t", "tTransit"],
  plateDeflectionYM: ["y", "deltaY", "deflectionM"],
  deflectionAngleDegrees: ["theta", "deflectionAngle"],
  exitSpeedMs: ["vExit", "v_f"],
  kineticEnergyGainJ: ["deltaEk", "workJ"],
  screenYM: ["yScreen"],
  speedMs: ["v", "speed"],
  acceleratingVoltageV: ["Vacc", "V_acc"],
  magneticForceMagnitudeN: ["FB", "F_B", "magneticForceN"],
  cyclotronRadiusM: ["r", "radiusM", "R"],
  orbitDiameterM: ["D", "2r", "diameterM"],
  specificChargeCPerKg: ["qOverM", "q/m", "specificCharge"],
  kineticEnergyJ: ["Ek", "E_k"],
  kineticEnergyEv: ["Ek_eV"],
  selectedSpeedMs: ["v", "vSelected", "v_sel"],
  particleSpeedMs: ["vParticle"],
  selectorElectricFieldVm: ["E", "E_sel"],
  selectorMagneticFieldT: ["B1", "B_1", "B_sel"],
  deflectionMagneticFieldT: ["B2", "B_2"],
  primaryRadiusM: ["r1", "r_1", "r"],
  primaryDiameterM: ["D1", "D_1", "2r1"],
  comparisonRadiusM: ["r2", "r_2"],
  comparisonDiameterM: ["D2", "D_2", "2r2"],
  strikeSeparationM: ["deltaD", "separationM"],
  massRatio: ["m2/m1"],
};

function normalizeKey(raw: string): string {
  return raw.trim();
}

export function expandQuantityKeys(
  canonicalId: string,
  extraAliases: readonly string[] = [],
): string[] {
  const aliases = QUANTITY_ALIASES[canonicalId] ?? [];
  return [canonicalId, ...aliases, ...extraAliases];
}

export function isQuantityHidden(
  controls: EmVisibilityControls,
  canonicalId: string,
  extraAliases: readonly string[] = [],
): boolean {
  const hiddenSet = new Set(
    (controls.hiddenQuantities ?? []).map(normalizeKey),
  );
  const candidates = expandQuantityKeys(canonicalId, extraAliases);
  if (candidates.some((key) => hiddenSet.has(key))) {
    return true;
  }
  if (controls.visibleQuantities !== undefined) {
    const visibleSet = new Set(controls.visibleQuantities.map(normalizeKey));
    return !candidates.some((key) => visibleSet.has(key));
  }
  return false;
}

export function isQuantityVisible(
  controls: EmVisibilityControls,
  canonicalId: string,
  options: { isDerived?: boolean; aliases?: readonly string[] } = {},
): boolean {
  if (isQuantityHidden(controls, canonicalId, options.aliases)) {
    return false;
  }
  if (controls.visibleQuantities !== undefined) {
    return true;
  }
  if (options.isDerived) {
    return Boolean(controls.showDerivedLabels);
  }
  return true;
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function toSuperscript(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

function formatSigFigs(value: number, sigFigs = 3): string {
  if (Math.abs(value) < 1e-18) return "0";
  const precision = Number(value.toPrecision(sigFigs));
  if (Math.abs(precision) >= 1e-2 && Math.abs(precision) < 1e4) {
    const raw = value.toPrecision(sigFigs);
    if (!raw.includes("e")) return raw;
  }
  const [mantissa, expPart] = value.toExponential(sigFigs - 1).split("e");
  const exp = Number(expPart);
  if (exp === 0) return mantissa;
  return `${mantissa} × 10${toSuperscript(exp)}`;
}

const SI_PREFIXES: ReadonlyArray<{ power: number; symbol: string }> = [
  { power: 9, symbol: "G" },
  { power: 6, symbol: "M" },
  { power: 3, symbol: "k" },
  { power: 0, symbol: "" },
  { power: -3, symbol: "m" },
  { power: -6, symbol: "μ" },
  { power: -9, symbol: "n" },
  { power: -12, symbol: "p" },
];

const PREFIXABLE_UNITS = new Set(["F", "Ω", "V", "A", "W", "J", "T", "Wb", "Hz", "s", "C"]);

export function formatSiQuantity(
  value: number,
  unit: string,
  sigFigs = 3,
): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot format non-finite quantity");
  }
  if (Math.abs(value) < 1e-18) {
    return unit ? `0 ${unit}` : "0";
  }
  if (PREFIXABLE_UNITS.has(unit)) {
    const abs = Math.abs(value);
    for (const prefix of SI_PREFIXES) {
      const scale = 10 ** prefix.power;
      if (abs >= scale * 0.9995 && abs < scale * 1000) {
        const scaled = value / scale;
        const formatted = Number(scaled.toPrecision(sigFigs));
        const text =
          Math.abs(formatted) >= 100
            ? formatted.toFixed(0)
            : Math.abs(formatted) >= 10
              ? formatted.toFixed(1)
              : formatted.toFixed(2);
        return `${text} ${prefix.symbol}${unit}`;
      }
    }
  }
  const numberText = formatSigFigs(value, sigFigs);
  return unit ? `${numberText} ${unit}` : numberText;
}

export function formatLabeledQuantity(
  controls: EmVisibilityControls,
  canonicalId: string,
  symbol: string,
  value: number,
  unit: string,
  options: { isDerived?: boolean; aliases?: readonly string[] } = {},
): string {
  if (!isQuantityVisible(controls, canonicalId, options)) {
    return symbol;
  }
  return `${symbol} = ${formatSiQuantity(value, unit)}`;
}
