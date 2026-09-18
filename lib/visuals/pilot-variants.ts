import {
  CARTESIAN_PILOT_FIXTURES,
  PilotCheck,
  PilotFixture,
} from "./pilot-fixtures";
import { kineticEnergyFraction } from "./pilot-physics";
import { CartesianPlotData } from "./render-cartesian";
import { AxisSpec, Point2D, VisualSpec } from "./types";

export type PilotVariantScenario =
  | {
      kind: "area-speed";
      duration: number;
      finalAcceleration: number;
      queryTime: number;
    }
  | {
      kind: "mean-force";
      duration: number;
      flatUntil: number;
      initialAcceleration: number;
      finalAcceleration: number;
      mass: number;
      yMaximum: number;
    }
  | {
      kind: "dissipated-energy";
      startDistance: number;
      breakDistance: number;
      stopDistance: number;
      initialDeceleration: number;
      finalDeceleration: number;
      mass: number;
    }
  | {
      kind: "harmonic-speed";
      amplitudeCm: number;
      period: number;
      queryTime: number;
      duration: number;
    }
  | {
      kind: "work-speed";
      forceKiloNewton: number;
      flatDistance: number;
      totalDistance: number;
      mass: number;
    }
  | {
      kind: "terminal-drag-speed";
      fluidDensity: number;
      oilDensity: number;
      radius: number;
      viscosity: number;
      gravity: number;
    }
  | {
      kind: "spring-max-speed";
      mass: number;
      springConstant: number;
      amplitude: number;
      gravity: number;
    }
  | {
      kind: "harmonic-max-acceleration";
      amplitude: number;
      angularFrequency: number;
      duration: number;
    };

export interface PilotSolutionPart {
  id: string;
  label: string;
  working: string;
  finalAnswer?: string;
}

export interface PilotExpectedGraph {
  description: string;
  spec: VisualSpec<"cartesian_plot">;
  data: CartesianPlotData;
}

export interface PilotVariantSolution {
  value: number;
  displayValue: string;
  significantFigures: 3;
  unit: string;
  method: string;
  parts: PilotSolutionPart[];
  expectedGraph?: PilotExpectedGraph;
}

