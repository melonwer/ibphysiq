import { CircuitStudentQuestion, CircuitSolutionPart } from "./circuit-question-packages";
import { compileCircuitIntent, CircuitTopologyIntent } from "./circuit-intent";
import { compileFieldIntent, FieldIntent } from "./field-intent";
import { compileMechanicsIntent, MechanicsIntent } from "./mechanics-intent";
import { currentFromVoltage, parallelResistance, powerFromCurrent, seriesResistance } from "./circuit-physics";
import { electricField1D, electricPotential1D, uniformElectricField, zeroFieldFractionBetweenLikeCharges } from "./field-physics";
import { solveMechanicsScenario } from "./mechanics-physics";
import { integratePolyline } from "./pilot-physics";
import { formatToSignificantFigures } from "./pilot-variants";
import { CartesianPlotData } from "./render-cartesian";
import { Point2D, VISUAL_SCHEMA_VERSION, VisualSpec } from "./types";
import { CARTESIAN_PILOT_FIXTURES } from "./pilot-fixtures";
import { CIRCUIT_QUESTION_PACKAGES } from "./circuit-question-packages";
import { FIELD_QUESTION_PACKAGES } from "./field-question-packages";
import { MECHANICS_QUESTION_PACKAGES } from "./mechanics-question-packages";
import { measurementAxisTicks } from "./measurement-axis";

type OptionId = "A" | "B" | "C" | "D";
type GraphScenario =
  | { kind: "rover-distance"; points: Point2D[]; durationS: number }
  | { kind: "cart-work"; points: Point2D[]; distanceM: number; massKg: number; initialSpeedMs: number }
  | { kind: "shuttle-motion"; points: Point2D[]; durationS: number; brakingStartS: number }
  | { kind: "lift-acceleration"; points: Point2D[]; durationS: number; initialSpeedMs: number; peakTimeS: number }
  | { kind: "glider-momentum"; points: Point2D[]; massKg: number; forceStartS: number; forceEndS: number };
type CircuitScenario =
  | { kind: "branch-heater"; voltageV: number; seriesOhm: number; branchOhm: [number, number] }
  | { kind: "sensor-current"; voltageV: number; branchSeriesOhm: [number, number]; otherOhm: number }
  | { kind: "battery-energy"; emfV: number; internalOhm: number; loadOhm: number; durationS: number }
  | { kind: "resistor-network"; voltageV: number; seriesOhm: number; branchOhm: [number, number] }
  | { kind: "light-alarm"; voltageV: number; fixedOhm: number; darkOhm: number; brightOhm: number };
type FieldScenario =
  | { kind: "charge-field"; chargesNC: [number, number]; separationM: number; probeM: number }
  | { kind: "field-work"; potentialsV: [number, number, number]; spacingM: number; chargeC: number }
  | { kind: "null-potential"; chargesNC: [number, number]; separationM: number }
  | { kind: "negative-probe"; chargesNC: [number, number]; separationM: number; probeM: number; testChargeNC: number }
  | { kind: "guided-bead"; potentialsV: [number, number, number]; spacingM: number; chargeC: number; massKg: number };
type MechanicsScenario =
  | { kind: "collision-loss"; massXKg: number; massYKg: number; initialXMs: number; finalYMs: number }
  | { kind: "circle-limit"; massKg: number; radiusM: number; maxTensionN: number; gravityMs2: number }
  | { kind: "ramp-heating"; weightN: number; lengthM: number; heightM: number; speedMs: number }
  | { kind: "short-ramp"; massKg: number; lengthM: number; angleDegrees: number; finalSpeedMs: number; gravityMs2: number }
  | { kind: "pendulum-loss"; massKg: number; targetMassKg: number; lengthM: number; gravityMs2: number };
export type SyntheticScenario = GraphScenario | CircuitScenario | FieldScenario | MechanicsScenario;
type NumericTargets = Record<string, number>;
type Authored = {
  question: CircuitStudentQuestion;
  solution: { correctOptionId?: OptionId; parts: CircuitSolutionPart[] };
  assessmentTargets: string[];
};
type VisualArtifact =
  | { family: "cartesian_plot"; spec: VisualSpec<"cartesian_plot">; data: CartesianPlotData }
  | { family: "circuit_network"; spec: VisualSpec<"circuit_network"> }
  | { family: "field_map"; spec: VisualSpec<"field_map"> }
  | { family: "mechanics_scene"; spec: VisualSpec<"mechanics_scene"> };
export interface SyntheticPilotPackage extends Authored {
  schemaVersion: "synthetic-question-package/0.1.0";
  id: string;
  title: string;
  paper: "1A" | "2";
  level: "SL" | "HL";
  marks: number;
  scenario: SyntheticScenario;
  results: NumericTargets;
  visual: VisualArtifact;
  lineage: { parentQuestionId: string; relationship: "development-template-family" };
  provenance: { generatorVersion: "synthetic-pilot/0.1.0"; author: "deterministic-code"; solverVersion: "synthetic-physics/0.1.0" };
  reviewStatus: "awaiting-human-review";
  trainingEligibility: "blocked-pending-review-and-source-use-clearance";
}

