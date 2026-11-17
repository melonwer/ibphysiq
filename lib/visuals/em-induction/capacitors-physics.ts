import { Point2D, VisualValidationIssue } from "../types";
import {
  CapacitorElementState,
  CapacitorNetworkSolution,
  CapacitorNetworkSpec,
  ParallelPlateCapacitorSolution,
  ParallelPlateCapacitorSpec,
  RcTransientSolution,
  RcTransientSpec,
  VACUUM_PERMITTIVITY,
} from "./types";

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be non-negative and finite`);
  }
}

export function parallelPlateCapacitance(
  plateAreaM2: number,
  plateSeparationM: number,
  relativePermittivity = 1,
  permittivityFPerM = VACUUM_PERMITTIVITY,
): number {
  assertPositiveFinite("Plate area", plateAreaM2);
  assertPositiveFinite("Plate separation", plateSeparationM);
  if (!Number.isFinite(relativePermittivity) || relativePermittivity < 1) {
    throw new Error("Relative permittivity must be finite and at least 1");
  }
  assertPositiveFinite("Vacuum permittivity", permittivityFPerM);
  return (
    (relativePermittivity * permittivityFPerM * plateAreaM2) / plateSeparationM
  );
}

export function capacitorCharge(capacitanceF: number, voltageV: number): number {
  assertPositiveFinite("Capacitance", capacitanceF);
  assertNonNegativeFinite("Voltage", voltageV);
  return capacitanceF * voltageV;
}

export function capacitorStoredEnergyFromCV(
  capacitanceF: number,
  voltageV: number,
): number {
  assertPositiveFinite("Capacitance", capacitanceF);
  assertNonNegativeFinite("Voltage", voltageV);
  return 0.5 * capacitanceF * voltageV ** 2;
}

export function capacitorStoredEnergyFromQV(
  chargeC: number,
  voltageV: number,
): number {
  assertNonNegativeFinite("Charge", chargeC);
  assertNonNegativeFinite("Voltage", voltageV);
  return 0.5 * chargeC * voltageV;
}

export function capacitorStoredEnergyFromQC(
  chargeC: number,
  capacitanceF: number,
): number {
  assertNonNegativeFinite("Charge", chargeC);
  assertPositiveFinite("Capacitance", capacitanceF);
  return chargeC ** 2 / (2 * capacitanceF);
}

export function seriesCapacitance(capacitancesF: readonly number[]): number {
  if (capacitancesF.length === 0) {
    throw new Error("Series capacitor network requires at least one capacitor");
  }
  capacitancesF.forEach((c, index) =>
    assertPositiveFinite(`Series capacitance ${index + 1}`, c),
  );
  const inverseSum = capacitancesF.reduce((sum, c) => sum + 1 / c, 0);
  return 1 / inverseSum;
}

export function parallelCapacitance(capacitancesF: readonly number[]): number {
  if (capacitancesF.length === 0) {
    throw new Error(
      "Parallel capacitor network requires at least one capacitor",
    );
  }
  capacitancesF.forEach((c, index) =>
    assertPositiveFinite(`Parallel capacitance ${index + 1}`, c),
  );
  return capacitancesF.reduce((sum, c) => sum + c, 0);
}

export function rcTimeConstant(
  resistanceOhm: number,
  capacitanceF: number,
): number {
  assertPositiveFinite("Resistance", resistanceOhm);
  assertPositiveFinite("Capacitance", capacitanceF);
  return resistanceOhm * capacitanceF;
}

export function rcHalfTime(
  resistanceOhm: number,
  capacitanceF: number,
): number {
  return rcTimeConstant(resistanceOhm, capacitanceF) * Math.LN2;
}

export interface RcInstantaneousState {
  capacitorVoltageV: number;
  resistorVoltageV: number;
  currentA: number;
  chargeC: number;
  storedEnergyJ: number;
}

export function rcChargingState(
  supplyVoltageV: number,
  resistanceOhm: number,
  capacitanceF: number,
  timeS: number,
): RcInstantaneousState {
  assertPositiveFinite("Supply voltage", supplyVoltageV);
  const tau = rcTimeConstant(resistanceOhm, capacitanceF);
  assertNonNegativeFinite("Time", timeS);
  const decay = Math.exp(-timeS / tau);
  const growth = 1 - decay;
  const capacitorVoltageV = supplyVoltageV * growth;
  const resistorVoltageV = supplyVoltageV * decay;
  const currentA = (supplyVoltageV / resistanceOhm) * decay;
  const chargeC = capacitanceF * capacitorVoltageV;
  const storedEnergyJ = 0.5 * capacitanceF * capacitorVoltageV ** 2;
  return {
    capacitorVoltageV,
    resistorVoltageV,
    currentA,
    chargeC,
    storedEnergyJ,
  };
}

export function rcDischargingState(
  initialVoltageV: number,
  resistanceOhm: number,
  capacitanceF: number,
  timeS: number,
): RcInstantaneousState {
  assertPositiveFinite("Initial voltage", initialVoltageV);
  const tau = rcTimeConstant(resistanceOhm, capacitanceF);
  assertNonNegativeFinite("Time", timeS);
  const decay = Math.exp(-timeS / tau);
  const capacitorVoltageV = initialVoltageV * decay;
  const resistorVoltageV = capacitorVoltageV;
  const currentA = (initialVoltageV / resistanceOhm) * decay;
  const chargeC = capacitanceF * capacitorVoltageV;
  const storedEnergyJ = 0.5 * capacitanceF * capacitorVoltageV ** 2;
  return {
    capacitorVoltageV,
    resistorVoltageV,
    currentA,
    chargeC,
    storedEnergyJ,
  };
}

export interface ChargeSharingState {
  equivalentCapacitanceF: number;
  netChargeC: number;
  finalCommonVoltageV: number;
  finalCharge1C: number;
  finalCharge2C: number;
  initialStoredEnergyJ: number;
  finalStoredEnergyJ: number;
  energyDissipatedJ: number;
}

export function solveCapacitorChargeSharing(
  c1F: number,
  v1InitialV: number,
  c2F: number,
  v2InitialV = 0,
  polarity: "same" | "opposing" = "same",
): ChargeSharingState {
  assertPositiveFinite("Capacitor 1 capacitance", c1F);
  assertPositiveFinite("Capacitor 2 capacitance", c2F);
  assertPositiveFinite("Capacitor 1 initial voltage", v1InitialV);
  assertNonNegativeFinite("Capacitor 2 initial voltage", v2InitialV);

  const q1Initial = c1F * v1InitialV;
  const q2Initial = c2F * v2InitialV;
  const signedNetCharge =
    polarity === "same" ? q1Initial + q2Initial : q1Initial - q2Initial;
  const netChargeC = Math.abs(signedNetCharge);
  const equivalentCapacitanceF = c1F + c2F;
  const finalCommonVoltageV = netChargeC / equivalentCapacitanceF;
  const finalCharge1C = c1F * finalCommonVoltageV;
  const finalCharge2C = c2F * finalCommonVoltageV;
  const initialStoredEnergyJ =
    0.5 * c1F * v1InitialV ** 2 + 0.5 * c2F * v2InitialV ** 2;
  const finalStoredEnergyJ =
    0.5 * equivalentCapacitanceF * finalCommonVoltageV ** 2;
  const energyDissipatedJ = Math.max(
    0,
    initialStoredEnergyJ - finalStoredEnergyJ,
  );

  return {
    equivalentCapacitanceF,
    netChargeC,
    finalCommonVoltageV,
    finalCharge1C,
    finalCharge2C,
    initialStoredEnergyJ,
    finalStoredEnergyJ,
    energyDissipatedJ,
  };
}

function addPositiveIssue(
  issues: VisualValidationIssue[],
  path: string,
  label: string,
  value: number | undefined,
): void {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    issues.push({
      code: "INVALID_POSITIVE_QUANTITY",
      message: `${label} must be positive and finite`,
      path,
    });
  }
}

export function validateParallelPlateCapacitor(
  spec: ParallelPlateCapacitorSpec,
  issues: VisualValidationIssue[],
): void {
  addPositiveIssue(issues, "plateAreaM2", "Plate area", spec.plateAreaM2);
  addPositiveIssue(
    issues,
    "plateSeparationM",
    "Plate separation",
    spec.plateSeparationM,
  );
  addPositiveIssue(issues, "voltageV", "Applied voltage", spec.voltageV);
  if (
    spec.relativePermittivity !== undefined &&
    (!Number.isFinite(spec.relativePermittivity) ||
      spec.relativePermittivity < 1)
  ) {
    issues.push({
      code: "INVALID_RELATIVE_PERMITTIVITY",
      message: "Relative permittivity must be finite and >= 1",
      path: "relativePermittivity",
    });
  }
  if (spec.permittivityFPerM !== undefined) {
    addPositiveIssue(
      issues,
      "permittivityFPerM",
      "Permittivity",
      spec.permittivityFPerM,
    );
  }
  if (spec.afterChange) {
    if (
      spec.afterChange.constraint !== "constant-voltage" &&
      spec.afterChange.constraint !== "isolated-charge"
    ) {
      issues.push({
        code: "INVALID_CAPACITOR_CONSTRAINT",
        message: "afterChange.constraint must be constant-voltage or isolated-charge",
        path: "afterChange.constraint",
      });
    }
    if (spec.afterChange.newSeparationM !== undefined) {
      addPositiveIssue(
        issues,
        "afterChange.newSeparationM",
        "New plate separation",
        spec.afterChange.newSeparationM,
      );
    }
    if (
      spec.afterChange.newRelativePermittivity !== undefined &&
      (!Number.isFinite(spec.afterChange.newRelativePermittivity) ||
        spec.afterChange.newRelativePermittivity < 1)
    ) {
      issues.push({
        code: "INVALID_RELATIVE_PERMITTIVITY",
        message: "afterChange.newRelativePermittivity must be finite and >= 1",
        path: "afterChange.newRelativePermittivity",
      });
    }
  }
}

export function validateCapacitorNetwork(
  spec: CapacitorNetworkSpec,
  issues: VisualValidationIssue[],
): void {
  const { topology } = spec;
  if (topology.arrangement === "series" || topology.arrangement === "parallel") {
    if (
      !Array.isArray(topology.capacitancesF) ||
      topology.capacitancesF.length < 2 ||
      topology.capacitancesF.length > 5
    ) {
      issues.push({
        code: "INVALID_CAPACITOR_COUNT",
        message: `${topology.arrangement} network requires between 2 and 5 capacitors`,
        path: "topology.capacitancesF",
      });
    } else {
      topology.capacitancesF.forEach((c, idx) =>
        addPositiveIssue(
          issues,
          `topology.capacitancesF.${idx}`,
          `Capacitor C${idx + 1}`,
          c,
        ),
      );
    }
    addPositiveIssue(
      issues,
      "topology.supplyVoltageV",
      "Supply voltage",
      topology.supplyVoltageV,
    );
    return;
  }

  if (topology.arrangement === "series-parallel") {
    addPositiveIssue(
      issues,
      "topology.seriesCapacitanceF",
      "Series capacitance",
      topology.seriesCapacitanceF,
    );
    if (
      !Array.isArray(topology.parallelCapacitancesF) ||
      topology.parallelCapacitancesF.length < 2 ||
      topology.parallelCapacitancesF.length > 4
    ) {
      issues.push({
        code: "INVALID_CAPACITOR_COUNT",
        message: "series-parallel network requires between 2 and 4 parallel capacitors",
        path: "topology.parallelCapacitancesF",
      });
    } else {
      topology.parallelCapacitancesF.forEach((c, idx) =>
        addPositiveIssue(
          issues,
          `topology.parallelCapacitancesF.${idx}`,
          `Parallel capacitor Cp${idx + 1}`,
          c,
        ),
      );
    }
    addPositiveIssue(
      issues,
      "topology.supplyVoltageV",
      "Supply voltage",
      topology.supplyVoltageV,
    );
    return;
  }

  if (topology.arrangement === "charge-sharing") {
    addPositiveIssue(issues, "topology.c1F", "Capacitor C1", topology.c1F);
    addPositiveIssue(issues, "topology.c2F", "Capacitor C2", topology.c2F);
    addPositiveIssue(
      issues,
      "topology.v1InitialV",
      "Initial voltage V1",
      topology.v1InitialV,
    );
    if (
      topology.v2InitialV !== undefined &&
      (!Number.isFinite(topology.v2InitialV) || topology.v2InitialV < 0)
    ) {
      issues.push({
        code: "INVALID_NON_NEGATIVE_QUANTITY",
        message: "Initial voltage V2 must be non-negative and finite",
        path: "topology.v2InitialV",
      });
    }
    if (
      topology.polarity !== undefined &&
      topology.polarity !== "same" &&
      topology.polarity !== "opposing"
    ) {
      issues.push({
        code: "INVALID_POLARITY",
        message: "polarity must be same or opposing",
        path: "topology.polarity",
      });
    }
    return;
  }

  issues.push({
    code: "UNSUPPORTED_CAPACITOR_ARRANGEMENT",
    message: "Unsupported capacitor network arrangement",
    path: "topology.arrangement",
  });
}

export function validateRcTransient(
  spec: RcTransientSpec,
  issues: VisualValidationIssue[],
): void {
  if (spec.mode !== "charging" && spec.mode !== "discharging") {
    issues.push({
      code: "INVALID_RC_MODE",
      message: "RC mode must be charging or discharging",
      path: "mode",
    });
  }
  addPositiveIssue(issues, "resistanceOhm", "Resistance", spec.resistanceOhm);
  addPositiveIssue(issues, "capacitanceF", "Capacitance", spec.capacitanceF);
  addPositiveIssue(
    issues,
    "supplyVoltageV",
    "Supply or initial voltage",
    spec.supplyVoltageV,
  );
  if (
    spec.queryTimeS !== undefined &&
    (!Number.isFinite(spec.queryTimeS) || spec.queryTimeS < 0)
  ) {
    issues.push({
      code: "INVALID_QUERY_TIME",
      message: "queryTimeS must be non-negative and finite",
      path: "queryTimeS",
    });
  }
  if (
    spec.durationTimeConstants !== undefined &&
    (!Number.isFinite(spec.durationTimeConstants) ||
      spec.durationTimeConstants < 1 ||
      spec.durationTimeConstants > 12)
  ) {
    issues.push({
      code: "INVALID_DURATION_MULTIPLIER",
      message: "durationTimeConstants must lie between 1 and 12",
      path: "durationTimeConstants",
    });
  }
}

export function solveParallelPlateCapacitor(
  spec: ParallelPlateCapacitorSpec,
): ParallelPlateCapacitorSolution {
  const er = spec.relativePermittivity ?? 1;
  const eps0 = spec.permittivityFPerM ?? VACUUM_PERMITTIVITY;
  const capacitanceF = parallelPlateCapacitance(
    spec.plateAreaM2,
    spec.plateSeparationM,
    er,
    eps0,
  );
  const chargeC = capacitorCharge(capacitanceF, spec.voltageV);
  const electricFieldVm = spec.voltageV / spec.plateSeparationM;
  const storedEnergyJ = capacitorStoredEnergyFromCV(capacitanceF, spec.voltageV);
  const energyDensityJm3 = 0.5 * er * eps0 * electricFieldVm ** 2;

  const quantities: Record<string, number> = {
    plateAreaM2: spec.plateAreaM2,
    plateSeparationM: spec.plateSeparationM,
    relativePermittivity: er,
    voltageV: spec.voltageV,
    capacitanceF,
    chargeC,
    electricFieldVm,
    storedEnergyJ,
    energyDensityJm3,
  };

  let afterChange: ParallelPlateCapacitorSolution["afterChange"];
  if (spec.afterChange) {
    const newD = spec.afterChange.newSeparationM ?? spec.plateSeparationM;
    const newEr = spec.afterChange.newRelativePermittivity ?? er;
    const newC = parallelPlateCapacitance(spec.plateAreaM2, newD, newEr, eps0);
    if (spec.afterChange.constraint === "constant-voltage") {
      const newV = spec.voltageV;
      const newQ = newC * newV;
      const newE = newV / newD;
      const newU = 0.5 * newC * newV ** 2;
      afterChange = {
        constraint: "constant-voltage",
        capacitanceF: newC,
        voltageV: newV,
        chargeC: newQ,
        electricFieldVm: newE,
        storedEnergyJ: newU,
        energyChangeJ: newU - storedEnergyJ,
      };
    } else {
      const newQ = chargeC;
      const newV = newQ / newC;
      const newE = newV / newD;
      const newU = newQ ** 2 / (2 * newC);
      afterChange = {
        constraint: "isolated-charge",
        capacitanceF: newC,
        voltageV: newV,
        chargeC: newQ,
        electricFieldVm: newE,
        storedEnergyJ: newU,
        energyChangeJ: newU - storedEnergyJ,
      };
    }
    quantities.afterCapacitanceF = afterChange.capacitanceF;
    quantities.afterVoltageV = afterChange.voltageV;
    quantities.afterChargeC = afterChange.chargeC;
    quantities.afterElectricFieldVm = afterChange.electricFieldVm;
    quantities.afterStoredEnergyJ = afterChange.storedEnergyJ;
    quantities.energyChangeJ = afterChange.energyChangeJ;
  }

  return {
    kind: "parallel-plate-capacitor",
    capacitanceF,
    chargeC,
    electricFieldVm,
    storedEnergyJ,
    energyDensityJm3,
    afterChange,
    quantities,
  };
}

export function solveCapacitorNetwork(
  spec: CapacitorNetworkSpec,
): CapacitorNetworkSolution {
  const { topology } = spec;

  if (topology.arrangement === "series") {
    const equivalentCapacitanceF = seriesCapacitance(topology.capacitancesF);
    const totalChargeC = equivalentCapacitanceF * topology.supplyVoltageV;
    const totalStoredEnergyJ =
      0.5 * equivalentCapacitanceF * topology.supplyVoltageV ** 2;
    const elements: CapacitorElementState[] = topology.capacitancesF.map(
      (c, index) => {
        const voltageV = totalChargeC / c;
        return {
          id: `C${index + 1}`,
          capacitanceF: c,
          voltageV,
          chargeC: totalChargeC,
          storedEnergyJ: 0.5 * c * voltageV ** 2,
        };
      },
    );
    const quantities: Record<string, number> = {
      supplyVoltageV: topology.supplyVoltageV,
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
    };
    elements.forEach((el, idx) => {
      quantities[`c${idx + 1}F`] = el.capacitanceF;
      quantities[`v${idx + 1}V`] = el.voltageV;
      quantities[`q${idx + 1}C`] = el.chargeC;
      quantities[`u${idx + 1}J`] = el.storedEnergyJ;
    });
    return {
      kind: "capacitor-network",
      arrangement: "series",
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
      elements,
      quantities,
    };
  }

  if (topology.arrangement === "parallel") {
    const equivalentCapacitanceF = parallelCapacitance(topology.capacitancesF);
    const totalChargeC = equivalentCapacitanceF * topology.supplyVoltageV;
    const totalStoredEnergyJ =
      0.5 * equivalentCapacitanceF * topology.supplyVoltageV ** 2;
    const elements: CapacitorElementState[] = topology.capacitancesF.map(
      (c, index) => {
        const chargeC = c * topology.supplyVoltageV;
        return {
          id: `C${index + 1}`,
          capacitanceF: c,
          voltageV: topology.supplyVoltageV,
          chargeC,
          storedEnergyJ: 0.5 * c * topology.supplyVoltageV ** 2,
        };
      },
    );
    const quantities: Record<string, number> = {
      supplyVoltageV: topology.supplyVoltageV,
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
    };
    elements.forEach((el, idx) => {
      quantities[`c${idx + 1}F`] = el.capacitanceF;
      quantities[`v${idx + 1}V`] = el.voltageV;
      quantities[`q${idx + 1}C`] = el.chargeC;
      quantities[`u${idx + 1}J`] = el.storedEnergyJ;
    });
    return {
      kind: "capacitor-network",
      arrangement: "parallel",
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
      elements,
      quantities,
    };
  }

  if (topology.arrangement === "series-parallel") {
    const parallelBankF = parallelCapacitance(topology.parallelCapacitancesF);
    const equivalentCapacitanceF = seriesCapacitance([
      topology.seriesCapacitanceF,
      parallelBankF,
    ]);
    const totalChargeC = equivalentCapacitanceF * topology.supplyVoltageV;
    const totalStoredEnergyJ =
      0.5 * equivalentCapacitanceF * topology.supplyVoltageV ** 2;
    const seriesVoltageV = totalChargeC / topology.seriesCapacitanceF;
    const parallelVoltageV = totalChargeC / parallelBankF;

    const elements: CapacitorElementState[] = [
      {
        id: "Cs",
        capacitanceF: topology.seriesCapacitanceF,
        voltageV: seriesVoltageV,
        chargeC: totalChargeC,
        storedEnergyJ: 0.5 * topology.seriesCapacitanceF * seriesVoltageV ** 2,
      },
      ...topology.parallelCapacitancesF.map((c, index) => ({
        id: `Cp${index + 1}`,
        capacitanceF: c,
        voltageV: parallelVoltageV,
        chargeC: c * parallelVoltageV,
        storedEnergyJ: 0.5 * c * parallelVoltageV ** 2,
      })),
    ];

    const quantities: Record<string, number> = {
      supplyVoltageV: topology.supplyVoltageV,
      seriesCapacitanceF: topology.seriesCapacitanceF,
      parallelBankCapacitanceF: parallelBankF,
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
      seriesVoltageV,
      parallelVoltageV,
    };
    elements.forEach((el) => {
      quantities[`${el.id}_capacitanceF`] = el.capacitanceF;
      quantities[`${el.id}_voltageV`] = el.voltageV;
      quantities[`${el.id}_chargeC`] = el.chargeC;
      quantities[`${el.id}_storedEnergyJ`] = el.storedEnergyJ;
    });
    return {
      kind: "capacitor-network",
      arrangement: "series-parallel",
      equivalentCapacitanceF,
      totalChargeC,
      totalStoredEnergyJ,
      elements,
      quantities,
    };
  }

  const v2Initial = topology.v2InitialV ?? 0;
  const polarity = topology.polarity ?? "same";
  const shared = solveCapacitorChargeSharing(
    topology.c1F,
    topology.v1InitialV,
    topology.c2F,
    v2Initial,
    polarity,
  );
  const elements: CapacitorElementState[] = [
    {
      id: "C1",
      capacitanceF: topology.c1F,
      voltageV: shared.finalCommonVoltageV,
      chargeC: shared.finalCharge1C,
      storedEnergyJ: 0.5 * topology.c1F * shared.finalCommonVoltageV ** 2,
    },
    {
      id: "C2",
      capacitanceF: topology.c2F,
      voltageV: shared.finalCommonVoltageV,
      chargeC: shared.finalCharge2C,
      storedEnergyJ: 0.5 * topology.c2F * shared.finalCommonVoltageV ** 2,
    },
  ];
  return {
    kind: "capacitor-network",
    arrangement: "charge-sharing",
    equivalentCapacitanceF: shared.equivalentCapacitanceF,
    totalChargeC: shared.netChargeC,
    totalStoredEnergyJ: shared.finalStoredEnergyJ,
    elements,
    finalCommonVoltageV: shared.finalCommonVoltageV,
    initialStoredEnergyJ: shared.initialStoredEnergyJ,
    energyDissipatedJ: shared.energyDissipatedJ,
    quantities: {
      c1F: topology.c1F,
      c2F: topology.c2F,
      v1InitialV: topology.v1InitialV,
      v2InitialV: v2Initial,
      equivalentCapacitanceF: shared.equivalentCapacitanceF,
      totalChargeC: shared.netChargeC,
      finalCommonVoltageV: shared.finalCommonVoltageV,
      finalCharge1C: shared.finalCharge1C,
      finalCharge2C: shared.finalCharge2C,
      initialStoredEnergyJ: shared.initialStoredEnergyJ,
      totalStoredEnergyJ: shared.finalStoredEnergyJ,
      energyDissipatedJ: shared.energyDissipatedJ,
    },
  };
}

export function solveRcTransient(spec: RcTransientSpec): RcTransientSolution {
  const timeConstantS = rcTimeConstant(spec.resistanceOhm, spec.capacitanceF);
  const halfTimeS = rcHalfTime(spec.resistanceOhm, spec.capacitanceF);
  const initialCurrentA = spec.supplyVoltageV / spec.resistanceOhm;
  const maxChargeC = spec.capacitanceF * spec.supplyVoltageV;
  const maxStoredEnergyJ = 0.5 * spec.capacitanceF * spec.supplyVoltageV ** 2;
  const queryTimeS = spec.queryTimeS ?? timeConstantS;

  const stateFn =
    spec.mode === "charging" ? rcChargingState : rcDischargingState;
  const queryState = stateFn(
    spec.supplyVoltageV,
    spec.resistanceOhm,
    spec.capacitanceF,
    queryTimeS,
  );

  const durationTau = spec.durationTimeConstants ?? 5;
  const endTimeS = durationTau * timeConstantS;
  const sampleCount = 201;
  const capacitorVoltage: Point2D[] = [];
  const resistorVoltage: Point2D[] = [];
  const current: Point2D[] = [];
  const charge: Point2D[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const t = (endTimeS * i) / (sampleCount - 1);
    const st = stateFn(
      spec.supplyVoltageV,
      spec.resistanceOhm,
      spec.capacitanceF,
      t,
    );
    capacitorVoltage.push({ x: t, y: st.capacitorVoltageV });
    resistorVoltage.push({ x: t, y: st.resistorVoltageV });
    current.push({ x: t, y: st.currentA });
    charge.push({ x: t, y: st.chargeC });
  }

  return {
    kind: "rc-transient",
    mode: spec.mode,
    timeConstantS,
    halfTimeS,
    initialCurrentA,
    maxChargeC,
    maxStoredEnergyJ,
    queryTimeS,
    capacitorVoltageAtQueryV: queryState.capacitorVoltageV,
    resistorVoltageAtQueryV: queryState.resistorVoltageV,
    currentAtQueryA: queryState.currentA,
    chargeAtQueryC: queryState.chargeC,
    storedEnergyAtQueryJ: queryState.storedEnergyJ,
    curves: {
      capacitorVoltage,
      resistorVoltage,
      current,
      charge,
    },
    quantities: {
      resistanceOhm: spec.resistanceOhm,
      capacitanceF: spec.capacitanceF,
      supplyVoltageV: spec.supplyVoltageV,
      timeConstantS,
      halfTimeS,
      initialCurrentA,
      maxChargeC,
      maxStoredEnergyJ,
      queryTimeS,
      capacitorVoltageAtQueryV: queryState.capacitorVoltageV,
      resistorVoltageAtQueryV: queryState.resistorVoltageV,
      currentAtQueryA: queryState.currentA,
      chargeAtQueryC: queryState.chargeC,
      storedEnergyAtQueryJ: queryState.storedEnergyJ,
    },
  };
}
