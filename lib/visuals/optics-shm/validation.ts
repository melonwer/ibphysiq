import {
  MAX_SMALL_ANGLE_PENDULUM_DEG,
  OpticsShmScenarioKind,
  OpticsShmValidationIssue,
  OpticsShmValidationResult,
  ShmCommonControls,
} from "./types";
import { canonicalizeQuantityKey, expandQuantityKeys } from "./visibility";

const SUPPORTED_KINDS: ReadonlySet<OpticsShmScenarioKind> = new Set([
  "planar-refraction",
  "multi-layer-slab",
  "optical-fiber",
  "thin-lens",
  "mass-spring-shm",
  "simple-pendulum-shm",
  "kinematic-shm",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateVisibilityControls(
  record: Record<string, unknown>,
  kind: OpticsShmScenarioKind,
  issues: OpticsShmValidationIssue[],
): void {
  if (record.hiddenQuantities !== undefined) {
    if (
      !Array.isArray(record.hiddenQuantities) ||
      record.hiddenQuantities.some(
        (item) => typeof item !== "string" || item.trim().length === 0,
      )
    ) {
      issues.push({
        code: "INVALID_HIDDEN_QUANTITIES",
        message: "hiddenQuantities must be an array of non-empty strings",
        path: "hiddenQuantities",
      });
    }
  }

  if (record.visibleQuantities !== undefined) {
    if (
      !Array.isArray(record.visibleQuantities) ||
      record.visibleQuantities.some(
        (item) => typeof item !== "string" || item.trim().length === 0,
      )
    ) {
      issues.push({
        code: "INVALID_VISIBLE_QUANTITIES",
        message: "visibleQuantities must be an array of non-empty strings",
        path: "visibleQuantities",
      });
    }
  }

  if (
    record.visibilityMode !== undefined &&
    record.visibilityMode !== "all-except-hidden" &&
    record.visibilityMode !== "allowlist"
  ) {
    issues.push({
      code: "INVALID_VISIBILITY_MODE",
      message: 'visibilityMode must be "all-except-hidden" or "allowlist"',
      path: "visibilityMode",
    });
  }

  if (
    record.mode !== undefined &&
    record.mode !== "student" &&
    record.mode !== "teacher"
  ) {
    issues.push({
      code: "INVALID_RENDER_MODE",
      message: 'mode must be "student" or "teacher"',
      path: "mode",
    });
  }

  if (record.customLabels !== undefined) {
    if (!isRecord(record.customLabels)) {
      issues.push({
        code: "INVALID_CUSTOM_LABELS",
        message: "customLabels must be an object mapping keys to strings",
        path: "customLabels",
      });
    } else {
      const hiddenCanonical = new Set<string>(
        Array.isArray(record.hiddenQuantities)
          ? record.hiddenQuantities
              .filter((k): k is string => typeof k === "string")
              .flatMap((k) => expandQuantityKeys(k, kind))
          : [],
      );
      const effectiveMode = record.mode === "teacher" ? "teacher" : "student";
      for (const [key, val] of Object.entries(record.customLabels)) {
        if (typeof val !== "string" || val.trim().length === 0) {
          issues.push({
            code: "INVALID_CUSTOM_LABEL_TEXT",
            message: `customLabels.${key} must be a non-empty string`,
            path: `customLabels.${key}`,
          });
        } else if (
          effectiveMode === "student" &&
          expandQuantityKeys(key, kind).some((ek) =>
            hiddenCanonical.has(canonicalizeQuantityKey(ek, kind)) ||
            hiddenCanonical.has(ek),
          )
        ) {
          issues.push({
            code: "CUSTOM_LABEL_ON_HIDDEN_QUANTITY",
            message: `customLabels.${key} cannot override a hidden quantity in student mode`,
            path: `customLabels.${key}`,
          });
        }
      }
    }
  }
}

function validateShmCommon(
  record: Record<string, unknown> & Partial<ShmCommonControls>,
  amplitudeM: number | null,
  issues: OpticsShmValidationIssue[],
): void {
  if (
    record.initialPhaseRad !== undefined &&
    !isFiniteNumber(record.initialPhaseRad)
  ) {
    issues.push({
      code: "INVALID_INITIAL_PHASE",
      message: "initialPhaseRad must be a finite number",
      path: "initialPhaseRad",
    });
  }

  if (
    record.phaseConvention !== undefined &&
    record.phaseConvention !== "cosine" &&
    record.phaseConvention !== "sine"
  ) {
    issues.push({
      code: "INVALID_PHASE_CONVENTION",
      message: 'phaseConvention must be "cosine" or "sine"',
      path: "phaseConvention",
    });
  }

  if (record.queryTimeS !== undefined) {
    if (!isFiniteNumber(record.queryTimeS) || record.queryTimeS < 0) {
      issues.push({
        code: "INVALID_QUERY_TIME",
        message: "queryTimeS must be a finite non-negative number",
        path: "queryTimeS",
      });
    }
  }

  if (record.queryDisplacementM !== undefined) {
    if (!isFiniteNumber(record.queryDisplacementM)) {
      issues.push({
        code: "INVALID_QUERY_DISPLACEMENT",
        message: "queryDisplacementM must be a finite number",
        path: "queryDisplacementM",
      });
    } else if (
      amplitudeM !== null &&
      Math.abs(record.queryDisplacementM) > amplitudeM + 1e-12
    ) {
      issues.push({
        code: "QUERY_DISPLACEMENT_EXCEEDS_AMPLITUDE",
        message: "queryDisplacementM magnitude cannot exceed amplitudeM",
        path: "queryDisplacementM",
      });
    }
  }

  if (record.cyclesToRender !== undefined) {
    if (
      !isFiniteNumber(record.cyclesToRender) ||
      record.cyclesToRender < 0.5 ||
      record.cyclesToRender > 6
    ) {
      issues.push({
        code: "INVALID_CYCLES_TO_RENDER",
        message: "cyclesToRender must be between 0.5 and 6",
        path: "cyclesToRender",
      });
    }
  }

  if (
    record.plotMode !== undefined &&
    record.plotMode !== "time-series" &&
    record.plotMode !== "energy-displacement" &&
    record.plotMode !== "energy-time" &&
    record.plotMode !== "phase-portrait"
  ) {
    issues.push({
      code: "INVALID_PLOT_MODE",
      message:
        'plotMode must be "time-series", "energy-displacement", "energy-time", or "phase-portrait"',
      path: "plotMode",
    });
  }

  if (
    record.phasePlotKind !== undefined &&
    record.phasePlotKind !== "velocity-displacement" &&
    record.phasePlotKind !== "acceleration-displacement"
  ) {
    issues.push({
      code: "INVALID_PHASE_PLOT_KIND",
      message:
        'phasePlotKind must be "velocity-displacement" or "acceleration-displacement"',
      path: "phasePlotKind",
    });
  }
}

export function validateOpticsShmScenario(
  spec: unknown,
): OpticsShmValidationResult {
  const issues: OpticsShmValidationIssue[] = [];

  if (!isRecord(spec)) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_SPEC",
          message: "Scenario specification must be a non-null object",
          path: "",
        },
      ],
    };
  }

  if (
    typeof spec.kind !== "string" ||
    !SUPPORTED_KINDS.has(spec.kind as OpticsShmScenarioKind)
  ) {
    return {
      valid: false,
      issues: [
        {
          code: "UNSUPPORTED_KIND",
          message: `Unsupported optics-shm scenario kind: ${String(spec.kind)}`,
          path: "kind",
        },
      ],
    };
  }

  const kind = spec.kind as OpticsShmScenarioKind;
  validateVisibilityControls(spec, kind, issues);

  switch (kind) {
    case "planar-refraction": {
      if (!isFiniteNumber(spec.n1) || spec.n1 < 1 || spec.n1 > 10) {
        issues.push({
          code: "INVALID_REFRACTIVE_INDEX",
          message: "n1 must be a finite refractive index between 1 and 10",
          path: "n1",
        });
      }
      if (!isFiniteNumber(spec.n2) || spec.n2 < 1 || spec.n2 > 10) {
        issues.push({
          code: "INVALID_REFRACTIVE_INDEX",
          message: "n2 must be a finite refractive index between 1 and 10",
          path: "n2",
        });
      }
      if (
        !isFiniteNumber(spec.incidentAngleDeg) ||
        spec.incidentAngleDeg < 0 ||
        spec.incidentAngleDeg >= 90
      ) {
        issues.push({
          code: "INVALID_INCIDENT_ANGLE",
          message: "incidentAngleDeg must satisfy 0 <= incidentAngleDeg < 90",
          path: "incidentAngleDeg",
        });
      }
      if (
        spec.vacuumWavelengthNm !== undefined &&
        !isFinitePositive(spec.vacuumWavelengthNm)
      ) {
        issues.push({
          code: "INVALID_WAVELENGTH",
          message: "vacuumWavelengthNm must be positive and finite",
          path: "vacuumWavelengthNm",
        });
      }
      if (
        spec.vacuumSpeedMs !== undefined &&
        !isFinitePositive(spec.vacuumSpeedMs)
      ) {
        issues.push({
          code: "INVALID_VACUUM_SPEED",
          message: "vacuumSpeedMs must be positive and finite",
          path: "vacuumSpeedMs",
        });
      }
      break;
    }

    case "multi-layer-slab": {
      if (
        !Array.isArray(spec.layers) ||
        spec.layers.length < 2 ||
        spec.layers.length > 8
      ) {
        issues.push({
          code: "INVALID_SLAB_LAYERS",
          message: "layers must contain between 2 and 8 media layers",
          path: "layers",
        });
      } else {
        spec.layers.forEach((layer: unknown, idx: number) => {
          if (!isRecord(layer)) {
            issues.push({
              code: "INVALID_SLAB_LAYER",
              message: `Layer ${idx} must be an object`,
              path: `layers[${idx}]`,
            });
            return;
          }
          if (
            !isFiniteNumber(layer.refractiveIndex) ||
            layer.refractiveIndex < 1 ||
            layer.refractiveIndex > 10
          ) {
            issues.push({
              code: "INVALID_REFRACTIVE_INDEX",
              message: `layers[${idx}].refractiveIndex must be between 1 and 10`,
              path: `layers[${idx}].refractiveIndex`,
            });
          }
          if (
            layer.thicknessM !== undefined &&
            !isFinitePositive(layer.thicknessM)
          ) {
            issues.push({
              code: "INVALID_LAYER_THICKNESS",
              message: `layers[${idx}].thicknessM must be positive and finite`,
              path: `layers[${idx}].thicknessM`,
            });
          }
        });
      }

      if (
        !isFiniteNumber(spec.incidentAngleDeg) ||
        spec.incidentAngleDeg < 0 ||
        spec.incidentAngleDeg >= 90
      ) {
        issues.push({
          code: "INVALID_INCIDENT_ANGLE",
          message: "incidentAngleDeg must satisfy 0 <= incidentAngleDeg < 90",
          path: "incidentAngleDeg",
        });
      }
      if (
        spec.vacuumWavelengthNm !== undefined &&
        !isFinitePositive(spec.vacuumWavelengthNm)
      ) {
        issues.push({
          code: "INVALID_WAVELENGTH",
          message: "vacuumWavelengthNm must be positive and finite",
          path: "vacuumWavelengthNm",
        });
      }
      if (
        spec.vacuumSpeedMs !== undefined &&
        !isFinitePositive(spec.vacuumSpeedMs)
      ) {
        issues.push({
          code: "INVALID_VACUUM_SPEED",
          message: "vacuumSpeedMs must be positive and finite",
          path: "vacuumSpeedMs",
        });
      }
      break;
    }

    case "optical-fiber": {
      const nCoreValid =
        isFiniteNumber(spec.nCore) && spec.nCore > 1 && spec.nCore <= 10;
      const nCladValid =
        isFiniteNumber(spec.nCladding) &&
        spec.nCladding >= 1 &&
        spec.nCladding <= 10;
      if (!nCoreValid) {
        issues.push({
          code: "INVALID_CORE_INDEX",
          message: "nCore must be greater than 1 and at most 10",
          path: "nCore",
        });
      }
      if (!nCladValid) {
        issues.push({
          code: "INVALID_CLADDING_INDEX",
          message: "nCladding must be between 1 and 10",
          path: "nCladding",
        });
      }
      if (
        nCoreValid &&
        nCladValid &&
        (spec.nCore as number) <= (spec.nCladding as number)
      ) {
        issues.push({
          code: "CORE_NOT_GREATER_THAN_CLADDING",
          message:
            "Optical fiber requires nCore > nCladding for waveguiding by total internal reflection",
          path: "nCore",
        });
      }

      const nExternal = spec.nExternal === undefined ? 1 : spec.nExternal;
      const nExtValid =
        isFiniteNumber(nExternal) && nExternal >= 1 && nExternal <= 10;
      if (!nExtValid) {
        issues.push({
          code: "INVALID_EXTERNAL_INDEX",
          message: "nExternal must be between 1 and 10",
          path: "nExternal",
        });
      }

      const launchValid =
        isFiniteNumber(spec.launchAngleDeg) &&
        spec.launchAngleDeg >= 0 &&
        spec.launchAngleDeg < 90;
      if (!launchValid) {
        issues.push({
          code: "INVALID_LAUNCH_ANGLE",
          message: "launchAngleDeg must satisfy 0 <= launchAngleDeg < 90",
          path: "launchAngleDeg",
        });
      }

      if (nCoreValid && nExtValid && launchValid) {
        const sinCore =
          ((nExternal as number) *
            Math.sin(((spec.launchAngleDeg as number) * Math.PI) / 180)) /
          (spec.nCore as number);
        if (sinCore > 1 + 1e-12) {
          issues.push({
            code: "LAUNCH_RAY_CANNOT_ENTER_CORE",
            message:
              "External launch angle exceeds critical angle at fiber entry face",
            path: "launchAngleDeg",
          });
        }
      }

      if (
        spec.fiberLengthM !== undefined &&
        !isFinitePositive(spec.fiberLengthM)
      ) {
        issues.push({
          code: "INVALID_FIBER_LENGTH",
          message: "fiberLengthM must be positive and finite",
          path: "fiberLengthM",
        });
      }
      if (
        spec.coreDiameterM !== undefined &&
        !isFinitePositive(spec.coreDiameterM)
      ) {
        issues.push({
          code: "INVALID_CORE_DIAMETER",
          message: "coreDiameterM must be positive and finite",
          path: "coreDiameterM",
        });
      }
      if (
        spec.vacuumSpeedMs !== undefined &&
        !isFinitePositive(spec.vacuumSpeedMs)
      ) {
        issues.push({
          code: "INVALID_VACUUM_SPEED",
          message: "vacuumSpeedMs must be positive and finite",
          path: "vacuumSpeedMs",
        });
      }
      break;
    }

    case "thin-lens": {
      if (spec.lensType !== "converging" && spec.lensType !== "diverging") {
        issues.push({
          code: "INVALID_LENS_TYPE",
          message: 'lensType must be "converging" or "diverging"',
          path: "lensType",
        });
      }
      if (!isFiniteNumber(spec.focalLengthM) || spec.focalLengthM === 0) {
        issues.push({
          code: "INVALID_FOCAL_LENGTH",
          message: "focalLengthM must be a finite non-zero number",
          path: "focalLengthM",
        });
      } else if (spec.lensType === "converging" && spec.focalLengthM <= 0) {
        issues.push({
          code: "CONVERGING_FOCAL_LENGTH_NEGATIVE",
          message: "Converging lens requires focalLengthM > 0",
          path: "focalLengthM",
        });
      }

      if (!isFinitePositive(spec.objectDistanceM)) {
        issues.push({
          code: "INVALID_OBJECT_DISTANCE",
          message: "objectDistanceM must be positive and finite",
          path: "objectDistanceM",
        });
      }
      if (
        spec.objectHeightM !== undefined &&
        !isFinitePositive(spec.objectHeightM)
      ) {
        issues.push({
          code: "INVALID_OBJECT_HEIGHT",
          message: "objectHeightM must be positive and finite",
          path: "objectHeightM",
        });
      }
      break;
    }

    case "mass-spring-shm": {
      if (!isFinitePositive(spec.massKg)) {
        issues.push({
          code: "INVALID_MASS",
          message: "massKg must be positive and finite",
          path: "massKg",
        });
      }
      if (!isFinitePositive(spec.springConstantNm)) {
        issues.push({
          code: "INVALID_SPRING_CONSTANT",
          message: "springConstantNm must be positive and finite",
          path: "springConstantNm",
        });
      }
      const ampValid = isFinitePositive(spec.amplitudeM);
      if (!ampValid) {
        issues.push({
          code: "INVALID_AMPLITUDE",
          message: "amplitudeM must be positive and finite",
          path: "amplitudeM",
        });
      }
      if (
        spec.orientation !== undefined &&
        spec.orientation !== "horizontal" &&
        spec.orientation !== "vertical"
      ) {
        issues.push({
          code: "INVALID_ORIENTATION",
          message: 'orientation must be "horizontal" or "vertical"',
          path: "orientation",
        });
      }
      if (spec.gravityMs2 !== undefined && !isFinitePositive(spec.gravityMs2)) {
        issues.push({
          code: "INVALID_GRAVITY",
          message: "gravityMs2 must be positive and finite",
          path: "gravityMs2",
        });
      }
      validateShmCommon(
        spec,
        ampValid ? (spec.amplitudeM as number) : null,
        issues,
      );
      break;
    }

    case "simple-pendulum-shm": {
      const lengthValid = isFinitePositive(spec.lengthM);
      if (!lengthValid) {
        issues.push({
          code: "INVALID_PENDULUM_LENGTH",
          message: "lengthM must be positive and finite",
          path: "lengthM",
        });
      }
      if (spec.gravityMs2 !== undefined && !isFinitePositive(spec.gravityMs2)) {
        issues.push({
          code: "INVALID_GRAVITY",
          message: "gravityMs2 must be positive and finite",
          path: "gravityMs2",
        });
      }
      if (spec.bobMassKg !== undefined && !isFinitePositive(spec.bobMassKg)) {
        issues.push({
          code: "INVALID_BOB_MASS",
          message: "bobMassKg must be positive and finite",
          path: "bobMassKg",
        });
      }

      const hasAmp = spec.amplitudeM !== undefined;
      const hasAngle = spec.maxAngleDeg !== undefined;
      let resolvedAmplitude: number | null = null;
      let resolvedAngleDeg: number | null = null;

      if (!hasAmp && !hasAngle) {
        issues.push({
          code: "MISSING_PENDULUM_AMPLITUDE",
          message:
            "simple-pendulum-shm requires amplitudeM or maxAngleDeg to be specified",
          path: "amplitudeM",
        });
      } else {
        if (hasAmp && !isFinitePositive(spec.amplitudeM)) {
          issues.push({
            code: "INVALID_AMPLITUDE",
            message: "amplitudeM must be positive and finite",
            path: "amplitudeM",
          });
        }
        if (hasAngle && !isFinitePositive(spec.maxAngleDeg)) {
          issues.push({
            code: "INVALID_MAX_ANGLE",
            message: "maxAngleDeg must be positive and finite",
            path: "maxAngleDeg",
          });
        }

        if (lengthValid) {
          const L = spec.lengthM as number;
          if (hasAmp && isFinitePositive(spec.amplitudeM)) {
            resolvedAmplitude = spec.amplitudeM;
            resolvedAngleDeg = ((spec.amplitudeM / L) * 180) / Math.PI;
          }
          if (hasAngle && isFinitePositive(spec.maxAngleDeg)) {
            const expectedAmp = (L * (spec.maxAngleDeg * Math.PI)) / 180;
            if (
              resolvedAmplitude !== null &&
              Math.abs(resolvedAmplitude - expectedAmp) >
                1e-5 * Math.max(1, expectedAmp)
            ) {
              issues.push({
                code: "INCONSISTENT_PENDULUM_AMPLITUDE",
                message:
                  "amplitudeM and maxAngleDeg disagree with s = L * theta",
                path: "maxAngleDeg",
              });
            }
            resolvedAngleDeg = spec.maxAngleDeg;
            if (resolvedAmplitude === null) {
              resolvedAmplitude = expectedAmp;
            }
          }
          if (
            resolvedAngleDeg !== null &&
            resolvedAngleDeg > MAX_SMALL_ANGLE_PENDULUM_DEG + 1e-9
          ) {
            issues.push({
              code: "PENDULUM_EXCEEDS_SMALL_ANGLE_LIMIT",
              message: `Small-angle SHM approximation requires angular amplitude <= ${MAX_SMALL_ANGLE_PENDULUM_DEG} degrees`,
              path: hasAngle ? "maxAngleDeg" : "amplitudeM",
            });
          }
        }
      }

      validateShmCommon(spec, resolvedAmplitude, issues);
      break;
    }

    case "kinematic-shm": {
      const ampValid = isFinitePositive(spec.amplitudeM);
      if (!ampValid) {
        issues.push({
          code: "INVALID_AMPLITUDE",
          message: "amplitudeM must be positive and finite",
          path: "amplitudeM",
        });
      }
      if (spec.massKg !== undefined && !isFinitePositive(spec.massKg)) {
        issues.push({
          code: "INVALID_MASS",
          message: "massKg must be positive and finite",
          path: "massKg",
        });
      }

      const hasT = spec.periodS !== undefined;
      const hasF = spec.frequencyHz !== undefined;
      const hasOmega = spec.angularFrequencyRadS !== undefined;

      if (!hasT && !hasF && !hasOmega) {
        issues.push({
          code: "MISSING_TIME_SCALE",
          message:
            "kinematic-shm requires periodS, frequencyHz, or angularFrequencyRadS",
          path: "periodS",
        });
      } else {
        const omegas: Array<{ source: string; value: number }> = [];
        if (hasT) {
          if (!isFinitePositive(spec.periodS)) {
            issues.push({
              code: "INVALID_PERIOD",
              message: "periodS must be positive and finite",
              path: "periodS",
            });
          } else {
            omegas.push({
              source: "periodS",
              value: (2 * Math.PI) / spec.periodS,
            });
          }
        }
        if (hasF) {
          if (!isFinitePositive(spec.frequencyHz)) {
            issues.push({
              code: "INVALID_FREQUENCY",
              message: "frequencyHz must be positive and finite",
              path: "frequencyHz",
            });
          } else {
            omegas.push({
              source: "frequencyHz",
              value: 2 * Math.PI * spec.frequencyHz,
            });
          }
        }
        if (hasOmega) {
          if (!isFinitePositive(spec.angularFrequencyRadS)) {
            issues.push({
              code: "INVALID_ANGULAR_FREQUENCY",
              message: "angularFrequencyRadS must be positive and finite",
              path: "angularFrequencyRadS",
            });
          } else {
            omegas.push({
              source: "angularFrequencyRadS",
              value: spec.angularFrequencyRadS,
            });
          }
        }

        for (let i = 1; i < omegas.length; i++) {
          const ref = omegas[0].value;
          const cur = omegas[i].value;
          if (Math.abs(cur - ref) > 1e-5 * Math.max(1, ref)) {
            issues.push({
              code: "INCONSISTENT_SHM_FREQUENCIES",
              message: `${omegas[0].source} and ${omegas[i].source} are mutually inconsistent`,
              path: omegas[i].source,
            });
          }
        }
      }

      validateShmCommon(
        spec,
        ampValid ? (spec.amplitudeM as number) : null,
        issues,
      );
      break;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
