import {
  CircuitTopologyIntent,
  compileCircuitIntent,
} from "@/lib/visuals/circuit-intent";
import {
  currentFromVoltage,
  parallelResistance,
  powerFromCurrent,
  seriesResistance,
  sourcePower,
  terminalVoltage,
} from "@/lib/visuals/circuit-physics";
import {
  CircuitScenario as PackageCircuitScenario,
  solveCircuitScenario,
} from "@/lib/visuals/circuit-question-packages";
import {
  compileFieldIntent,
  FieldIntent,
} from "@/lib/visuals/field-intent";
import {
  accelerationInElectricField,
  electricField1D,
  electricPotential1D,
  uniformElectricField,
} from "@/lib/visuals/field-physics";
import {
  FieldScenario as PackageFieldScenario,
  solveFieldScenario,
} from "@/lib/visuals/field-question-packages";
import { measurementAxisTicks } from "@/lib/visuals/measurement-axis";
import {
  compileMechanicsIntent,
  MechanicsIntent,
} from "@/lib/visuals/mechanics-intent";
import {
  MechanicsScenario as PackageMechanicsScenario,
  projectileFlightTime,
  solveMechanicsScenario,
} from "@/lib/visuals/mechanics-physics";
import { integratePolyline } from "@/lib/visuals/pilot-physics";
import { renderCartesianPlot } from "@/lib/visuals/render-cartesian";
import { renderCircuitNetwork } from "@/lib/visuals/render-circuit";
import { renderFieldMap } from "@/lib/visuals/render-field-map";
import { renderMechanicsScene } from "@/lib/visuals/render-mechanics";
import {
  solveSyntheticScenario,
  SyntheticScenario,
} from "@/lib/visuals/synthetic-pilot";
import {
  MechanicsLabel,
  Point2D,
  VISUAL_SCHEMA_VERSION,
  VisualSpec,
} from "@/lib/visuals/types";

import { formatSignificantFigures } from "./numeric-checker";
import { PhysicsDomainId, VerifiedQuantityMap } from "./types";

export interface DomainValidationResult {
  valid: boolean;
  issues: string[];
}

export interface DomainSolveOutput {
  solverId: string;
  quantities: VerifiedQuantityMap;
  publicNumbers?: number[];
  publicLabels?: string[];
}

export interface DomainRenderOptions {
  hiddenQuantities?: readonly string[];
  id?: string;
}

export interface DomainRenderOutput {
  visualFamily: string;
  svgMarkup: string;
  rendererVersion: string;
  publicNumbers: number[];
  publicLabels: string[];
}

export interface DomainAdapter<
  TSpec extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly domain: PhysicsDomainId;
  readonly defaultVisualFamily: string;
  readonly solverId: string;
  readonly description: string;
  readonly supportedScenarioKinds: readonly string[];
  validateScenario(spec: TSpec): DomainValidationResult;
  solveScenario(spec: TSpec): DomainSolveOutput;
  renderSvg?(
    spec: TSpec,
    options?: DomainRenderOptions,
  ): DomainRenderOutput | undefined;
  sampleScenario?(seed: number, kind?: string): TSpec;
}

export type FlexibleValidationReturn =
  | DomainValidationResult
  | { valid: boolean; issues: ReadonlyArray<string | { message: string }> }
  | readonly string[]
  | boolean;

export interface IncomingVisualModuleHooks<
  TSpec extends Record<string, unknown> = Record<string, unknown>,
> {
  validate: (spec: TSpec) => FlexibleValidationReturn;
  solve: (spec: TSpec) => VerifiedQuantityMap;
  render: (spec: TSpec) => string;
  visualFamily?: string;
  solverId?: string;
  rendererVersion?: string;
  description?: string;
  supportedScenarioKinds?: readonly string[];
  sampleScenario?: (seed: number, kind?: string) => TSpec;
}

function isFinitePositive(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

function asPointsArray(val: unknown): Point2D[] | undefined {
  if (!Array.isArray(val) || val.length < 2) return undefined;
  const pts: Point2D[] = [];
  for (const item of val) {
    if (
      item === null ||
      typeof item !== "object" ||
      !isFiniteNumber((item as { x?: unknown }).x) ||
      !isFiniteNumber((item as { y?: unknown }).y)
    ) {
      return undefined;
    }
    pts.push({
      x: (item as { x: number }).x,
      y: (item as { y: number }).y,
    });
  }
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].x < pts[i - 1].x) {
      return undefined;
    }
  }
  if (pts[pts.length - 1].x <= pts[0].x) {
    return undefined;
  }
  return pts;
}

function integrateUnsignedPolyline(
  points: readonly Point2D[],
  xStart: number,
  xEnd: number,
): number {
  const split: Point2D[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = i > 0 ? points[i - 1] : undefined;
    if (prev && prev.y * p.y < 0) {
      const zeroX = prev.x - (prev.y * (p.x - prev.x)) / (p.y - prev.y);
      split.push({ x: zeroX, y: 0 });
    }
    split.push({ x: p.x, y: Math.abs(p.y) });
  }
  return integratePolyline(split, xStart, xEnd);
}

function seededPrng(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function safeId(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? fallback).replace(/[^a-zA-Z0-9_-]/g, "-");
  return cleaned || fallback;
}

// ============================================================================
// 1. GRAPHS ADAPTER (Cartesian plots + polyline calculus)
// ============================================================================

const SYNTHETIC_GRAPH_KINDS = new Set([
  "rover-distance",
  "cart-work",
  "shuttle-motion",
  "lift-acceleration",
  "glider-momentum",
]);