const superscriptDigits: Record<string, string> = { "-": "⁻", "+": "", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const fmt = (value: number, unit = "") => {
  const number = formatToSignificantFigures(Number(value.toPrecision(14)), 3).replace(/e([+-]?\d+)/, (_, exponent: string) => ` × 10${[...exponent].map(c => superscriptDigits[c]).join("")}`);
  return `${number}${unit ? ` ${unit}` : ""}`;
};
const optionIds: [OptionId, OptionId, OptionId, OptionId] = ["A", "B", "C", "D"];
function mcq(stem: string, correct: string, distractors: [string, string, string], correctIndex: number, working: string[], target: string): Authored {
  const texts = [...distractors];
  texts.splice(correctIndex, 0, correct);
  if (new Set(texts).size !== 4) throw new Error("MCQ options collide after formatting");
  return {
    question: { kind: "multiple-choice", stem, marks: 1, options: texts.map((text, i) => ({ id: optionIds[i], text })) },
    solution: { correctOptionId: optionIds[correctIndex], parts: [{ partId: "answer", working, markingPoints: [correct], finalAnswer: correct, marks: 1 }] },
    assessmentTargets: [target],
  };
}
interface PartDefinition {
  prompt: string;
  target: string;
  working: string[];
  markingPoints: string[];
  finalAnswer: string;
}
function multipart(stem: string, parts: PartDefinition[]): Authored {
  return {
    question: { kind: "multipart", stem, parts: parts.map((part, i) => ({ id: String.fromCharCode(97 + i), prompt: part.prompt, marks: part.markingPoints.length })) },
    solution: { parts: parts.map((part, i) => ({ partId: String.fromCharCode(97 + i), working: part.working, markingPoints: part.markingPoints, finalAnswer: part.finalAnswer, marks: part.markingPoints.length })) },
    assessmentTargets: parts.map(part => part.target),
  };
}
function distanceUnderVelocity(points: Point2D[], end: number): number {
  const split: Point2D[] = [];
  points.forEach((p, i) => {
    const previous = points[i - 1];
    if (previous && previous.y * p.y < 0) split.push({ x: previous.x - previous.y * (p.x - previous.x) / (p.y - previous.y), y: 0 });
    split.push({ x: p.x, y: Math.abs(p.y) });
  });
  return integratePolyline(split, 0, end);
}
function twoCharges(s: { chargesNC: [number, number]; separationM: number }) {
  return [{ positionM: 0, chargeC: s.chargesNC[0] * 1e-9 }, { positionM: s.separationM, chargeC: s.chargesNC[1] * 1e-9 }];
}
export function solveSyntheticScenario(s: SyntheticScenario): NumericTargets {
  switch (s.kind) {
    case "rover-distance": return { displacementM: integratePolyline(s.points, 0, s.durationS), distanceM: distanceUnderVelocity(s.points, s.durationS) };
    case "cart-work": {
      const workJ = integratePolyline(s.points, 0, s.distanceM);
      return { workJ, finalSpeedMs: Math.sqrt(s.initialSpeedMs ** 2 + 2 * workJ / s.massKg) };
    }
    case "shuttle-motion": {
      const distanceM = integratePolyline(s.points, 0, s.durationS);
      const start = s.points.find(p => p.x === s.brakingStartS);
      const end = s.points.find(p => p.x === s.durationS);
      if (!start || !end) throw new Error("Missing braking endpoint");
      return { distanceM, meanSpeedMs: distanceM / s.durationS, brakingAccelerationMs2: (end.y - start.y) / (s.durationS - s.brakingStartS) };
    }
    case "lift-acceleration": return { finalSpeedMs: s.initialSpeedMs + integratePolyline(s.points, 0, s.durationS), maxSpeedMs: s.initialSpeedMs + integratePolyline(s.points, 0, s.peakTimeS), peakTimeS: s.peakTimeS };
    case "glider-momentum": {
      const start = s.points.find(p => p.x === s.forceStartS);
      const end = s.points.find(p => p.x === s.forceEndS);
      if (!start || !end) throw new Error("Missing force endpoint");
      return { meanForceN: (end.y - start.y) / (s.forceEndS - s.forceStartS), workJ: (end.y ** 2 - start.y ** 2) / (2 * s.massKg) };
    }
    case "branch-heater":
    case "resistor-network": {
      const parallelOhm = parallelResistance(s.branchOhm);
      const totalOhm = seriesResistance([s.seriesOhm, parallelOhm]);
      const totalCurrentA = currentFromVoltage(s.voltageV, totalOhm);
      const branchVoltageV = totalCurrentA * parallelOhm;
      return { parallelOhm, totalOhm, totalCurrentA, branchVoltageV, branchOnePowerW: powerFromCurrent(branchVoltageV / s.branchOhm[0], s.branchOhm[0]), branchTwoPowerW: powerFromCurrent(branchVoltageV / s.branchOhm[1], s.branchOhm[1]) };
    }
    case "sensor-current": {
      const firstCurrentA = currentFromVoltage(s.voltageV, seriesResistance(s.branchSeriesOhm));
      const otherCurrentA = currentFromVoltage(s.voltageV, s.otherOhm);
      return { firstCurrentA, otherCurrentA, totalCurrentA: firstCurrentA + otherCurrentA };
    }
    case "battery-energy": {
      const currentA = s.emfV / seriesResistance([s.internalOhm, s.loadOhm]);
      return { currentA, terminalVoltageV: currentA * s.loadOhm, externalEnergyJ: powerFromCurrent(currentA, s.loadOhm) * s.durationS };
    }
    case "light-alarm": return { darkCurrentA: s.voltageV / (s.darkOhm + s.fixedOhm), darkOutputV: s.voltageV * s.fixedOhm / (s.darkOhm + s.fixedOhm), brightOutputV: s.voltageV * s.fixedOhm / (s.brightOhm + s.fixedOhm) };
    case "charge-field": return { fieldNC: electricField1D(s.probeM, twoCharges(s)) };
    case "field-work": return { workJ: s.chargeC * (s.potentialsV[0] - s.potentialsV[2]), deltaPotentialJ: s.chargeC * (s.potentialsV[2] - s.potentialsV[0]) };
    case "null-potential": {
      const nullPositionM = s.separationM * zeroFieldFractionBetweenLikeCharges(s.chargesNC[0], s.chargesNC[1]);
      return { nullPositionM, potentialV: electricPotential1D(nullPositionM, twoCharges(s)), fieldNC: electricField1D(nullPositionM, twoCharges(s)) };
    }
    case "negative-probe": {
      const fieldNC = electricField1D(s.probeM, twoCharges(s));
      return { fieldNC, potentialV: electricPotential1D(s.probeM, twoCharges(s)), forceN: fieldNC * s.testChargeNC * 1e-9 };
    }
    case "guided-bead": {
      const fieldNC = uniformElectricField(s.potentialsV[1] - s.potentialsV[2], s.spacingM);
      return { fieldNC, accelerationMs2: s.chargeC * fieldNC / s.massKg, finalSpeedMs: Math.sqrt(2 * s.chargeC * (s.potentialsV[1] - s.potentialsV[2]) / s.massKg) };
    }
    case "collision-loss": {
      const collision = solveMechanicsScenario({ ...s, kind: "cart-collision", initialYMs: 0 });
      const rawFinalXMs = Number(collision.finalXMs);
      const finalXMs = Math.abs(rawFinalXMs) < 1e-12 * Math.abs(s.initialXMs) ? 0 : rawFinalXMs;
      const initialEnergyJ = s.massXKg * s.initialXMs ** 2 / 2;
      const finalEnergyJ = (s.massXKg * finalXMs ** 2 + s.massYKg * s.finalYMs ** 2) / 2;
      return { finalXMs, initialEnergyJ, finalEnergyJ, lostEnergyJ: initialEnergyJ - finalEnergyJ };
    }
    case "circle-limit": return { safeSpeedMs: Math.sqrt((s.maxTensionN / s.massKg - s.gravityMs2) * s.radiusM) };
    case "ramp-heating": {
      const result = solveMechanicsScenario({ ...s, kind: "ramp-resistance" });
      return { resistanceN: Number(result.resistanceN), thermalPowerW: Number(result.resistanceN) * s.speedMs };
    }
    case "short-ramp": {
      const result = solveMechanicsScenario({ ...s, kind: "incline-friction" });
      return { frictionLossJ: Number(result.frictionLossJ), frictionN: Number(result.frictionLossJ) / s.lengthM, shortRampSpeedMs: s.finalSpeedMs / Math.sqrt(2) };
    }
    case "pendulum-loss": {
      const result = solveMechanicsScenario({ ...s, kind: "pendulum-collision" });
      const bottomSpeedMs = Number(result.bottomSpeedMs), combinedSpeedMs = Number(result.combinedSpeedMs);
      const initialEnergyJ = s.massKg * bottomSpeedMs ** 2 / 2;
      const finalEnergyJ = (s.massKg + s.targetMassKg) * combinedSpeedMs ** 2 / 2;
      return { bottomSpeedMs, combinedSpeedMs, lostEnergyJ: initialEnergyJ - finalEnergyJ, riseM: Number(result.riseM) };
    }
    default: { const exhaustive: never = s; throw new Error(`Unsupported synthetic scenario ${exhaustive}`); }
  }
}

function author(s: SyntheticScenario, r: NumericTargets): Authored {
  switch (s.kind) {
    case "rover-distance": return mcq(`An inspection rover moves along a straight rail. The graph shows its signed velocity over ${s.durationS} s. What total distance does it travel?`, fmt(r.distanceM, "m"), [fmt(r.displacementM, "m"), "24.0 m", "30.0 m"], 0, ["Distance is the total area between the velocity graph and the time axis, counting areas below the axis positively.", "The velocity crosses zero at t = 5.5 s.", `Positive area = ${fmt((r.distanceM + r.displacementM) / 2, "m")}; negative area magnitude = ${fmt((r.distanceM - r.displacementM) / 2, "m")}. Total = ${fmt(r.distanceM, "m")}.`], "distance from signed velocity");
    case "cart-work": return mcq(`A ${s.massKg} kg test cart has an initial speed of ${s.initialSpeedMs} m s⁻¹. The graph shows the resultant force in its direction of motion over ${s.distanceM} m. What is its final speed?`, fmt(r.finalSpeedMs, "m s⁻¹"), [fmt(Math.sqrt(2 * r.workJ / s.massKg), "m s⁻¹"), "8.00 m s⁻¹", "4.00 m s⁻¹"], 1, [`Work = area under force-position graph = ${fmt(r.workJ, "J")}.`, `½mv² = ½mu² + W. v = √(${s.initialSpeedMs}² + 2 × ${fmt(r.workJ)} / ${s.massKg}) = ${fmt(r.finalSpeedMs, "m s⁻¹")}.`], "work with nonzero initial kinetic energy");
    case "shuttle-motion": return multipart(`A delivery shuttle moves along a straight track. The graph shows its velocity during a ${s.durationS} s journey.`, [
      { prompt: "Calculate the total distance travelled.", target: "integrated distance", working: [`Area = ½ × 3 × 9 + 4 × 9 + ½ × 3 × 9 = ${fmt(r.distanceM, "m")}.`], markingPoints: ["Use the area under the velocity-time graph.", `Sum the three areas to obtain ${fmt(r.distanceM, "m")}.`], finalAnswer: fmt(r.distanceM, "m") },
      { prompt: "Calculate its mean speed for the whole journey.", target: "mean speed", working: [`Mean speed = total distance / total time = ${fmt(r.distanceM)} / ${s.durationS} = ${fmt(r.meanSpeedMs, "m s⁻¹")}.`], markingPoints: ["Divide total distance by total journey time.", `Obtain ${fmt(r.meanSpeedMs, "m s⁻¹")}.`], finalAnswer: fmt(r.meanSpeedMs, "m s⁻¹") },
      { prompt: `Determine its acceleration from t = ${s.brakingStartS} s to t = ${s.durationS} s.`, target: "signed braking acceleration", working: [`a = (0 − 9) / (10 − 7) = ${fmt(r.brakingAccelerationMs2, "m s⁻²")}.`], markingPoints: [`Obtain ${fmt(r.brakingAccelerationMs2, "m s⁻²")}, including the negative sign.`], finalAnswer: fmt(r.brakingAccelerationMs2, "m s⁻²") },
    ]);
    case "lift-acceleration": return multipart(`A maintenance lift initially moves upwards at ${s.initialSpeedMs} m s⁻¹. The graph shows its acceleration over ${s.durationS} s; upward is positive.`, [
      { prompt: "Calculate the velocity at the end of the interval.", target: "velocity from acceleration with initial condition", working: [`Δv = 8 + 0 − 4 = 4.00 m s⁻¹. Final velocity = ${s.initialSpeedMs} + 4 = ${fmt(r.finalSpeedMs, "m s⁻¹")} upwards.`], markingPoints: ["Calculate signed area under the acceleration-time graph.", `Add the initial velocity to obtain ${fmt(r.finalSpeedMs, "m s⁻¹")} upwards.`], finalAnswer: `${fmt(r.finalSpeedMs, "m s⁻¹")} upwards` },
      { prompt: "State the time when the upward speed is greatest and explain your answer.", target: "maximum velocity at acceleration sign change", working: [`Acceleration changes from positive to negative at ${fmt(r.peakTimeS, "s")}. Velocity is increasing before and decreasing after this time.`], markingPoints: [`State t = ${fmt(r.peakTimeS, "s")}.`, "Explain the change from increasing to decreasing upward velocity."], finalAnswer: fmt(r.peakTimeS, "s") },
      { prompt: "Calculate this greatest speed.", target: "partial integration", working: [`v = ${s.initialSpeedMs} + 2 × 4 + ½ × 2 × 2 = ${fmt(r.maxSpeedMs, "m s⁻¹")}.`], markingPoints: ["Integrate the acceleration only up to the maximum-speed time.", `Add the initial velocity to obtain ${fmt(r.maxSpeedMs, "m s⁻¹")}.`], finalAnswer: fmt(r.maxSpeedMs, "m s⁻¹") },
    ]);
    case "glider-momentum": return multipart(`A ${s.massKg} kg air-track glider moves to the right. The graph shows its momentum. Treat the glider as a particle.`, [
      { prompt: `Calculate the mean resultant force between t = ${s.forceStartS} s and t = ${s.forceEndS} s.`, target: "force as momentum gradient", working: [`F = Δp/Δt = (1.8 − 0.6) / (5 − 2) = ${fmt(r.meanForceN, "N")}.`], markingPoints: ["Use F = Δp/Δt.", `Obtain ${fmt(r.meanForceN, "N")} to the right.`], finalAnswer: `${fmt(r.meanForceN, "N")} to the right` },
      { prompt: "Calculate the net work done on the glider during this interval.", target: "kinetic energy from momentum", working: [`W = ΔK = (p₂² − p₁²)/(2m) = (1.8² − 0.6²)/(2 × ${s.massKg}) = ${fmt(r.workJ, "J")}.`], markingPoints: ["Use K = p²/(2m) and the change in kinetic energy.", `Obtain ${fmt(r.workJ, "J")}.`], finalAnswer: fmt(r.workJ, "J") },
      { prompt: "State all time intervals shown for which the resultant force is zero.", target: "zero momentum gradient", working: ["The horizontal momentum sections are 0–2 s and 5–7 s."], markingPoints: ["State both 0–2 s and 5–7 s."], finalAnswer: "0–2 s and 5–7 s" },
    ]);
    case "branch-heater": return mcq(`A heater test circuit uses an ideal ${s.voltageV} V supply, a ${s.seriesOhm} Ω series resistor and parallel resistors of ${s.branchOhm[0]} Ω and ${s.branchOhm[1]} Ω. Wires have negligible resistance. What power is dissipated in the ${s.branchOhm[1]} Ω resistor?`, fmt(r.branchTwoPowerW, "W"), [fmt(s.voltageV ** 2 / s.branchOhm[1], "W"), fmt(r.totalCurrentA ** 2 * s.branchOhm[1], "W"), fmt(r.branchOnePowerW, "W")], 2, [`Rparallel = ${fmt(r.parallelOhm, "Ω")}; Rtotal = ${fmt(r.totalOhm, "Ω")}; I = ${fmt(r.totalCurrentA, "A")}.`, `Vparallel = ${fmt(r.branchVoltageV, "V")}; P = Vparallel²/${s.branchOhm[1]} = ${fmt(r.branchTwoPowerW, "W")}.`], "power in a parallel branch after a series voltage drop");
    case "sensor-current": return mcq(`An ideal ${s.voltageV} V supply powers two branches. One contains ${s.branchSeriesOhm[0]} Ω and ${s.branchSeriesOhm[1]} Ω resistors in series; the other contains a ${s.otherOhm} Ω resistor. An ideal ammeter is in the supply branch. What does it read?`, fmt(r.totalCurrentA, "A"), [fmt(r.firstCurrentA, "A"), fmt(r.otherCurrentA, "A"), "4.00 A"], 3, [`Branch currents are ${s.voltageV}/(${s.branchSeriesOhm.join(" + ")}) = ${fmt(r.firstCurrentA, "A")} and ${s.voltageV}/${s.otherOhm} = ${fmt(r.otherCurrentA, "A")}.`, `The ammeter reads their sum, ${fmt(r.totalCurrentA, "A")}.`], "total current from separate branches");
    case "battery-energy": return mcq(`A battery has emf ${s.emfV} V and internal resistance ${s.internalOhm} Ω. It powers an ${s.loadOhm} Ω resistor for ${s.durationS} s. What energy is transferred to the external resistor in this time?`, fmt(r.externalEnergyJ, "J"), [fmt(s.emfV * r.currentA * s.durationS, "J"), fmt(r.currentA ** 2 * s.internalOhm * s.durationS, "J"), "480 J"], 0, [`I = ε/(R + r) = ${s.emfV}/(${s.loadOhm} + ${s.internalOhm}) = ${fmt(r.currentA, "A")}.`, `External energy = I²Rt = ${fmt(r.externalEnergyJ, "J")}. Internal heating is excluded.`], "energy delivered by a nonideal battery");
    case "resistor-network": return multipart(`A calibration circuit has an ideal ${s.voltageV} V supply. A ${s.seriesOhm} Ω resistor is in series with a parallel combination of ${s.branchOhm[0]} Ω and ${s.branchOhm[1]} Ω resistors. All wires have negligible resistance.`, [
      { prompt: "Calculate the resistance of the complete load.", target: "equivalent resistance", working: [`Rparallel = (${s.branchOhm[0]} × ${s.branchOhm[1]})/(${s.branchOhm[0]} + ${s.branchOhm[1]}) = ${fmt(r.parallelOhm, "Ω")}. Rtotal = ${s.seriesOhm} + ${fmt(r.parallelOhm)} = ${fmt(r.totalOhm, "Ω")}.`], markingPoints: ["Calculate the parallel resistance.", `Add the series resistor to obtain ${fmt(r.totalOhm, "Ω")}.`], finalAnswer: fmt(r.totalOhm, "Ω") },
      { prompt: "Calculate the current delivered by the supply.", target: "supply current", working: [`I = V/Rtotal = ${fmt(r.totalCurrentA, "A")}.`], markingPoints: [`Obtain ${fmt(r.totalCurrentA, "A")}.`], finalAnswer: fmt(r.totalCurrentA, "A") },
      { prompt: `Calculate the potential difference across the ${s.branchOhm[0]} Ω resistor.`, target: "parallel branch voltage", working: [`Vparallel = I Rparallel = ${fmt(r.branchVoltageV, "V")}.`], markingPoints: ["Use the voltage across the parallel combination, excluding the series drop.", `Obtain ${fmt(r.branchVoltageV, "V")}.`], finalAnswer: fmt(r.branchVoltageV, "V") },
      { prompt: `Calculate the power dissipated in the ${s.branchOhm[0]} Ω resistor.`, target: "individual resistor power", working: [`P = Vparallel²/R = ${fmt(r.branchOnePowerW, "W")}.`], markingPoints: ["Use P = V²/R with the branch voltage.", `Obtain ${fmt(r.branchOnePowerW, "W")}.`], finalAnswer: fmt(r.branchOnePowerW, "W") },
    ]);
    case "light-alarm": return multipart(`A light alarm uses an ideal ${s.voltageV} V supply. An LDR and a ${s.fixedOhm / 1000} kΩ resistor form a potential divider. The output is measured across the fixed resistor by an ideal voltmeter. The LDR resistance is ${s.darkOhm / 1000} kΩ in darkness and ${s.brightOhm / 1000} kΩ in bright light.`, [
      { prompt: "Calculate the current through the LDR in darkness.", target: "dark divider current", working: [`I = ${s.voltageV}/(${s.darkOhm} + ${s.fixedOhm}) = ${fmt(r.darkCurrentA * 1000, "mA")}.`], markingPoints: ["Add the two series resistances and use I = V/R.", `Obtain ${fmt(r.darkCurrentA * 1000, "mA")}.`], finalAnswer: fmt(r.darkCurrentA * 1000, "mA") },
      { prompt: "Calculate the output voltage in darkness and in bright light.", target: "two divider states", working: [`Vout = V Rfixed/(RLDR + Rfixed). Darkness: ${fmt(r.darkOutputV, "V")}; bright light: ${fmt(r.brightOutputV, "V")}.`], markingPoints: [`Obtain ${fmt(r.darkOutputV, "V")} in darkness.`, `Obtain ${fmt(r.brightOutputV, "V")} in bright light.`], finalAnswer: `${fmt(r.darkOutputV, "V")} in darkness; ${fmt(r.brightOutputV, "V")} in bright light` },
      { prompt: "Explain why the output voltage increases as the light intensity increases.", target: "divider response", working: ["The LDR resistance falls. Total resistance falls, so current rises and the potential difference across the unchanged fixed resistor rises."], markingPoints: ["State that the LDR resistance decreases.", "Link the greater current to the greater voltage across the fixed resistor."], finalAnswer: "A lower LDR resistance gives a larger fraction of the supply voltage across the fixed resistor." },
    ]);
    case "charge-field": return mcq(`Two fixed point charges are separated by ${s.separationM} m in vacuum. P is ${s.probeM} m to the right of the left charge. Use k = 8.99 × 10⁹ N m² C⁻². What is the resultant electric field at P?`, `${fmt(r.fieldNC, "N C⁻¹")} to the right`, [`${fmt(337.125, "N C⁻¹")} to the right`, `${fmt(r.fieldNC, "N C⁻¹")} to the left`, `${fmt(337.125, "N C⁻¹")} to the left`], 1, ["At P, the positive charge produces a field to the right and the negative charge also produces a field to the right.", `E = k(3 × 10⁻⁹/0.2² + 6 × 10⁻⁹/0.4²) = ${fmt(r.fieldNC, "N C⁻¹")} to the right.`], "signed field superposition");
    case "field-work": return mcq(`The diagram shows equipotential lines in a uniform electric field. A charge of ${fmt(s.chargeC * 1e9, "nC")} moves from the leftmost line to the rightmost line. What work does the electric field do on the charge?`, fmt(r.workJ, "J"), [fmt(r.deltaPotentialJ, "J"), fmt(r.workJ / 2, "J"), fmt(-r.workJ / 2, "J")], 2, [`Wfield = q(Vinitial − Vfinal) = ${fmt(s.chargeC)} × (${s.potentialsV[0]} − ${s.potentialsV[2]}) = ${fmt(r.workJ, "J")}.`, "Positive field work corresponds to a decrease in electric potential energy."], "field work and potential-energy sign");
    case "null-potential": return multipart(`Two fixed positive point charges of ${s.chargesNC[0]} nC and ${s.chargesNC[1]} nC are separated by ${s.separationM} m in vacuum. Use k = 8.99 × 10⁹ N m² C⁻². Take electric potential to be zero at infinity. The diagram is schematic.`, [
      { prompt: "Calculate the distance from the left charge to the point between the charges where the electric field is zero.", target: "null field position", working: [`${s.chargesNC[0]}/x² = ${s.chargesNC[1]}/(${s.separationM} − x)². Therefore (${s.separationM} − x)/x = √(${s.chargesNC[1]}/${s.chargesNC[0]}), giving x = ${fmt(r.nullPositionM, "m")}.`], markingPoints: ["Equate the opposing inverse-square field magnitudes.", `Solve to obtain ${fmt(r.nullPositionM, "m")} from the left charge.`], finalAnswer: fmt(r.nullPositionM, "m") },
      { prompt: "Calculate the electric potential at this point.", target: "nonzero potential at zero field", working: [`V = k(qL/x + qR/(d − x)) = ${fmt(r.potentialV, "V")}. Both contributions are positive.`], markingPoints: ["Add the scalar potential contributions from both charges.", `Obtain ${fmt(r.potentialV, "V")}.`], finalAnswer: fmt(r.potentialV, "V") },
      { prompt: "A very small negative test charge is placed at this point. State the electric force on it.", target: "force at field null", working: ["F = qE. The field is zero, so the electric force is zero regardless of the nonzero potential."], markingPoints: ["State zero electric force."], finalAnswer: "0 N" },
    ]);
    case "negative-probe": return multipart(`Two fixed point charges are separated by ${s.separationM} m in vacuum. Point P is ${s.probeM} m from the left charge. Use k = 8.99 × 10⁹ N m² C⁻² and take potential to be zero at infinity.`, [
      { prompt: "Calculate the magnitude and direction of the resultant electric field at P.", target: "opposite-charge field", working: [`E = k(${s.chargesNC[0]} × 10⁻⁹/${s.probeM}² + ${Math.abs(s.chargesNC[1])} × 10⁻⁹/${s.separationM - s.probeM}²) = ${fmt(r.fieldNC, "N C⁻¹")} to the right.`], markingPoints: ["Use E = k|q|/r² for each charge.", "Recognize that both field contributions at P point to the right.", `Obtain ${fmt(r.fieldNC, "N C⁻¹")} to the right.`], finalAnswer: `${fmt(r.fieldNC, "N C⁻¹")} to the right` },
      { prompt: "Calculate the electric potential at P.", target: "signed scalar potential", working: [`V = k(${s.chargesNC[0]} × 10⁻⁹/${s.probeM} + (${s.chargesNC[1]}) × 10⁻⁹/${fmt(s.separationM - s.probeM)}) = ${fmt(r.potentialV, "V")}.`], markingPoints: ["Add signed scalar potentials, using V = kq/r.", `Obtain ${fmt(r.potentialV, "V")}, including the sign.`], finalAnswer: fmt(r.potentialV, "V") },
      { prompt: `A test charge of ${s.testChargeNC} nC is placed at P without altering the source charges. Calculate the magnitude and direction of the electric force on it.`, target: "negative test-charge force", working: [`F = qE = ${fmt(r.forceN, "N")} for right positive. The force is to the left.`], markingPoints: ["Use F = qE and reverse the field direction for a negative charge.", `Obtain ${fmt(Math.abs(r.forceN), "N")} to the left.`], finalAnswer: `${fmt(Math.abs(r.forceN), "N")} to the left` },
    ]);
    case "guided-bead": return multipart(`The parallel vertical lines are equipotentials in a uniform electric field. Adjacent lines are ${s.spacingM} m apart. A bead of mass ${fmt(s.massKg, "kg")} and charge +${fmt(s.chargeC, "C")} is released from rest on the middle line. It moves along a horizontal frictionless guide that supports its weight. Ignore air resistance and changes to the field.`, [
      { prompt: "Calculate the magnitude and state the direction of the electric field.", target: "potential gradient", working: [`E = |ΔV|/d = (${s.potentialsV[1]} − ${s.potentialsV[2]})/${s.spacingM} = ${fmt(r.fieldNC, "N C⁻¹")}. It points to the right, toward lower potential.`], markingPoints: ["Divide the potential difference by the separation.", `Obtain ${fmt(r.fieldNC, "N C⁻¹")} to the right.`], finalAnswer: `${fmt(r.fieldNC, "N C⁻¹")} to the right` },
      { prompt: "Calculate the bead's horizontal acceleration.", target: "electric acceleration", working: [`a = qE/m = ${fmt(r.accelerationMs2, "m s⁻²")}.`], markingPoints: ["Use F = qE and a = F/m.", `Obtain ${fmt(r.accelerationMs2, "m s⁻²")} to the right.`], finalAnswer: `${fmt(r.accelerationMs2, "m s⁻²")} to the right` },
      { prompt: "Calculate its speed when it reaches the rightmost line.", target: "electric potential energy to kinetic energy", working: [`½mv² = q(Vmiddle − Vright). Therefore v = ${fmt(r.finalSpeedMs, "m s⁻¹")}.`], markingPoints: ["Equate the decrease in electric potential energy to kinetic energy.", `Obtain ${fmt(r.finalSpeedMs, "m s⁻¹")}.`], finalAnswer: fmt(r.finalSpeedMs, "m s⁻¹") },
    ]);
    case "collision-loss": return mcq(`A ${s.massXKg} kg cart X moves at ${s.initialXMs} m s⁻¹ to the right and collides with a stationary ${s.massYKg} kg cart Y. After the collision, Y moves at ${s.finalYMs} m s⁻¹ to the right. External impulse is negligible. How much kinetic energy is lost in the collision?`, fmt(r.lostEnergyJ, "J"), ["0 J", fmt(r.finalEnergyJ, "J"), fmt(r.initialEnergyJ, "J")], 3, [`Momentum conservation gives vX = (${s.massXKg} × ${s.initialXMs} − ${s.massYKg} × ${s.finalYMs})/${s.massXKg} = ${fmt(r.finalXMs, "m s⁻¹")}.`, `Energy lost = initial K − final K = ${fmt(r.initialEnergyJ)} − ${fmt(r.finalEnergyJ)} = ${fmt(r.lostEnergyJ, "J")}.`], "collision energy loss after momentum calculation");
    case "circle-limit": return mcq(`A ${s.massKg} kg ball on a light string moves in a vertical circle of radius ${s.radiusM} m. At the bottom, the string tension must not exceed ${s.maxTensionN} N. Use g = ${s.gravityMs2} m s⁻². What is the greatest allowed speed at the bottom?`, fmt(r.safeSpeedMs, "m s⁻¹"), [fmt(Math.sqrt(s.maxTensionN * s.radiusM / s.massKg), "m s⁻¹"), fmt(Math.sqrt(s.gravityMs2 * s.radiusM), "m s⁻¹"), fmt(Math.sqrt((s.maxTensionN / s.massKg + s.gravityMs2) * s.radiusM), "m s⁻¹")], 0, ["At the bottom, T − mg = mv²/r.", `vmax = √[(Tmax/m − g)r] = ${fmt(r.safeSpeedMs, "m s⁻¹")}.`], "safe circular speed from a tension limit");
    case "ramp-heating": return mcq(`A crate of weight ${s.weightN} N slides down a rough ramp at a constant speed of ${s.speedMs} m s⁻¹. The ramp is ${s.lengthM} m long and has a vertical drop of ${s.heightM} m. Assume all work done against friction becomes thermal energy. At what rate is thermal energy produced?`, fmt(r.thermalPowerW, "W"), [fmt(s.weightN * s.speedMs, "W"), fmt(s.weightN * s.heightM, "W"), "27.0 W"], 1, [`At constant speed, friction = W h/L = ${s.weightN} × ${s.heightM}/${s.lengthM} = ${fmt(r.resistanceN, "N")}.`, `Thermal power = friction × speed = ${fmt(r.thermalPowerW, "W")}.`], "thermal power on a constant-speed ramp");
    case "short-ramp": return multipart(`A ${s.massKg} kg parcel is released from rest on a rough ramp of length ${s.lengthM} m inclined at ${s.angleDegrees}° to the horizontal. Its speed at the bottom is ${s.finalSpeedMs} m s⁻¹. The friction force is constant. Ignore air resistance and use g = ${s.gravityMs2} m s⁻².`, [
      { prompt: "Calculate the energy transferred to thermal energy on the ramp.", target: "mechanical energy loss", working: [`Energy lost = mgL sinθ − ½mv² = ${s.massKg} × ${s.gravityMs2} × ${s.lengthM} × sin${s.angleDegrees}° − ½ × ${s.massKg} × ${s.finalSpeedMs}² = ${fmt(r.frictionLossJ, "J")}.`], markingPoints: ["Subtract final kinetic energy from the loss of gravitational potential energy.", `Obtain ${fmt(r.frictionLossJ, "J")}.`], finalAnswer: fmt(r.frictionLossJ, "J") },
      { prompt: "Calculate the friction force acting on the parcel.", target: "friction from dissipated work", working: [`Ffriction = energy lost / L = ${fmt(r.frictionN, "N")}.`], markingPoints: ["Use work against friction = Ffriction L.", `Obtain ${fmt(r.frictionN, "N")} up the ramp. Accept 3.20 N using the rounded answer from part (a).`], finalAnswer: `${fmt(r.frictionN, "N")} up the ramp` },
      { prompt: "The parcel is instead released from rest halfway down the same ramp. Predict its speed at the bottom and justify your answer.", target: "speed scaling at constant acceleration", working: [`The resultant force and acceleration are unchanged. With u = 0, v² = 2as. Halving s halves v², so vnew = ${s.finalSpeedMs}/√2 = ${fmt(r.shortRampSpeedMs, "m s⁻¹")}.`], markingPoints: ["Explain that the acceleration is unchanged, or that both gravitational energy lost and work against friction halve.", "Use v² proportional to distance, or halve the final kinetic energy for the same mass.", `Obtain ${fmt(r.shortRampSpeedMs, "m s⁻¹")}.`], finalAnswer: fmt(r.shortRampSpeedMs, "m s⁻¹") },
    ]);
    case "pendulum-loss": return multipart(`A ${s.massKg} kg pendulum bob on a light inextensible string of length ${s.lengthM} m is released from rest with the string horizontal. At its lowest point it collides with and sticks to a stationary ${s.targetMassKg} kg lump of clay. The joined bodies then swing upwards. Ignore air resistance and pivot friction. The collision is brief, and the tangential external impulse during it is negligible. Use g = ${s.gravityMs2} m s⁻².`, [
      { prompt: "Calculate the bob's speed immediately before the collision.", target: "pendulum energy before impact", working: [`mgL = ½mu², so u = √(2gL) = ${fmt(r.bottomSpeedMs, "m s⁻¹")}.`], markingPoints: ["Equate gravitational potential energy lost to kinetic energy.", `Obtain ${fmt(r.bottomSpeedMs, "m s⁻¹")}.`], finalAnswer: fmt(r.bottomSpeedMs, "m s⁻¹") },
      { prompt: "Calculate the kinetic energy lost during the collision.", target: "inelastic collision energy loss", working: [`Momentum: m u = (m + M)v, so v = ${fmt(r.combinedSpeedMs, "m s⁻¹")}.`, `Lost K = ½m u² − ½(m + M)v² = ${fmt(r.lostEnergyJ, "J")}.`], markingPoints: ["Conserve tangential momentum to find the joined speed.", "Subtract joined kinetic energy from the bob's pre-collision kinetic energy.", `Obtain ${fmt(r.lostEnergyJ, "J")}.`], finalAnswer: fmt(r.lostEnergyJ, "J") },
      { prompt: "Calculate the greatest vertical height reached above the collision point by the joined bodies.", target: "post-collision rise", working: [`½(m + M)v² = (m + M)gh, so h = v²/(2g) = ${fmt(r.riseM, "m")}.`], markingPoints: ["Convert the post-collision kinetic energy into gravitational potential energy.", `Obtain ${fmt(r.riseM, "m")}.`], finalAnswer: fmt(r.riseM, "m") },
    ]);
    default: { const exhaustive: never = s; throw new Error(`Unsupported author scenario ${exhaustive}`); }
  }
}

function graph(id: string, s: GraphScenario): VisualArtifact {
  const axes = s.kind === "cart-work" ? ["position", "m", "resultant force", "N"] : s.kind === "lift-acceleration" ? ["time", "s", "acceleration", "m s⁻²"] : s.kind === "glider-momentum" ? ["time", "s", "momentum", "kg m s⁻¹"] : ["time", "s", "velocity", "m s⁻¹"];
  const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
  const xMax = Math.max(...xs), yMin = Math.min(0, ...ys), yMax = Math.max(...ys);
  const xDomain: [number, number] = [0, xMax];
  const yDomain: [number, number] = [yMin, yMax];
  const spec: VisualSpec<"cartesian_plot"> = {
    schemaVersion: VISUAL_SCHEMA_VERSION, id: `${id}-figure`, family: "cartesian_plot", templateId: "plot.cartesian.v1", scenarioRef: id, coordinateSpace: "cartesian",
    payload: {
      xAxis: { id: `${id}-x`, label: axes[0], unit: axes[1], scale: "linear", domain: xDomain, ...measurementAxisTicks(xDomain) },
      yAxis: { id: `${id}-y`, label: axes[2], unit: axes[3], scale: "linear", domain: yDomain, ...measurementAxisTicks(yDomain) },
      series: [{ id: `${id}-line`, kind: "analytical-curve", xParameterId: `${id}-x`, yParameterId: `${id}-y`, dataRef: `${id}-data`, styleRole: "primary" }], showGrid: true,
    },
    visibility: { publicParameterIds: [`${id}-x`, `${id}-y`, `${id}-data`], privateParameterIds: [`${id}-answer`], labelMode: "allowlist", altTextMode: "student-safe" },
    provenance: { rendererVersion: "synthetic-pilot/0.1.0+cartesian-svg/0.1.0" },
  };
  return { family: "cartesian_plot", spec, data: { [`${id}-data`]: s.points } };
}
const component = (id: string, componentKind: "resistor" | "cell" | "ammeter" | "ldr" | "voltmeter", label: string): CircuitTopologyIntent => ({ type: "component", id, componentKind, label });
const series = (...items: CircuitTopologyIntent[]): CircuitTopologyIntent => ({ type: "series", items });
const parallel = (...branches: CircuitTopologyIntent[]): CircuitTopologyIntent => ({ type: "parallel", branches });
function circuit(id: string, s: CircuitScenario): VisualArtifact {
  let topology: CircuitTopologyIntent;
  switch (s.kind) {
    case "branch-heater":
    case "resistor-network": topology = parallel(component("supply", "cell", `${s.voltageV} V`), series(component("series-r", "resistor", `${s.seriesOhm} Ω`), parallel(component("r1", "resistor", `${s.branchOhm[0]} Ω`), component("r2", "resistor", `${s.branchOhm[1]} Ω`)))); break;
    case "sensor-current": topology = parallel(series(component("ammeter", "ammeter", "A"), component("supply", "cell", `${s.voltageV} V`)), series(component("r1", "resistor", `${s.branchSeriesOhm[0]} Ω`), component("r2", "resistor", `${s.branchSeriesOhm[1]} Ω`)), component("r3", "resistor", `${s.otherOhm} Ω`)); break;
    case "battery-energy": topology = parallel(series(component("supply", "cell", `ε = ${s.emfV} V`), component("internal-r", "resistor", `r = ${s.internalOhm} Ω`)), component("load", "resistor", `${s.loadOhm} Ω`)); break;
    case "light-alarm": topology = parallel(component("supply", "cell", `${s.voltageV} V`), series(component("ldr", "ldr", "LDR"), parallel(component("fixed", "resistor", `${s.fixedOhm / 1000} kΩ`), component("meter", "voltmeter", "Vout")))); break;
    default: { const exhaustive: never = s; throw new Error(`Unsupported circuit ${exhaustive}`); }
  }
  return { family: "circuit_network", spec: compileCircuitIntent({ schemaVersion: "circuit-intent/0.1.0", id: `${id}-figure`, scenarioRef: id, templateId: "series-parallel.v1", topology, visibility: { privateParameterIds: [`${id}-answer`] } }) };
}
function field(id: string, s: FieldScenario): VisualArtifact {
  const base = { schemaVersion: "field-intent/0.1.0", id: `${id}-figure`, scenarioRef: id } satisfies Pick<FieldIntent, "schemaVersion" | "id" | "scenarioRef">;
  let intent: FieldIntent;
  switch (s.kind) {
    case "field-work":
    case "guided-bead": intent = { ...base, templateId: "parallel-equipotentials.v1", labels: [s.potentialsV[0] + " V", s.potentialsV[1] + " V", s.potentialsV[2] + " V"], marker: { id: "middle", label: s.kind === "guided-bead" ? "+q" : "P", lineIndex: 1 }, spacingLabel: `${s.spacingM} m` }; break;
    case "charge-field":
    case "negative-probe":
    case "null-potential": intent = {
      ...base, templateId: "linear-sources.v1",
      sources: [{ id: "left-charge", kind: "point-charge", sign: s.chargesNC[0] > 0 ? 1 : -1, relativeMagnitude: Math.abs(s.chargesNC[0]), label: `${s.chargesNC[0] > 0 ? "+" : ""}${s.chargesNC[0]} nC` }, { id: "right-charge", kind: "point-charge", sign: s.chargesNC[1] > 0 ? 1 : -1, relativeMagnitude: Math.abs(s.chargesNC[1]), label: `${s.chargesNC[1] > 0 ? "+" : ""}${s.chargesNC[1]} nC` }],
      ...(s.kind === "null-potential" ? {} : { marker: { id: "probe", label: "P", placement: { kind: "between", fractionFromLeft: s.probeM / s.separationM } } satisfies NonNullable<Extract<FieldIntent, { templateId: "linear-sources.v1" }>["marker"]> }),
      dimensions: s.kind === "null-potential" ? { total: `${s.separationM} m` } : { total: `${s.separationM} m`, leftToMarker: `${s.probeM} m`, markerToRight: `${fmt(s.separationM - s.probeM)} m` },
    }; break;
    default: { const exhaustive: never = s; throw new Error(`Unsupported field ${exhaustive}`); }
  }
  return { family: "field_map", spec: compileFieldIntent(intent) };
}
function mechanics(id: string, s: MechanicsScenario): VisualArtifact {
  const base = { schemaVersion: "mechanics-intent/0.1.0", id: `${id}-figure`, scenarioRef: id, privateParameterIds: [`${id}-answer`] } satisfies Pick<MechanicsIntent, "schemaVersion" | "id" | "scenarioRef" | "privateParameterIds">;
  let intent: MechanicsIntent;
  switch (s.kind) {
    case "collision-loss": intent = { ...base, template: "collision", labels: [{ parameterId: "cart-x", text: `X, ${s.massXKg} kg` }, { parameterId: "cart-y", text: `Y, ${s.massYKg} kg` }, { parameterId: "speed-x", text: `${s.initialXMs} m s⁻¹` }] }; break;
    case "circle-limit": intent = { ...base, template: "vertical-circle", labels: [{ parameterId: "body", text: `${s.massKg} kg` }, { parameterId: "radius", text: `${s.radiusM} m` }] }; break;
    case "ramp-heating": intent = { ...base, template: "incline", angleDegrees: Math.asin(s.heightM / s.lengthM) * 180 / Math.PI, showStartEnd: false, labels: [{ parameterId: "body", text: `${s.weightN} N` }, { parameterId: "length", text: `${s.lengthM} m` }, { parameterId: "height", text: `${s.heightM} m` }] }; break;
    case "short-ramp": intent = { ...base, template: "incline", angleDegrees: s.angleDegrees, showStartEnd: true, labels: [{ parameterId: "body", text: `${s.massKg} kg` }, { parameterId: "length", text: `${s.lengthM} m` }, { parameterId: "angle", text: `${s.angleDegrees}°` }] }; break;
    case "pendulum-loss": intent = { ...base, template: "pendulum", labels: [{ parameterId: "body", text: `${s.massKg} kg` }, { parameterId: "target", text: `${s.targetMassKg} kg` }, { parameterId: "length", text: `${s.lengthM} m` }] }; break;
    default: { const exhaustive: never = s; throw new Error(`Unsupported mechanics ${exhaustive}`); }
  }
  return { family: "mechanics_scene", spec: compileMechanicsIntent(intent) };
}
function visual(id: string, s: SyntheticScenario): VisualArtifact {
  switch (s.kind) {
    case "rover-distance": case "cart-work": case "shuttle-motion": case "lift-acceleration": case "glider-momentum": return graph(id, s);
    case "branch-heater": case "sensor-current": case "battery-energy": case "resistor-network": case "light-alarm": return circuit(id, s);
    case "charge-field": case "field-work": case "null-potential": case "negative-probe": case "guided-bead": return field(id, s);
    case "collision-loss": case "circle-limit": case "ramp-heating": case "short-ramp": case "pendulum-loss": return mechanics(id, s);
    default: { const exhaustive: never = s; throw new Error(`Unsupported visual ${exhaustive}`); }
  }
}
interface Seed { title: string; level: "SL" | "HL"; parentQuestionId: string; scenario: SyntheticScenario }
const graphParents = CARTESIAN_PILOT_FIXTURES;
const circuitParents = CIRCUIT_QUESTION_PACKAGES;
const fieldParents = FIELD_QUESTION_PACKAGES;
const mechanicsParents = MECHANICS_QUESTION_PACKAGES;
const seeds: Seed[] = [
  { title: "Inspection rover: total distance", level: "SL", parentQuestionId: graphParents[0].sourceQuestionId, scenario: { kind: "rover-distance", durationS: 8, points: [{ x: 0, y: 0 }, { x: 2, y: 6 }, { x: 4, y: 6 }, { x: 6, y: -2 }, { x: 8, y: -2 }] } },
  { title: "Test cart: force and final speed", level: "SL", parentQuestionId: graphParents[4].sourceQuestionId, scenario: { kind: "cart-work", distanceM: 7, massKg: 2.5, initialSpeedMs: 2, points: [{ x: 0, y: 0 }, { x: 2, y: 8 }, { x: 5, y: 8 }, { x: 7, y: 0 }] } },
  { title: "Delivery shuttle: journey analysis", level: "SL", parentQuestionId: graphParents[0].sourceQuestionId, scenario: { kind: "shuttle-motion", durationS: 10, brakingStartS: 7, points: [{ x: 0, y: 0 }, { x: 3, y: 9 }, { x: 7, y: 9 }, { x: 10, y: 0 }] } },
  { title: "Maintenance lift: changing acceleration", level: "SL", parentQuestionId: graphParents[1].sourceQuestionId, scenario: { kind: "lift-acceleration", durationS: 10, initialSpeedMs: 3, peakTimeS: 6, points: [{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 8, y: -2 }, { x: 10, y: -2 }] } },
  { title: "Air-track glider: momentum and work", level: "SL", parentQuestionId: graphParents[1].sourceQuestionId, scenario: { kind: "glider-momentum", massKg: 0.3, forceStartS: 2, forceEndS: 5, points: [{ x: 0, y: 0.6 }, { x: 2, y: 0.6 }, { x: 5, y: 1.8 }, { x: 7, y: 1.8 }] } },
  { title: "Heater circuit: branch power", level: "SL", parentQuestionId: circuitParents[0].source.questionId, scenario: { kind: "branch-heater", voltageV: 21, seriesOhm: 3, branchOhm: [12, 6] } },
  { title: "Sensor circuit: supply current", level: "SL", parentQuestionId: circuitParents[3].source.questionId, scenario: { kind: "sensor-current", voltageV: 12, branchSeriesOhm: [8, 4], otherOhm: 6 } },
  { title: "Battery: useful energy delivery", level: "SL", parentQuestionId: circuitParents[5].source.questionId, scenario: { kind: "battery-energy", emfV: 9, internalOhm: 1, loadOhm: 8, durationS: 30 } },
  { title: "Calibration circuit: resistance and power", level: "SL", parentQuestionId: circuitParents[0].source.questionId, scenario: { kind: "resistor-network", voltageV: 15, seriesOhm: 3, branchOhm: [6, 12] } },
  { title: "Light alarm: divider response", level: "SL", parentQuestionId: circuitParents[6].source.questionId, scenario: { kind: "light-alarm", voltageV: 10, fixedOhm: 5000, darkOhm: 15000, brightOhm: 5000 } },
  { title: "Charge pair: field direction", level: "HL", parentQuestionId: fieldParents[0].source.questionId, scenario: { kind: "charge-field", chargesNC: [3, -6], separationM: 0.6, probeM: 0.2 } },
  { title: "Equipotentials: work done by the field", level: "HL", parentQuestionId: fieldParents[2].source.questionId, scenario: { kind: "field-work", potentialsV: [120, 80, 40], spacingM: 0.02, chargeC: 2e-9 } },
  { title: "Positive charges: zero field, nonzero potential", level: "HL", parentQuestionId: fieldParents[4].source.questionId, scenario: { kind: "null-potential", chargesNC: [4, 9], separationM: 0.5 } },
  { title: "Negative probe: field, potential and force", level: "HL", parentQuestionId: fieldParents[5].source.questionId, scenario: { kind: "negative-probe", chargesNC: [2, -5], separationM: 0.8, probeM: 0.3, testChargeNC: -3 } },
  { title: "Guided bead: acceleration in an electric field", level: "HL", parentQuestionId: fieldParents[2].source.questionId, scenario: { kind: "guided-bead", potentialsV: [90, 60, 30], spacingM: 0.015, chargeC: 2e-9, massKg: 4e-6 } },
  { title: "Cart collision: lost kinetic energy", level: "SL", parentQuestionId: mechanicsParents[1].source.questionId, scenario: { kind: "collision-loss", massXKg: 0.8, massYKg: 1.2, initialXMs: 3, finalYMs: 2 } },
  { title: "Vertical circle: safe bottom speed", level: "SL", parentQuestionId: mechanicsParents[2].source.questionId, scenario: { kind: "circle-limit", massKg: 0.4, radiusM: 1.2, maxTensionN: 30, gravityMs2: 9.8 } },
  { title: "Rough ramp: rate of heating", level: "SL", parentQuestionId: mechanicsParents[3].source.questionId, scenario: { kind: "ramp-heating", weightN: 90, lengthM: 5, heightM: 1.5, speedMs: 1.2 } },
  { title: "Parcel on a ramp: a shorter run", level: "SL", parentQuestionId: mechanicsParents[4].source.questionId, scenario: { kind: "short-ramp", massKg: 1.5, lengthM: 4, angleDegrees: 25, finalSpeedMs: 4, gravityMs2: 9.8 } },
  { title: "Pendulum and clay: collision losses", level: "SL", parentQuestionId: mechanicsParents[5].source.questionId, scenario: { kind: "pendulum-loss", massKg: 0.2, targetMassKg: 0.6, lengthM: 0.9, gravityMs2: 9.8 } },
];

export function buildSyntheticPilot(): SyntheticPilotPackage[] {
  return seeds.map((seed, i) => {
    const id = `synthetic-v1-${String(i + 1).padStart(2, "0")}-${seed.scenario.kind}`;
    const results = solveSyntheticScenario(seed.scenario);
    const authored = author(seed.scenario, results);
    const marks = authored.question.kind === "multiple-choice" ? 1 : authored.question.parts.reduce((sum, p) => sum + p.marks, 0);
    return {
      schemaVersion: "synthetic-question-package/0.1.0", id, title: seed.title, paper: authored.question.kind === "multiple-choice" ? "1A" : "2", level: seed.level, marks,
      scenario: seed.scenario, results, ...authored, visual: visual(id, seed.scenario), lineage: { parentQuestionId: seed.parentQuestionId, relationship: "development-template-family" },
      provenance: { generatorVersion: "synthetic-pilot/0.1.0", author: "deterministic-code", solverVersion: "synthetic-physics/0.1.0" }, reviewStatus: "awaiting-human-review", trainingEligibility: "blocked-pending-review-and-source-use-clearance",
    };
  });
}

export function validateSyntheticPackage(item: SyntheticPilotPackage): string[] {
  const issues: string[] = [];
  const expected = solveSyntheticScenario(item.scenario);
  if (JSON.stringify(expected) !== JSON.stringify(item.results) || Object.values(item.results).some(v => !Number.isFinite(v))) issues.push("Physics targets disagree with the scenario");
  const authored = author(item.scenario, expected);
  if (JSON.stringify(authored.question) !== JSON.stringify(item.question)) issues.push("Question differs from scenario-derived wording");
  if (JSON.stringify(authored.solution) !== JSON.stringify(item.solution)) issues.push("Solution differs from checked working");
  if (JSON.stringify(visual(item.id, item.scenario)) !== JSON.stringify(item.visual)) issues.push("Student figure differs from scenario-derived givens");
  const questionMarks = item.question.kind === "multiple-choice" ? 1 : item.question.parts.reduce((sum, p) => sum + p.marks, 0);
  if (questionMarks !== item.marks || item.solution.parts.reduce((sum, p) => sum + p.marks, 0) !== item.marks || item.solution.parts.some(p => p.markingPoints.length !== p.marks)) issues.push("Mark allocation does not balance");
  if (item.question.kind === "multiple-choice") {
    if (new Set(item.question.options.map(o => o.text)).size !== 4 || item.question.options.filter(o => o.id === item.solution.correctOptionId).length !== 1) issues.push("MCQ needs four distinct choices and one correct choice");
  }
  return issues;
}
