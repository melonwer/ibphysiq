export interface QuantumNuclearConstants {
  readonly planckConstantJs: number;
  readonly speedOfLightMs: number;
  readonly elementaryChargeC: number;
  readonly electronMassKg: number;
  readonly protonMassKg: number;
  readonly neutronMassKg: number;
  readonly protonMassU: number;
  readonly neutronMassU: number;
  readonly electronMassU: number;
  readonly alphaParticleMassU: number;
  readonly alphaParticleMassKg: number;
  readonly atomicMassUnitKg: number;
  readonly atomicMassUnitMeV: number;
  readonly coulombConstantNm2C2: number;
  readonly vacuumPermittivityC2Nm2: number;
  readonly fermiRadiusM: number;
  readonly bohrGroundStateEv: number;
}

/**
 * Standard pre-university physics Data Booklet constants aligned across
 * IB Physics (First Assessment 2025), UK A-Level Physics, and NCUK IFY Physics.
 */
export const DATA_BOOKLET_CONSTANTS: QuantumNuclearConstants = {
  planckConstantJs: 6.63e-34,
  speedOfLightMs: 3.0e8,
  elementaryChargeC: 1.6e-19,
  electronMassKg: 9.11e-31,
  protonMassKg: 1.673e-27,
  neutronMassKg: 1.675e-27,
  protonMassU: 1.007276,
  neutronMassU: 1.008665,
  electronMassU: 0.00054858,
  alphaParticleMassU: 4.001506,
  alphaParticleMassKg: 6.644e-27,
  atomicMassUnitKg: 1.661e-27,
  atomicMassUnitMeV: 931.5,
  coulombConstantNm2C2: 8.99e9,
  vacuumPermittivityC2Nm2: 8.85e-12,
  fermiRadiusM: 1.2e-15,
  bohrGroundStateEv: -13.6,
};

/**
 * High-precision CODATA constants for callers requesting exact SI values.
 */
export const CODATA_CONSTANTS: QuantumNuclearConstants = {
  planckConstantJs: 6.62607015e-34,
  speedOfLightMs: 2.99792458e8,
  elementaryChargeC: 1.602176634e-19,
  electronMassKg: 9.1093837015e-31,
  protonMassKg: 1.67262192369e-27,
  neutronMassKg: 1.67492749804e-27,
  protonMassU: 1.007276466621,
  neutronMassU: 1.00866491595,
  electronMassU: 0.000548579909,
  alphaParticleMassU: 4.001506179127,
  alphaParticleMassKg: 6.6446573357e-27,
  atomicMassUnitKg: 1.6605390666e-27,
  atomicMassUnitMeV: 931.49410242,
  coulombConstantNm2C2: 8.9875517923e9,
  vacuumPermittivityC2Nm2: 8.8541878128e-12,
  fermiRadiusM: 1.2e-15,
  bohrGroundStateEv: -13.605693122994,
};

export function resolveConstants(
  overrides?: Partial<QuantumNuclearConstants>,
): QuantumNuclearConstants {
  if (!overrides) return DATA_BOOKLET_CONSTANTS;
  return {
    ...DATA_BOOKLET_CONSTANTS,
    ...overrides,
  };
}

export type TimeUnit = "s" | "min" | "h" | "d" | "yr";

export const TIME_UNIT_TO_SECONDS: Readonly<Record<TimeUnit, number>> = {
  s: 1,
  min: 60,
  h: 3600,
  d: 86400,
  yr: 365.25 * 86400,
};

export type SpectralRegion =
  | "gamma-ray"
  | "x-ray"
  | "ultraviolet"
  | "visible"
  | "infrared"
  | "microwave"
  | "radio";

export function evToJoules(
  energyEv: number,
  elementaryChargeC = DATA_BOOKLET_CONSTANTS.elementaryChargeC,
): number {
  return energyEv * elementaryChargeC;
}

export function joulesToEv(
  energyJ: number,
  elementaryChargeC = DATA_BOOKLET_CONSTANTS.elementaryChargeC,
): number {
  return energyJ / elementaryChargeC;
}