function buildGraphAdapter(): DomainAdapter {
  const supportedScenarioKinds = [
    "rover-distance",
    "cart-work",
    "shuttle-motion",
    "lift-acceleration",
    "glider-momentum",
    "piecewise-linear-graph",
  ] as const;

  const solveScenario = (spec: Record<string, unknown>): DomainSolveOutput => {
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    const pts = asPointsArray(spec.points);
    if (!pts) {
      throw new Error(
        "Graphs scenario requires 'points' with >= 2 monotonic finite {x, y} vertices",
      );
    }

    if (SYNTHETIC_GRAPH_KINDS.has(kind)) {
      const quantities = solveSyntheticScenario(
        spec as unknown as SyntheticScenario,
      );
      const publicNumbers = pts.flatMap((p) => [p.x, p.y]);
      return {
        solverId: "fa50e43/graphs-synthetic+polyline/1.0.0",
        quantities,
        publicNumbers,
      };
    }

    if (kind === "piecewise-linear-graph") {
      const xMin = pts[0].x;
      const xMax = pts[pts.length - 1].x;
      const intervalRaw = spec.integralInterval;
      const intStart =
        Array.isArray(intervalRaw) && isFiniteNumber(intervalRaw[0])
          ? intervalRaw[0]
          : xMin;
      const intEnd =
        Array.isArray(intervalRaw) && isFiniteNumber(intervalRaw[1])
          ? intervalRaw[1]
          : xMax;
      if (intStart < xMin || intEnd > xMax || intEnd <= intStart) {
        throw new Error("integralInterval must lie strictly within points x-domain");
      }

      const signedArea = integratePolyline(pts, intStart, intEnd);
      const unsignedArea = integrateUnsignedPolyline(pts, intStart, intEnd);
      const initialValue = isFiniteNumber(spec.initialValue)
        ? spec.initialValue
        : 0;
      const finalCumulativeValue = initialValue + signedArea;
      const meanRate = signedArea / (intEnd - intStart);

      const gradRaw = spec.gradientInterval;
      const gStart =
        Array.isArray(gradRaw) && isFiniteNumber(gradRaw[0]) ? gradRaw[0] : xMin;
      const gEnd =
        Array.isArray(gradRaw) && isFiniteNumber(gradRaw[1]) ? gradRaw[1] : xMax;
      const pStart = pts.find((p) => Math.abs(p.x - gStart) < 1e-9);
      const pEnd = pts.find((p) => Math.abs(p.x - gEnd) < 1e-9);
      if (!pStart || !pEnd || gEnd <= gStart) {
        throw new Error(
          "gradientInterval endpoints must match vertices in points with end > start",
        );
      }
      const gradient = (pEnd.y - pStart.y) / (pEnd.x - pStart.x);

      const quantities: VerifiedQuantityMap = {
        signedArea,
        unsignedArea,
        finalCumulativeValue,
        meanRate,
        gradient,
        xSpan: xMax - xMin,
        yMin: Math.min(...pts.map((p) => p.y)),
        yMax: Math.max(...pts.map((p) => p.y)),
      };

      if (isFinitePositive(spec.massKg)) {
        const massKg = spec.massKg;
        quantities.deltaVelocityOrSpeedMs = signedArea / massKg;
        const vSq = initialValue ** 2 + (2 * signedArea) / massKg;
        if (vSq >= 0) {
          quantities.finalSpeedFromWorkMs = Math.sqrt(vSq);
        }
      }

      return {
        solverId: "fa50e43/graphs-polyline/1.0.0",
        quantities,
        publicNumbers: pts.flatMap((p) => [p.x, p.y]),
      };
    }

    throw new Error(`Unsupported graphs scenario kind: "${kind}"`);
  };

  return {
    domain: "graphs",
    defaultVisualFamily: "cartesian_plot",
    solverId: "fa50e43/graphs-polyline/1.0.0",
    description:
      "Cartesian kinematics, force-displacement, momentum-time, and piecewise-linear calculus plots",
    supportedScenarioKinds,
    validateScenario(spec) {
      try {
        const out = solveScenario(spec);
        for (const [k, v] of Object.entries(out.quantities)) {
          if (typeof v === "number" && !Number.isFinite(v)) {
            return { valid: false, issues: [`Non-finite solver output for ${k}`] };
          }
        }
        return { valid: true, issues: [] };
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario,
    renderSvg(spec, options = {}) {
      const pts = asPointsArray(spec.points);
      if (!pts) {
        throw new Error("Invalid points array for Cartesian plot rendering");
      }
      const kind = typeof spec.kind === "string" ? spec.kind : "piecewise-linear-graph";
      const id = safeId(options.id, "graph-item");
      const hidden = new Set(options.hiddenQuantities ?? []);

      const defaultAxes: [string, string, string, string] =
        kind === "cart-work"
          ? ["position", "m", "resultant force", "N"]
          : kind === "lift-acceleration"
            ? ["time", "s", "acceleration", "m s⁻²"]
            : kind === "glider-momentum"
              ? ["time", "s", "momentum", "kg m s⁻¹"]
              : ["time", "s", "velocity", "m s⁻¹"];

      const xLabel =
        typeof spec.xLabel === "string" && spec.xLabel.trim()
          ? spec.xLabel.trim()
          : defaultAxes[0];
      const xUnit =
        typeof spec.xUnit === "string" && spec.xUnit.trim()
          ? spec.xUnit.trim()
          : defaultAxes[1];
      const yLabel =
        typeof spec.yLabel === "string" && spec.yLabel.trim()
          ? spec.yLabel.trim()
          : defaultAxes[2];
      const yUnit =
        typeof spec.yUnit === "string" && spec.yUnit.trim()
          ? spec.yUnit.trim()
          : defaultAxes[3];

      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const xDomain: [number, number] = [Math.min(0, ...xs), Math.max(...xs)];
      const rawYMin = Math.min(0, ...ys);
      const rawYMax = Math.max(...ys);
      const yDomain: [number, number] =
        rawYMax > rawYMin ? [rawYMin, rawYMax] : [rawYMin - 1, rawYMax + 1];

      const xTicks = measurementAxisTicks(xDomain);
      const yTicks = measurementAxisTicks(yDomain);

      const visualSpec: VisualSpec<"cartesian_plot"> = {
        schemaVersion: VISUAL_SCHEMA_VERSION,
        id: `${id}-figure`,
        family: "cartesian_plot",
        templateId: "plot.cartesian.v1",
        scenarioRef: id,
        coordinateSpace: "cartesian",
        payload: {
          xAxis: {
            id: `${id}-x`,
            label: xLabel,
            unit: xUnit,
            scale: "linear",
            domain: xDomain,
            ...xTicks,
          },
          yAxis: {
            id: `${id}-y`,
            label: yLabel,
            unit: yUnit,
            scale: "linear",
            domain: yDomain,
            ...yTicks,
          },
          series: [
            {
              id: `${id}-line`,
              kind: "analytical-curve",
              xParameterId: `${id}-x`,
              yParameterId: `${id}-y`,
              dataRef: `${id}-data`,
              styleRole: "primary",
            },
          ],
          showGrid: true,
        },
        visibility: {
          publicParameterIds: [`${id}-x`, `${id}-y`, `${id}-data`],
          privateParameterIds: [`${id}-answer`, ...hidden],
          labelMode: "allowlist",
          altTextMode: "student-safe",
        },
        provenance: {
          rendererVersion: "bank-pipeline/1.0.0+cartesian-svg/0.1.0",
        },
      };

      const svgMarkup = renderCartesianPlot(visualSpec, { [`${id}-data`]: pts });
      const publicNumbers = [
        ...(xTicks.tickValues ?? []),
        ...(yTicks.tickValues ?? []),
        ...pts.flatMap((p) => [p.x, p.y]),
      ];
      const publicLabels = [
        `${xLabel} / ${xUnit}`,
        `${yLabel} / ${yUnit}`,
        xLabel,
        yLabel,
      ];

      return {
        visualFamily: "cartesian_plot",
        svgMarkup,
        rendererVersion: "bank-pipeline/1.0.0+cartesian-svg/0.1.0",
        publicNumbers,
        publicLabels,
      };
    },
    sampleScenario(seed) {
      const rand = seededPrng(seed);
      const t1 = 2 + Math.floor(rand() * 3);
      const t2 = t1 + 2 + Math.floor(rand() * 4);
      const t3 = t2 + 2 + Math.floor(rand() * 3);
      const vPeak = 4 + Math.floor(rand() * 8);
      return {
        kind: "shuttle-motion",
        durationS: t3,
        brakingStartS: t2,
        points: [
          { x: 0, y: 0 },
          { x: t1, y: vPeak },
          { x: t2, y: vPeak },
          { x: t3, y: 0 },
        ],
      };
    },
  };
}

// ============================================================================
// 2. CIRCUITS ADAPTER (DC resistor networks, dividers, internal resistance)
// ============================================================================

const SYNTHETIC_CIRCUIT_KINDS = new Set([
  "branch-heater",
  "sensor-current",
  "battery-energy",
  "resistor-network",
  "light-alarm",
]);

const PACKAGE_CIRCUIT_KINDS = new Set([
  "resistance-order",
  "switched-power",
  "bypass-equivalent",
  "lamp-failure",
  "series-components",
  "internal-resistance",
  "ldr-divider",
  "thermistor-divider",
]);

function buildCircuitsAdapter(): DomainAdapter {
  const supportedScenarioKinds = [
    ...SYNTHETIC_CIRCUIT_KINDS,
    ...PACKAGE_CIRCUIT_KINDS,
    "dc-series-parallel",
  ];

  const solveScenario = (spec: Record<string, unknown>): DomainSolveOutput => {
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    if (SYNTHETIC_CIRCUIT_KINDS.has(kind)) {
      const quantities = solveSyntheticScenario(
        spec as unknown as SyntheticScenario,
      );
      return {
        solverId: "fa50e43/circuit-synthetic/1.0.0",
        quantities,
      };
    }
    if (PACKAGE_CIRCUIT_KINDS.has(kind)) {
      const quantities = solveCircuitScenario(
        spec as unknown as PackageCircuitScenario,
      );
      return {
        solverId: "fa50e43/circuit-packages/1.0.0",
        quantities,
      };
    }
    if (kind === "dc-series-parallel") {
      if (!isFinitePositive(spec.emfV)) {
        throw new Error("emfV must be positive and finite");
      }
      const internalOhm =
        spec.internalOhm === undefined ? 0 : Number(spec.internalOhm);
      const seriesOhm =
        spec.seriesOhm === undefined ? 0 : Number(spec.seriesOhm);
      if (
        !Number.isFinite(internalOhm) ||
        internalOhm < 0 ||
        !Number.isFinite(seriesOhm) ||
        seriesOhm < 0
      ) {
        throw new Error("internalOhm and seriesOhm must be non-negative and finite");
      }
      if (
        !Array.isArray(spec.parallelBranchOhms) ||
        spec.parallelBranchOhms.length < 1 ||
        spec.parallelBranchOhms.some((r) => !isFinitePositive(r))
      ) {
        throw new Error("parallelBranchOhms must be a non-empty array of positive resistances");
      }
      const branches = spec.parallelBranchOhms as number[];
      const parallelOhm = parallelResistance(branches);
      const externalOhm =
        seriesOhm > 0 ? seriesResistance([seriesOhm, parallelOhm]) : parallelOhm;
      const totalOhm =
        internalOhm > 0
          ? seriesResistance([internalOhm, externalOhm])
          : externalOhm;
      const totalCurrentA = currentFromVoltage(spec.emfV, totalOhm);
      const terminalVoltageV = terminalVoltage(
        spec.emfV,
        totalCurrentA,
        internalOhm,
      );
      const parallelVoltageV = totalCurrentA * parallelOhm;
      const totalSourcePowerW = sourcePower(spec.emfV, totalCurrentA);
      const branchOneCurrentA = currentFromVoltage(
        parallelVoltageV,
        branches[0],
      );
      const branchOnePowerW = powerFromCurrent(branchOneCurrentA, branches[0]);

      const quantities: VerifiedQuantityMap = {
        parallelOhm,
        externalOhm,
        totalOhm,
        totalCurrentA,
        terminalVoltageV,
        parallelVoltageV,
        totalSourcePowerW,
        branchOneCurrentA,
        branchOnePowerW,
      };
      if (branches.length >= 2) {
        const branchTwoCurrentA = currentFromVoltage(
          parallelVoltageV,
          branches[1],
        );
        quantities.branchTwoCurrentA = branchTwoCurrentA;
        quantities.branchTwoPowerW = powerFromCurrent(
          branchTwoCurrentA,
          branches[1],
        );
      }
      if (isFinitePositive(spec.durationS)) {
        quantities.externalEnergyJ =
          terminalVoltageV * totalCurrentA * spec.durationS;
      }
      return {
        solverId: "fa50e43/circuit-physics/1.0.0",
        quantities,
      };
    }

    throw new Error(`Unsupported circuits scenario kind: "${kind}"`);
  };

  return {
    domain: "circuits",
    defaultVisualFamily: "circuit_network",
    solverId: "fa50e43/circuit-physics/1.0.0",
    description:
      "DC series-parallel resistor networks, potential dividers, sensors, and non-ideal cells",
    supportedScenarioKinds,
    validateScenario(spec) {
      try {
        const out = solveScenario(spec);
        for (const [k, v] of Object.entries(out.quantities)) {
          if (typeof v === "number" && !Number.isFinite(v)) {
            return { valid: false, issues: [`Non-finite solver output for ${k}`] };
          }
        }
        return { valid: true, issues: [] };
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario,
    renderSvg(spec, options = {}) {
      const kind = typeof spec.kind === "string" ? spec.kind : "";
      const id = safeId(options.id, "circuit-item");
      const hidden = new Set(options.hiddenQuantities ?? []);
      const publicNumbers: number[] = [];
      const publicLabels: string[] = [];

      const lbl = (
        paramKey: string,
        val: number,
        unit: string,
        fallbackSymbol: string,
        prefix = "",
      ): string => {
        if (hidden.has(paramKey)) {
          publicLabels.push(fallbackSymbol);
          return fallbackSymbol;
        }
        publicNumbers.push(val);
        const text = `${prefix}${val} ${unit}`;
        publicLabels.push(text);
        return text;
      };

      const comp = (
        cid: string,
        componentKind:
          | "resistor"
          | "cell"
          | "ammeter"
          | "ldr"
          | "voltmeter"
          | "thermistor",
        label: string,
      ): CircuitTopologyIntent => ({
        type: "component",
        id: cid,
        componentKind,
        label,
      });
      const ser = (...items: CircuitTopologyIntent[]): CircuitTopologyIntent => ({
        type: "series",
        items,
      });
      const par = (
        ...branches: CircuitTopologyIntent[]
      ): CircuitTopologyIntent => ({
        type: "parallel",
        branches,
      });

      let topology: CircuitTopologyIntent;

      if (kind === "branch-heater" || kind === "resistor-network") {
        const v = Number(spec.voltageV);
        const rs = Number(spec.seriesOhm);
        const br = spec.branchOhm as [number, number];
        topology = par(
          comp("supply", "cell", lbl("voltageV", v, "V", "V")),
          ser(
            comp("series-r", "resistor", lbl("seriesOhm", rs, "Ω", "R_s")),
            par(
              comp("r1", "resistor", lbl("branchOhm0", br[0], "Ω", "R_1")),
              comp("r2", "resistor", lbl("branchOhm1", br[1], "Ω", "R_2")),
            ),
          ),
        );
      } else if (kind === "sensor-current") {
        const v = Number(spec.voltageV);
        const bs = spec.branchSeriesOhm as [number, number];
        const ro = Number(spec.otherOhm);
        publicLabels.push("A");
        topology = par(
          ser(
            comp("ammeter", "ammeter", "A"),
            comp("supply", "cell", lbl("voltageV", v, "V", "V")),
          ),
          ser(
            comp("r1", "resistor", lbl("branchSeriesOhm0", bs[0], "Ω", "R_1")),
            comp("r2", "resistor", lbl("branchSeriesOhm1", bs[1], "Ω", "R_2")),
          ),
          comp("r3", "resistor", lbl("otherOhm", ro, "Ω", "R_3")),
        );
      } else if (kind === "battery-energy") {
        const emf = Number(spec.emfV);
        const rInt = Number(spec.internalOhm);
        const rLoad = Number(spec.loadOhm);
        topology = par(
          ser(
            comp("supply", "cell", lbl("emfV", emf, "V", "ε", "ε = ")),
            comp(
              "internal-r",
              "resistor",
              lbl("internalOhm", rInt, "Ω", "r", "r = "),
            ),
          ),
          comp("load", "resistor", lbl("loadOhm", rLoad, "Ω", "R")),
        );
      } else if (kind === "light-alarm" || kind === "ldr-divider") {
        const v = Number(spec.voltageV ?? spec.emfV);
        const rf = Number(spec.fixedOhm ?? spec.fixedResistanceOhm);
        publicLabels.push("LDR", "Vout");
        topology = par(
          comp("supply", "cell", lbl("voltageV", v, "V", "V")),
          ser(
            comp("ldr", "ldr", "LDR"),
            par(
              comp(
                "fixed",
                "resistor",
                rf >= 1000 && rf % 100 === 0
                  ? lbl("fixedOhm", rf / 1000, "kΩ", "R")
                  : lbl("fixedOhm", rf, "Ω", "R"),
              ),
              comp("meter", "voltmeter", "Vout"),
            ),
          ),
        );
        publicNumbers.push(rf);
      } else if (kind === "dc-series-parallel") {
        const emf = Number(spec.emfV);
        const rInt = Number(spec.internalOhm ?? 0);
        const rSer = Number(spec.seriesOhm ?? 0);
        const branches = spec.parallelBranchOhms as number[];
        const supplyBranch =
          rInt > 0
            ? ser(
                comp("supply", "cell", lbl("emfV", emf, "V", "ε", "ε = ")),
                comp(
                  "internal-r",
                  "resistor",
                  lbl("internalOhm", rInt, "Ω", "r", "r = "),
                ),
              )
            : comp("supply", "cell", lbl("emfV", emf, "V", "V"));
        const parBlock =
          branches.length === 1
            ? comp("r1", "resistor", lbl("branch0", branches[0], "Ω", "R_1"))
            : par(
                ...branches.map((b, idx) =>
                  comp(
                    `r${idx + 1}`,
                    "resistor",
                    lbl(`branch${idx}`, b, "Ω", `R_${idx + 1}`),
                  ),
                ),
              );
        const loadBranch =
          rSer > 0
            ? ser(
                comp("series-r", "resistor", lbl("seriesOhm", rSer, "Ω", "R_s")),
                parBlock,
              )
            : parBlock;
        topology = par(supplyBranch, loadBranch);
      } else {
        const r = Number(
          spec.resistorOhm ??
            spec.identicalResistanceOhm ??
            spec.lampResistanceOhm ??
            10,
        );
        topology = par(
          comp("supply", "cell", "V"),
          ser(
            comp("r1", "resistor", lbl("resistorOhm", r, "Ω", "R")),
            comp("r2", "resistor", lbl("resistorOhm", r, "Ω", "R")),
          ),
        );
      }

      const visualSpec = compileCircuitIntent({
        schemaVersion: "circuit-intent/0.1.0",
        id: `${id}-figure`,
        scenarioRef: id,
        templateId: "series-parallel.v1",
        topology,
        visibility: {
          privateParameterIds: [`${id}-answer`, ...hidden],
        },
      });

      return {
        visualFamily: "circuit_network",
        svgMarkup: renderCircuitNetwork(visualSpec),
        rendererVersion: "bank-pipeline/1.0.0+circuit-svg/0.1.0",
        publicNumbers,
        publicLabels,
      };
    },
    sampleScenario(seed) {
      const rand = seededPrng(seed);
      const rPairs: Array<[number, number]> = [
        [6, 12],
        [4, 12],
        [10, 15],
        [8, 24],
      ];
      const pair = rPairs[Math.floor(rand() * rPairs.length)];
      const rPar = (pair[0] * pair[1]) / (pair[0] + pair[1]);
      const rSer = 2 + Math.floor(rand() * 5);
      const current = 1 + Math.floor(rand() * 4);
      return {
        kind: "branch-heater",
        voltageV: current * (rPar + rSer),
        seriesOhm: rSer,
        branchOhm: pair,
      };
    },
  };
}

// ============================================================================
// 3. FIELDS ADAPTER (Electrostatic & gravitational fields, equipotentials)
// ============================================================================

const SYNTHETIC_FIELD_KINDS = new Set([
  "charge-field",
  "field-work",
  "null-potential",
  "negative-probe",
  "guided-bead",
]);

const PACKAGE_FIELD_KINDS = new Set([
  "electric-superposition",
  "zero-field-mass-ratio",
  "equipotential-gradient",
  "field-line-choice",
  "zero-field-stability",
  "two-charge-field-graph",
  "nuclear-potential",
  "two-body-gravitational-potential",
]);

function buildFieldsAdapter(): DomainAdapter {
  const supportedScenarioKinds = [
    ...SYNTHETIC_FIELD_KINDS,
    ...PACKAGE_FIELD_KINDS,
    "parallel-plates-particle",
  ];

  const solveScenario = (spec: Record<string, unknown>): DomainSolveOutput => {
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    if (SYNTHETIC_FIELD_KINDS.has(kind)) {
      const quantities = solveSyntheticScenario(
        spec as unknown as SyntheticScenario,
      );
      return {
        solverId: "fa50e43/field-synthetic/1.0.0",
        quantities,
      };
    }
    if (PACKAGE_FIELD_KINDS.has(kind)) {
      const quantities = solveFieldScenario(
        spec as unknown as PackageFieldScenario,
      );
      return {
        solverId: "fa50e43/field-packages/1.0.0",
        quantities,
      };
    }
    if (kind === "parallel-plates-particle") {
      if (
        !isFinitePositive(spec.potentialDifferenceV) ||
        !isFinitePositive(spec.plateSeparationM) ||
        !isFinitePositive(spec.chargeC) ||
        !isFinitePositive(spec.massKg)
      ) {
        throw new Error(
          "potentialDifferenceV, plateSeparationM, chargeC, and massKg must be positive and finite",
        );
      }
      const fieldNC = uniformElectricField(
        spec.potentialDifferenceV,
        spec.plateSeparationM,
      );
      const accelerationMs2 = accelerationInElectricField(
        spec.chargeC,
        fieldNC,
        spec.massKg,
      );
      const workJ = spec.chargeC * spec.potentialDifferenceV;
      const finalSpeedMs = Math.sqrt((2 * workJ) / spec.massKg);
      return {
        solverId: "fa50e43/field-physics/1.0.0",
        quantities: {
          fieldNC,
          accelerationMs2,
          workJ,
          finalSpeedMs,
        },
      };
    }

    // Direct 1D two-charge helper fallback if chargesC + probeM supplied
    if (
      kind === "collinear-charges" &&
      Array.isArray(spec.chargesNC) &&
      spec.chargesNC.length === 2 &&
      isFinitePositive(spec.separationM) &&
      isFinitePositive(spec.probeM)
    ) {
      const q1 = Number(spec.chargesNC[0]) * 1e-9;
      const q2 = Number(spec.chargesNC[1]) * 1e-9;
      const sources = [
        { positionM: 0, chargeC: q1 },
        { positionM: spec.separationM, chargeC: q2 },
      ];
      return {
        solverId: "fa50e43/field-physics/1.0.0",
        quantities: {
          fieldNC: electricField1D(spec.probeM, sources),
          potentialV: electricPotential1D(spec.probeM, sources),
        },
      };
    }

    throw new Error(`Unsupported fields scenario kind: "${kind}"`);
  };

  return {
    domain: "fields",
    defaultVisualFamily: "field_map",
    solverId: "fa50e43/field-physics/1.0.0",
    description:
      "Collinear point charges, electric & gravitational potentials, and parallel equipotential maps",
    supportedScenarioKinds,
    validateScenario(spec) {
      try {
        const out = solveScenario(spec);
        for (const [k, v] of Object.entries(out.quantities)) {
          if (typeof v === "number" && !Number.isFinite(v)) {
            return { valid: false, issues: [`Non-finite solver output for ${k}`] };
          }
        }
        return { valid: true, issues: [] };
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario,
    renderSvg(spec, options = {}) {
      const kind = typeof spec.kind === "string" ? spec.kind : "";
      const id = safeId(options.id, "field-item");
      const hidden = new Set(options.hiddenQuantities ?? []);
      const publicNumbers: number[] = [];
      const publicLabels: string[] = [];

      const base = {
        schemaVersion: "field-intent/0.1.0" as const,
        id: `${id}-figure`,
        scenarioRef: id,
      };
      let intent: FieldIntent;

      if (kind === "field-work" || kind === "guided-bead") {
        const pots = spec.potentialsV as [number, number, number];
        const spacing = Number(spec.spacingM);
        const labels: [string, string, string] = hidden.has("potentialsV")
          ? ["V₁", "V₂", "V₃"]
          : [
              `${pots[0]} V`,
              `${pots[1]} V`,
              `${pots[2]} V`,
            ];
        if (!hidden.has("potentialsV")) {
          publicNumbers.push(...pots);
        }
        publicLabels.push(...labels);
        const spacingLabel = hidden.has("spacingM") ? "d" : `${spacing} m`;
        if (!hidden.has("spacingM")) publicNumbers.push(spacing);
        publicLabels.push(spacingLabel);

        intent = {
          ...base,
          templateId: "parallel-equipotentials.v1",
          labels,
          marker: {
            id: "middle",
            label: kind === "guided-bead" ? "+q" : "P",
            lineIndex: 1,
          },
          spacingLabel,
        };
      } else if (kind === "parallel-plates-particle") {
        const dv = Number(spec.potentialDifferenceV);
        const d = Number(spec.plateSeparationM);
        const labels: [string, string, string] = hidden.has(
          "potentialDifferenceV",
        )
          ? ["+V", "V/2", "0 V"]
          : [`${dv} V`, `${dv / 2} V`, "0 V"];
        if (!hidden.has("potentialDifferenceV")) {
          publicNumbers.push(dv, dv / 2, 0);
        }
        const spacingLabel = hidden.has("plateSeparationM")
          ? "d / 2"
          : `${formatSignificantFigures(d / 2)} m`;
        if (!hidden.has("plateSeparationM")) {
          publicNumbers.push(d, d / 2);
        }
        publicLabels.push(...labels, spacingLabel);
        intent = {
          ...base,
          templateId: "parallel-equipotentials.v1",
          labels,
          marker: { id: "start", label: "+q", lineIndex: 0 },
          spacingLabel,
        };
      } else {
        const charges = Array.isArray(spec.chargesNC)
          ? (spec.chargesNC as [number, number])
          : ([3, -6] as [number, number]);
        const sep = isFinitePositive(spec.separationM) ? spec.separationM : 0.6;
        const probe = isFinitePositive(spec.probeM) ? spec.probeM : undefined;
        const leftLabel = hidden.has("chargesNC")
          ? "q₁"
          : `${charges[0] > 0 ? "+" : ""}${charges[0]} nC`;
        const rightLabel = hidden.has("chargesNC")
          ? "q₂"
          : `${charges[1] > 0 ? "+" : ""}${charges[1]} nC`;
        if (!hidden.has("chargesNC")) {
          publicNumbers.push(
            charges[0],
            charges[1],
            Math.abs(charges[0]),
            Math.abs(charges[1]),
          );
        }
        if (!hidden.has("separationM")) {
          publicNumbers.push(sep);
        }
        const totalDim = hidden.has("separationM") ? "d" : `${sep} m`;
        publicLabels.push(leftLabel, rightLabel, totalDim);

        const hasProbe =
          probe !== undefined && kind !== "null-potential" && probe < sep;
        if (hasProbe && !hidden.has("probeM")) {
          publicNumbers.push(probe, Number((sep - probe).toPrecision(3)));
        }

        intent = {
          ...base,
          templateId: "linear-sources.v1",
          sources: [
            {
              id: "left-charge",
              kind: "point-charge",
              sign: charges[0] >= 0 ? 1 : -1,
              relativeMagnitude: Math.max(0.1, Math.abs(charges[0])),
              label: leftLabel,
            },
            {
              id: "right-charge",
              kind: "point-charge",
              sign: charges[1] >= 0 ? 1 : -1,
              relativeMagnitude: Math.max(0.1, Math.abs(charges[1])),
              label: rightLabel,
            },
          ],
          ...(hasProbe
            ? {
                marker: {
                  id: "probe",
                  label: "P",
                  placement: {
                    kind: "between" as const,
                    fractionFromLeft: probe / sep,
                  },
                },
                dimensions: hidden.has("probeM")
                  ? { total: totalDim }
                  : {
                      total: totalDim,
                      leftToMarker: `${probe} m`,
                      markerToRight: `${formatSignificantFigures(sep - probe)} m`,
                    },
              }
            : { dimensions: { total: totalDim } }),
        };
      }

      const visualSpec = compileFieldIntent(intent);
      return {
        visualFamily: "field_map",
        svgMarkup: renderFieldMap(visualSpec),
        rendererVersion: "bank-pipeline/1.0.0+field-svg/0.1.0",
        publicNumbers,
        publicLabels,
      };
    },
    sampleScenario(seed) {
      const rand = seededPrng(seed);
      const q1 = 2 + Math.floor(rand() * 5);
      const q2 = -(2 + Math.floor(rand() * 6));
      const sep = Number((0.4 + Math.floor(rand() * 5) * 0.1).toFixed(2));
      const probe = Number((sep * 0.25).toFixed(2));
      return {
        kind: "charge-field",
        chargesNC: [q1, q2],
        separationM: sep,
        probeM: probe,
      };
    },
  };
}

// ============================================================================
// 4. MECHANICS ADAPTER (Collisions, ramps, circular tension, pendulums, projectiles)
// ============================================================================

const SYNTHETIC_MECHANICS_KINDS = new Set([
  "collision-loss",
  "circle-limit",
  "ramp-heating",
  "short-ramp",
  "pendulum-loss",
]);

const PACKAGE_MECHANICS_KINDS = new Set([
  "projectile-flight",
  "cart-collision",
  "circle-bottom",
  "ramp-resistance",
  "incline-friction",
  "pendulum-collision",
  "elastic-rope",
  "truck",
]);

function buildMechanicsAdapter(): DomainAdapter {
  const supportedScenarioKinds = [
    ...SYNTHETIC_MECHANICS_KINDS,
    ...PACKAGE_MECHANICS_KINDS,
    "projectile-kinematics",
  ];

  const solveScenario = (spec: Record<string, unknown>): DomainSolveOutput => {
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    if (SYNTHETIC_MECHANICS_KINDS.has(kind)) {
      const quantities = solveSyntheticScenario(
        spec as unknown as SyntheticScenario,
      );
      return {
        solverId: "fa50e43/mechanics-synthetic/1.0.0",
        quantities,
      };
    }
    if (PACKAGE_MECHANICS_KINDS.has(kind)) {
      const quantities = solveMechanicsScenario(
        spec as unknown as PackageMechanicsScenario,
      );
      return {
        solverId: "fa50e43/mechanics-physics/1.0.0",
        quantities,
      };
    }
    if (kind === "projectile-kinematics") {
      if (
        !isFinitePositive(spec.launchSpeedMs) ||
        !isFinitePositive(spec.launchAngleDegrees) ||
        spec.launchAngleDegrees >= 90 ||
        !isFinitePositive(spec.gravityMs2)
      ) {
        throw new Error(
          "projectile-kinematics requires positive launchSpeedMs, gravityMs2, and launchAngleDegrees in (0, 90)",
        );
      }
      const u = spec.launchSpeedMs;
      const thetaRad = (spec.launchAngleDegrees * Math.PI) / 180;
      const g = spec.gravityMs2;
      const flightTimeS = projectileFlightTime(u, spec.launchAngleDegrees, g);
      const horizontalSpeedMs = u * Math.cos(thetaRad);
      const initialVerticalSpeedMs = u * Math.sin(thetaRad);
      const maxHeightM = initialVerticalSpeedMs ** 2 / (2 * g);
      const horizontalRangeM = horizontalSpeedMs * flightTimeS;
      return {
        solverId: "fa50e43/mechanics-projectile/1.0.0",
        quantities: {
          flightTimeS,
          horizontalSpeedMs,
          initialVerticalSpeedMs,
          maxHeightM,
          horizontalRangeM,
        },
      };
    }

    throw new Error(`Unsupported mechanics scenario kind: "${kind}"`);
  };

  return {
    domain: "mechanics",
    defaultVisualFamily: "mechanics_scene",
    solverId: "fa50e43/mechanics-physics/1.0.0",
    description:
      "Collisions, inclined planes, vertical circular tension, ballistic pendulums, elastic ropes, and projectiles",
    supportedScenarioKinds,
    validateScenario(spec) {
      try {
        const out = solveScenario(spec);
        for (const [k, v] of Object.entries(out.quantities)) {
          if (typeof v === "number" && !Number.isFinite(v)) {
            return { valid: false, issues: [`Non-finite solver output for ${k}`] };
          }
        }
        return { valid: true, issues: [] };
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario,
    renderSvg(spec, options = {}) {
      const kind = typeof spec.kind === "string" ? spec.kind : "";
      const id = safeId(options.id, "mechanics-item");
      const hidden = new Set(options.hiddenQuantities ?? []);
      const publicNumbers: number[] = [];
      const publicLabels: string[] = [];

      const pushLabel = (
        labels: MechanicsLabel[],
        parameterId: string,
        scenarioKey: string,
        numVal: number | undefined,
        text: string,
      ) => {
        if (hidden.has(scenarioKey) || hidden.has(parameterId)) {
          return;
        }
        labels.push({ parameterId, text });
        publicLabels.push(text);
        if (numVal !== undefined && Number.isFinite(numVal)) {
          publicNumbers.push(numVal);
        }
      };

      const base = {
        schemaVersion: "mechanics-intent/0.1.0" as const,
        id: `${id}-figure`,
        scenarioRef: id,
        privateParameterIds: [`${id}-answer`, ...hidden],
      };

      let intent: MechanicsIntent;
      const labels: MechanicsLabel[] = [];

      if (kind === "collision-loss" || kind === "cart-collision") {
        const mx = Number(spec.massXKg);
        const my = Number(spec.massYKg);
        const vx = Number(spec.initialXMs);
        pushLabel(labels, "cart-x", "massXKg", mx, `X, ${mx} kg`);
        pushLabel(labels, "cart-y", "massYKg", my, `Y, ${my} kg`);
        pushLabel(labels, "speed-x", "initialXMs", vx, `${vx} m s⁻¹`);
        intent = { ...base, template: "collision", labels };
      } else if (kind === "circle-limit" || kind === "circle-bottom") {
        const m = Number(spec.massKg);
        const r = Number(spec.radiusM);
        pushLabel(labels, "body", "massKg", m, `${m} kg`);
        pushLabel(labels, "radius", "radiusM", r, `${r} m`);
        intent = { ...base, template: "vertical-circle", labels };
      } else if (kind === "ramp-heating" || kind === "ramp-resistance") {
        const w = Number(spec.weightN);
        const l = Number(spec.lengthM);
        const h = Number(spec.heightM);
        const angleDeg = (Math.asin(h / l) * 180) / Math.PI;
        pushLabel(labels, "body", "weightN", w, `${w} N`);
        pushLabel(labels, "length", "lengthM", l, `${l} m`);
        pushLabel(labels, "height", "heightM", h, `${h} m`);
        intent = {
          ...base,
          template: "incline",
          angleDegrees: angleDeg,
          showStartEnd: false,
          labels,
        };
      } else if (kind === "short-ramp" || kind === "incline-friction") {
        const m = Number(spec.massKg);
        const l = Number(spec.lengthM);
        const deg = Number(spec.angleDegrees);
        pushLabel(labels, "body", "massKg", m, `${m} kg`);
        pushLabel(labels, "length", "lengthM", l, `${l} m`);
        pushLabel(labels, "angle", "angleDegrees", deg, `${deg}°`);
        intent = {
          ...base,
          template: "incline",
          angleDegrees: deg,
          showStartEnd: true,
          labels,
        };
      } else if (kind === "pendulum-loss" || kind === "pendulum-collision") {
        const m = Number(spec.massKg);
        const mt = Number(spec.targetMassKg);
        const l = Number(spec.lengthM);
        pushLabel(labels, "body", "massKg", m, `${m} kg`);
        pushLabel(labels, "target", "targetMassKg", mt, `${mt} kg`);
        pushLabel(labels, "length", "lengthM", l, `${l} m`);
        intent = { ...base, template: "pendulum", labels };
      } else if (kind === "elastic-rope") {
        const l = Number(spec.lengthM);
        const ext = Number(spec.extensionM);
        pushLabel(labels, "length", "lengthM", l, `${l} m`);
        pushLabel(labels, "extension", "extensionM", ext, `${ext} m`);
        intent = { ...base, template: "elastic-rope", labels };
      } else if (kind === "truck") {
        const def = Number(spec.deflectionDegrees);
        const m = Number(spec.massKg);
        pushLabel(labels, "body", "massKg", m, `${m} kg`);
        pushLabel(labels, "angle", "deflectionDegrees", def, `${def}°`);
        intent = {
          ...base,
          template: "accelerometer",
          angleDegrees: def,
          labels,
        };
      } else {
        const deg = isFinitePositive(spec.launchAngleDegrees)
          ? spec.launchAngleDegrees
          : 35;
        const u = isFinitePositive(spec.launchSpeedMs)
          ? spec.launchSpeedMs
          : undefined;
        if (u !== undefined) {
          pushLabel(labels, "speed", "launchSpeedMs", u, `${u} m s⁻¹`);
        }
        pushLabel(labels, "angle", "launchAngleDegrees", deg, `${deg}°`);
        intent = {
          ...base,
          template: "projectile",
          launchAngleDegrees: deg,
          labels,
        };
      }

      const visualSpec = compileMechanicsIntent(intent);
      return {
        visualFamily: "mechanics_scene",
        svgMarkup: renderMechanicsScene(visualSpec),
        rendererVersion: "bank-pipeline/1.0.0+mechanics-svg/0.1.0",
        publicNumbers,
        publicLabels,
      };
    },
    sampleScenario(seed) {
      const rand = seededPrng(seed);
      const massKg = Number((0.5 + Math.floor(rand() * 6) * 0.5).toFixed(1));
      const lengthM = 3 + Math.floor(rand() * 5);
      const angleDegrees = 20 + Math.floor(rand() * 4) * 5;
      return {
        kind: "short-ramp",
        massKg,
        lengthM,
        angleDegrees,
        finalSpeedMs: 3,
        gravityMs2: 9.8,
      };
    },
  };
}

// ============================================================================
// 5. PURE-CALCULATION ADAPTER (Figureless quantitative & conceptual specs)
// ============================================================================

function buildPureCalculationAdapter(): DomainAdapter {
  const supportedScenarioKinds = [
    "suvat-motion",
    "power-efficiency",
    "uncertainty-power-product",
    "momentum-impulse",
  ] as const;

  const solveScenario = (spec: Record<string, unknown>): DomainSolveOutput => {
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    if (kind === "suvat-motion") {
      if (
        !isFiniteNumber(spec.uMs) ||
        !isFiniteNumber(spec.aMs2) ||
        !isFinitePositive(spec.tS)
      ) {
        throw new Error("suvat-motion requires finite uMs, aMs2, and positive tS");
      }
      const vMs = spec.uMs + spec.aMs2 * spec.tS;
      const displacementM =
        spec.uMs * spec.tS + 0.5 * spec.aMs2 * spec.tS ** 2;
      const averageVelocityMs = displacementM / spec.tS;
      return {
        solverId: "bank-pipeline/pure-calculation/1.0.0",
        quantities: { vMs, displacementM, averageVelocityMs },
      };
    }

    if (kind === "power-efficiency") {
      if (
        !isFinitePositive(spec.inputPowerW) ||
        !isFinitePositive(spec.usefulPowerW) ||
        spec.usefulPowerW > spec.inputPowerW ||
        !isFinitePositive(spec.durationS)
      ) {
        throw new Error(
          "power-efficiency requires 0 < usefulPowerW <= inputPowerW and positive durationS",
        );
      }
      const efficiency = spec.usefulPowerW / spec.inputPowerW;
      const efficiencyPercent = efficiency * 100;
      const usefulEnergyJ = spec.usefulPowerW * spec.durationS;
      const totalInputEnergyJ = spec.inputPowerW * spec.durationS;
      const wastedEnergyJ = totalInputEnergyJ - usefulEnergyJ;
      return {
        solverId: "bank-pipeline/pure-calculation/1.0.0",
        quantities: {
          efficiency,
          efficiencyPercent,
          usefulEnergyJ,
          totalInputEnergyJ,
          wastedEnergyJ,
        },
      };
    }

    if (kind === "uncertainty-power-product") {
      if (
        !isFinitePositive(spec.aValue) ||
        !isFinitePositive(spec.aAbsUnc) ||
        !isFiniteNumber(spec.aPower) ||
        !isFinitePositive(spec.bValue) ||
        !isFinitePositive(spec.bAbsUnc) ||
        !isFiniteNumber(spec.bPower)
      ) {
        throw new Error(
          "uncertainty-power-product requires positive values/uncertainties and finite exponents",
        );
      }
      const resultValue =
        spec.aValue ** spec.aPower * spec.bValue ** spec.bPower;
      const fractionalUncertainty =
        Math.abs(spec.aPower) * (spec.aAbsUnc / spec.aValue) +
        Math.abs(spec.bPower) * (spec.bAbsUnc / spec.bValue);
      const percentageUncertainty = fractionalUncertainty * 100;
      const absoluteUncertainty = resultValue * fractionalUncertainty;
      return {
        solverId: "bank-pipeline/pure-calculation/1.0.0",
        quantities: {
          resultValue,
          fractionalUncertainty,
          percentageUncertainty,
          absoluteUncertainty,
        },
      };
    }

    if (kind === "momentum-impulse") {
      if (
        !isFinitePositive(spec.massKg) ||
        !isFiniteNumber(spec.initialVelocityMs) ||
        !isFiniteNumber(spec.finalVelocityMs) ||
        !isFinitePositive(spec.contactTimeS)
      ) {
        throw new Error(
          "momentum-impulse requires positive massKg/contactTimeS and finite velocities",
        );
      }
      const impulseNs =
        spec.massKg * (spec.finalVelocityMs - spec.initialVelocityMs);
      const averageForceN = impulseNs / spec.contactTimeS;
      const kineticEnergyChangeJ =
        0.5 *
        spec.massKg *
        (spec.finalVelocityMs ** 2 - spec.initialVelocityMs ** 2);
      return {
        solverId: "bank-pipeline/pure-calculation/1.0.0",
        quantities: {
          impulseNs,
          averageForceN,
          averageForceMagnitudeN: Math.abs(averageForceN),
          kineticEnergyChangeJ,
        },
      };
    }

    throw new Error(`Unsupported pure-calculation scenario kind: "${kind}"`);
  };

  return {
    domain: "pure-calculation",
    defaultVisualFamily: "none",
    solverId: "bank-pipeline/pure-calculation/1.0.0",
    description:
      "Deterministic non-visual physics calculations (SUVAT, uncertainties, efficiency, impulse)",
    supportedScenarioKinds,
    validateScenario(spec) {
      try {
        solveScenario(spec);
        return { valid: true, issues: [] };
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario,
    renderSvg() {
      return undefined;
    },
    sampleScenario(seed) {
      const rand = seededPrng(seed);
      return {
        kind: "suvat-motion",
        uMs: 2 + Math.floor(rand() * 8),
        aMs2: 1 + Math.floor(rand() * 5),
        tS: 2 + Math.floor(rand() * 6),
      };
    },
  };
}

// ============================================================================
// REGISTRY + 1-LINE PLUG-IN HOOK FOR THE 6 INCOMING WAVE 1 VISUAL MODULES
// ============================================================================
// Incoming Wave 1 sibling modules plug in with 1 line each once merged:
//   registerVisualModule("waves", { validate: validateWavesScenario, solve: solveWavesScenario, render: renderWavesSvg });
//   registerVisualModule("optics-shm", { validate: validateOpticsShmScenario, solve: solveOpticsShmScenario, render: renderOpticsShmSvg });
//   registerVisualModule("thermal", { validate: validateThermalScenario, solve: solveThermalScenario, render: renderThermalSvg });
//   registerVisualModule("grav-astro", { validate: validateGravAstroScenario, solve: solveGravAstroScenario, render: renderGravAstroSvg });
//   registerVisualModule("em-induction", { validate: validateEmInductionScenario, solve: solveEmInductionScenario, render: renderEmInductionSvg });
//   registerVisualModule("quantum-nuclear", { validate: validateQuantumNuclearScenario, solve: solveQuantumNuclearScenario, render: renderQuantumNuclearSvg });

function normalizeFlexibleValidation(
  raw: FlexibleValidationReturn,
): DomainValidationResult {
  if (typeof raw === "boolean") {
    return {
      valid: raw,
      issues: raw ? [] : ["Scenario failed domain validation"],
    };
  }
  if (Array.isArray(raw)) {
    const issues = raw.map((item) => String(item));
    return { valid: issues.length === 0, issues };
  }
  const obj = raw as {
    valid: boolean;
    issues: ReadonlyArray<string | { message: string }>;
  };
  const issues = obj.issues.map((item) =>
    typeof item === "string" ? item : item.message,
  );
  return { valid: obj.valid && issues.length === 0, issues };
}

const registry = new Map<PhysicsDomainId, DomainAdapter>();

export function registerDomainAdapter<
  TSpec extends Record<string, unknown> = Record<string, unknown>,
>(adapter: DomainAdapter<TSpec>): DomainAdapter<TSpec> {
  registry.set(adapter.domain, adapter as unknown as DomainAdapter);
  return adapter;
}

/**
 * One-line registration helper wrapping `(validateXScenario, solveXScenario, renderXSvg)`
 * for incoming deterministic physics + SVG modules (`waves`, `optics-shm`, `thermal`,
 * `grav-astro`, `em-induction`, `quantum-nuclear`).
 */
export function registerVisualModule<
  TSpec extends Record<string, unknown> = Record<string, unknown>,
>(
  domain: PhysicsDomainId,
  hooks: IncomingVisualModuleHooks<TSpec>,
): DomainAdapter<TSpec> {
  const defaultFamily = hooks.visualFamily ?? domain;
  const solverId = hooks.solverId ?? `sixthphysics/${domain}/1.0.0`;
  const rendererVersion = hooks.rendererVersion ?? `sixthphysics/${domain}-svg/1.0.0`;

  const adapter: DomainAdapter<TSpec> = {
    domain,
    defaultVisualFamily: defaultFamily,
    solverId,
    description: hooks.description ?? `Registered deterministic visual module: ${domain}`,
    supportedScenarioKinds: hooks.supportedScenarioKinds ?? ["*"],
    validateScenario(spec: TSpec): DomainValidationResult {
      try {
        return normalizeFlexibleValidation(hooks.validate(spec));
      } catch (error) {
        return {
          valid: false,
          issues: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
    solveScenario(spec: TSpec): DomainSolveOutput {
      const validation = this.validateScenario(spec);
      if (!validation.valid) {
        throw new Error(validation.issues.join("; "));
      }
      const quantities = hooks.solve(spec);
      return { solverId, quantities };
    },
    renderSvg(spec: TSpec, options: DomainRenderOptions = {}): DomainRenderOutput {
      const specWithVisibility =
        options.hiddenQuantities && !("hiddenQuantities" in spec)
          ? ({ ...spec, hiddenQuantities: [...options.hiddenQuantities] } as TSpec)
          : spec;
      const svgMarkup = hooks.render(specWithVisibility);
      return {
        visualFamily: defaultFamily,
        svgMarkup,
        rendererVersion,
        publicNumbers: [],
        publicLabels: [],
      };
    },
    sampleScenario: hooks.sampleScenario,
  };

  return registerDomainAdapter(adapter);
}

export function resetDomainRegistryToDefaults(): void {
  registry.clear();
  registerDomainAdapter(buildGraphAdapter());
  registerDomainAdapter(buildCircuitsAdapter());
  registerDomainAdapter(buildFieldsAdapter());
  registerDomainAdapter(buildMechanicsAdapter());
  registerDomainAdapter(buildPureCalculationAdapter());
}

export function hasDomainAdapter(domain: string): domain is PhysicsDomainId {
  return registry.has(domain as PhysicsDomainId);
}

export function getDomainAdapter(domain: PhysicsDomainId): DomainAdapter {
  const adapter = registry.get(domain);
  if (!adapter) {
    throw new Error(
      `No domain adapter registered for "${domain}". Registered domains: ${listRegisteredDomains().join(", ")}`,
    );
  }
  return adapter;
}

export function listRegisteredDomains(): PhysicsDomainId[] {
  return [...registry.keys()];
}

export function listRegisteredAdapters(): DomainAdapter[] {
  return [...registry.values()];
}

// Initialize built-in fa50e43 + pure-calculation adapters on module load
resetDomainRegistryToDefaults();
