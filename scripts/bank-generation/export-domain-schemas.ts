import fs from "node:fs";
import path from "node:path";

import {
  getDomainAdapter,
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
} from "../../lib/bank-pipeline";

export const DOMAIN_TOOL_SCHEMAS_VERSION =
  "sixthphysics-domain-tool-schemas/1.0.0" as const;

export const DEFAULT_DOMAIN_SCHEMAS_OUT_PATH =
  "dataset/sixthphysics-bank-v2/domain-tool-schemas.json";

export interface ScenarioFieldSchema {
  readonly name: string;
  readonly type: string;
  readonly unit?: string;
  readonly bounds?: string;
  readonly enumValues?: readonly string[];
  readonly notes?: string;
}

export interface VerifiedQuantitySchema {
  readonly key: string;
  readonly type: "number" | "string" | "boolean";
  readonly unit?: string;
  readonly conditional?: boolean;
}

export interface ScenarioKindSchema {
  readonly kind: string;
  readonly summary: string;
  readonly requiredFields: readonly ScenarioFieldSchema[];
  readonly optionalFields: readonly ScenarioFieldSchema[];
  readonly physicalConstraints: readonly string[];
  readonly verifiedQuantities: readonly VerifiedQuantitySchema[];
}

export interface DomainToolSchema {
  readonly domain: PhysicsDomainId;
  readonly visualFamily: string;
  readonly solverId: string;
  readonly description: string;
  readonly supportedScenarioKinds: readonly string[];
  readonly compactPromptSummary: string;
  readonly kinds: Readonly<Record<string, ScenarioKindSchema>>;
}

export interface DomainToolSchemasDocument {
  readonly schemaVersion: typeof DOMAIN_TOOL_SCHEMAS_VERSION;
  readonly derivationMethod: "deterministic-code-introspection-only";
  readonly zeroDatasetReadsVerified: true;
  readonly toolCallContract: {
    readonly toolName: "solve_and_render_scenario";
    readonly requiredTopLevelFields: readonly [
      "action",
      "domain",
      "scenarioSpec",
      "hiddenQuantities",
      "questionPlan",
    ];
    readonly step2RequiredFieldsMcq: readonly [
      "format",
      "difficulty",
      "stem",
      "options",
      "correctOptionIndex",
      "workedSolution",
      "markScheme",
      "totalMarks",
    ];
    readonly step2RequiredFieldsStructured: readonly [
      "format",
      "difficulty",
      "stem",
      "parts",
      "workedSolution",
      "markScheme",
      "totalMarks",
    ];
    readonly gravityConventions: {
      readonly ib: "g = 9.8 m s^-2";
      readonly alevel: "g = 9.81 m s^-2";
      readonly ncuk: "g = 9.81 m s^-2";
    };
  };
  readonly domainOrder: readonly PhysicsDomainId[];
  readonly totalDomains: number;
  readonly totalScenarioKinds: number;
  readonly domains: Readonly<Record<PhysicsDomainId, DomainToolSchema>>;
}

interface StaticKindSpec {
  readonly kind: string;
  readonly summary: string;
  readonly requiredFields: readonly ScenarioFieldSchema[];
  readonly optionalFields?: readonly ScenarioFieldSchema[];
  readonly physicalConstraints: readonly string[];
  readonly probeSpecs?: readonly Record<string, unknown>[];
  readonly conditionalVerifiedKeys?: readonly VerifiedQuantitySchema[];
}

function inferUnitFromKey(key: string): string | undefined {
  const leaf = key.includes(".")
    ? key.slice(key.lastIndexOf(".") + 1)
    : key.includes(":")
      ? key.slice(key.lastIndexOf(":") + 1)
      : key;

  if (
    leaf.endsWith("Degrees") ||
    leaf.endsWith("Deg") ||
    leaf === "parallaxDegrees"
  ) {
    return "deg";
  }
  if (leaf.endsWith("Radians") || leaf.endsWith("Rad")) return "rad";
  if (leaf.endsWith("RadS")) return "rad s^-1";
  if (leaf.endsWith("RadM")) return "rad m^-1";
  if (leaf.endsWith("Ms2")) return "m s^-2";
  if (leaf.endsWith("KmS")) return "km s^-1";
  if (leaf.endsWith("KmSMpc")) return "km s^-1 Mpc^-1";
  if (leaf.endsWith("Ms")) return "m s^-1";
  if (leaf.endsWith("M3") || leaf.endsWith("Jm3")) {
    return leaf.endsWith("Jm3") ? "J m^-3" : "m^3";
  }
  if (leaf.endsWith("M2") || leaf.endsWith("Wm2")) {
    return leaf.endsWith("Wm2") ? "W m^-2" : "m^2";
  }
  if (leaf.endsWith("KgM3") || leaf.endsWith("KgPerM3")) return "kg m^-3";
  if (leaf.endsWith("KgM")) return "kg m^-1";
  if (leaf.endsWith("KgMs")) return "kg m s^-1";
  if (leaf.endsWith("KgPerMol")) return "kg mol^-1";
  if (leaf.endsWith("JPerKgK")) return "J kg^-1 K^-1";
  if (leaf.endsWith("JPerKg") || leaf.endsWith("Jkg")) return "J kg^-1";
  if (leaf.endsWith("JPerMol")) return "J mol^-1";
  if (leaf.endsWith("JK")) return "J K^-1";
  if (leaf.endsWith("KPerJ")) return "K J^-1";
  if (leaf.endsWith("KPerS")) return "K s^-1";
  if (leaf.endsWith("Nkg")) return "N kg^-1";
  if (leaf.endsWith("NC")) return "N C^-1";
  if (leaf.endsWith("Vm") || leaf.endsWith("VPerM")) return "V m^-1";
  if (leaf.endsWith("Nm") && !leaf.endsWith("WavelengthNm")) {
    return leaf.includes("Constant") ? "N m^-1" : "nm";
  }
  if (leaf.endsWith("WavelengthNm") || leaf.endsWith("ShiftNm")) return "nm";
  if (leaf.endsWith("Pm")) return "pm";
  if (leaf.endsWith("Fm")) return "fm";
  if (leaf.endsWith("Mpc")) return "Mpc";
  if (leaf.endsWith("Pc")) return "pc";
  if (leaf.endsWith("Ly")) return "ly";
  if (leaf.endsWith("Au")) return "AU";
  if (leaf.endsWith("Arcsec")) return "arcsec";
  if (leaf.endsWith("Milliarcsec")) return "mas";
  if (leaf.endsWith("Gyr")) return "Gyr";
  if (leaf.endsWith("MeV")) return "MeV";
  if (leaf.endsWith("Ev")) return "eV";
  if (leaf.endsWith("WbTurns")) return "Wb turns";
  if (leaf.endsWith("Wb")) return "Wb";
  if (leaf.endsWith("Ohm") || leaf.endsWith("Ohms")) return "Ohm";
  if (leaf.endsWith("Hz")) return "Hz";
  if (leaf.endsWith("Bq")) return "Bq";
  if (leaf.endsWith("Pa")) return "Pa";
  if (leaf.endsWith("Ns")) return "N s";
  if (leaf.endsWith("CPerKg")) return "C kg^-1";
  if (leaf.endsWith("NC") || leaf.endsWith("ChargesNC")) return "nC";
  if (leaf.endsWith("Percent")) return "%";
  if (leaf.endsWith("Kg")) return "kg";
  if (leaf.endsWith("U") && leaf.toLowerCase().includes("mass")) return "u";
  if (leaf.endsWith("M")) return "m";
  if (leaf.endsWith("S")) return "s";
  if (leaf.endsWith("N")) return "N";
  if (leaf.endsWith("J")) return "J";
  if (leaf.endsWith("W")) return "W";
  if (leaf.endsWith("V")) return "V";
  if (leaf.endsWith("A") && !leaf.endsWith("DeltaA") && !leaf.endsWith("NumberA")) {
    return "A";
  }
  if (leaf.endsWith("C") && !leaf.endsWith("TemperatureC") && !leaf.endsWith("FractionC")) {
    return "C";
  }
  if (leaf.endsWith("TemperatureC")) return "degC";
  if (leaf.endsWith("K")) return "K";
  if (leaf.endsWith("F")) return "F";
  if (leaf.endsWith("T")) return "T";
  if (leaf.endsWith("D")) return "D";
  return undefined;
}

const STATIC_DOMAIN_SPECS: Readonly<
  Record<PhysicsDomainId, readonly StaticKindSpec[]>