export function mevToJoules(
  energyMeV: number,
  elementaryChargeC = DATA_BOOKLET_CONSTANTS.elementaryChargeC,
): number {
  return energyMeV * 1e6 * elementaryChargeC;
}

export function joulesToMev(
  energyJ: number,
  elementaryChargeC = DATA_BOOKLET_CONSTANTS.elementaryChargeC,
): number {
  return energyJ / (1e6 * elementaryChargeC);
}

export function classifySpectralRegion(wavelengthNm: number): SpectralRegion {
  if (wavelengthNm < 0.01) return "gamma-ray";
  if (wavelengthNm < 10) return "x-ray";
  if (wavelengthNm < 380) return "ultraviolet";
  if (wavelengthNm <= 750) return "visible";
  if (wavelengthNm < 1e6) return "infrared";
  if (wavelengthNm < 1e8) return "microwave";
  return "radio";
}

export function classifyHydrogenSeries(lowerPrincipalN: number): string | null {
  switch (lowerPrincipalN) {
    case 1:
      return "Lyman";
    case 2:
      return "Balmer";
    case 3:
      return "Paschen";
    case 4:
      return "Brackett";
    case 5:
      return "Pfund";
    default:
      return null;
  }
}

/**
 * Deterministic perceptual hex color for spectral strip rendering.
 * Non-visible UV/IR lines receive crisp slate-violet / deep-crimson accents.
 */
export function spectralLineColorHex(wavelengthNm: number): string {
  if (wavelengthNm < 380) return "#5b4b8a";
  if (wavelengthNm < 440) return "#6b3fa0";
  if (wavelengthNm < 490) return "#2563eb";
  if (wavelengthNm < 520) return "#0891b2";
  if (wavelengthNm < 565) return "#16a34a";
  if (wavelengthNm < 590) return "#ca8a04";
  if (wavelengthNm < 625) return "#ea580c";
  if (wavelengthNm <= 750) return "#dc2626";
  return "#881337";
}

export const ELEMENT_SYMBOLS: Readonly<Record<number, string>> = {
  0: "n",
  1: "H",
  2: "He",
  3: "Li",
  4: "Be",
  5: "B",
  6: "C",
  7: "N",
  8: "O",
  9: "F",
  10: "Ne",
  11: "Na",
  12: "Mg",
  13: "Al",
  14: "Si",
  15: "P",
  16: "S",
  17: "Cl",
  18: "Ar",
  19: "K",
  20: "Ca",
  21: "Sc",
  22: "Ti",
  23: "V",
  24: "Cr",
  25: "Mn",
  26: "Fe",
  27: "Co",
  28: "Ni",
  29: "Cu",
  30: "Zn",
  31: "Ga",
  32: "Ge",
  33: "As",
  34: "Se",
  35: "Br",
  36: "Kr",
  37: "Rb",
  38: "Sr",
  39: "Y",
  40: "Zr",
  41: "Nb",
  42: "Mo",
  43: "Tc",
  44: "Ru",
  45: "Rh",
  46: "Pd",
  47: "Ag",
  48: "Cd",
  49: "In",
  50: "Sn",
  51: "Sb",
  52: "Te",
  53: "I",
  54: "Xe",
  55: "Cs",
  56: "Ba",
  57: "La",
  58: "Ce",
  59: "Pr",
  60: "Nd",
  61: "Pm",
  62: "Sm",
  63: "Eu",
  64: "Gd",
  65: "Tb",
  66: "Dy",
  67: "Ho",
  68: "Er",
  69: "Tm",
  70: "Yb",
  71: "Lu",
  72: "Hf",
  73: "Ta",
  74: "W",
  75: "Re",
  76: "Os",
  77: "Ir",
  78: "Pt",
  79: "Au",
  80: "Hg",
  81: "Tl",
  82: "Pb",
  83: "Bi",
  84: "Po",
  85: "At",
  86: "Rn",
  87: "Fr",
  88: "Ra",
  89: "Ac",
  90: "Th",
  91: "Pa",
  92: "U",
  93: "Np",
  94: "Pu",
  95: "Am",
  96: "Cm",
  97: "Bk",
  98: "Cf",
  99: "Es",
  100: "Fm",
};

