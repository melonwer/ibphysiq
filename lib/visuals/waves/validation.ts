import { validateSchemaValue } from "@/lib/generation-harness/schema";
import {
  WAVES_SCENARIO_KINDS,
  WAVES_SCENARIO_SCHEMAS,
  WavesScenarioKind,
  WavesScenarioSpec,
  WavesValidationIssue,
  WavesValidationResult,
} from "./types";

export function computeExactMaxOrder(
  spacingM: number,
  wavelengthM: number,
): number {
  const ratio = spacingM / wavelengthM;
  const nearestInt = Math.round(ratio);
  if (
    nearestInt >= 0 &&
    Math.abs(ratio - nearestInt) <= 1e-12 * Math.max(1, nearestInt)
  ) {
    return nearestInt;
  }
  return Math.floor(ratio);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePositive(
  issues: WavesValidationIssue[],
  value: number,
  path: string,
  label: string,
): boolean {
  if (!Number.isFinite(value) || value <= 0) {
    issues.push({
      code: "non-positive-quantity",
      message: `${label} must be positive and finite, received ${value}`,
      path,
    });
    return false;
  }
  return true;
}

function requireNonNegative(
  issues: WavesValidationIssue[],
  value: number,
  path: string,
  label: string,
): boolean {
  if (!Number.isFinite(value) || value < 0) {
    issues.push({
      code: "negative-quantity",
      message: `${label} must be non-negative and finite, received ${value}`,
      path,
    });
    return false;
  }
  return true;
}

export function validateWavesScenario(spec: unknown): WavesValidationResult {
  if (!isRecord(spec)) {
    return {
      valid: false,
      issues: [
        {
          code: "expected-object",
          message: "Waves scenario spec must be an object",
          path: "$",
        },
      ],
    };
  }

  const rawKind = spec.kind;
  if (
    typeof rawKind !== "string" ||
    !(WAVES_SCENARIO_KINDS as readonly string[]).includes(rawKind)
  ) {
    return {
      valid: false,
      issues: [
        {
          code: "unsupported-scenario-kind",
          message: `Scenario kind must be one of: ${WAVES_SCENARIO_KINDS.join(", ")}`,
          path: "$.kind",
        },
      ],
    };
  }

  const kind = rawKind as WavesScenarioKind;
  const schemaResult = validateSchemaValue(WAVES_SCENARIO_SCHEMAS[kind], spec);
  const issues: WavesValidationIssue[] = schemaResult.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  const typed = spec as unknown as WavesScenarioSpec;

  if (typed.hiddenQuantities) {
    for (let i = 0; i < typed.hiddenQuantities.length; i += 1) {
      if (!typed.hiddenQuantities[i].trim()) {
        issues.push({
          code: "blank-hidden-quantity",
          message: "Hidden quantity identifiers cannot be blank whitespace",
          path: `$.hiddenQuantities[${i}]`,
        });
      }
    }
  }

  if (typed.visibility) {
    const pub = new Set(typed.visibility.publicParameterIds ?? []);
    const priv = typed.visibility.privateParameterIds ?? [];
    for (const id of priv) {
      if (pub.has(id)) {
        issues.push({
          code: "public-private-overlap",
          message: `Quantity "${id}" cannot be both public and private`,
          path: "$.visibility",
        });
      }
    }
  }

  if (typed.customLabels) {
    for (const [key, val] of Object.entries(typed.customLabels)) {
      if (typeof val !== "string" || !val.trim()) {
        issues.push({
          code: "invalid-custom-label",
          message: `Custom label for "${key}" must be a non-empty string`,
          path: `$.customLabels.${key}`,
        });
      }
    }
  }

  switch (typed.kind) {
    case "progressive-wave": {
      const ampOk = requirePositive(
        issues,
        typed.amplitudeM,
        "$.amplitudeM",
        "Amplitude",
      );
      const wlOk = requirePositive(
        issues,
        typed.wavelengthM,
        "$.wavelengthM",
        "Wavelength",
      );
      const freqOk = requirePositive(
        issues,
        typed.frequencyHz,
        "$.frequencyHz",
        "Frequency",
      );

      const hasP1 = typed.point1Coord !== undefined;
      const hasP2 = typed.point2Coord !== undefined;
      if (hasP1 !== hasP2) {
        issues.push({
          code: "incomplete-phase-points",
          message:
            "Both point1Coord and point2Coord must be supplied together when specifying phase markers",
          path: hasP1 ? "$.point2Coord" : "$.point1Coord",
        });
      } else if (hasP1 && hasP2 && ampOk && wlOk && freqOk) {
        const cycles = typed.cyclesShown ?? 2;
        const unitSpan =
          typed.profileKind === "displacement-position"
            ? typed.wavelengthM
            : 1 / typed.frequencyHz;
        const maxAxis = cycles * unitSpan;
        const tol = 1e-9 * Math.max(1, maxAxis);
        if (typed.point1Coord! < -tol || typed.point1Coord! > maxAxis + tol) {
          issues.push({
            code: "point-outside-domain",
            message: `point1Coord (${typed.point1Coord}) must lie within [0, ${maxAxis}]`,
            path: "$.point1Coord",
          });
        }
        if (typed.point2Coord! < -tol || typed.point2Coord! > maxAxis + tol) {
          issues.push({
            code: "point-outside-domain",
            message: `point2Coord (${typed.point2Coord}) must lie within [0, ${maxAxis}]`,
            path: "$.point2Coord",
          });
        }
      }
      break;
    }

    case "standing-wave": {
      const lenOk = requirePositive(
        issues,
        typed.lengthM,
        "$.lengthM",
        "Resonator length",
      );

      if (
        typed.boundaryKind === "pipe-closed-one" &&
        typed.harmonicNumber % 2 === 0
      ) {
        issues.push({
          code: "closed-pipe-even-harmonic",
          message:
            "A pipe closed at one end supports odd harmonics only (n = 1, 3, 5, ...)",
          path: "$.harmonicNumber",
        });
      }

      if (typed.amplitudeM !== undefined) {
        requirePositive(
          issues,
          typed.amplitudeM,
          "$.amplitudeM",
          "Standing wave amplitude",
        );
      }

      if (typed.boundaryKind === "string-fixed-both") {
        if (typed.endCorrectionM !== undefined && typed.endCorrectionM !== 0) {
          issues.push({
            code: "string-end-correction-unsupported",
            message:
              "Strings fixed at both ends cannot have a non-zero acoustic end correction",
            path: "$.endCorrectionM",
          });
        }

        const hasSpeed = typed.waveSpeedMs !== undefined;
        const hasTension = typed.tensionN !== undefined;
        const hasDensity = typed.linearDensityKgM !== undefined;

        if (hasTension !== hasDensity) {
          issues.push({
            code: "incomplete-string-parameters",
            message:
              "Both tensionN and linearDensityKgM must be provided together when specifying string mechanics",
            path: hasTension ? "$.linearDensityKgM" : "$.tensionN",
          });
        }

        if (!hasSpeed && !(hasTension && hasDensity)) {
          issues.push({
            code: "missing-wave-speed",
            message:
              "Provide waveSpeedMs or both tensionN and linearDensityKgM for a fixed string",
            path: "$.waveSpeedMs",
          });
        }

        const speedOk = hasSpeed
          ? requirePositive(
              issues,
              typed.waveSpeedMs!,
              "$.waveSpeedMs",
              "Wave speed",
            )
          : true;
        const tensionOk = hasTension
          ? requirePositive(
              issues,
              typed.tensionN!,
              "$.tensionN",
              "String tension",
            )
          : false;
        const densityOk = hasDensity
          ? requirePositive(
              issues,
              typed.linearDensityKgM!,
              "$.linearDensityKgM",
              "Linear mass density",
            )
          : false;

        if (hasSpeed && speedOk && tensionOk && densityOk) {
          const expectedSpeed = Math.sqrt(
            typed.tensionN! / typed.linearDensityKgM!,
          );
          if (
            Math.abs(typed.waveSpeedMs! - expectedSpeed) >
            1e-5 * Math.max(1, expectedSpeed)
          ) {
            issues.push({
              code: "inconsistent-string-wave-speed",
              message: `waveSpeedMs (${typed.waveSpeedMs}) is inconsistent with sqrt(tensionN / linearDensityKgM) (${expectedSpeed})`,
              path: "$.waveSpeedMs",
            });
          }
        }
      } else {
        if (typed.tensionN !== undefined) {
          issues.push({
            code: "pipe-string-parameter-unsupported",
            message: "tensionN is only valid for string-fixed-both scenarios",
            path: "$.tensionN",
          });
        }
        if (typed.linearDensityKgM !== undefined) {
          issues.push({
            code: "pipe-string-parameter-unsupported",
            message:
              "linearDensityKgM is only valid for string-fixed-both scenarios",
            path: "$.linearDensityKgM",
          });
        }
        if (typed.waveSpeedMs === undefined) {
          issues.push({
            code: "missing-wave-speed",
            message: "waveSpeedMs is required for acoustic pipe standing waves",
            path: "$.waveSpeedMs",
          });
        } else {
          requirePositive(
            issues,
            typed.waveSpeedMs,
            "$.waveSpeedMs",
            "Wave speed",
          );
        }

        if (typed.endCorrectionM !== undefined) {
          const ecOk = requireNonNegative(
            issues,
            typed.endCorrectionM,
            "$.endCorrectionM",
            "End correction",
          );
          if (ecOk && lenOk && typed.endCorrectionM >= 0.5 * typed.lengthM) {
            issues.push({
              code: "excessive-end-correction",
              message:
                "End correction must be strictly less than half the physical pipe length",
              path: "$.endCorrectionM",
            });
          }
        }
      }
      break;
    }

    case "double-slit": {
      const wlOk = requirePositive(
        issues,
        typed.wavelengthM,
        "$.wavelengthM",
        "Wavelength",
      );
      const sepOk = requirePositive(
        issues,
        typed.slitSeparationM,
        "$.slitSeparationM",
        "Slit separation",
      );
      const distOk = requirePositive(
        issues,
        typed.screenDistanceM,
        "$.screenDistanceM",
        "Screen distance",
      );

      if (wlOk && sepOk) {
        if (typed.wavelengthM >= typed.slitSeparationM) {
          issues.push({
            code: "wavelength-exceeds-slit-separation",
            message:
              "Wavelength must be strictly smaller than slit separation for interference fringes",
            path: "$.wavelengthM",
          });
        } else {
          const order = typed.orderN ?? 1;
          if (order * typed.wavelengthM >= typed.slitSeparationM) {
            issues.push({
              code: "order-beyond-diffraction-limit",
              message: `Order n = ${order} exceeds the 90-degree interference limit (n * wavelengthM < slitSeparationM)`,
              path: "$.orderN",
            });
          }
        }
      }

      if (sepOk && distOk && typed.screenDistanceM <= typed.slitSeparationM) {
        issues.push({
          code: "screen-too-close",
          message: "Screen distance D must exceed slit separation d",
          path: "$.screenDistanceM",
        });
      }

      if (typed.slitWidthM !== undefined) {
        const widthOk = requirePositive(
          issues,
          typed.slitWidthM,
          "$.slitWidthM",
          "Slit width",
        );
        if (widthOk && sepOk && typed.slitWidthM >= typed.slitSeparationM) {
          issues.push({
            code: "slit-width-exceeds-separation",
            message:
              "Individual slit width b must be smaller than center-to-center slit separation d",
            path: "$.slitWidthM",
          });
        }
        if (widthOk && wlOk && typed.wavelengthM >= typed.slitWidthM) {
          issues.push({
            code: "wavelength-exceeds-slit-width",
            message:
              "Wavelength must be smaller than slit width b for finite-slit envelope diffraction",
            path: "$.slitWidthM",
          });
        }
      }
      break;
    }

    case "diffraction-grating": {
      const wlOk = requirePositive(
        issues,
        typed.wavelengthM,
        "$.wavelengthM",
        "Wavelength",
      );
      const spOk = requirePositive(
        issues,
        typed.slitSpacingM,
        "$.slitSpacingM",
        "Grating slit spacing",
      );

      if (wlOk && spOk) {
        if (typed.wavelengthM > typed.slitSpacingM) {
          issues.push({
            code: "wavelength-exceeds-grating-spacing",
            message:
              "Wavelength cannot exceed grating slit spacing d for non-trivial diffraction orders",
            path: "$.wavelengthM",
          });
        } else {
          const maxOrder = computeExactMaxOrder(
            typed.slitSpacingM,
            typed.wavelengthM,
          );
          const queryOrder =
            typed.queryOrderN ?? (maxOrder >= 1 ? 1 : 0);
          if (queryOrder > maxOrder) {
            issues.push({
              code: "query-order-exceeds-max-order",
              message: `Requested order n = ${queryOrder} exceeds maximum observable order n_max = ${maxOrder}`,
              path: "$.queryOrderN",
            });
          } else if (
            typed.screenDistanceM !== undefined &&
            queryOrder * typed.wavelengthM >= typed.slitSpacingM * (1 - 1e-12)
          ) {
            issues.push({
              code: "grazing-order-misses-flat-screen",
              message: `Order n = ${queryOrder} diffracts at 90 degrees and cannot intersect a flat screen at finite distance`,
              path: "$.queryOrderN",
            });
          }
        }
      }

      if (typed.linesPerMm !== undefined) {
        const linesOk = requirePositive(
          issues,
          typed.linesPerMm,
          "$.linesPerMm",
          "Grating lines per mm",
        );
        if (linesOk && spOk) {
          const expectedLines = 1e-3 / typed.slitSpacingM;
          if (
            Math.abs(typed.linesPerMm - expectedLines) >
            1e-4 * expectedLines
          ) {
            issues.push({
              code: "inconsistent-grating-lines-per-mm",
              message: `linesPerMm (${typed.linesPerMm}) does not match 1e-3 / slitSpacingM (${expectedLines})`,
              path: "$.linesPerMm",
            });
          }
        }
      }

      if (typed.screenDistanceM !== undefined) {
        requirePositive(
          issues,
          typed.screenDistanceM,
          "$.screenDistanceM",
          "Screen distance",
        );
      }
      break;
    }

    case "single-slit": {
      const wlOk = requirePositive(
        issues,
        typed.wavelengthM,
        "$.wavelengthM",
        "Wavelength",
      );
      const widthOk = requirePositive(
        issues,
        typed.slitWidthM,
        "$.slitWidthM",
        "Slit width",
      );
      const distOk = requirePositive(
        issues,
        typed.screenDistanceM,
        "$.screenDistanceM",
        "Screen distance",
      );

      if (wlOk && widthOk && typed.wavelengthM >= typed.slitWidthM) {
        issues.push({
          code: "wavelength-exceeds-slit-width",
          message:
            "Wavelength must be strictly less than slit width b for a first diffraction minimum to exist",
          path: "$.wavelengthM",
        });
      }
      if (widthOk && distOk && typed.screenDistanceM <= typed.slitWidthM) {
        issues.push({
          code: "screen-too-close",
          message: "Screen distance D must exceed slit width b",
          path: "$.screenDistanceM",
        });
      }
      break;
    }

    case "doppler-effect": {
      requirePositive(
        issues,
        typed.emittedFrequencyHz,
        "$.emittedFrequencyHz",
        "Emitted frequency",
      );
      const vOk = requirePositive(
        issues,
        typed.waveSpeedMs,
        "$.waveSpeedMs",
        "Wave speed",
      );
      const vsOk = requireNonNegative(
        issues,
        typed.sourceSpeedMs,
        "$.sourceSpeedMs",
        "Source speed",
      );
      const voOk = requireNonNegative(
        issues,
        typed.observerSpeedMs,
        "$.observerSpeedMs",
        "Observer speed",
      );

      if (vOk && vsOk && typed.sourceSpeedMs >= typed.waveSpeedMs) {
        issues.push({
          code: "supersonic-source-unsupported",
          message:
            "Source speed must be strictly less than wave speed (v_s < v)",
          path: "$.sourceSpeedMs",
        });
      }
      if (vOk && voOk && typed.observerSpeedMs >= typed.waveSpeedMs) {
        issues.push({
          code: "supersonic-observer-unsupported",
          message:
            "Observer speed must be strictly less than wave speed (v_o < v)",
          path: "$.observerSpeedMs",
        });
      }

      if (vsOk) {
        if (typed.sourceMotion === "stationary" && typed.sourceSpeedMs !== 0) {
          issues.push({
            code: "stationary-source-nonzero-speed",
            message: "Stationary source must have sourceSpeedMs === 0",
            path: "$.sourceSpeedMs",
          });
        } else if (
          typed.sourceMotion !== "stationary" &&
          typed.sourceSpeedMs === 0
        ) {
          issues.push({
            code: "moving-source-zero-speed",
            message: `Source with motion "${typed.sourceMotion}" must have positive sourceSpeedMs`,
            path: "$.sourceSpeedMs",
          });
        }
      }

      if (voOk) {
        if (
          typed.observerMotion === "stationary" &&
          typed.observerSpeedMs !== 0
        ) {
          issues.push({
            code: "stationary-observer-nonzero-speed",
            message: "Stationary observer must have observerSpeedMs === 0",
            path: "$.observerSpeedMs",
          });
        } else if (
          typed.observerMotion !== "stationary" &&
          typed.observerSpeedMs === 0
        ) {
          issues.push({
            code: "moving-observer-zero-speed",
            message: `Observer with motion "${typed.observerMotion}" must have positive observerSpeedMs`,
            path: "$.observerSpeedMs",
          });
        }
      }
      break;
    }

    case "malus-polarization": {
      requirePositive(
        issues,
        typed.incidentIntensityWm2,
        "$.incidentIntensityWm2",
        "Incident intensity",
      );
      break;
    }

    default: {
      const exhaustive: never = typed;
      throw new Error(`Unhandled scenario kind: ${String(exhaustive)}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function parseWavesScenario(spec: unknown): WavesScenarioSpec {
  const result = validateWavesScenario(spec);
  if (!result.valid) {
    throw new Error(
      `Invalid waves scenario: ${result.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }
  return spec as WavesScenarioSpec;
}
