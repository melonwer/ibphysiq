import { solveOpticsShmScenario } from "./physics";
import {
  RenderedSvgBody,
  renderMultiLayerSlabBody,
  renderOpticalFiberBody,
  renderPlanarRefractionBody,
  renderThinLensBody,
} from "./render-optics";
import {
  renderKinematicShmBody,
  renderMassSpringShmBody,
  renderSimplePendulumShmBody,
} from "./render-shm";
import {
  KinematicShmSolution,
  MassSpringShmSolution,
  MultiLayerSlabSolution,
  OpticalFiberSolution,
  OpticsShmRenderOptions,
  OpticsShmScenarioSpec,
  PlanarRefractionSolution,
  SimplePendulumShmSolution,
  ThinLensSolution,
} from "./types";
import { validateOpticsShmScenario } from "./validation";
import {
  createVisibilityController,
  escapeXml,
  extractOpticsShmQuantities,
} from "./visibility";

function defaultDimensions(kind: OpticsShmScenarioSpec["kind"]): {
  width: number;
  height: number;
} {
  if (kind === "mass-spring-shm" || kind === "simple-pendulum-shm") {
    return { width: 760, height: 420 };
  }
  return { width: 680, height: 400 };
}

export function renderOpticsShmSvg(
  spec: OpticsShmScenarioSpec,
  options: OpticsShmRenderOptions = {},
): string {
  const specValidation = validateOpticsShmScenario(spec);
  if (!specValidation.valid) {
    throw new Error(
      `Cannot render invalid optics-shm scenario: ${specValidation.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const optionsValidation = validateOpticsShmScenario({
    ...spec,
    hiddenQuantities: options.hiddenQuantities,
    visibleQuantities: options.visibleQuantities,
    visibilityMode: options.visibilityMode,
    mode: options.mode ?? spec.mode,
    showSymbolicHiddenLabels:
      options.showSymbolicHiddenLabels ?? spec.showSymbolicHiddenLabels,
    customLabels: options.customLabels,
  });
  if (!optionsValidation.valid) {
    throw new Error(
      `Cannot render optics-shm scenario with invalid render options: ${optionsValidation.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const defaults = defaultDimensions(spec.kind);
  const width = options.width ?? defaults.width;
  const height = options.height ?? defaults.height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  ) {
    throw new Error("Invalid optics-shm SVG dimensions");
  }

  const solution = solveOpticsShmScenario(spec);
  const quantities = extractOpticsShmQuantities(spec, solution);
  const visibility = createVisibilityController(
    spec.kind,
    spec,
    options,
    quantities,
  );
  const showGrid = options.showGrid ?? true;

  let body: RenderedSvgBody;
  switch (spec.kind) {
    case "planar-refraction":
      body = renderPlanarRefractionBody(
        spec,
        solution as PlanarRefractionSolution,
        visibility,
        width,
        height,
      );
      break;
    case "multi-layer-slab":
      body = renderMultiLayerSlabBody(
        spec,
        solution as MultiLayerSlabSolution,
        visibility,
        width,
        height,
      );
      break;
    case "optical-fiber":
      body = renderOpticalFiberBody(
        spec,
        solution as OpticalFiberSolution,
        visibility,
        width,
        height,
      );
      break;
    case "thin-lens":
      body = renderThinLensBody(
        spec,
        solution as ThinLensSolution,
        visibility,
        width,
        height,
      );
      break;
    case "mass-spring-shm":
      body = renderMassSpringShmBody(
        spec,
        solution as MassSpringShmSolution,
        visibility,
        width,
        height,
        showGrid,
      );
      break;
    case "simple-pendulum-shm":
      body = renderSimplePendulumShmBody(
        spec,
        solution as SimplePendulumShmSolution,
        visibility,
        width,
        height,
        showGrid,
      );
      break;
    case "kinematic-shm":
      body = renderKinematicShmBody(
        spec,
        solution as KinematicShmSolution,
        visibility,
        width,
        height,
        showGrid,
      );
      break;
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unsupported optics-shm kind: ${String(exhaustive)}`);
    }
  }

  const footer =
    spec.kind === "kinematic-shm"
      ? ""
      : `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#64748b">Diagram not to scale</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(body.ariaLabel)}"><title>${escapeXml(body.title)}</title><desc>${escapeXml(body.desc)}</desc><rect width="${width}" height="${height}" fill="#ffffff"/><g font-family="Arial, Helvetica, sans-serif">${body.elements.join("")}${footer}</g></svg>`;
}
