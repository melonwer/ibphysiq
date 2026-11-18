import {
  renderNuclearBindingBody,
  renderNuclearDecayChainBody,
  renderRadioactiveDecayBody,
  renderRutherfordScatteringBody,
  renderSpecialRelativityBody,
} from "./render-nuclear-relativity";
import {
  renderEnergyLevelsBody,
  renderMatterWavesBody,
  renderPhotoelectricBody,
  SvgBodyResult,
} from "./render-quantum-atomic";
import { solveQuantumNuclearScenario } from "./solver";
import {
  QuantumNuclearRenderOptions,
  QuantumNuclearScenarioSpec,
} from "./types";
import { validateQuantumNuclearScenario } from "./validate";
import {
  createVisibilityGuard,
  escapeXml,
  extractQuantumNuclearQuantityMap,
} from "./visibility";

function sanitizeUid(raw: string, maskDigits = false): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  const base = cleaned.length > 0 ? cleaned : "qn";
  if (!maskDigits) return base;
  return base.replace(/\d/g, (d) =>
    String.fromCharCode("g".charCodeAt(0) + Number(d)),
  );
}

function defaultDimensions(kind: QuantumNuclearScenarioSpec["kind"]): {
  width: number;
  height: number;
} {
  switch (kind) {
    case "energy-levels":
      return { width: 720, height: 500 };
    case "special-relativity":
      return { width: 580, height: 540 };
    default:
      return { width: 720, height: 460 };
  }
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error("Invalid quantum-nuclear SVG dimensions");
  }
}

export function renderQuantumNuclearSvg(
  spec: QuantumNuclearScenarioSpec,
  options: QuantumNuclearRenderOptions = {},
): string {
  const validation = validateQuantumNuclearScenario(spec);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  }

  const defaults = defaultDimensions(spec.kind);
  const width = options.width ?? defaults.width;
  const height = options.height ?? defaults.height;
  assertDimensions(width, height);

  const solution = solveQuantumNuclearScenario(spec);
  const quantityMap = extractQuantumNuclearQuantityMap(spec, solution);
  const guard = createVisibilityGuard(spec, options, quantityMap);
  const rawUid = spec.id ?? spec.kind;
  const uid = sanitizeUid(rawUid, guard.textContainsHiddenNumber(rawUid));

  let rendered: SvgBodyResult;
  switch (spec.kind) {
    case "energy-levels":
      if (solution.kind !== "energy-levels") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderEnergyLevelsBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "photoelectric-effect":
      if (solution.kind !== "photoelectric-effect") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderPhotoelectricBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "matter-waves":
      if (solution.kind !== "matter-waves") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderMatterWavesBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "radioactive-decay":
      if (solution.kind !== "radioactive-decay") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderRadioactiveDecayBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "nuclear-decay-chain":
      if (solution.kind !== "nuclear-decay-chain") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderNuclearDecayChainBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "nuclear-binding":
      if (solution.kind !== "nuclear-binding") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderNuclearBindingBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "rutherford-scattering":
      if (solution.kind !== "rutherford-scattering") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderRutherfordScatteringBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
    case "special-relativity":
      if (solution.kind !== "special-relativity") {
        throw new Error("Solver/spec kind mismatch");
      }
      rendered = renderSpecialRelativityBody(
        spec,
        solution,
        guard,
        width,
        height,
        uid,
      );
      break;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(rendered.ariaLabel)}">`,
    `<title>${escapeXml(rendered.title)}</title>`,
    `<desc>${escapeXml(rendered.desc)}</desc>`,
    rendered.defs ? `<defs>${rendered.defs}</defs>` : "",
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g font-family="Arial, Helvetica, sans-serif">${rendered.body}</g>`,
    `</svg>`,
  ].join("");
}
