import { VisualValidationIssue } from "../types";
import {
  solveCapacitorNetwork,
  solveParallelPlateCapacitor,
  solveRcTransient,
  validateCapacitorNetwork,
  validateParallelPlateCapacitor,
  validateRcTransient,
} from "./capacitors-physics";
import {
  solveBainbridgeSpectrometer,
  solveElectricDeflection,
  solveMagneticCyclotron,
  solveVelocitySelector,
  validateBainbridgeSpectrometer,
  validateElectricDeflection,
  validateMagneticCyclotron,
  validateVelocitySelector,
} from "./charged-particles-physics";
import {
  solveAcGenerator,
  solveFluxFaraday,
  solveMotionalEmfRails,
  solveTransformer,
  validateAcGenerator,
  validateFluxFaraday,
  validateMotionalEmfRails,
  validateTransformer,
} from "./induction-ac-physics";
import { renderSolvedEmInductionSvg } from "./render-svg";
import {
  EmInductionRenderOptions,
  EmInductionScenarioSpec,
  EmInductionSolution,
  EmInductionValidationResult,
  EmVisibilityControls,
} from "./types";

export * from "./types";
export * from "./capacitors-physics";
export * from "./induction-ac-physics";
export * from "./charged-particles-physics";
export * from "./generators";
export { renderSolvedEmInductionSvg } from "./render-svg";

function validateVisibilityControls(
  controls: EmVisibilityControls,
  issues: VisualValidationIssue[],
): void {
  const hiddenTrimmed = new Set<string>();
  for (const [index, entry] of (controls.hiddenQuantities ?? []).entries()) {
    if (typeof entry !== "string" || !entry.trim()) {
      issues.push({
        code: "INVALID_HIDDEN_QUANTITY_ID",
        message: "hiddenQuantities entries must be non-empty strings",
        path: `hiddenQuantities.${index}`,
      });
    } else {
      hiddenTrimmed.add(entry.trim());
    }
  }

  if (controls.visibleQuantities !== undefined) {
    for (const [index, entry] of controls.visibleQuantities.entries()) {
      if (typeof entry !== "string" || !entry.trim()) {
        issues.push({
          code: "INVALID_VISIBLE_QUANTITY_ID",
          message: "visibleQuantities entries must be non-empty strings",
          path: `visibleQuantities.${index}`,
        });
      } else if (hiddenTrimmed.has(entry.trim())) {
        issues.push({
          code: "CONFLICTING_VISIBILITY_QUANTITY",
          message: `Quantity '${entry.trim()}' cannot be listed in both hiddenQuantities and visibleQuantities`,
          path: `visibleQuantities.${index}`,
        });
      }
    }
  }

  if (controls.title !== undefined && !controls.title.trim()) {
    issues.push({
      code: "EMPTY_DIAGRAM_TITLE",
      message: "Diagram title cannot be empty or whitespace-only",
      path: "title",
    });
  }
}

export function validateEmInductionScenario(
  spec: EmInductionScenarioSpec,
): EmInductionValidationResult {
  const issues: VisualValidationIssue[] = [];
  validateVisibilityControls(spec, issues);

  switch (spec.kind) {
    case "parallel-plate-capacitor":
      validateParallelPlateCapacitor(spec, issues);
      break;
    case "capacitor-network":
      validateCapacitorNetwork(spec, issues);
      break;
    case "rc-transient":
      validateRcTransient(spec, issues);
      break;
    case "flux-faraday":
      validateFluxFaraday(spec, issues);
      break;
    case "motional-emf-rails":
      validateMotionalEmfRails(spec, issues);
      break;
    case "ac-generator":
      validateAcGenerator(spec, issues);
      break;
    case "transformer":
      validateTransformer(spec, issues);
      break;
    case "electric-deflection":
      validateElectricDeflection(spec, issues);
      break;
    case "magnetic-cyclotron":
      validateMagneticCyclotron(spec, issues);
      break;
    case "velocity-selector":
      validateVelocitySelector(spec, issues);
      break;
    case "bainbridge-mass-spectrometer":
      validateBainbridgeSpectrometer(spec, issues);
      break;
    default: {
      const unknownSpec = spec as { kind?: string };
      issues.push({
        code: "UNSUPPORTED_SCENARIO_KIND",
        message: `Unsupported EM induction scenario kind: ${String(unknownSpec.kind)}`,
        path: "kind",
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function solveEmInductionScenario(
  spec: EmInductionScenarioSpec,
): EmInductionSolution {
  const validation = validateEmInductionScenario(spec);
  if (!validation.valid) {
    throw new Error(
      `Invalid EM induction scenario (${spec.kind}): ${validation.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }

  switch (spec.kind) {
    case "parallel-plate-capacitor":
      return solveParallelPlateCapacitor(spec);
    case "capacitor-network":
      return solveCapacitorNetwork(spec);
    case "rc-transient":
      return solveRcTransient(spec);
    case "flux-faraday":
      return solveFluxFaraday(spec);
    case "motional-emf-rails":
      return solveMotionalEmfRails(spec);
    case "ac-generator":
      return solveAcGenerator(spec);
    case "transformer":
      return solveTransformer(spec);
    case "electric-deflection":
      return solveElectricDeflection(spec);
    case "magnetic-cyclotron":
      return solveMagneticCyclotron(spec);
    case "velocity-selector":
      return solveVelocitySelector(spec);
    case "bainbridge-mass-spectrometer":
      return solveBainbridgeSpectrometer(spec);
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unsupported EM induction scenario: ${exhaustive}`);
    }
  }
}

export function renderEmInductionSvg(
  spec: EmInductionScenarioSpec,
  options: EmInductionRenderOptions = {},
): string {
  const solution = solveEmInductionScenario(spec);
  return renderSolvedEmInductionSvg(spec, solution, options);
}