export interface PilotVariant {
  id: string;
  sourceFixtureId: string;
  sourceQuestionId: string;
  paper: "1A" | "2";
  scenario: PilotVariantScenario;
  studentPrompt: string;
  spec: VisualSpec<"cartesian_plot">;
  data: CartesianPlotData;
  solution: PilotVariantSolution;
  trainingEligibility: "blocked";
  check: PilotCheck;
}

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`);
  }
}

function requireOrder(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

/** Student-facing calculated answers use the project's IB-style 3 s.f. rule. */
export function formatToSignificantFigures(
  value: number,
  significantFigures = 3,
): string {
  if (!Number.isFinite(value)) throw new Error("Answer must be finite");
  if (!Number.isInteger(significantFigures) || significantFigures < 1) {
    throw new Error("Significant figures must be a positive integer");
  }
  return value.toPrecision(significantFigures).replace("e+", "e");
}

/** Givens stay calculator-friendly without adding insignificant trailing zeros. */
function formatGiven(value: number): string {
  return String(Number(formatToSignificantFigures(value)));
}

function requireStudentFriendlyGiven(name: string, value: number): void {
  if (value !== Number(formatGiven(value))) {
    throw new Error(`${name} must use at most 3 significant figures`);
  }
}

function ticks(start: number, end: number, step: number): number[] {
  positive("tick step", step);
  const count = Math.floor((end - start) / step + 1e-8);
  if (count < 1 || count > 80) throw new Error("Unsupported tick count");
  return Array.from({ length: count + 1 }, (_, index) =>
    index === count && Math.abs(start + index * step - end) < 1e-7
      ? end
      : round(start + index * step),
  );
}

function samples(end: number, yAt: (time: number) => number): Point2D[] {
  return Array.from({ length: 201 }, (_, index) => {
    const x = (end * index) / 200;
    return { x, y: yAt(x) };
  });
}

function setAxis(
  axis: AxisSpec,
  domain: [number, number],
  values: number[],
  minorTickStep?: number,
): void {
  axis.domain = domain;
  axis.tickValues = values;
  axis.minorTickStep = minorTickStep;
}

function shortTickLabels(
  values: readonly number[],
  decimalPlaces: number,
): Record<string, string> {
  return Object.fromEntries(
    values.map((value) => [
      round(value).toString(),
      Number(value.toFixed(decimalPlaces)).toString(),
    ]),
  );
}

function variantSpec(
  base: PilotFixture,
  id: string,
): VisualSpec<"cartesian_plot"> {
  const spec = structuredClone(base.spec);
  spec.id = id;
  spec.scenarioRef = id;
  spec.payload.xAxis.id = `${id}-x`;
  spec.payload.yAxis.id = `${id}-y`;
  for (const series of spec.payload.series) {
    series.id = `${id}-series`;
    series.xParameterId = `${id}-x`;
    series.yParameterId = `${id}-y`;
    series.dataRef = `${id}-data`;
  }
  spec.visibility.publicParameterIds = [
    `${id}-x`,
    `${id}-y`,
    ...(spec.payload.series.length ? [`${id}-data`] : []),
  ];
  spec.visibility.privateParameterIds = [`${id}-answer`];
  spec.provenance = {
    sourceQuestionId: base.sourceQuestionId,
    rendererVersion: "cartesian-svg/0.2.0",
  };
  return spec;
}

function kineticEnergySolutionGraph(
  studentSpec: VisualSpec<"cartesian_plot">,
  id: string,
  duration: number,
  angularFrequency: number,
): PilotExpectedGraph {
  const spec = structuredClone(studentSpec);
  const dataRef = `${id}-solution-data`;
  spec.id = `${id}-solution`;
  spec.scenarioRef = `${id}-solution`;
  spec.payload.series = [
    {
      id: `${id}-solution-series`,
      kind: "waveform",
      xParameterId: spec.payload.xAxis.id,
      yParameterId: spec.payload.yAxis.id,
      dataRef,
      styleRole: "primary",
    },
  ];
  spec.visibility.publicParameterIds = [
    spec.payload.xAxis.id,
    spec.payload.yAxis.id,
    dataRef,
  ];
  spec.visibility.privateParameterIds = [];
  spec.visibility.altTextMode = "teacher-complete";
  return {
    description:
      "The curve starts at zero, reaches Eₜ whenever the displacement passes through equilibrium, returns to zero at each extreme displacement, and repeats every π/ω seconds.",
    spec,
    data: {
      [dataRef]: samples(duration, (time) =>
        kineticEnergyFraction(time, angularFrequency),
      ),
    },
  };
}

/** Build a new graph and solution from one validated physical scenario. */
export function createPilotVariant(
  sourceFixtureId: string,
  variantNumber: number,
  scenario: PilotVariantScenario,
): PilotVariant {
  const base = CARTESIAN_PILOT_FIXTURES.find(
    (item) => item.id === sourceFixtureId,
  );
  if (!base || base.check.kind !== scenario.kind) {
    throw new Error(
      `Scenario does not match source fixture: ${sourceFixtureId}`,
    );
  }
  if (
    !Number.isInteger(variantNumber) ||
    variantNumber < 1 ||
    variantNumber > 99
  ) {
    throw new Error("Variant number must be an integer from 1 to 99");
  }
  const id = `${sourceFixtureId}-v${variantNumber}`;
  const spec = variantSpec(base, id);
  const xAxis = spec.payload.xAxis;
  const yAxis = spec.payload.yAxis;
  let points: Point2D[] | undefined;
  let value: number;
  let unit: string;
  let method: string;
  let inputs: Record<string, number>;
  let studentPrompt: string;

  switch (scenario.kind) {
    case "area-speed": {
      const { duration, finalAcceleration, queryTime } = scenario;
      positive("duration", duration);
      positive("final acceleration", finalAcceleration);
      requireOrder(
        queryTime > 0 && queryTime <= duration,
        "Query time must lie on the graph",
      );
      setAxis(
        xAxis,
        [0, duration],
        ticks(0, duration, duration / 5),
        duration / 25,
      );
      setAxis(
        yAxis,
        [0, finalAcceleration],
        ticks(0, finalAcceleration, finalAcceleration / 5),
        finalAcceleration / 25,
      );
      points = [
        { x: 0, y: 0 },
        { x: duration, y: finalAcceleration },
      ];
      value = (finalAcceleration * queryTime ** 2) / (2 * duration);
      unit = "m/s";
      method = "Integrate the linear acceleration from 0 to the requested time";
      inputs = { end: queryTime };
      studentPrompt = `An object starts from rest. Use the acceleration–time graph to find its speed at t = ${queryTime} s.`;
      break;
    }
    case "mean-force": {
      const {
        duration,
        flatUntil,
        initialAcceleration,
        finalAcceleration,
        mass,
        yMaximum,
      } = scenario;
      for (const [name, number] of Object.entries({
        duration,
        initialAcceleration,
        finalAcceleration,
        mass,
        yMaximum,
      }))
        positive(name, number);
      requireOrder(
        flatUntil > 0 && flatUntil < duration,
        "Flat interval must lie inside the graph",
      );
      requireOrder(
        Math.max(initialAcceleration, finalAcceleration) < yMaximum,
        "Acceleration must fit the axis",
      );
      setAxis(xAxis, [0, duration], ticks(0, duration, 2), 0.4);
      setAxis(yAxis, [0, yMaximum], ticks(0, yMaximum, 1), 0.2);
      points = [
        { x: 0, y: initialAcceleration },
        { x: flatUntil, y: initialAcceleration },
        { x: duration, y: finalAcceleration },
      ];
      const area =
        initialAcceleration * flatUntil +
        ((initialAcceleration + finalAcceleration) * (duration - flatUntil)) /
          2;
      value = (mass * area) / duration;
      unit = "N";
      method =
        "Mean force = mass × mean acceleration; mean acceleration is graph area / duration";
      inputs = { start: 0, end: duration, mass };
      studentPrompt = `A body of mass ${mass} kg has the acceleration shown. Find its average resultant force over ${duration} s.`;
      break;
    }
    case "dissipated-energy": {
      const {
        startDistance,
        breakDistance,
        stopDistance,
        initialDeceleration,
        finalDeceleration,
        mass,
      } = scenario;
      for (const [name, number] of Object.entries({
        startDistance,
        breakDistance,
        stopDistance,
        initialDeceleration,
        finalDeceleration,
        mass,
      }))
        positive(name, number);
      requireOrder(
        startDistance < breakDistance && breakDistance < stopDistance,
        "Distances must be strictly ordered",
      );
      const xMaximum = stopDistance + 5;
      const yMinimum = -Math.ceil(
        Math.max(initialDeceleration, finalDeceleration) + 1,
      );
      setAxis(xAxis, [0, xMaximum], ticks(0, xMaximum, 5));
      setAxis(yAxis, [yMinimum, 1], ticks(yMinimum, 1, 1));
      points = [
        { x: startDistance, y: 0 },
        { x: startDistance, y: -initialDeceleration },
        { x: breakDistance, y: -initialDeceleration },
        { x: stopDistance, y: -finalDeceleration },
        { x: stopDistance, y: 0 },
      ];
      const areaMagnitude =
        initialDeceleration * (breakDistance - startDistance) +
        ((initialDeceleration + finalDeceleration) *
          (stopDistance - breakDistance)) /
          2;
      value = (mass * areaMagnitude) / 1000;
      unit = "kJ";
      method =
        "Energy dissipated = mass × magnitude of acceleration–distance area";
      inputs = { start: startDistance, end: stopDistance, mass };
      studentPrompt = `A ${mass} kg vehicle slows to rest. Find the energy dissipated using the acceleration–distance graph.`;
      break;
    }
    case "harmonic-speed": {
      const { amplitudeCm, period, queryTime, duration } = scenario;
      for (const [name, number] of Object.entries({
        amplitudeCm,
        period,
        duration,
      }))
        positive(name, number);
      requireOrder(
        queryTime >= 0 && queryTime <= duration,
        "Query time must lie on the graph",
      );
      const yMaximum = Math.ceil(amplitudeCm * 2.5) / 2;
      setAxis(
        xAxis,
        [0, duration],
        ticks(0, duration, duration / 4),
        duration / 20,
      );
      setAxis(
        yAxis,
        [-yMaximum, yMaximum],
        ticks(-yMaximum, yMaximum, 0.5),
        0.1,
      );
      const omega = (2 * Math.PI) / period;
      points = samples(
        duration,
        (time) => -amplitudeCm * Math.sin(omega * time),
      );
      value = Math.abs(amplitudeCm * omega * Math.cos(omega * queryTime));
      unit = "cm/s";
      method =
        "Differentiate sinusoidal displacement and take the speed magnitude";
      inputs = { amplitude: amplitudeCm, period, time: queryTime };
      studentPrompt = `The graph shows a pendulum bob's displacement from equilibrium. Find its speed at t = ${queryTime} s.`;
      break;
    }
    case "work-speed": {
      const { forceKiloNewton, flatDistance, totalDistance, mass } = scenario;
      for (const [name, number] of Object.entries({
        forceKiloNewton,
        flatDistance,
        totalDistance,
        mass,
      }))
        positive(name, number);
      requireOrder(
        flatDistance < totalDistance,
        "Flat distance must be less than total distance",
      );
      const yMaximum = Math.ceil(forceKiloNewton + 1);
      setAxis(xAxis, [0, totalDistance], ticks(0, totalDistance, 10), 2);
      setAxis(yAxis, [0, yMaximum], ticks(0, yMaximum, 1), 0.2);
      points = [
        { x: 0, y: forceKiloNewton },
        { x: flatDistance, y: forceKiloNewton },
        { x: totalDistance, y: 0 },
      ];
      const work =
        1000 *
        forceKiloNewton *
        (flatDistance + (totalDistance - flatDistance) / 2);
      value = Math.sqrt((2 * work) / mass);
      unit = "m/s";
      method =
        "Work is force–distance area; set work equal to final kinetic energy";
      inputs = { start: 0, end: totalDistance, forceScale: 1000, mass };
      studentPrompt = `A ${mass} kg car starts from rest. Use the resultant force–distance graph to find its final speed.`;
      break;
    }
    case "terminal-drag-speed": {
      const { fluidDensity, oilDensity, radius, viscosity, gravity } = scenario;
      for (const [name, number] of Object.entries({
        fluidDensity,
        oilDensity,
        radius,
        viscosity,
        gravity,
      }))
        positive(name, number);
      requireOrder(
        oilDensity < fluidDensity,
        "Droplet must be buoyant in the liquid",
      );
      const volume = (4 * Math.PI * radius ** 3) / 3;
      const weight = oilDensity * volume * gravity;
      const dragCoefficient = 6 * Math.PI * viscosity * radius;
      const tau = weight / gravity / dragCoefficient;
      value =
        ((fluidDensity - oilDensity) * volume * gravity) / dragCoefficient;
      const reynoldsNumber = (2 * fluidDensity * radius * value) / viscosity;
      requireOrder(
        reynoldsNumber < 0.1,
        "Stokes drag requires low Reynolds number",
      );
      const duration = 5 * tau;
      requireOrder(
        duration >= 1e-5 && duration <= 30,
        "Terminal-speed time domain is unsupported",
      );
      setAxis(xAxis, [0, duration], ticks(0, duration, duration / 5));
      setAxis(yAxis, [0, value * 1.1], []);
      points = samples(duration, (time) => value * (1 - Math.exp(-time / tau)));
      unit = "m/s";
      method = "At terminal speed, buoyancy minus weight equals 6πηrv";
      inputs = {
        density: fluidDensity,
        volume,
        gravity,
        weight,
        viscosity,
        radius,
      };
      studentPrompt = `A spherical droplet rises in a liquid. Its radius is ${radius} m, its density is ${oilDensity} kg/m³, the liquid density is ${fluidDensity} kg/m³, viscosity is ${viscosity} Pa·s, and g = ${gravity} m/s². Deduce its terminal speed; the curve shows its approach to steady speed.`;
      break;
    }
    case "spring-max-speed": {
      const { mass, springConstant, amplitude, gravity } = scenario;
      for (const [name, number] of Object.entries({
        mass,
        springConstant,
        amplitude,
        gravity,
      }))
        positive(name, number);
      const meanExtension = (mass * gravity) / springConstant;
      requireOrder(
        amplitude < meanExtension,
        "Spring must remain stretched throughout the cycle",
      );
      const omega = Math.sqrt(springConstant / mass);
      const period = (2 * Math.PI) / omega;
      const energyMinimum =
        0.5 * springConstant * (meanExtension - amplitude) ** 2;
      const energyMaximum =
        0.5 * springConstant * (meanExtension + amplitude) ** 2;
      const yMaximum = Math.ceil((energyMaximum * 100) / 5) * 5;
      const timeTicks = ticks(0, period, period / 4);
      setAxis(xAxis, [0, period], timeTicks, period / 40);
      xAxis.tickLabels = shortTickLabels(timeTicks, 2);
      setAxis(yAxis, [0, yMaximum], ticks(0, yMaximum, 5), 1);
      points = samples(
        period,
        (time) =>
          100 *
          0.5 *
          springConstant *
          (meanExtension + amplitude * Math.cos(omega * time)) ** 2,
      );
      value = omega * amplitude;
      unit = "m/s";
      method =
        "Read spring-extension amplitude from energy extrema, then use vₘₐₓ = ωA";
      inputs = {
        energyMin: energyMinimum,
        energyMax: energyMaximum,
        springConstant,
        period,
      };
      studentPrompt = `A ${mass} kg mass oscillates vertically on a ${springConstant} N/m spring. Use the elastic-energy graph to find its maximum speed.`;
      break;
    }
    case "harmonic-max-acceleration": {
      const { amplitude, angularFrequency, duration } = scenario;
      positive("amplitude", amplitude);
      positive("angular frequency", angularFrequency);
      positive("duration", duration);
      requireStudentFriendlyGiven("amplitude", amplitude);
      requireStudentFriendlyGiven("angular frequency", angularFrequency);
      const timeTicks = ticks(0, duration, duration / 8);
      setAxis(xAxis, [0, duration], timeTicks, duration / 40);
      xAxis.tickLabels = shortTickLabels(timeTicks, 3);
      setAxis(yAxis, [0, 1], [0, 1], 0.05);
      value = angularFrequency ** 2 * amplitude;
      unit = "m/s²";
      method =
        "Maximum SHM acceleration = angular frequency squared × displacement amplitude";
      inputs = { amplitude, angularFrequency };
      studentPrompt = `A loudspeaker follows x = ${formatGiven(amplitude)} cos(${formatGiven(angularFrequency)}t) metres. Find its maximum acceleration; on the blank axes, sketch kinetic energy over time.`;
      break;
    }
  }

  const data: CartesianPlotData = points ? { [`${id}-data`]: points } : {};
  const displayValue = formatToSignificantFigures(value);
  const parts: PilotSolutionPart[] = [
    {
      id: "calculation",
      label: "Calculated result",
      working: method,
      finalAnswer: `${displayValue} ${unit}`,
    },
  ];
  let expectedGraph: PilotExpectedGraph | undefined;
  if (scenario.kind === "harmonic-max-acceleration") {
    const { amplitude, angularFrequency, duration } = scenario;
    parts.splice(
      0,
      parts.length,
      {
        id: "maximum-acceleration",
        label: "Maximum acceleration",
        working: `aₘₐₓ = ω²A = (${formatGiven(angularFrequency)})²(${formatGiven(amplitude)})`,
        finalAnswer: `${displayValue} ${unit}`,
      },
      {
        id: "kinetic-energy-sketch",
        label: "Kinetic-energy sketch",
        working:
          "v = −Aω sin(ωt), so kinetic energy is proportional to sin²(ωt). It is always non-negative and has half the period of the displacement.",
      },
    );
    expectedGraph = kineticEnergySolutionGraph(
      spec,
      id,
      duration,
      angularFrequency,
    );
  }
  const check: PilotCheck = {
    kind: scenario.kind,
    expected: value,
    tolerance: Math.max(1e-8, Math.abs(value) * 1e-7),
    unit,
    inputs,
  };
  return {
    id,
    sourceFixtureId,
    sourceQuestionId: base.sourceQuestionId,
    paper: base.paper,
    scenario,
    studentPrompt,
    spec,
    data,
    solution: {
      value,
      displayValue,
      significantFigures: 3,
      unit,
      method,
      parts,
      expectedGraph,
    },
    trainingEligibility: "blocked",
    check,
  };
}