export function lookupElementSymbol(atomicNumberZ: number): string {
  return ELEMENT_SYMBOLS[atomicNumberZ] ?? `Z${atomicNumberZ}`;
}

export interface BindingCurvePoint {
  readonly massNumberA: number;
  readonly atomicNumberZ: number;
  readonly symbol: string;
  readonly bindingEnergyPerNucleonMeV: number;
}

/**
 * Canonical empirical nuclear binding energy per nucleon curve anchor points
 * for accurate IB / A-Level / NCUK binding-energy curve rendering.
 */
export const REFERENCE_BINDING_CURVE_POINTS: readonly BindingCurvePoint[] = [
  { massNumberA: 2, atomicNumberZ: 1, symbol: "²H", bindingEnergyPerNucleonMeV: 1.112 },
  { massNumberA: 3, atomicNumberZ: 1, symbol: "³H", bindingEnergyPerNucleonMeV: 2.827 },
  { massNumberA: 3, atomicNumberZ: 2, symbol: "³He", bindingEnergyPerNucleonMeV: 2.573 },
  { massNumberA: 4, atomicNumberZ: 2, symbol: "⁴He", bindingEnergyPerNucleonMeV: 7.074 },
  { massNumberA: 6, atomicNumberZ: 3, symbol: "⁶Li", bindingEnergyPerNucleonMeV: 5.332 },
  { massNumberA: 7, atomicNumberZ: 3, symbol: "⁷Li", bindingEnergyPerNucleonMeV: 5.606 },
  { massNumberA: 9, atomicNumberZ: 4, symbol: "⁹Be", bindingEnergyPerNucleonMeV: 6.463 },
  { massNumberA: 12, atomicNumberZ: 6, symbol: "¹²C", bindingEnergyPerNucleonMeV: 7.680 },
  { massNumberA: 14, atomicNumberZ: 7, symbol: "¹⁴N", bindingEnergyPerNucleonMeV: 7.476 },
  { massNumberA: 16, atomicNumberZ: 8, symbol: "¹⁶O", bindingEnergyPerNucleonMeV: 7.976 },
  { massNumberA: 24, atomicNumberZ: 12, symbol: "²⁴Mg", bindingEnergyPerNucleonMeV: 8.261 },
  { massNumberA: 40, atomicNumberZ: 20, symbol: "⁴⁰Ca", bindingEnergyPerNucleonMeV: 8.551 },
  { massNumberA: 56, atomicNumberZ: 26, symbol: "⁵⁶Fe", bindingEnergyPerNucleonMeV: 8.790 },
  { massNumberA: 62, atomicNumberZ: 28, symbol: "⁶²Ni", bindingEnergyPerNucleonMeV: 8.795 },
  { massNumberA: 89, atomicNumberZ: 36, symbol: "⁸⁹Kr", bindingEnergyPerNucleonMeV: 8.600 },
  { massNumberA: 107, atomicNumberZ: 47, symbol: "¹⁰⁷Ag", bindingEnergyPerNucleonMeV: 8.554 },
  { massNumberA: 120, atomicNumberZ: 50, symbol: "¹²⁰Sn", bindingEnergyPerNucleonMeV: 8.505 },
  { massNumberA: 141, atomicNumberZ: 56, symbol: "¹⁴¹Ba", bindingEnergyPerNucleonMeV: 8.326 },
  { massNumberA: 184, atomicNumberZ: 74, symbol: "¹⁸⁴W", bindingEnergyPerNucleonMeV: 8.005 },
  { massNumberA: 197, atomicNumberZ: 79, symbol: "¹⁹⁷Au", bindingEnergyPerNucleonMeV: 7.916 },
  { massNumberA: 208, atomicNumberZ: 82, symbol: "²⁰⁸Pb", bindingEnergyPerNucleonMeV: 7.867 },
  { massNumberA: 235, atomicNumberZ: 92, symbol: "²³⁵U", bindingEnergyPerNucleonMeV: 7.591 },
  { massNumberA: 238, atomicNumberZ: 92, symbol: "²³⁸U", bindingEnergyPerNucleonMeV: 7.570 },
];
