export interface CircuitMeasurement {
  currentA: number;
  terminalVoltageV: number;
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

export function seriesResistance(resistancesOhm: readonly number[]): number {
  if (resistancesOhm.length === 0) {
    throw new Error("Series network needs at least one resistance");
  }
  resistancesOhm.forEach((value, index) =>
    positiveFinite(`Series resistance ${index + 1}`, value),
  );
  return resistancesOhm.reduce((total, value) => total + value, 0);
}

export function parallelResistance(resistancesOhm: readonly number[]): number {
  if (resistancesOhm.length === 0) {
    throw new Error("Parallel network needs at least one resistance");
  }
  resistancesOhm.forEach((value, index) =>
    positiveFinite(`Parallel resistance ${index + 1}`, value),
  );
  return 1 / resistancesOhm.reduce((total, value) => total + 1 / value, 0);
}

export function currentFromVoltage(
  voltageV: number,
  resistanceOhm: number,
): number {
  positiveFinite("Resistance", resistanceOhm);
  if (!Number.isFinite(voltageV) || voltageV < 0) {
    throw new Error("Voltage must be non-negative and finite");
  }
  return voltageV / resistanceOhm;
}

export function resistanceFromVoltageCurrent(
  voltageV: number,
  currentA: number,
): number {
  positiveFinite("Voltage", voltageV);
  positiveFinite("Current", currentA);
  return voltageV / currentA;
}

export function powerFromCurrent(
  currentA: number,
  resistanceOhm: number,
): number {
  if (!Number.isFinite(currentA) || currentA < 0) {
    throw new Error("Current must be non-negative and finite");
  }
  positiveFinite("Resistance", resistanceOhm);
  return currentA ** 2 * resistanceOhm;
}

export function terminalVoltage(
  emfV: number,
  currentA: number,
  internalResistanceOhm: number,
): number {
  positiveFinite("Emf", emfV);
  if (!Number.isFinite(currentA) || currentA < 0) {
    throw new Error("Current must be non-negative and finite");
  }
  if (!Number.isFinite(internalResistanceOhm) || internalResistanceOhm < 0) {
    throw new Error("Internal resistance must be non-negative and finite");
  }
  const voltage = emfV - currentA * internalResistanceOhm;
  if (voltage < 0) {
    throw new Error("Terminal voltage cannot be negative");
  }
  return voltage;
}

export function internalResistanceFromMeasurements(
  first: CircuitMeasurement,
  second: CircuitMeasurement,
): number {
  for (const [name, measurement] of [
    ["First", first],
    ["Second", second],
  ] as const) {
    if (!Number.isFinite(measurement.currentA) || measurement.currentA < 0) {
      throw new Error(`${name} current must be non-negative and finite`);
    }
    positiveFinite(`${name} terminal voltage`, measurement.terminalVoltageV);
  }
  const currentChange = second.currentA - first.currentA;
  if (Math.abs(currentChange) < 1e-12) {
    throw new Error("Measurements need different currents");
  }
  const resistance =
    (first.terminalVoltageV - second.terminalVoltageV) / currentChange;
  if (resistance <= 0) {
    throw new Error(
      "Measurements must show terminal voltage falling with current",
    );
  }
  return resistance;
}

export function emfFromMeasurement(
  measurement: CircuitMeasurement,
  internalResistanceOhm: number,
): number {
  if (!Number.isFinite(measurement.currentA) || measurement.currentA < 0) {
    throw new Error("Current must be non-negative and finite");
  }
  positiveFinite("Terminal voltage", measurement.terminalVoltageV);
  if (!Number.isFinite(internalResistanceOhm) || internalResistanceOhm < 0) {
    throw new Error("Internal resistance must be non-negative and finite");
  }
  return (
    measurement.terminalVoltageV + measurement.currentA * internalResistanceOhm
  );
}

export function sourcePower(emfV: number, currentA: number): number {
  positiveFinite("Emf", emfV);
  if (!Number.isFinite(currentA) || currentA < 0) {
    throw new Error("Current must be non-negative and finite");
  }
  return emfV * currentA;
}
