/**
 * Physical constants and reference material presets for IB Physics (SL/HL),
 * UK A-Level Physics, and NCUK IFY Thermal Physics & Thermodynamics.
 *
 * Values match standard 3-significant-figure pre-university data booklets
 * while allowing per-scenario overrides when CODATA precision is desired.
 */

/** Molar gas constant R in J mol^-1 K^-1. */
export const MOLAR_GAS_CONSTANT = 8.31;

/** Boltzmann constant k_B in J K^-1. */
export const BOLTZMANN_CONSTANT = 1.38e-23;

/** Avogadro constant N_A in mol^-1. */
export const AVOGADRO_CONSTANT = 6.02e23;

/** Wien's displacement constant b in m K (lambda_max * T = 2.90e-3 m K). */
export const WIEN_DISPLACEMENT_CONSTANT = 2.9e-3;

/** Stefan-Boltzmann constant sigma in W m^-2 K^-4. */
export const STEFAN_BOLTZMANN_CONSTANT = 5.67e-8;

/** Planck constant h in J s. */
export const PLANCK_CONSTANT = 6.63e-34;

/** Speed of light in vacuum c in m s^-1. */
export const SPEED_OF_LIGHT = 3.0e8;

/** Elementary charge e in C (for J to eV conversion). */
export const ELEMENTARY_CHARGE = 1.6e-19;

/** Ice-point offset between Celsius and Kelvin (T(K) = T(°C) + 273.15). */
export const KELVIN_OFFSET = 273.15;

/** Translational degrees of freedom f = 3 for a monatomic ideal gas. */
export const MONATOMIC_DOF = 3;

/** Adiabatic index gamma = C_P / C_V = 5/3 for a monatomic ideal gas. */
export const MONATOMIC_ADIABATIC_GAMMA = 5 / 3;

/**
 * Exact dimensionless root x* of (x - 5) * exp(x) + 5 = 0 governing the
 * wavelength maximum of Planck's spectral radiance law.
 */
export const PLANCK_WIEN_ROOT = 4.965114231744276;

export interface ThermalSubstancePreset {
  readonly id: string;
  readonly name: string;
  readonly meltingPointK: number;
  readonly boilingPointK: number;
  readonly specificHeatSolidJPerKgK: number;
  readonly specificHeatLiquidJPerKgK: number;
  readonly specificHeatGasJPerKgK: number;
  readonly latentHeatFusionJPerKg: number;
  readonly latentHeatVaporizationJPerKg: number;
}

export const THERMAL_SUBSTANCE_PRESETS: Readonly<
  Record<string, ThermalSubstancePreset>
> = {
  water: {
    id: "water",
    name: "Water",
    meltingPointK: 273.15,
    boilingPointK: 373.15,
    specificHeatSolidJPerKgK: 2100,
    specificHeatLiquidJPerKgK: 4180,
    specificHeatGasJPerKgK: 2010,
    latentHeatFusionJPerKg: 3.34e5,
    latentHeatVaporizationJPerKg: 2.26e6,
  },
  ethanol: {
    id: "ethanol",
    name: "Ethanol",
    meltingPointK: 159,
    boilingPointK: 351,
    specificHeatSolidJPerKgK: 1120,
    specificHeatLiquidJPerKgK: 2440,
    specificHeatGasJPerKgK: 1600,
    latentHeatFusionJPerKg: 1.08e5,
    latentHeatVaporizationJPerKg: 8.46e5,
  },
  lead: {
    id: "lead",
    name: "Lead",
    meltingPointK: 600.6,
    boilingPointK: 2022,
    specificHeatSolidJPerKgK: 128,
    specificHeatLiquidJPerKgK: 147,
    specificHeatGasJPerKgK: 100,
    latentHeatFusionJPerKg: 2.3e4,
    latentHeatVaporizationJPerKg: 8.71e5,
  },
  aluminium: {
    id: "aluminium",
    name: "Aluminium",
    meltingPointK: 933.5,
    boilingPointK: 2792,
    specificHeatSolidJPerKgK: 900,
    specificHeatLiquidJPerKgK: 1180,
    specificHeatGasJPerKgK: 770,
    latentHeatFusionJPerKg: 3.97e5,
    latentHeatVaporizationJPerKg: 1.09e7,
  },
};

export interface IdealGasPreset {
  readonly id: string;
  readonly label: string;
  readonly molarMassKgPerMol: number;
}

export const MONATOMIC_GAS_PRESETS: readonly IdealGasPreset[] = [
  { id: "helium", label: "Helium-4 (He)", molarMassKgPerMol: 4.0e-3 },
  { id: "neon", label: "Neon-20 (Ne)", molarMassKgPerMol: 20.2e-3 },
  { id: "argon", label: "Argon-40 (Ar)", molarMassKgPerMol: 40.0e-3 },
  { id: "krypton", label: "Krypton-84 (Kr)", molarMassKgPerMol: 83.8e-3 },
  { id: "xenon", label: "Xenon-131 (Xe)", molarMassKgPerMol: 131.3e-3 },
];

export const SOLID_CALORIMETRY_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly specificHeatJPerKgK: number;
}[] = [
  { id: "copper", label: "Copper", specificHeatJPerKgK: 385 },
  { id: "aluminium", label: "Aluminium", specificHeatJPerKgK: 900 },
  { id: "iron", label: "Iron", specificHeatJPerKgK: 450 },
  { id: "brass", label: "Brass", specificHeatJPerKgK: 380 },
  { id: "glass", label: "Glass", specificHeatJPerKgK: 840 },
];