> = {
  graphs: [
    {
      kind: "piecewise-linear-graph",
      summary:
        "General piecewise-linear Cartesian plot supporting signed/unsigned definite integrals, segment gradients, and optional impulse/work mass coupling",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          bounds: "length >= 2, finite coordinates, non-decreasing x with x_last > x_first",
        },
      ],
      optionalFields: [
        {
          name: "integralInterval",
          type: "[number, number]",
          bounds: "[xStart, xEnd] inside [xMin, xMax] with xEnd > xStart",
        },
        {
          name: "gradientInterval",
          type: "[number, number]",
          bounds: "[gStart, gEnd] matching exact vertex x-coordinates with gEnd > gStart",
        },
        { name: "initialValue", type: "number", notes: "defaults to 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "xLabel", type: "string" },
        { name: "xUnit", type: "string" },
        { name: "yLabel", type: "string" },
        { name: "yUnit", type: "string" },
      ],
      physicalConstraints: [
        "points must have >= 2 vertices with strictly positive total x-span",
        "gradientInterval endpoints must match vertex x-values in points",
        "when massKg > 0, initialValue^2 + 2 * signedArea / massKg >= 0 yields finalSpeedFromWorkMs",
      ],
      probeSpecs: [
        {
          kind: "piecewise-linear-graph",
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 4 },
            { x: 6, y: 4 },
            { x: 8, y: 0 },
          ],
          integralInterval: [0, 8],
          gradientInterval: [0, 2],
          initialValue: 1,
          massKg: 2,
        },
      ],
    },
    {
      kind: "rover-distance",
      summary: "Signed velocity-time graph integrating net displacement and total unsigned distance",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          unit: "s, m s^-1",
          bounds: "length >= 2, x from 0 to durationS",
        },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: ["points must cover [0, durationS] with monotonic x"],
      probeSpecs: [
        {
          kind: "rover-distance",
          durationS: 8,
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 4 },
            { x: 6, y: -2 },
            { x: 8, y: 0 },
          ],
        },
      ],
    },
    {
      kind: "cart-work",
      summary: "Resultant force vs position graph computing net work and final speed via work-energy theorem",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          unit: "m, N",
          bounds: "length >= 2, x covering [0, distanceM]",
        },
        { name: "distanceM", type: "number", unit: "m", bounds: "> 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialSpeedMs", type: "number", unit: "m s^-1", bounds: ">= 0" },
      ],
      physicalConstraints: ["initialSpeedMs^2 + 2 * workJ / massKg >= 0"],
      probeSpecs: [
        {
          kind: "cart-work",
          distanceM: 6,
          massKg: 2,
          initialSpeedMs: 3,
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 6 },
            { x: 6, y: 0 },
          ],
        },
      ],
    },
    {
      kind: "shuttle-motion",
      summary: "Velocity-time journey profile computing total distance, mean speed, and braking acceleration",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          unit: "s, m s^-1",
          bounds: "length >= 2, must include vertices at x = brakingStartS and x = durationS",
        },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
        {
          name: "brakingStartS",
          type: "number",
          unit: "s",
          bounds: "0 <= brakingStartS < durationS",
        },
      ],
      physicalConstraints: [
        "points must contain exact vertices at x === brakingStartS and x === durationS",
      ],
      probeSpecs: [
        {
          kind: "shuttle-motion",
          durationS: 10,
          brakingStartS: 7,
          points: [
            { x: 0, y: 0 },
            { x: 3, y: 6 },
            { x: 7, y: 6 },
            { x: 10, y: 0 },
          ],
        },
      ],
    },
    {
      kind: "lift-acceleration",
      summary: "Acceleration-time graph computing final velocity and peak speed at acceleration sign change",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          unit: "s, m s^-2",
          bounds: "length >= 2, x covering [0, durationS]",
        },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
        { name: "initialSpeedMs", type: "number", unit: "m s^-1", bounds: "finite" },
        {
          name: "peakTimeS",
          type: "number",
          unit: "s",
          bounds: "0 < peakTimeS <= durationS",
        },
      ],
      physicalConstraints: ["points must cover [0, durationS] monotonically"],
      probeSpecs: [
        {
          kind: "lift-acceleration",
          durationS: 8,
          initialSpeedMs: 2,
          peakTimeS: 4,
          points: [
            { x: 0, y: 2 },
            { x: 4, y: 0 },
            { x: 8, y: -2 },
          ],
        },
      ],
    },
    {
      kind: "glider-momentum",
      summary: "Momentum-time graph computing mean resultant force and net work Δ(p^2 / 2m)",
      requiredFields: [
        {
          name: "points",
          type: "Array<{x: number, y: number}>",
          unit: "s, kg m s^-1",
          bounds: "length >= 2, must contain vertices at forceStartS and forceEndS",
        },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "forceStartS", type: "number", unit: "s", bounds: ">= 0" },
        {
          name: "forceEndS",
          type: "number",
          unit: "s",
          bounds: "> forceStartS",
        },
      ],
      physicalConstraints: [
        "points must contain exact vertices at x === forceStartS and x === forceEndS",
      ],
      probeSpecs: [
        {
          kind: "glider-momentum",
          massKg: 0.5,
          forceStartS: 2,
          forceEndS: 5,
          points: [
            { x: 0, y: 1 },
            { x: 2, y: 1 },
            { x: 5, y: 2.5 },
            { x: 7, y: 2.5 },
          ],
        },
      ],
    },
  ],

  circuits: [
    {
      kind: "dc-series-parallel",
      summary: "General DC network with optional internal resistance, series resistor, and N>=1 parallel branches",
      requiredFields: [
        { name: "emfV", type: "number", unit: "V", bounds: "> 0" },
        {
          name: "parallelBranchOhms",
          type: "number[]",
          unit: "Ohm",
          bounds: "length >= 1, each > 0",
        },
      ],
      optionalFields: [
        { name: "internalOhm", type: "number", unit: "Ohm", bounds: ">= 0" },
        { name: "seriesOhm", type: "number", unit: "Ohm", bounds: ">= 0" },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: [
        "emfV > 0, internalOhm >= 0, seriesOhm >= 0, all parallelBranchOhms > 0",
      ],
      probeSpecs: [
        {
          kind: "dc-series-parallel",
          emfV: 12,
          internalOhm: 1,
          seriesOhm: 3,
          parallelBranchOhms: [6, 12],
          durationS: 10,
        },
      ],
    },
    {
      kind: "branch-heater",
      summary: "Ideal supply feeding a series resistor and two-branch parallel heater network",
      requiredFields: [
        { name: "voltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "seriesOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        {
          name: "branchOhm",
          type: "[number, number]",
          unit: "Ohm",
          bounds: "both > 0",
        },
      ],
      physicalConstraints: ["all resistances and voltageV > 0"],
      probeSpecs: [
        {
          kind: "branch-heater",
          voltageV: 12,
          seriesOhm: 2,
          branchOhm: [6, 12],
        },
      ],
    },
    {
      kind: "resistor-network",
      summary: "Series resistor combined with two parallel resistors driven by an ideal voltage source",
      requiredFields: [
        { name: "voltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "seriesOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        {
          name: "branchOhm",
          type: "[number, number]",
          unit: "Ohm",
          bounds: "both > 0",
        },
      ],
      physicalConstraints: ["all resistances and voltageV > 0"],
      probeSpecs: [
        {
          kind: "resistor-network",
          voltageV: 18,
          seriesOhm: 3,
          branchOhm: [6, 12],
        },
      ],
    },
    {
      kind: "sensor-current",
      summary: "Two parallel branches across ideal supply: a two-resistor series branch and a single resistor branch",
      requiredFields: [
        { name: "voltageV", type: "number", unit: "V", bounds: "> 0" },
        {
          name: "branchSeriesOhm",
          type: "[number, number]",
          unit: "Ohm",
          bounds: "both > 0",
        },
        { name: "otherOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["voltageV > 0 and all resistances > 0"],
      probeSpecs: [
        {
          kind: "sensor-current",
          voltageV: 12,
          branchSeriesOhm: [4, 8],
          otherOhm: 6,
        },
      ],
    },
    {
      kind: "battery-energy",
      summary: "Non-ideal battery (emf + internal resistance) delivering energy to an external load over durationS",
      requiredFields: [
        { name: "emfV", type: "number", unit: "V", bounds: "> 0" },
        { name: "internalOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "loadOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: ["emfV, internalOhm, loadOhm, durationS > 0"],
      probeSpecs: [
        {
          kind: "battery-energy",
          emfV: 12,
          internalOhm: 1,
          loadOhm: 5,
          durationS: 10,
        },
      ],
    },
    {
      kind: "light-alarm",
      summary: "LDR and fixed resistor potential divider comparing dark vs bright output voltages",
      requiredFields: [
        { name: "voltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "fixedOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "darkOhm", type: "number", unit: "Ohm", bounds: "> brightOhm > 0" },
        { name: "brightOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["darkOhm > brightOhm > 0, fixedOhm > 0, voltageV > 0"],
      probeSpecs: [
        {
          kind: "light-alarm",
          voltageV: 9,
          fixedOhm: 2000,
          darkOhm: 10000,
          brightOhm: 500,
        },
      ],
    },
    {
      kind: "internal-resistance",
      summary: "Cell emf and internal resistance deduced from two (currentA, terminalVoltageV) operating points",
      requiredFields: [
        {
          name: "measurements",
          type: "[{currentA: number, terminalVoltageV: number}, {currentA: number, terminalVoltageV: number}]",
          unit: "A, V",
          bounds: "distinct positive currents with decreasing terminal voltage",
        },
      ],
      physicalConstraints: [
        "currentA > 0, terminalVoltageV > 0, and (V2 - V1)/(I1 - I2) > 0",
      ],
      probeSpecs: [
        {
          kind: "internal-resistance",
          measurements: [
            { currentA: 0.5, terminalVoltageV: 5.5 },
            { currentA: 1.5, terminalVoltageV: 4.5 },
          ],
        },
      ],
    },
    {
      kind: "ldr-divider",
      summary: "LDR potential divider total resistance, dark current, and qualitative trend",
      requiredFields: [
        { name: "emfV", type: "number", unit: "V", bounds: "> 0" },
        { name: "darkLdrResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "fixedResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "ldr-divider",
          emfV: 6,
          darkLdrResistanceOhm: 8000,
          fixedResistanceOhm: 2000,
        },
      ],
    },
    {
      kind: "thermistor-divider",
      summary: "Series resistor feeding parallel fixed-resistor + thermistor sub-branch",
      requiredFields: [
        { name: "emfV", type: "number", unit: "V", bounds: "> 0" },
        { name: "seriesResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        {
          name: "parallelFixedResistanceOhm",
          type: "number",
          unit: "Ohm",
          bounds: "> 0",
        },
        {
          name: "parallelVoltageV",
          type: "number",
          unit: "V",
          bounds: "0 < parallelVoltageV < emfV",
        },
      ],
      physicalConstraints: [
        "0 < parallelVoltageV < emfV and implied thermistor resistance > 0",
      ],
      probeSpecs: [
        {
          kind: "thermistor-divider",
          emfV: 12,
          seriesResistanceOhm: 100,
          parallelFixedResistanceOhm: 300,
          parallelVoltageV: 6,
        },
      ],
    },
    {
      kind: "resistance-order",
      summary: "Comparison of equivalent resistances across three identical-resistor networks P, Q, R",
      requiredFields: [
        { name: "identicalResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["identicalResistanceOhm > 0"],
      probeSpecs: [{ kind: "resistance-order", identicalResistanceOhm: 12 }],
    },
    {
      kind: "switched-power",
      summary: "Identical-resistor switched network comparing open-switch vs closed-switch power in R1",
      requiredFields: [
        { name: "resistorOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "openR1PowerW", type: "number", unit: "W", bounds: "> 0" },
      ],
      physicalConstraints: ["resistorOhm > 0 and openR1PowerW > 0"],
      probeSpecs: [{ kind: "switched-power", resistorOhm: 10, openR1PowerW: 20 }],
    },
    {
      kind: "bypass-equivalent",
      summary: "Three-resistor bypass topology equivalent resistance R/3",
      requiredFields: [
        { name: "resistorOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["resistorOhm > 0"],
      probeSpecs: [{ kind: "bypass-equivalent", resistorOhm: 15 }],
    },
    {
      kind: "lamp-failure",
      summary: "Identical-lamp mixed network before and after parallel branch lamp failure",
      requiredFields: [
        { name: "lampResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "supplyVoltageV", type: "number", unit: "V", bounds: "> 0" },
      ],
      physicalConstraints: ["lampResistanceOhm > 0 and supplyVoltageV > 0"],
      probeSpecs: [
        { kind: "lamp-failure", lampResistanceOhm: 12, supplyVoltageV: 6 },
      ],
    },
    {
      kind: "series-components",
      summary: "Non-ohmic component Q in series with resistor P evaluated at operating points",
      requiredFields: [
        {
          name: "pOperatingPoint",
          type: "{voltageV: number, currentA: number}",
          unit: "V, A",
          bounds: "both > 0",
        },
        {
          name: "qOperatingPoints",
          type: "[{voltageV: number, currentA: number}, {voltageV: number, currentA: number}]",
          unit: "V, A",
          bounds: "increasing resistance across points",
        },
        {
          name: "circuitQVoltageV",
          type: "number",
          unit: "V",
          bounds: "must match one of qOperatingPoints[].voltageV",
        },
      ],
      physicalConstraints: [
        "R_Q(high) > R_Q(low) and circuitQVoltageV matches a supplied operating point",
      ],
      probeSpecs: [
        {
          kind: "series-components",
          pOperatingPoint: { voltageV: 2, currentA: 0.5 },
          qOperatingPoints: [
            { voltageV: 1, currentA: 0.4 },
            { voltageV: 4, currentA: 0.5 },
          ],
          circuitQVoltageV: 4,
        },
      ],
    },
  ],

  fields: [
    {
      kind: "charge-field",
      summary: "1D electric field superposition at probe point between two collinear point charges in nC",
      requiredFields: [
        {
          name: "chargesNC",
          type: "[number, number]",
          unit: "nC",
          bounds: "non-zero finite charges",
        },
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "probeM",
          type: "number",
          unit: "m",
          bounds: "0 < probeM < separationM",
        },
      ],
      physicalConstraints: ["0 < probeM < separationM"],
      probeSpecs: [
        {
          kind: "charge-field",
          chargesNC: [4, -6],
          separationM: 0.6,
          probeM: 0.2,
        },
      ],
    },
    {
      kind: "collinear-charges",
      summary: "1D electric field and scalar electric potential at probeM between two collinear charges in nC",
      requiredFields: [
        {
          name: "chargesNC",
          type: "[number, number]",
          unit: "nC",
          bounds: "non-zero finite charges",
        },
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "probeM",
          type: "number",
          unit: "m",
          bounds: "0 < probeM < separationM",
        },
      ],
      physicalConstraints: ["0 < probeM < separationM"],
      probeSpecs: [
        {
          kind: "collinear-charges",
          chargesNC: [3, -5],
          separationM: 0.5,
          probeM: 0.2,
        },
      ],
    },
    {
      kind: "negative-probe",
      summary: "1D electric field, scalar potential, and force on a test charge placed at probeM",
      requiredFields: [
        { name: "chargesNC", type: "[number, number]", unit: "nC" },
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "probeM",
          type: "number",
          unit: "m",
          bounds: "0 < probeM < separationM",
        },
        { name: "testChargeNC", type: "number", unit: "nC", bounds: "!= 0" },
      ],
      physicalConstraints: ["0 < probeM < separationM"],
      probeSpecs: [
        {
          kind: "negative-probe",
          chargesNC: [4, -8],
          separationM: 0.6,
          probeM: 0.2,
          testChargeNC: -2,
        },
      ],
    },
    {
      kind: "null-potential",
      summary: "Zero-field position and scalar potential between two like-sign point charges",
      requiredFields: [
        {
          name: "chargesNC",
          type: "[number, number]",
          unit: "nC",
          bounds: "same sign, non-zero",
        },
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["chargesNC[0] and chargesNC[1] must have the same non-zero sign"],
      probeSpecs: [
        { kind: "null-potential", chargesNC: [4, 9], separationM: 0.5 },
      ],
    },
    {
      kind: "field-work",
      summary: "Work done by a uniform electric field and potential-energy change across three equipotentials",
      requiredFields: [
        { name: "potentialsV", type: "[number, number, number]", unit: "V" },
        { name: "spacingM", type: "number", unit: "m", bounds: "> 0" },
        { name: "chargeC", type: "number", unit: "C", bounds: "!= 0" },
      ],
      physicalConstraints: ["spacingM > 0"],
      probeSpecs: [
        {
          kind: "field-work",
          potentialsV: [120, 60, 0],
          spacingM: 0.05,
          chargeC: 2e-9,
        },
      ],
    },
    {
      kind: "guided-bead",
      summary: "Charged bead accelerated from rest across parallel equipotential lines",
      requiredFields: [
        {
          name: "potentialsV",
          type: "[number, number, number]",
          unit: "V",
          bounds: "potentialsV[1] > potentialsV[2] for positive chargeC",
        },
        { name: "spacingM", type: "number", unit: "m", bounds: "> 0" },
        { name: "chargeC", type: "number", unit: "C", bounds: "> 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
      ],
      physicalConstraints: [
        "chargeC * (potentialsV[1] - potentialsV[2]) > 0, massKg > 0, spacingM > 0",
      ],
      probeSpecs: [
        {
          kind: "guided-bead",
          potentialsV: [200, 100, 0],
          spacingM: 0.04,
          chargeC: 2e-6,
          massKg: 1e-4,
        },
      ],
    },
    {
      kind: "parallel-plates-particle",
      summary: "Charged particle accelerated from rest across uniform parallel plates",
      requiredFields: [
        { name: "potentialDifferenceV", type: "number", unit: "V", bounds: "> 0" },
        { name: "plateSeparationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "chargeC", type: "number", unit: "C", bounds: "> 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
      ],
      physicalConstraints: [
        "potentialDifferenceV, plateSeparationM, chargeC, massKg must all be > 0",
      ],
      probeSpecs: [
        {
          kind: "parallel-plates-particle",
          potentialDifferenceV: 400,
          plateSeparationM: 0.02,
          chargeC: 1.6e-19,
          massKg: 9.11e-31,
        },
      ],
    },
    {
      kind: "electric-superposition",
      summary: "Dimensionless inverse-square superposition between two like-sign sources on a grid",
      requiredFields: [
        { name: "leftMagnitude", type: "number", bounds: "> 0" },
        { name: "rightMagnitude", type: "number", bounds: "> 0" },
        { name: "separationUnits", type: "number", bounds: "> 0" },
        {
          name: "pointUnitsFromLeft",
          type: "number",
          bounds: "0 < pointUnitsFromLeft < separationUnits",
        },
      ],
      physicalConstraints: ["0 < pointUnitsFromLeft < separationUnits"],
      probeSpecs: [
        {
          kind: "electric-superposition",
          leftMagnitude: 4,
          rightMagnitude: 9,
          separationUnits: 4,
          pointUnitsFromLeft: 1,
        },
      ],
    },
    {
      kind: "zero-field-mass-ratio",
      summary: "Mass or charge ratio deduced from fractional zero-field position between two bodies",
      requiredFields: [
        { name: "fractionFromLeft", type: "number", bounds: "0 < fractionFromLeft < 1" },
      ],
      physicalConstraints: ["0 < fractionFromLeft < 1"],
      probeSpecs: [{ kind: "zero-field-mass-ratio", fractionFromLeft: 0.4 }],
    },
    {
      kind: "equipotential-gradient",
      summary: "Gravitational field strength from uniform equipotential step and line spacing",
      requiredFields: [
        { name: "potentialStepJkg", type: "number", unit: "J kg^-1", bounds: "!= 0" },
        { name: "spacingM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["spacingM > 0"],
      probeSpecs: [
        { kind: "equipotential-gradient", potentialStepJkg: 20, spacingM: 2 },
      ],
    },
    {
      kind: "field-line-choice",
      summary: "Null-point fraction for field-line pattern between unequal like charges",
      requiredFields: [
        { name: "leftMagnitude", type: "number", bounds: "> 0" },
        { name: "rightMagnitude", type: "number", bounds: "> 0" },
      ],
      physicalConstraints: ["leftMagnitude > 0 and rightMagnitude > 0"],
      probeSpecs: [
        { kind: "field-line-choice", leftMagnitude: 2, rightMagnitude: 8 },
      ],
    },
    {
      kind: "zero-field-stability",
      summary: "Equilibrium stability of a test charge displaced axially vs perpendicularly from null point",
      requiredFields: [
        { name: "leftMagnitude", type: "number", bounds: "> 0" },
        { name: "rightMagnitude", type: "number", bounds: "> 0" },
      ],
      physicalConstraints: ["leftMagnitude > 0 and rightMagnitude > 0"],
      probeSpecs: [
        { kind: "zero-field-stability", leftMagnitude: 4, rightMagnitude: 4 },
      ],
    },
    {
      kind: "two-charge-field-graph",
      summary: "Second charge magnitude and sign deduced from zero-crossing of E(x) between two charges",
      requiredFields: [
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "zeroPositionM",
          type: "number",
          unit: "m",
          bounds: "0 < zeroPositionM < separationM",
        },
        { name: "leftChargeC", type: "number", unit: "C", bounds: "!= 0" },
      ],
      physicalConstraints: ["0 < zeroPositionM < separationM and leftChargeC != 0"],
      probeSpecs: [
        {
          kind: "two-charge-field-graph",
          separationM: 0.6,
          zeroPositionM: 0.2,
          leftChargeC: 2e-9,
        },
      ],
    },
    {
      kind: "nuclear-potential",
      summary: "Electrostatic potential and Coulomb barrier at closest approach to a nucleus",
      requiredFields: [
        { name: "sourceChargeUnits", type: "number", unit: "e", bounds: "> 0" },
        { name: "probeChargeUnits", type: "number", unit: "e", bounds: "> 0" },
        { name: "closestApproachM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "nuclear-potential",
          sourceChargeUnits: 79,
          probeChargeUnits: 2,
          closestApproachM: 4e-14,
        },
      ],
    },
    {
      kind: "two-body-gravitational-potential",
      summary: "Two-body planet-moon gravitational potential curve, field at sample point, and transfer mass",
      requiredFields: [
        { name: "moonMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "planetMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "moonRadiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "planetRadiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "samplePositionM",
          type: "number",
          unit: "m",
          bounds: "moonRadiusM < samplePositionM < separationM - planetRadiusM",
        },
        { name: "workJ", type: "number", unit: "J", bounds: "> 0" },
      ],
      physicalConstraints: [
        "moonRadiusM < samplePositionM < separationM - planetRadiusM",
      ],
      probeSpecs: [
        {
          kind: "two-body-gravitational-potential",
          moonMassKg: 7.35e22,
          planetMassKg: 5.97e24,
          separationM: 3.84e8,
          moonRadiusM: 1.74e6,
          planetRadiusM: 6.37e6,
          samplePositionM: 3.0e8,
          workJ: 2.5e9,
        },
      ],
    },
  ],

  mechanics: [
    {
      kind: "projectile-kinematics",
      summary: "Level-ground projectile motion flight time, components, maximum height, and horizontal range",
      requiredFields: [
        { name: "launchSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        {
          name: "launchAngleDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 < launchAngleDegrees < 90",
        },
        {
          name: "gravityMs2",
          type: "number",
          unit: "m s^-2",
          bounds: "> 0 (9.8 IB, 9.81 A-Level/NCUK)",
        },
      ],
      physicalConstraints: [
        "launchSpeedMs > 0, gravityMs2 > 0, 0 < launchAngleDegrees < 90",
      ],
      probeSpecs: [
        {
          kind: "projectile-kinematics",
          launchSpeedMs: 20,
          launchAngleDegrees: 35,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "projectile-flight",
      summary: "Symbolic projectile flight-time relation 2v sin(theta)/g",
      requiredFields: [],
      optionalFields: [
        { name: "launchAngleDegrees", type: "number", unit: "deg", bounds: "0 < angle < 90" },
      ],
      physicalConstraints: ["symbolic flight-time archetype"],
      probeSpecs: [{ kind: "projectile-flight" }],
    },
    {
      kind: "collision-loss",
      summary: "1D collision of moving cart X with stationary cart Y computing post-impact v_X and kinetic energy loss",
      requiredFields: [
        { name: "massXKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "massYKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialXMs", type: "number", unit: "m s^-1", bounds: "!= 0" },
        { name: "finalYMs", type: "number", unit: "m s^-1", bounds: "finite" },
      ],
      physicalConstraints: ["massXKg > 0, massYKg > 0, lostEnergyJ >= 0 for passive collision"],
      probeSpecs: [
        {
          kind: "collision-loss",
          massXKg: 2,
          massYKg: 3,
          initialXMs: 4,
          finalYMs: 2,
        },
      ],
    },
    {
      kind: "cart-collision",
      summary: "General 1D two-cart momentum conservation solving finalXMs and momentumBeforeKgMs",
      requiredFields: [
        { name: "massXKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "massYKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialXMs", type: "number", unit: "m s^-1", bounds: "finite" },
        { name: "initialYMs", type: "number", unit: "m s^-1", bounds: "finite" },
        { name: "finalYMs", type: "number", unit: "m s^-1", bounds: "finite" },
      ],
      physicalConstraints: ["massXKg > 0 and massYKg > 0"],
      probeSpecs: [
        {
          kind: "cart-collision",
          massXKg: 2,
          massYKg: 3,
          initialXMs: 5,
          initialYMs: 0,
          finalYMs: 2,
        },
      ],
    },
    {
      kind: "circle-bottom",
      summary: "Tension and centripetal force at the bottom of a vertical circle",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "circle-bottom",
          massKg: 0.5,
          radiusM: 1.2,
          speedMs: 4,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "circle-limit",
      summary: "Maximum safe speed at bottom of vertical circle given string tension limit",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "maxTensionN",
          type: "number",
          unit: "N",
          bounds: "> massKg * gravityMs2",
        },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: ["maxTensionN > massKg * gravityMs2"],
      probeSpecs: [
        {
          kind: "circle-limit",
          massKg: 0.5,
          radiusM: 0.8,
          maxTensionN: 25,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "ramp-resistance",
      summary: "Constant-speed motion down a rough ramp of length L and vertical drop h",
      requiredFields: [
        { name: "weightN", type: "number", unit: "N", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> heightM" },
        { name: "heightM", type: "number", unit: "m", bounds: "0 < heightM < lengthM" },
      ],
      physicalConstraints: ["0 < heightM < lengthM and weightN > 0"],
      probeSpecs: [
        { kind: "ramp-resistance", weightN: 60, lengthM: 6, heightM: 2 },
      ],
    },
    {
      kind: "ramp-heating",
      summary: "Frictional resistance and thermal power dissipated on a constant-speed rough ramp",
      requiredFields: [
        { name: "weightN", type: "number", unit: "N", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> heightM" },
        { name: "heightM", type: "number", unit: "m", bounds: "0 < heightM < lengthM" },
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
      ],
      physicalConstraints: ["0 < heightM < lengthM, weightN > 0, speedMs > 0"],
      probeSpecs: [
        {
          kind: "ramp-heating",
          weightN: 50,
          lengthM: 5,
          heightM: 1.5,
          speedMs: 2,
        },
      ],
    },
    {
      kind: "incline-friction",
      summary: "Block sliding from rest down rough incline of angleDegrees reaching finalSpeedMs",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "angleDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 < angleDegrees < 90",
        },
        { name: "finalSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: [
        "0.5 * finalSpeedMs^2 <= gravityMs2 * lengthM * sin(angleDegrees)",
      ],
      probeSpecs: [
        {
          kind: "incline-friction",
          massKg: 2,
          lengthM: 5,
          angleDegrees: 30,
          finalSpeedMs: 5,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "short-ramp",
      summary: "Rough incline energy loss, friction force, and half-length release speed scaling",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "angleDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 < angleDegrees < 90",
        },
        { name: "finalSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: [
        "0.5 * finalSpeedMs^2 <= gravityMs2 * lengthM * sin(angleDegrees)",
      ],
      probeSpecs: [
        {
          kind: "short-ramp",
          massKg: 2,
          lengthM: 4,
          angleDegrees: 30,
          finalSpeedMs: 4,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "pendulum-collision",
      summary: "Horizontal-release pendulum bob coalescing with stationary target mass at lowest point",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "targetMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "pendulum-collision",
          massKg: 0.5,
          targetMassKg: 1.0,
          lengthM: 1.2,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "pendulum-loss",
      summary: "Inelastic coalescing pendulum impact computing pre/post speeds, kinetic energy lost, and rise height",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "targetMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "pendulum-loss",
          massKg: 0.4,
          targetMassKg: 0.6,
          lengthM: 0.8,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "elastic-rope",
      summary: "Bungee / elastic-rope drop of natural length L and maximum extension x",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "extensionM", type: "number", unit: "m", bounds: "> 0" },
        { name: "intervalS", type: "number", unit: "s", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: ["all inputs > 0"],
      probeSpecs: [
        {
          kind: "elastic-rope",
          massKg: 65,
          lengthM: 12,
          extensionM: 8,
          intervalS: 1.5,
          gravityMs2: 9.8,
        },
      ],
    },
    {
      kind: "truck",
      summary: "Multi-stage vehicle accelerometer deflection, flat cornering limit, and resistive stopping arc",
      requiredFields: [
        {
          name: "deflectionDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 < deflectionDegrees < 90",
        },
        {
          name: "inclineDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 < inclineDegrees < 90",
        },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "frictionCoefficient",
          type: "number",
          bounds: "0 < frictionCoefficient <= 2",
        },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "resistanceN", type: "number", unit: "N", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: [
        "0 < deflectionDegrees < 90, 0 < inclineDegrees < 90, 0 < frictionCoefficient <= 2",
      ],
      probeSpecs: [
        {
          kind: "truck",
          deflectionDegrees: 12,
          inclineDegrees: 10,
          radiusM: 45,
          frictionCoefficient: 0.6,
          massKg: 2500,
          initialSpeedMs: 14,
          resistanceN: 1800,
          gravityMs2: 9.8,
        },
      ],
    },
  ],

  waves: [
    {
      kind: "progressive-wave",
      summary: "Sinusoidal travelling wave displacement-position or displacement-time profile and two-point phase difference",
      requiredFields: [
        {
          name: "profileKind",
          type: "string",
          enumValues: ["displacement-position", "displacement-time"],
        },
        { name: "amplitudeM", type: "number", unit: "m", bounds: "> 0" },
        { name: "wavelengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "frequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "direction", type: "string", enumValues: ["right", "left"] },
        { name: "initialPhaseRad", type: "number", unit: "rad" },
        { name: "snapshotTimeS", type: "number", unit: "s", bounds: ">= 0" },
        { name: "fixedPositionM", type: "number", unit: "m", bounds: ">= 0" },
        { name: "cyclesShown", type: "number", bounds: "0.5 <= cyclesShown <= 8" },
        { name: "point1Coord", type: "number" },
        { name: "point2Coord", type: "number" },
      ],
      physicalConstraints: ["amplitudeM, wavelengthM, frequencyHz > 0"],
    },
    {
      kind: "standing-wave",
      summary: "Standing wave harmonics on fixed string, open-open pipe, or open-closed pipe",
      requiredFields: [
        {
          name: "boundaryKind",
          type: "string",
          enumValues: ["string-fixed-both", "pipe-open-both", "pipe-closed-one"],
        },
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "harmonicNumber",
          type: "integer",
          bounds: "1..15 (odd integers only when boundaryKind === 'pipe-closed-one')",
        },
      ],
      optionalFields: [
        { name: "waveSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "tensionN", type: "number", unit: "N", bounds: "> 0" },
        { name: "linearDensityKgM", type: "number", unit: "kg m^-1", bounds: "> 0" },
        { name: "endCorrectionM", type: "number", unit: "m", bounds: ">= 0" },
        { name: "amplitudeM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: [
        "pipe-closed-one requires odd harmonicNumber (1, 3, 5, ...)",
        "supply either waveSpeedMs > 0 OR both tensionN > 0 and linearDensityKgM > 0",
      ],
    },
    {
      kind: "double-slit",
      summary: "Young's double-slit interference fringe spacing and optional single-slit envelope modulation",
      requiredFields: [
        { name: "wavelengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "slitSeparationM",
          type: "number",
          unit: "m",
          bounds: "> wavelengthM",
        },
        { name: "screenDistanceM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        {
          name: "slitWidthM",
          type: "number",
          unit: "m",
          bounds: "0 < slitWidthM < slitSeparationM",
        },
        { name: "orderN", type: "integer", bounds: "1 <= orderN <= maxOrder" },
      ],
      physicalConstraints: [
        "wavelengthM < slitSeparationM and orderN * wavelengthM < slitSeparationM",
      ],
    },
    {
      kind: "diffraction-grating",
      summary: "Multi-slit diffraction grating d sin(theta) = n lambda maxima and angular orders",
      requiredFields: [
        { name: "wavelengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "slitSpacingM",
          type: "number",
          unit: "m",
          bounds: "> wavelengthM",
        },
      ],
      optionalFields: [
        { name: "linesPerMm", type: "number", unit: "mm^-1", bounds: "consistent with 1e-3 / slitSpacingM" },
        { name: "queryOrderN", type: "integer", bounds: "0 <= queryOrderN <= maxOrder" },
        { name: "screenDistanceM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["queryOrderN * wavelengthM < slitSpacingM"],
    },
    {
      kind: "single-slit",
      summary: "Single-slit Fraunhofer diffraction central maximum width and first minimum angle",
      requiredFields: [
        { name: "wavelengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "slitWidthM",
          type: "number",
          unit: "m",
          bounds: "> wavelengthM",
        },
        { name: "screenDistanceM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["0 < wavelengthM < slitWidthM and screenDistanceM > 0"],
    },
    {
      kind: "doppler-effect",
      summary: "Classical acoustic/wave Doppler shift for moving source and/or moving observer",
      requiredFields: [
        { name: "emittedFrequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
        { name: "waveSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        {
          name: "sourceSpeedMs",
          type: "number",
          unit: "m s^-1",
          bounds: "0 <= sourceSpeedMs < waveSpeedMs",
        },
        {
          name: "sourceMotion",
          type: "string",
          enumValues: ["stationary", "towards-observer", "away-from-observer"],
        },
        {
          name: "observerSpeedMs",
          type: "number",
          unit: "m s^-1",
          bounds: "0 <= observerSpeedMs < waveSpeedMs",
        },
        {
          name: "observerMotion",
          type: "string",
          enumValues: ["stationary", "towards-source", "away-from-source"],
        },
      ],
      physicalConstraints: [
        "sourceSpeedMs === 0 when sourceMotion === 'stationary'; observerSpeedMs === 0 when observerMotion === 'stationary'",
        "sourceSpeedMs < waveSpeedMs and observerSpeedMs < waveSpeedMs",
      ],
    },
    {
      kind: "malus-polarization",
      summary: "Malus's law intensity transmission for polarized or unpolarized incident light through an analyzer",
      requiredFields: [
        { name: "incidentIntensityWm2", type: "number", unit: "W m^-2", bounds: "> 0" },
        {
          name: "analyzerAngleDegrees",
          type: "number",
          unit: "deg",
          bounds: "0 <= analyzerAngleDegrees <= 180",
        },
      ],
      optionalFields: [
        {
          name: "incidentPolarization",
          type: "string",
          enumValues: ["polarized", "unpolarized"],
        },
      ],
      physicalConstraints: [
        "incidentIntensityWm2 > 0 and 0 <= analyzerAngleDegrees <= 180",
      ],
    },
  ],

  "optics-shm": [
    {
      kind: "planar-refraction",
      summary: "Snell's law refraction, critical angle, and total internal reflection at a planar dielectric interface",
      requiredFields: [
        { name: "n1", type: "number", bounds: ">= 1" },
        { name: "n2", type: "number", bounds: ">= 1" },
        {
          name: "incidentAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 <= incidentAngleDeg < 90",
        },
      ],
      optionalFields: [
        { name: "medium1Name", type: "string" },
        { name: "medium2Name", type: "string" },
        { name: "vacuumWavelengthNm", type: "number", unit: "nm", bounds: "> 0" },
        { name: "vacuumSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "showPartialReflection", type: "boolean" },
      ],
      physicalConstraints: ["n1 >= 1, n2 >= 1, 0 <= incidentAngleDeg < 90"],
    },
    {
      kind: "multi-layer-slab",
      summary: "Ray propagation and transverse/lateral shift across >= 2 parallel dielectric layers",
      requiredFields: [
        {
          name: "layers",
          type: "Array<{name?: string, refractiveIndex: number, thicknessM?: number}>",
          bounds: "length >= 2, refractiveIndex >= 1, interior thicknessM > 0",
        },
        {
          name: "incidentAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 <= incidentAngleDeg < 90",
        },
      ],
      optionalFields: [
        { name: "vacuumWavelengthNm", type: "number", unit: "nm", bounds: "> 0" },
        { name: "vacuumSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
      ],
      physicalConstraints: ["layers.length >= 2, each refractiveIndex >= 1"],
    },
    {
      kind: "optical-fiber",
      summary: "Step-index optical fiber numerical aperture, acceptance angle, critical angle, and modal dispersion",
      requiredFields: [
        { name: "nCore", type: "number", bounds: "> nCladding" },
        { name: "nCladding", type: "number", bounds: ">= 1" },
        {
          name: "launchAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 <= launchAngleDeg < 90",
        },
      ],
      optionalFields: [
        { name: "nExternal", type: "number", bounds: ">= 1 (default 1.0)" },
        { name: "fiberLengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "coreDiameterM", type: "number", unit: "m", bounds: "> 0" },
        { name: "vacuumSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
      ],
      physicalConstraints: ["nCore > nCladding >= 1 and 0 <= launchAngleDeg < 90"],
    },
    {
      kind: "thin-lens",
      summary: "Paraxial converging or diverging thin lens image formation, magnification, and optical power",
      requiredFields: [
        {
          name: "lensType",
          type: "string",
          enumValues: ["converging", "diverging"],
        },
        {
          name: "focalLengthM",
          type: "number",
          unit: "m",
          bounds: "> 0 (sign applied from lensType) or signed matching lensType",
        },
        { name: "objectDistanceM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "objectHeightM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: ["objectDistanceM > 0 and focalLengthM != 0"],
    },
    {
      kind: "mass-spring-shm",
      summary: "Horizontal or vertical mass-spring simple harmonic oscillator kinematics, forces, and energies",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "springConstantNm", type: "number", unit: "N m^-1", bounds: "> 0" },
        { name: "amplitudeM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        {
          name: "orientation",
          type: "string",
          enumValues: ["horizontal", "vertical"],
        },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
        { name: "initialPhaseRad", type: "number", unit: "rad" },
        { name: "phaseConvention", type: "string", enumValues: ["cosine", "sine"] },
        { name: "queryTimeS", type: "number", unit: "s", bounds: ">= 0" },
        {
          name: "queryDisplacementM",
          type: "number",
          unit: "m",
          bounds: "|queryDisplacementM| <= amplitudeM",
        },
        {
          name: "plotMode",
          type: "string",
          enumValues: [
            "time-series",
            "energy-displacement",
            "energy-time",
            "phase-portrait",
          ],
        },
      ],
      physicalConstraints: [
        "massKg > 0, springConstantNm > 0, amplitudeM > 0, |queryDisplacementM| <= amplitudeM",
      ],
    },
    {
      kind: "simple-pendulum-shm",
      summary: "Small-angle simple pendulum SHM period, angular amplitude, energy, and string tension",
      requiredFields: [
        { name: "lengthM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
        { name: "bobMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "amplitudeM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "maxAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 < maxAngleDeg <= 20",
        },
        { name: "queryTimeS", type: "number", unit: "s", bounds: ">= 0" },
        {
          name: "queryDisplacementM",
          type: "number",
          unit: "m",
          bounds: "|queryDisplacementM| <= amplitudeM",
        },
      ],
      physicalConstraints: [
        "lengthM > 0 and small-angle regime maxAngleDeg <= 20 degrees",
      ],
    },
    {
      kind: "kinematic-shm",
      summary: "Kinematic SHM oscillator specified by amplitude and one of (periodS, frequencyHz, angularFrequencyRadS)",
      requiredFields: [
        { name: "amplitudeM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "periodS", type: "number", unit: "s", bounds: "> 0" },
        { name: "frequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
        { name: "angularFrequencyRadS", type: "number", unit: "rad s^-1", bounds: "> 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialPhaseRad", type: "number", unit: "rad" },
        { name: "phaseConvention", type: "string", enumValues: ["cosine", "sine"] },
        { name: "queryTimeS", type: "number", unit: "s", bounds: ">= 0" },
        {
          name: "queryDisplacementM",
          type: "number",
          unit: "m",
          bounds: "|queryDisplacementM| <= amplitudeM",
        },
        {
          name: "plotMode",
          type: "string",
          enumValues: [
            "time-series",
            "energy-displacement",
            "energy-time",
            "phase-portrait",
          ],
        },
        {
          name: "phasePlotKind",
          type: "string",
          enumValues: ["velocity-displacement", "acceleration-displacement"],
        },
      ],
      physicalConstraints: [
        "provide amplitudeM > 0 and at least one consistent timing parameter (periodS, frequencyHz, or angularFrequencyRadS)",
      ],
    },
  ],

  thermal: [
    {
      kind: "thermodynamic-process",
      summary: "Monatomic ideal gas multi-step P-V / P-T / V-T processes and closed heat-engine cycles",
      requiredFields: [
        {
          name: "initialState",
          type: "{stateId?: string, label?: string, pressurePa?: number, volumeM3?: number, temperatureK?: number}",
          unit: "Pa, m^3, K",
          bounds: "at least 2 of (pressurePa, volumeM3, temperatureK) > 0 consistent with PV = nRT",
        },
        {
          name: "steps",
          type: "Array<{process: 'isobaric'|'isochoric'|'isothermal'|'adiabatic', toStateId?: string, toLabel?: string, targetPressurePa?: number, targetVolumeM3?: number, targetTemperatureK?: number, closeToInitial?: boolean}>",
          bounds: "length >= 1",
        },
      ],
      optionalFields: [
        { name: "moles", type: "number", unit: "mol", bounds: "> 0" },
        { name: "particleCount", type: "number", bounds: "> 0" },
        { name: "isClosedCycle", type: "boolean" },
        { name: "diagramPlane", type: "string", enumValues: ["PV", "PT", "VT"] },
      ],
      physicalConstraints: [
        "each step must specify exactly one valid target state variable (or closeToInitial: true on final closing leg)",
      ],
    },
    {
      kind: "carnot-cycle",
      summary: "Reversible ideal-gas Carnot heat engine or refrigerator cycle between T_hot and T_cold",
      requiredFields: [
        {
          name: "hotTemperatureK",
          type: "number",
          unit: "K",
          bounds: "> coldTemperatureK",
        },
        { name: "coldTemperatureK", type: "number", unit: "K", bounds: "> 0" },
        { name: "initialVolumeM3", type: "number", unit: "m^3", bounds: "> 0" },
        {
          name: "isothermalExpansionVolumeM3",
          type: "number",
          unit: "m^3",
          bounds: "> initialVolumeM3",
        },
      ],
      optionalFields: [
        { name: "moles", type: "number", unit: "mol", bounds: "> 0" },
        {
          name: "cycleDirection",
          type: "string",
          enumValues: ["heat-engine", "refrigerator"],
        },
        { name: "diagramPlane", type: "string", enumValues: ["PV", "PT", "VT"] },
      ],
      physicalConstraints: [
        "hotTemperatureK > coldTemperatureK > 0 and isothermalExpansionVolumeM3 > initialVolumeM3 > 0",
      ],
    },
    {
      kind: "phase-change-curve",
      summary: "Sensible and latent heat stages across heating or cooling curves with optional constant-power heater",
      requiredFields: [
        {
          name: "material",
          type: "{name?: string, massKg: number, meltingPointK: number, boilingPointK: number, specificHeatSolidJPerKgK?: number, specificHeatLiquidJPerKgK?: number, specificHeatGasJPerKgK?: number, latentHeatFusionJPerKg?: number, latentHeatVaporizationJPerKg?: number}",
          bounds: "massKg > 0, 0 < meltingPointK < boilingPointK",
        },
        { name: "initialTemperatureK", type: "number", unit: "K", bounds: "> 0" },
        {
          name: "finalTemperatureK",
          type: "number",
          unit: "K",
          bounds: "> 0 and != initialTemperatureK (unless phase change specified)",
        },
      ],
      optionalFields: [
        { name: "initialPhase", type: "string", enumValues: ["solid", "liquid", "gas"] },
        { name: "finalPhase", type: "string", enumValues: ["solid", "liquid", "gas"] },
        { name: "heaterPowerW", type: "number", unit: "W", bounds: "> 0" },
        { name: "heaterEfficiency", type: "number", bounds: "0 < heaterEfficiency <= 1" },
        { name: "xAxisMode", type: "string", enumValues: ["energy", "time"] },
        { name: "temperatureDisplayUnit", type: "string", enumValues: ["K", "C"] },
      ],
      physicalConstraints: [
        "required specific heats and latent heats for traversed phases must be > 0",
        "xAxisMode === 'time' requires heaterPowerW > 0",
      ],
    },
    {
      kind: "calorimetry-mixing",
      summary: "Thermal equilibrium mixing of >= 2 components in an insulated or lossy calorimeter",
      requiredFields: [
        {
          name: "components",
          type: "Array<{id: string, label: string, massKg: number, initialTemperatureK: number, specificHeatJPerKgK?: number, initialPhase?: 'solid'|'liquid'|'gas', meltingPointK?: number, boilingPointK?: number, latentHeatFusionJPerKg?: number}>",
          bounds: "length >= 2, unique ids, massKg > 0, initialTemperatureK > 0",
        },
      ],
      optionalFields: [
        { name: "heatLossToSurroundingsJ", type: "number", unit: "J", bounds: ">= 0" },
        { name: "temperatureDisplayUnit", type: "string", enumValues: ["K", "C"] },
        {
          name: "diagramVariant",
          type: "string",
          enumValues: ["calorimeter-schematic", "convergence-graph"],
        },
      ],
      physicalConstraints: [
        "components.length >= 2 with positive masses and heat capacities",
      ],
    },
    {
      kind: "kinetic-theory",
      summary: "Maxwell-Boltzmann molecular speeds (rms, mean, most probable), translational KE, and gas pressure/density",
      requiredFields: [
        { name: "temperatureK", type: "number", unit: "K", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "gasLabel", type: "string" },
        { name: "molarMassKgPerMol", type: "number", unit: "kg mol^-1", bounds: "> 0" },
        { name: "particleMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "moles", type: "number", unit: "mol", bounds: "> 0" },
        { name: "volumeM3", type: "number", unit: "m^3", bounds: "> 0" },
        { name: "comparisonTemperatureK", type: "number", unit: "K", bounds: "> 0" },
      ],
      physicalConstraints: [
        "temperatureK > 0 and supply at least one of molarMassKgPerMol > 0 or particleMassKg > 0",
      ],
    },
    {
      kind: "thermal-radiation",
      summary: "Stefan-Boltzmann radiative power, Wien peak wavelength, net ambient exchange, and inverse-square intensity",
      requiredFields: [
        { name: "temperatureK", type: "number", unit: "K", bounds: "> 0" },
        { name: "surfaceAreaM2", type: "number", unit: "m^2", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "bodyLabel", type: "string" },
        { name: "emissivity", type: "number", bounds: "0 < emissivity <= 1 (default 1)" },
        { name: "ambientTemperatureK", type: "number", unit: "K", bounds: ">= 0" },
        { name: "observerDistanceM", type: "number", unit: "m", bounds: "> 0" },
        { name: "comparisonTemperatureK", type: "number", unit: "K", bounds: "> 0" },
        { name: "comparisonEmissivity", type: "number", bounds: "0 < comparisonEmissivity <= 1" },
      ],
      physicalConstraints: [
        "temperatureK > 0, surfaceAreaM2 > 0, 0 < emissivity <= 1",
      ],
    },
  ],

  "grav-astro": [
    {
      kind: "conical-pendulum",
      summary: "Conical pendulum circular orbit radius, tension, angular speed, and period",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "stringLengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "semiVerticalAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 < semiVerticalAngleDeg < 89",
        },
      ],
      optionalFields: [
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: [
        "massKg > 0, stringLengthM > 0, 0 < semiVerticalAngleDeg < 89",
      ],
    },
    {
      kind: "flat-curve",
      summary: "Vehicle cornering on a flat horizontal curve with static friction limit",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        {
          name: "staticFrictionCoeff",
          type: "number",
          bounds: "0 < staticFrictionCoeff <= 2",
        },
      ],
      optionalFields: [
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
        { name: "requireNoSkid", type: "boolean" },
      ],
      physicalConstraints: [
        "when requireNoSkid !== false, speedMs <= sqrt(staticFrictionCoeff * gravityMs2 * radiusM)",
      ],
    },
    {
      kind: "banked-curve",
      summary: "Banked circular track ideal design speed, normal force, slope friction, and safe speed window",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "bankAngleDeg",
          type: "number",
          unit: "deg",
          bounds: "0 < bankAngleDeg < 80",
        },
        {
          name: "staticFrictionCoeff",
          type: "number",
          bounds: "0 <= staticFrictionCoeff <= 2",
        },
      ],
      optionalFields: [
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
        { name: "requireNoSkid", type: "boolean" },
      ],
      physicalConstraints: ["massKg > 0, radiusM > 0, 0 < bankAngleDeg < 80"],
    },
    {
      kind: "vertical-circle",
      summary: "Uniform or energy-conserving vertical circular motion for string, track, rod, or crest",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "radiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "motionMode",
          type: "string",
          enumValues: ["uniform", "energy-conserving"],
        },
        { name: "referenceSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
      ],
      optionalFields: [
        {
          name: "constraintKind",
          type: "string",
          enumValues: ["string", "inside-track", "rigid-rod", "over-crest"],
        },
        {
          name: "referencePosition",
          type: "string",
          enumValues: ["top", "bottom"],
        },
        { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "> 0" },
      ],
      physicalConstraints: [
        "for string/inside-track complete loop, speedTopMs >= sqrt(g * radiusM)",
      ],
    },
    {
      kind: "planetary-field-potential",
      summary: "Spherical planet interior/surface/exterior gravitational field, potential, and escape speed",
      requiredFields: [
        { name: "centralMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "planetRadiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "probeRadiusM", type: "number", unit: "m", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "testMassKg", type: "number", unit: "kg", bounds: "> 0" },
        {
          name: "plotQuantity",
          type: "string",
          enumValues: ["field-strength", "potential"],
        },
      ],
      physicalConstraints: [
        "centralMassKg > 0, planetRadiusM > 0, probeRadiusM > 0",
      ],
    },
    {
      kind: "circular-orbit-energy",
      summary: "Satellite circular orbital speed, period, Kepler constant, K/U/E_total, and optional Hohmann transfer",
      requiredFields: [
        { name: "centralMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "centralRadiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "satelliteMassKg", type: "number", unit: "kg", bounds: "> 0" },
        {
          name: "orbitRadiusM",
          type: "number",
          unit: "m",
          bounds: "> centralRadiusM",
        },
      ],
      optionalFields: [
        {
          name: "targetOrbitRadiusM",
          type: "number",
          unit: "m",
          bounds: "> centralRadiusM and != orbitRadiusM",
        },
        {
          name: "diagramVariant",
          type: "string",
          enumValues: ["energy-curves", "orbit-schematic", "split-orbit-energy"],
        },
      ],
      physicalConstraints: ["orbitRadiusM > centralRadiusM > 0"],
    },
    {
      kind: "two-body-null-point",
      summary: "Gravitational null point, surface potentials, potential barrier, and minimum transfer speed between two bodies",
      requiredFields: [
        { name: "primaryMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "primaryRadiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "secondaryMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "secondaryRadiusM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "separationM",
          type: "number",
          unit: "m",
          bounds: "> primaryRadiusM + secondaryRadiusM",
        },
      ],
      optionalFields: [
        {
          name: "probeDistanceFromPrimaryM",
          type: "number",
          unit: "m",
          bounds: "primaryRadiusM < d < separationM - secondaryRadiusM",
        },
        { name: "testMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "primaryLabel", type: "string" },
        { name: "secondaryLabel", type: "string" },
      ],
      physicalConstraints: ["separationM > primaryRadiusM + secondaryRadiusM"],
    },
    {
      kind: "stellar-radiation",
      summary: "Stellar Wien peak wavelength, Stefan-Boltzmann luminosity L = 4 pi R^2 sigma T^4, and apparent brightness b = L / (4 pi d^2)",
      requiredFields: [
        { name: "surfaceTempK", type: "number", unit: "K", bounds: "> 0" },
        { name: "stellarRadiusM", type: "number", unit: "m", bounds: "> 0" },
        { name: "distanceM", type: "number", unit: "m", bounds: "> stellarRadiusM" },
      ],
      optionalFields: [
        {
          name: "diagramVariant",
          type: "string",
          enumValues: ["blackbody-curve", "inverse-square"],
        },
        {
          name: "comparisonStar",
          type: "{label?: string, surfaceTempK: number, stellarRadiusM: number}",
        },
      ],
      physicalConstraints: ["distanceM > stellarRadiusM > 0 and surfaceTempK > 0"],
    },
    {
      kind: "hr-diagram",
      summary: "Hertzsprung-Russell diagram stellar classification, solar-unit radius/luminosity, and main-sequence scaling",
      requiredFields: [
        {
          name: "stars",
          type: "Array<{id: string, label: string, surfaceTempK: number, luminositySolar: number, region?: 'main-sequence'|'red-giant'|'supergiant'|'white-dwarf'}>",
          bounds: "length >= 1, 1500 <= surfaceTempK <= 60000, luminositySolar > 0",
        },
      ],
      optionalFields: [
        { name: "targetStarId", type: "string", notes: "must match an entry in stars" },
        { name: "showEvolutionTrack", type: "boolean" },
        { name: "showRadiusIsolines", type: "boolean" },
      ],
      physicalConstraints: ["stars must have unique ids and positive temperatures/luminosities"],
    },
    {
      kind: "stellar-parallax",
      summary: "Astronomical parallax angle to parsec / light-year / AU / metre distance and optional apparent brightness",
      requiredFields: [
        {
          name: "parallaxArcsec",
          type: "number",
          unit: "arcsec",
          bounds: "0 < parallaxArcsec <= 2",
        },
      ],
      optionalFields: [
        { name: "baselineAu", type: "number", unit: "AU", bounds: "> 0 (default 1)" },
        { name: "stellarLuminosityW", type: "number", unit: "W", bounds: "> 0" },
      ],
      physicalConstraints: ["0 < parallaxArcsec <= 2"],
    },
    {
      kind: "cosmological-redshift",
      summary: "Spectral redshift z, cosmic scale factor ratio, Hubble recession speed, and cosmological distance",
      requiredFields: [
        { name: "restWavelengthM", type: "number", unit: "m", bounds: "> 0" },
        {
          name: "observedWavelengthM",
          type: "number",
          unit: "m",
          bounds: "> restWavelengthM",
        },
      ],
      optionalFields: [
        {
          name: "hubbleConstantKmSMpc",
          type: "number",
          unit: "km s^-1 Mpc^-1",
          bounds: "> 0 (default 70)",
        },
        { name: "lowRedshiftApprox", type: "boolean" },
        {
          name: "diagramVariant",
          type: "string",
          enumValues: ["spectral-shift", "hubble-plot"],
        },
      ],
      physicalConstraints: ["observedWavelengthM > restWavelengthM > 0"],
    },
  ],

  "em-induction": [
    {
      kind: "parallel-plate-capacitor",
      summary: "Parallel-plate capacitance, charge, field, stored energy, energy density, and optional dielectric/separation change",
      requiredFields: [
        { name: "plateAreaM2", type: "number", unit: "m^2", bounds: "> 0" },
        { name: "plateSeparationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "voltageV", type: "number", unit: "V", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "relativePermittivity", type: "number", bounds: ">= 1 (default 1)" },
        {
          name: "afterChange",
          type: "{constraint: 'constant-voltage'|'isolated-charge', newSeparationM?: number, newRelativePermittivity?: number}",
        },
      ],
      physicalConstraints: ["plateAreaM2 > 0, plateSeparationM > 0, voltageV > 0"],
    },
    {
      kind: "capacitor-network",
      summary: "Series, parallel, series-parallel, or isolated charge-sharing capacitor networks",
      requiredFields: [
        {
          name: "topology",
          type: "{arrangement: 'series'|'parallel', capacitancesF: number[], supplyVoltageV: number} | {arrangement: 'series-parallel', seriesCapacitanceF: number, parallelCapacitancesF: number[], supplyVoltageV: number} | {arrangement: 'charge-sharing', c1F: number, c2F: number, v1InitialV: number, v2InitialV?: number, polarity?: 'same'|'opposing'}",
          bounds: "all capacitances > 0, voltages > 0",
        },
      ],
      physicalConstraints: [
        "series/parallel capacitancesF length >= 2; all capacitances > 0",
      ],
    },
    {
      kind: "rc-transient",
      summary: "RC charging or discharging exponential transient (tau = RC, t_1/2, V_C, V_R, I, Q, U at queryTimeS)",
      requiredFields: [
        { name: "mode", type: "string", enumValues: ["charging", "discharging"] },
        { name: "resistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "capacitanceF", type: "number", unit: "F", bounds: "> 0" },
        { name: "supplyVoltageV", type: "number", unit: "V", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "queryTimeS", type: "number", unit: "s", bounds: ">= 0" },
        { name: "durationTimeConstants", type: "number", bounds: "1..10" },
        {
          name: "plottedQuantity",
          type: "string",
          enumValues: ["capacitor-voltage", "resistor-voltage", "current", "charge"],
        },
      ],
      physicalConstraints: ["resistanceOhm > 0, capacitanceF > 0, supplyVoltageV > 0"],
    },
    {
      kind: "flux-faraday",
      summary: "Faraday's and Lenz's law magnetic flux linkage change, average emf, induced current, and charge",
      requiredFields: [
        { name: "turns", type: "integer", bounds: ">= 1" },
        { name: "coilAreaM2", type: "number", unit: "m^2", bounds: "> 0" },
        { name: "initialFieldT", type: "number", unit: "T", bounds: "finite" },
        { name: "finalFieldT", type: "number", unit: "T", bounds: "finite" },
        { name: "timeIntervalS", type: "number", unit: "s", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "initialAngleDegrees", type: "number", unit: "deg", bounds: "0..180" },
        { name: "finalAngleDegrees", type: "number", unit: "deg", bounds: "0..180" },
        { name: "angleReference", type: "string", enumValues: ["normal", "plane"] },
        { name: "coilResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      physicalConstraints: ["turns >= 1, coilAreaM2 > 0, timeIntervalS > 0"],
    },
    {
      kind: "motional-emf-rails",
      summary: "Conducting rod sliding on parallel rails in uniform B-field: emf = B L v, braking force, and power",
      requiredFields: [
        { name: "magneticFieldT", type: "number", unit: "T", bounds: "> 0" },
        {
          name: "fieldDirection",
          type: "string",
          enumValues: ["into-page", "out-of-page"],
        },
        { name: "railSeparationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "rodSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "loadResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "rodDirection", type: "string", enumValues: ["left", "right"] },
        { name: "rodResistanceOhm", type: "number", unit: "Ohm", bounds: ">= 0" },
      ],
      physicalConstraints: [
        "magneticFieldT, railSeparationM, rodSpeedMs, loadResistanceOhm > 0",
      ],
    },
    {
      kind: "ac-generator",
      summary: "Rotating coil AC generator peak/rms emf, flux linkage, instantaneous emf, and resistive load power",
      requiredFields: [
        { name: "turns", type: "integer", bounds: ">= 1" },
        { name: "coilAreaM2", type: "number", unit: "m^2", bounds: "> 0" },
        { name: "magneticFieldT", type: "number", unit: "T", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "angularSpeedRadS", type: "number", unit: "rad s^-1", bounds: "> 0" },
        { name: "frequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
        { name: "loadResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "initialPhaseRad", type: "number", unit: "rad" },
        { name: "queryTimeS", type: "number", unit: "s", bounds: ">= 0" },
      ],
      physicalConstraints: [
        "provide either angularSpeedRadS > 0 or frequencyHz > 0",
      ],
    },
    {
      kind: "transformer",
      summary: "Ideal or non-ideal AC transformer turns ratio, rms/peak voltages, currents, and power loss",
      requiredFields: [
        { name: "primaryVoltageRmsV", type: "number", unit: "V", bounds: "> 0" },
        { name: "primaryTurns", type: "integer", bounds: ">= 1" },
        { name: "secondaryTurns", type: "integer", bounds: ">= 1" },
      ],
      optionalFields: [
        { name: "efficiency", type: "number", bounds: "0 < efficiency <= 1 (default 1)" },
        { name: "loadResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
        { name: "secondaryCurrentRmsA", type: "number", unit: "A", bounds: "> 0" },
        { name: "supplyFrequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
      ],
      physicalConstraints: [
        "primaryVoltageRmsV > 0, primaryTurns >= 1, secondaryTurns >= 1, 0 < efficiency <= 1",
      ],
    },
    {
      kind: "electric-deflection",
      summary: "Charged particle parabolic trajectory between parallel deflecting plates and optional post-plate drift",
      requiredFields: [
        { name: "chargeC", type: "number", unit: "C", bounds: "!= 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "plateLengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "plateSeparationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "plateVoltageV", type: "number", unit: "V", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "topPlatePolarity", type: "string", enumValues: ["positive", "negative"] },
        { name: "entryOffsetYM", type: "number", unit: "m" },
        { name: "driftDistanceAfterPlatesM", type: "number", unit: "m", bounds: ">= 0" },
      ],
      physicalConstraints: [
        "chargeC != 0, massKg > 0, initialSpeedMs > 0, non-relativistic speed < 0.2 c",
      ],
    },
    {
      kind: "magnetic-cyclotron",
      summary: "Charged particle circular cyclotron orbit in uniform magnetic field r = mv / (|q|B)",
      requiredFields: [
        { name: "chargeC", type: "number", unit: "C", bounds: "!= 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "magneticFieldT", type: "number", unit: "T", bounds: "> 0" },
        {
          name: "fieldDirection",
          type: "string",
          enumValues: ["into-page", "out-of-page"],
        },
      ],
      optionalFields: [
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "acceleratingVoltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "arcSweepDegrees", type: "number", unit: "deg", bounds: "30..360" },
      ],
      physicalConstraints: [
        "provide either speedMs > 0 or acceleratingVoltageV > 0",
      ],
    },
    {
      kind: "velocity-selector",
      summary: "Crossed uniform E and B fields selecting undeflected speed v = E / B",
      requiredFields: [
        { name: "chargeC", type: "number", unit: "C", bounds: "!= 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "magneticFieldT", type: "number", unit: "T", bounds: "> 0" },
        {
          name: "fieldDirection",
          type: "string",
          enumValues: ["into-page", "out-of-page"],
        },
        {
          name: "topPlatePolarity",
          type: "string",
          enumValues: ["positive", "negative"],
        },
      ],
      optionalFields: [
        { name: "electricFieldVm", type: "number", unit: "V m^-1", bounds: "> 0" },
        { name: "plateVoltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "plateSeparationM", type: "number", unit: "m", bounds: "> 0" },
        { name: "particleSpeedMs", type: "number", unit: "m s^-1", bounds: "> 0" },
        { name: "selectorLengthM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: [
        "supply electricFieldVm > 0 OR both plateVoltageV > 0 and plateSeparationM > 0",
      ],
    },
    {
      kind: "bainbridge-mass-spectrometer",
      summary: "Velocity selector coupled to magnetic analyzer semicircular isotope separation",
      requiredFields: [
        { name: "chargeC", type: "number", unit: "C", bounds: "!= 0" },
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "selectorElectricFieldVm", type: "number", unit: "V m^-1", bounds: "> 0" },
        { name: "selectorMagneticFieldT", type: "number", unit: "T", bounds: "> 0" },
      ],
      optionalFields: [
        { name: "comparisonMassKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "deflectionMagneticFieldT", type: "number", unit: "T", bounds: "> 0" },
        {
          name: "deflectionFieldDirection",
          type: "string",
          enumValues: ["into-page", "out-of-page"],
        },
      ],
      physicalConstraints: [
        "selectorElectricFieldVm / selectorMagneticFieldT < 0.2 c",
      ],
    },
  ],

  "quantum-nuclear": [
    {
      kind: "energy-levels",
      summary: "Discrete atomic energy levels (Bohr hydrogenic or custom) and photon emission/absorption transitions",
      requiredFields: [
        {
          name: "transitions",
          type: "Array<{id: string, fromLevelId: string, toLevelId: string, label?: string}>",
          bounds: "length >= 1, distinct valid bound level endpoints",
        },
      ],
      optionalFields: [
        { name: "atomName", type: "string" },
        { name: "atomModel", type: "string", enumValues: ["bohr-hydrogen", "custom"] },
        { name: "atomicNumberZ", type: "integer", bounds: ">= 1" },
        { name: "maxPrincipalN", type: "integer", bounds: "2..8" },
        {
          name: "levels",
          type: "Array<{id: string, label: string, energyValue: number, energyUnit: 'eV'|'J', principalQuantumNumber?: number}>",
        },
        { name: "displayEnergyUnit", type: "string", enumValues: ["eV", "J"] },
      ],
      physicalConstraints: [
        "use atomModel: 'bohr-hydrogen' (with levels n1..nK) or supply custom negative bound levels",
      ],
    },
    {
      kind: "photoelectric-effect",
      summary: "Einstein photoelectric equation E_k,max = hf - phi, threshold frequency, and stopping potential",
      requiredFields: [],
      optionalFields: [
        { name: "metalName", type: "string" },
        { name: "workFunctionEv", type: "number", unit: "eV", bounds: "> 0" },
        { name: "workFunctionJ", type: "number", unit: "J", bounds: "> 0" },
        { name: "incidentFrequencyHz", type: "number", unit: "Hz", bounds: "> 0" },
        { name: "incidentWavelengthNm", type: "number", unit: "nm", bounds: "> 0" },
        { name: "incidentPhotonEnergyEv", type: "number", unit: "eV", bounds: "> 0" },
        {
          name: "plotMode",
          type: "string",
          enumValues: ["ek-ev-vs-f", "ek-j-vs-f", "stopping-potential-vs-f"],
        },
      ],
      physicalConstraints: [
        "supply exactly one work-function field (workFunctionEv or workFunctionJ) and one incident photon field (incidentFrequencyHz, incidentWavelengthNm, or incidentPhotonEnergyEv)",
      ],
    },
    {
      kind: "matter-waves",
      summary: "de Broglie wavelength lambda = h / p for accelerated particles and optional crystal diffraction ring",
      requiredFields: [
        {
          name: "particle",
          type: "string",
          enumValues: ["electron", "proton", "neutron", "alpha", "custom"],
        },
      ],
      optionalFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0 (required if custom)" },
        { name: "chargeMagnitudeC", type: "number", unit: "C", bounds: "> 0" },
        { name: "acceleratingVoltageV", type: "number", unit: "V", bounds: "> 0" },
        { name: "kineticEnergyEv", type: "number", unit: "eV", bounds: "> 0" },
        { name: "kineticEnergyJ", type: "number", unit: "J", bounds: "> 0" },
        { name: "speedMs", type: "number", unit: "m s^-1", bounds: "0 < speedMs < 0.25 c" },
        { name: "momentumNs", type: "number", unit: "N s", bounds: "> 0" },
        { name: "latticeSpacingM", type: "number", unit: "m", bounds: "> deBroglieWavelengthM" },
        { name: "screenDistanceM", type: "number", unit: "m", bounds: "> 0" },
      ],
      physicalConstraints: [
        "supply one kinematic input (acceleratingVoltageV, kineticEnergyEv, kineticEnergyJ, speedMs, or momentumNs); neutral neutron cannot use acceleratingVoltageV",
      ],
    },
    {
      kind: "radioactive-decay",
      summary: "Exponential nuclear decay N(t), activity A(t), and detector count rate with optional background",
      requiredFields: [
        { name: "elapsedTime", type: "number", bounds: "> 0 (in timeUnit)" },
      ],
      optionalFields: [
        { name: "nuclideLabel", type: "string" },
        { name: "timeUnit", type: "string", enumValues: ["s", "min", "h", "d", "yr"] },
        { name: "halfLife", type: "number", bounds: "> 0" },
        { name: "decayConstant", type: "number", bounds: "> 0" },
        { name: "initialNuclei", type: "number", bounds: "> 0" },
        { name: "initialActivityBq", type: "number", unit: "Bq", bounds: "> 0" },
        { name: "initialNetCountRate", type: "number", bounds: "> 0" },
        { name: "initialTotalCountRate", type: "number", bounds: "> backgroundCountRate" },
        { name: "backgroundCountRate", type: "number", bounds: ">= 0" },
      ],
      physicalConstraints: [
        "supply either halfLife > 0 or decayConstant > 0",
      ],
    },
    {
      kind: "nuclear-decay-chain",
      summary: "Sequential alpha, beta-minus, beta-plus, gamma, electron-capture, or neutron-emission decay chain",
      requiredFields: [
        {
          name: "parentNuclide",
          type: "{massNumberA: integer, atomicNumberZ: integer, symbol?: string}",
          bounds: "atomicNumberZ >= 1, massNumberA >= atomicNumberZ",
        },
        {
          name: "steps",
          type: "Array<{id: string, mode: 'alpha'|'beta-minus'|'beta-plus'|'gamma'|'electron-capture'|'neutron-emission', label?: string}>",
          bounds: "length >= 1",
        },
      ],
      optionalFields: [
        { name: "chartAxes", type: "string", enumValues: ["N-vs-Z", "A-vs-Z"] },
      ],
      physicalConstraints: [
        "intermediate and final daughter nuclides must keep Z >= 1 and N = A - Z >= 0",
      ],
    },
    {
      kind: "nuclear-binding",
      summary: "Single-nuclide mass defect & binding energy per nucleon OR fission/fusion reaction Q-value",
      requiredFields: [
        {
          name: "calculationMode",
          type: "string",
          enumValues: ["single-nuclide", "reaction"],
        },
      ],
      optionalFields: [
        { name: "massNumberA", type: "integer", bounds: ">= 2 (single-nuclide)" },
        { name: "atomicNumberZ", type: "integer", bounds: "1 <= Z <= A (single-nuclide)" },
        { name: "symbol", type: "string" },
        { name: "nuclearMassU", type: "number", unit: "u", bounds: "> 0 (less than free nucleons)" },
        { name: "atomicMassU", type: "number", unit: "u", bounds: "> 0" },
        {
          name: "reactionType",
          type: "string",
          enumValues: ["fission", "fusion", "decay", "transmutation"],
        },
        {
          name: "reactants",
          type: "Array<{id: string, symbol: string, massNumberA: number, atomicNumberZ: number, count?: number, massU?: number, bindingEnergyPerNucleonMeV?: number}>",
        },
        {
          name: "products",
          type: "Array<{id: string, symbol: string, massNumberA: number, atomicNumberZ: number, count?: number, massU?: number, bindingEnergyPerNucleonMeV?: number}>",
        },
      ],
      physicalConstraints: [
        "single-nuclide requires (massNumberA, atomicNumberZ, and nuclearMassU or atomicMassU); reaction requires conserved nucleon A and charge Z across reactants and products",
      ],
      probeSpecs: [
        {
          kind: "nuclear-binding",
          calculationMode: "single-nuclide",
          symbol: "Fe",
          massNumberA: 56,
          atomicNumberZ: 26,
          nuclearMassU: 55.92068,
        },
        {
          kind: "nuclear-binding",
          calculationMode: "reaction",
          reactionType: "fusion",
          reactants: [
            { id: "d", symbol: "H", massNumberA: 2, atomicNumberZ: 1, massU: 2.014102 },
            { id: "t", symbol: "H", massNumberA: 3, atomicNumberZ: 1, massU: 3.016049 },
          ],
          products: [
            { id: "he4", symbol: "He", massNumberA: 4, atomicNumberZ: 2, massU: 4.002603 },
            { id: "n", symbol: "n", massNumberA: 1, atomicNumberZ: 0, massU: 1.008665 },
          ],
        },
      ],
    },
    {
      kind: "rutherford-scattering",
      summary: "Head-on Coulomb closest approach d_min and empirical nuclear radius R = R_0 A^(1/3)",
      requiredFields: [
        { name: "projectileChargeZ", type: "integer", bounds: ">= 1" },
        { name: "targetChargeZ", type: "integer", bounds: ">= 1" },
        { name: "targetMassNumberA", type: "integer", bounds: ">= targetChargeZ" },
      ],
      optionalFields: [
        { name: "projectileLabel", type: "string" },
        { name: "targetSymbol", type: "string" },
        { name: "kineticEnergyMeV", type: "number", unit: "MeV", bounds: "> 0" },
        { name: "kineticEnergyJ", type: "number", unit: "J", bounds: "> 0" },
      ],
      physicalConstraints: [
        "supply either kineticEnergyMeV > 0 or kineticEnergyJ > 0",
      ],
    },
    {
      kind: "special-relativity",
      summary: "Lorentz factor gamma, time dilation, length contraction, relativistic velocity addition, and Minkowski events",
      requiredFields: [],
      optionalFields: [
        { name: "beta", type: "number", bounds: "-1 < beta < 1 and beta != 0" },
        { name: "frameSpeedMs", type: "number", unit: "m s^-1", bounds: "|frameSpeedMs| < c" },
        { name: "properTimeS", type: "number", unit: "s", bounds: "> 0" },
        { name: "properLengthM", type: "number", unit: "m", bounds: "> 0" },
        { name: "objectVelocityFractionC", type: "number", bounds: "-1 <= u/c <= 1" },
        {
          name: "events",
          type: "Array<{id: string, label: string, xLightSeconds: number, ctLightSeconds: number}>",
        },
      ],
      physicalConstraints: [
        "supply either beta in (-1, 1) or frameSpeedMs in (-c, c)",
      ],
    },
  ],

  "pure-calculation": [
    {
      kind: "suvat-motion",
      summary: "1D constant-acceleration SUVAT kinematics computing final velocity, displacement, and average velocity",
      requiredFields: [
        { name: "uMs", type: "number", unit: "m s^-1", bounds: "finite" },
        { name: "aMs2", type: "number", unit: "m s^-2", bounds: "finite" },
        { name: "tS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: ["uMs and aMs2 finite, tS > 0"],
      probeSpecs: [{ kind: "suvat-motion", uMs: 4, aMs2: 2.5, tS: 6 }],
    },
    {
      kind: "power-efficiency",
      summary: "Mechanical/electrical power efficiency, useful energy, total input energy, and wasted energy",
      requiredFields: [
        { name: "inputPowerW", type: "number", unit: "W", bounds: "> 0" },
        {
          name: "usefulPowerW",
          type: "number",
          unit: "W",
          bounds: "0 < usefulPowerW <= inputPowerW",
        },
        { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: [
        "0 < usefulPowerW <= inputPowerW and durationS > 0",
      ],
      probeSpecs: [
        {
          kind: "power-efficiency",
          inputPowerW: 500,
          usefulPowerW: 375,
          durationS: 20,
        },
      ],
    },
    {
      kind: "uncertainty-power-product",
      summary: "Propagation of fractional, percentage, and absolute uncertainties for Z = A^p * B^q",
      requiredFields: [
        { name: "aValue", type: "number", bounds: "> 0" },
        { name: "aAbsUnc", type: "number", bounds: "> 0" },
        { name: "aPower", type: "number", bounds: "finite" },
        { name: "bValue", type: "number", bounds: "> 0" },
        { name: "bAbsUnc", type: "number", bounds: "> 0" },
        { name: "bPower", type: "number", bounds: "finite" },
      ],
      physicalConstraints: ["aValue, aAbsUnc, bValue, bAbsUnc > 0"],
      probeSpecs: [
        {
          kind: "uncertainty-power-product",
          aValue: 4.0,
          aAbsUnc: 0.1,
          aPower: 2,
          bValue: 2.0,
          bAbsUnc: 0.05,
          bPower: -1,
        },
      ],
    },
    {
      kind: "momentum-impulse",
      summary: "1D impulse J = m(v - u), average resultant force, force magnitude, and kinetic energy change",
      requiredFields: [
        { name: "massKg", type: "number", unit: "kg", bounds: "> 0" },
        { name: "initialVelocityMs", type: "number", unit: "m s^-1", bounds: "finite" },
        { name: "finalVelocityMs", type: "number", unit: "m s^-1", bounds: "finite" },
        { name: "contactTimeS", type: "number", unit: "s", bounds: "> 0" },
      ],
      physicalConstraints: ["massKg > 0 and contactTimeS > 0"],
      probeSpecs: [
        {
          kind: "momentum-impulse",
          massKg: 0.45,
          initialVelocityMs: -12,
          finalVelocityMs: 18,
          contactTimeS: 0.03,
        },
      ],
    },
  ],
};

function buildCompactPromptSummary(
  domain: PhysicsDomainId,
  visualFamily: string,
  kinds: Readonly<Record<string, ScenarioKindSchema>>,
): string {
  const lines: string[] = [
    `Domain "${domain}" (visualFamily="${visualFamily}"):`,
  ];
  for (const schema of Object.values(kinds)) {
    const req = schema.requiredFields
      .map((f) => {
        const typeOrEnum = f.enumValues
          ? f.enumValues.map((v) => `'${v}'`).join("|")
          : f.type;
        const unitSuffix = f.unit ? ` [${f.unit}]` : "";
        return `${f.name}: ${typeOrEnum}${unitSuffix}`;
      })
      .join(", ");
    const opt = schema.optionalFields
      .slice(0, 6)
      .map((f) => `${f.name}?`)
      .join(", ");
    const primaryOutputs = schema.verifiedQuantities
      .filter((q) => q.key !== "kind" && !q.key.includes("."))
      .slice(0, 10)
      .map((q) => q.key)
      .join(", ");
    lines.push(
      `- kind="${schema.kind}": req={${req}}${opt ? ` opt={${opt}}` : ""} | constraints: ${schema.physicalConstraints.join("; ")} | outputs=[${primaryOutputs}]`,
    );
  }
  return lines.join("\n");
}

/**
 * Deterministically builds and solver-verifies the complete 11-domain tool schema
 * document purely from code introspection (zero reads from `dataset/`).
 */
export function buildDeterministicDomainToolSchemas(): DomainToolSchemasDocument {
  const domainsRecord = {} as Record<PhysicsDomainId, DomainToolSchema>;
  let totalScenarioKinds = 0;

  for (const domain of PHYSICS_DOMAIN_IDS) {
    const adapter = getDomainAdapter(domain);
    const staticSpecs = STATIC_DOMAIN_SPECS[domain];
    const staticByKind = new Map<string, StaticKindSpec>(
      staticSpecs.map((s) => [s.kind, s]),
    );

    // Ensure every supportedScenarioKind on the registered adapter is covered
    for (const adapterKind of adapter.supportedScenarioKinds) {
      if (!staticByKind.has(adapterKind)) {
        throw new Error(
          `Missing static schema entry for domain="${domain}" kind="${adapterKind}"`,
        );
      }
    }

    const kindsMap: Record<string, ScenarioKindSchema> = {};

    for (const spec of staticSpecs) {
      const probes: Record<string, unknown>[] =
        spec.probeSpecs && spec.probeSpecs.length > 0
          ? [...spec.probeSpecs]
          : adapter.sampleScenario
            ? [adapter.sampleScenario(101, spec.kind)]
            : [];

      if (probes.length === 0) {
        throw new Error(
          `No synthetic code probe available for domain="${domain}" kind="${spec.kind}"`,
        );
      }

      const keyTypes = new Map<string, "number" | "string" | "boolean">();
      const keyHitCounts = new Map<string, number>();

      for (const probe of probes) {
        if (probe.kind !== spec.kind) {
          throw new Error(
            `Probe kind mismatch for domain="${domain}": expected "${spec.kind}", got "${String(probe.kind)}"`,
          );
        }
        const validation = adapter.validateScenario(probe);
        if (!validation.valid) {
          throw new Error(
            `Synthetic code probe failed validation for ${domain}/${spec.kind}: ${validation.issues.join("; ")}`,
          );
        }
        const solved = adapter.solveScenario(probe);
        for (const [k, v] of Object.entries(solved.quantities)) {
          const scalarType = typeof v as "number" | "string" | "boolean";
          keyTypes.set(k, scalarType);
          keyHitCounts.set(k, (keyHitCounts.get(k) ?? 0) + 1);
        }
      }

      const verifiedQuantities: VerifiedQuantitySchema[] = [];
      for (const [key, scalarType] of keyTypes.entries()) {
        const unit = inferUnitFromKey(key);
        const conditional = (keyHitCounts.get(key) ?? 0) < probes.length;
        verifiedQuantities.push({
          key,
          type: scalarType,
          ...(unit ? { unit } : {}),
          ...(conditional ? { conditional: true } : {}),
        });
      }

      for (const extra of spec.conditionalVerifiedKeys ?? []) {
        if (!keyTypes.has(extra.key)) {
          verifiedQuantities.push({ ...extra, conditional: true });
        }
      }

      kindsMap[spec.kind] = {
        kind: spec.kind,
        summary: spec.summary,
        requiredFields: spec.requiredFields,
        optionalFields: spec.optionalFields ?? [],
        physicalConstraints: spec.physicalConstraints,
        verifiedQuantities,
      };
      totalScenarioKinds += 1;
    }

    const supportedKinds = staticSpecs.map((s) => s.kind);
    domainsRecord[domain] = {
      domain,
      visualFamily: adapter.defaultVisualFamily,
      solverId: adapter.solverId,
      description: adapter.description,
      supportedScenarioKinds: supportedKinds,
      compactPromptSummary: buildCompactPromptSummary(
        domain,
        adapter.defaultVisualFamily,
        kindsMap,
      ),
      kinds: kindsMap,
    };
  }

  return {
    schemaVersion: DOMAIN_TOOL_SCHEMAS_VERSION,
    derivationMethod: "deterministic-code-introspection-only",
    zeroDatasetReadsVerified: true,
    toolCallContract: {
      toolName: "solve_and_render_scenario",
      requiredTopLevelFields: [
        "action",
        "domain",
        "scenarioSpec",
        "hiddenQuantities",
        "questionPlan",
      ],
      step2RequiredFieldsMcq: [
        "format",
        "difficulty",
        "stem",
        "options",
        "correctOptionIndex",
        "workedSolution",
        "markScheme",
        "totalMarks",
      ],
      step2RequiredFieldsStructured: [
        "format",
        "difficulty",
        "stem",
        "parts",
        "workedSolution",
        "markScheme",
        "totalMarks",
      ],
      gravityConventions: {
        ib: "g = 9.8 m s^-2",
        alevel: "g = 9.81 m s^-2",
        ncuk: "g = 9.81 m s^-2",
      },
    },
    domainOrder: [...PHYSICS_DOMAIN_IDS],
    totalDomains: PHYSICS_DOMAIN_IDS.length,
    totalScenarioKinds,
    domains: domainsRecord,
  };
}

export interface ParsedExportDomainSchemasArgs {
  outPath: string;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/export-domain-schemas.ts [--out <path>]",
    "",
    "Options:",
    `  --out <path>   Output JSON path (default: ${DEFAULT_DOMAIN_SCHEMAS_OUT_PATH})`,
    "  --help         Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseExportDomainSchemasArgs(
  argv: readonly string[],
): ParsedExportDomainSchemasArgs {
  let outPath = path.resolve(process.cwd(), DEFAULT_DOMAIN_SCHEMAS_OUT_PATH);
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--out") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--out requires a file path");
      }
      outPath = path.resolve(process.cwd(), next);
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return { outPath, help };
}

export function runExportDomainSchemasCli(argv: readonly string[]): number {
  const args = parseExportDomainSchemasArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const doc = buildDeterministicDomainToolSchemas();
  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  const serialized = JSON.stringify(doc, null, 2) + "\n";
  fs.writeFileSync(args.outPath, serialized, "utf8");

  console.log(
    JSON.stringify(
      {
        outPath: args.outPath,
        schemaVersion: doc.schemaVersion,
        totalDomains: doc.totalDomains,
        totalScenarioKinds: doc.totalScenarioKinds,
        zeroDatasetReadsVerified: doc.zeroDatasetReadsVerified,
        byteLength: Buffer.byteLength(serialized, "utf8"),
      },
      null,
      2,
    ),
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runExportDomainSchemasCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