const VARIANT_PRESETS: readonly {
  sourceFixtureId: string;
  scenarios: readonly PilotVariantScenario[];
}[] = [
  {
    sourceFixtureId: "may25-tz1-hl-1a-q2",
    scenarios: [
      { kind: "area-speed", duration: 8, finalAcceleration: 6, queryTime: 6 },
      { kind: "area-speed", duration: 10, finalAcceleration: 12, queryTime: 7 },
      { kind: "area-speed", duration: 12, finalAcceleration: 8, queryTime: 9 },
    ],
  },
  {
    sourceFixtureId: "nov25-tz3-hl-1a-q3",
    scenarios: [
      {
        kind: "mean-force",
        duration: 6,
        flatUntil: 1.6,
        initialAcceleration: 1.2,
        finalAcceleration: 4.2,
        mass: 2.5,
        yMaximum: 5,
      },
      {
        kind: "mean-force",
        duration: 8,
        flatUntil: 3.2,
        initialAcceleration: 0.8,
        finalAcceleration: 3.8,
        mass: 4,
        yMaximum: 5,
      },
      {
        kind: "mean-force",
        duration: 10,
        flatUntil: 4,
        initialAcceleration: 1.5,
        finalAcceleration: 5.2,
        mass: 3,
        yMaximum: 6,
      },
    ],
  },
  {
    sourceFixtureId: "may26-tz2-hl-1a-q7",
    scenarios: [
      {
        kind: "dissipated-energy",
        startDistance: 5,
        breakDistance: 15,
        stopDistance: 35,
        initialDeceleration: 1.5,
        finalDeceleration: 3.5,
        mass: 1800,
      },
      {
        kind: "dissipated-energy",
        startDistance: 10,
        breakDistance: 30,
        stopDistance: 50,
        initialDeceleration: 1,
        finalDeceleration: 5,
        mass: 1300,
      },
      {
        kind: "dissipated-energy",
        startDistance: 15,
        breakDistance: 25,
        stopDistance: 45,
        initialDeceleration: 2.5,
        finalDeceleration: 4.5,
        mass: 1600,
      },
    ],
  },
  {
    sourceFixtureId: "may26-tz1-hl-1a-q19",
    scenarios: [
      {
        kind: "harmonic-speed",
        amplitudeCm: 1,
        period: 1.6,
        queryTime: 1,
        duration: 2,
      },
      {
        kind: "harmonic-speed",
        amplitudeCm: 1.5,
        period: 2,
        queryTime: 0.75,
        duration: 2,
      },
      {
        kind: "harmonic-speed",
        amplitudeCm: 0.8,
        period: 1.2,
        queryTime: 0.8,
        duration: 1.8,
      },
    ],
  },
  {
    sourceFixtureId: "may25-tz1-hl-2-q1",
    scenarios: [
      {
        kind: "work-speed",
        forceKiloNewton: 2.5,
        flatDistance: 50,
        totalDistance: 90,
        mass: 1200,
      },
      {
        kind: "work-speed",
        forceKiloNewton: 4,
        flatDistance: 40,
        totalDistance: 80,
        mass: 1800,
      },
      {
        kind: "work-speed",
        forceKiloNewton: 3.5,
        flatDistance: 70,
        totalDistance: 110,
        mass: 1500,
      },
    ],
  },
  {
    sourceFixtureId: "nov25-tz1-hl-2-q1",
    scenarios: [
      {
        kind: "terminal-drag-speed",
        fluidDensity: 1000,
        oilDensity: 850,
        radius: 0.001,
        viscosity: 0.12,
        gravity: 9.8,
      },
      {
        kind: "terminal-drag-speed",
        fluidDensity: 1050,
        oilDensity: 900,
        radius: 0.0008,
        viscosity: 0.08,
        gravity: 9.8,
      },
      {
        kind: "terminal-drag-speed",
        fluidDensity: 980,
        oilDensity: 800,
        radius: 0.0007,
        viscosity: 0.07,
        gravity: 9.8,
      },
    ],
  },
  {
    sourceFixtureId: "may25-tz1-hl-2-q9",
    scenarios: [
      {
        kind: "spring-max-speed",
        mass: 0.1,
        springConstant: 6,
        amplitude: 0.08,
        gravity: 9.8,
      },
      {
        kind: "spring-max-speed",
        mass: 0.16,
        springConstant: 8,
        amplitude: 0.11,
        gravity: 9.8,
      },
      {
        kind: "spring-max-speed",
        mass: 0.09,
        springConstant: 10,
        amplitude: 0.06,
        gravity: 9.8,
      },
    ],
  },
  {
    sourceFixtureId: "may26-tz1-hl-2-q6",
    scenarios: [
      {
        kind: "harmonic-max-acceleration",
        amplitude: 0.3,
        angularFrequency: 12.6,
        duration: 0.8,
      },
      {
        kind: "harmonic-max-acceleration",
        amplitude: 0.5,
        angularFrequency: 15.7,
        duration: 0.8,
      },
      {
        kind: "harmonic-max-acceleration",
        amplitude: 0.4,
        angularFrequency: 18.8,
        duration: 0.8,
      },
    ],
  },
];

export function generatePilotVariants(): PilotVariant[] {
  return VARIANT_PRESETS.flatMap(({ sourceFixtureId, scenarios }) =>
    scenarios.map((scenario, index) =>
      createPilotVariant(sourceFixtureId, index + 1, scenario),
    ),
  );
}

export { kineticEnergyFraction };
