import {
  VisualValidationIssue,
  VisualValidationResult,
} from "@/lib/visuals/types";
import {
  DEFAULT_HUBBLE_CONSTANT_KMS_MPC,
  GRAVITATIONAL_CONSTANT,
  PARSEC_M,
  SPEED_OF_LIGHT_MS,
  STANDARD_GRAVITY_MS2,
  STEFAN_BOLTZMANN_WM2K4,
  WIEN_DISPLACEMENT_MK,
} from "./constants";
import { GRAV_ASTRO_SCENARIO_KINDS, GravAstroScenario } from "./types";

export const HIDDEN_COMPANION_GROUPS: ReadonlyArray<readonly string[]> = [
  ["peakWavelengthM", "peakWavelengthNm"],
  ["comparisonPeakWavelengthM", "comparisonPeakWavelengthNm"],
  ["restWavelengthM", "restWavelengthNm"],
  ["observedWavelengthM", "observedWavelengthNm"],
  ["deltaWavelengthM", "deltaWavelengthNm"],
  ["recessionSpeedMs", "recessionSpeedKmS", "relativisticSpeedMs"],
  ["distancePc", "distanceLy", "distanceAu", "distanceM", "distanceMpc"],
  ["luminosityW", "luminositySolar"],
  ["stellarRadiusM", "radiusSolar"],
  [
    "parallaxArcsec",
    "parallaxMilliarcsec",
    "parallaxDegrees",
    "parallaxRadians",
  ],
  ["hubbleConstantKmSMpc", "hubbleConstantSiSInv"],
  ["hubbleTimeS", "hubbleTimeGyr"],
  ["nullPointFromPrimaryM", "nullPointFromSecondaryM", "nullPointFraction"],
  ["speedMs", "actualSpeedMs"],
  ["massKg", "weightN"],
  ["periodS", "frequencyHz"],
  ["totalEnergyJ", "bindingEnergyJ"],
  ["scaleFactorRatioEmissionToNow", "scaleFactorRatioNowToEmission"],
];

export function expandHiddenQuantityKeys(
  rawKeys: Iterable<string>,
): Set<string> {
  const expanded = new Set<string>();
  for (const key of rawKeys) {
    expanded.add(key);
    for (const group of HIDDEN_COMPANION_GROUPS) {
      if (group.includes(key)) {
        for (const companion of group) {
          expanded.add(companion);
        }
      }
    }
  }
  return expanded;
}

function checkPositive(
  issues: VisualValidationIssue[],
  value: number | undefined,
  path: string,
  label: string,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    issues.push({
      code: "INVALID_POSITIVE_NUMBER",
      message: `${label} must be a finite positive number`,
      path,
    });
    return false;
  }
  return true;
}

function checkNonNegative(
  issues: VisualValidationIssue[],
  value: number | undefined,
  path: string,
  label: string,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push({
      code: "INVALID_NON_NEGATIVE_NUMBER",
      message: `${label} must be a finite non-negative number`,
      path,
    });
    return false;
  }
  return true;
}

function checkAcuteAngle(
  issues: VisualValidationIssue[],
  value: number | undefined,
  path: string,
  label: string,
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value >= 90
  ) {
    issues.push({
      code: "INVALID_ACUTE_ANGLE",
      message: `${label} must be strictly between 0 and 90 degrees`,
      path,
    });
    return false;
  }
  return true;
}

function validateVisibility(
  spec: GravAstroScenario,
  issues: VisualValidationIssue[],
): void {
  const rawHidden = [
    ...(spec.hiddenQuantities ?? []),
    ...(spec.visibility?.hiddenQuantities ?? []),
  ];
  for (let i = 0; i < rawHidden.length; i += 1) {
    if (typeof rawHidden[i] !== "string" || !rawHidden[i].trim()) {
      issues.push({
        code: "INVALID_HIDDEN_QUANTITY_KEY",
        message: "Hidden quantity keys must be non-empty strings",
        path: `hiddenQuantities[${i}]`,
      });
    }
  }

  const visible = spec.visibility?.visibleQuantities ?? [];
  for (let i = 0; i < visible.length; i += 1) {
    if (typeof visible[i] !== "string" || !visible[i].trim()) {
      issues.push({
        code: "INVALID_VISIBLE_QUANTITY_KEY",
        message: "Visible quantity keys must be non-empty strings",
        path: `visibility.visibleQuantities[${i}]`,
      });
    }
  }

  const expandedHidden = expandHiddenQuantityKeys(rawHidden);
  for (const key of visible) {
    if (expandedHidden.has(key)) {
      issues.push({
        code: "VISIBILITY_CONFLICT",
        message: `Quantity "${key}" conflicts with hiddenQuantities`,
        path: "visibility.visibleQuantities",
      });
    }
  }

  if (
    spec.visibility?.labelMode !== undefined &&
    !["blacklist", "allowlist", "symbolic-only"].includes(
      spec.visibility.labelMode,
    )
  ) {
    issues.push({
      code: "INVALID_LABEL_MODE",
      message: `Unsupported visibility labelMode: ${String(spec.visibility.labelMode)}`,
      path: "visibility.labelMode",
    });
  }

  const customLabels = spec.visibility?.customLabels;
  if (customLabels) {
    for (const [key, text] of Object.entries(customLabels)) {
      if (!text.trim()) {
        issues.push({
          code: "EMPTY_CUSTOM_LABEL",
          message: `Custom label for "${key}" cannot be empty`,
          path: `visibility.customLabels.${key}`,
        });
      } else if (expandedHidden.has(key) && /\d/.test(text)) {
        issues.push({
          code: "HIDDEN_CUSTOM_LABEL_CONFLICT",
          message: `Custom label for hidden quantity "${key}" must not contain numeric digits`,
          path: `visibility.customLabels.${key}`,
        });
      }
    }
  }
}

export function validateGravAstroScenario(
  spec: GravAstroScenario,
): VisualValidationResult {
  const issues: VisualValidationIssue[] = [];

  if (!spec || typeof spec !== "object" || !("kind" in spec)) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_SCENARIO_OBJECT",
          message: "Scenario must be an object with a valid kind property",
          path: "kind",
        },
      ],
    };
  }

  if (
    !GRAV_ASTRO_SCENARIO_KINDS.includes(
      spec.kind as (typeof GRAV_ASTRO_SCENARIO_KINDS)[number],
    )
  ) {
    return {
      valid: false,
      issues: [
        {
          code: "UNSUPPORTED_SCENARIO_KIND",
          message: `Unsupported grav-astro scenario kind: ${String((spec as { kind?: unknown }).kind)}`,
          path: "kind",
        },
      ],
    };
  }

  validateVisibility(spec, issues);

  switch (spec.kind) {
    case "conical-pendulum": {
      checkPositive(issues, spec.massKg, "massKg", "Pendulum bob mass");
      checkPositive(
        issues,
        spec.stringLengthM,
        "stringLengthM",
        "String length",
      );
      checkAcuteAngle(
        issues,
        spec.semiVerticalAngleDeg,
        "semiVerticalAngleDeg",
        "Semi-vertical angle",
      );
      checkPositive(
        issues,
        spec.gravityMs2 ?? STANDARD_GRAVITY_MS2,
        "gravityMs2",
        "Gravitational field strength",
      );
      break;
    }

    case "flat-curve": {
      const mOk = checkPositive(issues, spec.massKg, "massKg", "Vehicle mass");
      const rOk = checkPositive(
        issues,
        spec.radiusM,
        "radiusM",
        "Curve radius",
      );
      const vOk = checkPositive(
        issues,
        spec.speedMs,
        "speedMs",
        "Vehicle speed",
      );
      const muOk = checkPositive(
        issues,
        spec.staticFrictionCoeff,
        "staticFrictionCoeff",
        "Static friction coefficient",
      );
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const gOk = checkPositive(issues, g, "gravityMs2", "Gravity");
      if (mOk && rOk && vOk && muOk && gOk && spec.requireNoSkid !== false) {
        const maxSpeed = Math.sqrt(spec.staticFrictionCoeff * g * spec.radiusM);
        if (spec.speedMs > maxSpeed + 1e-7) {
          issues.push({
            code: "SPEED_EXCEEDS_STATIC_FRICTION",
            message: `Vehicle speed (${spec.speedMs} m/s) exceeds maximum non-skidding speed (${maxSpeed.toFixed(4)} m/s)`,
            path: "speedMs",
          });
        }
      }
      break;
    }

    case "banked-curve": {
      const mOk = checkPositive(issues, spec.massKg, "massKg", "Vehicle mass");
      const rOk = checkPositive(
        issues,
        spec.radiusM,
        "radiusM",
        "Curve radius",
      );
      const thetaOk = checkAcuteAngle(
        issues,
        spec.bankAngleDeg,
        "bankAngleDeg",
        "Bank angle",
      );
      const muOk = checkNonNegative(
        issues,
        spec.staticFrictionCoeff,
        "staticFrictionCoeff",
        "Static friction coefficient",
      );
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const gOk = checkPositive(issues, g, "gravityMs2", "Gravity");
      const vOk =
        spec.speedMs === undefined
          ? true
          : checkNonNegative(issues, spec.speedMs, "speedMs", "Vehicle speed");

      if (mOk && rOk && thetaOk && muOk && gOk && vOk) {
        const theta = (spec.bankAngleDeg * Math.PI) / 180;
        const v =
          spec.speedMs ?? Math.sqrt(g * spec.radiusM * Math.tan(theta));
        const ac = v ** 2 / spec.radiusM;
        const normalN = spec.massKg * (g * Math.cos(theta) + ac * Math.sin(theta));
        const requiredFrictionN = Math.abs(
          spec.massKg * (ac * Math.cos(theta) - g * Math.sin(theta)),
        );
        const maxFrictionN = spec.staticFrictionCoeff * normalN;
        if (
          spec.requireNoSkid !== false &&
          requiredFrictionN > maxFrictionN + 1e-6 * Math.max(1, normalN)
        ) {
          issues.push({
            code: "BANKED_CURVE_SKID",
            message: `Vehicle speed (${v.toFixed(4)} m/s) requires slope friction (${requiredFrictionN.toFixed(4)} N) exceeding static limit (${maxFrictionN.toFixed(4)} N)`,
            path: "speedMs",
          });
        }
      }
      break;
    }

    case "vertical-circle": {
      const mOk = checkPositive(issues, spec.massKg, "massKg", "Mass");
      const rOk = checkPositive(
        issues,
        spec.radiusM,
        "radiusM",
        "Circle radius",
      );
      const g = spec.gravityMs2 ?? STANDARD_GRAVITY_MS2;
      const gOk = checkPositive(issues, g, "gravityMs2", "Gravity");
      if (!["uniform", "energy-conserving"].includes(spec.motionMode)) {
        issues.push({
          code: "INVALID_MOTION_MODE",
          message: "motionMode must be 'uniform' or 'energy-conserving'",
          path: "motionMode",
        });
      }
      const constraint = spec.constraintKind ?? "string";
      if (
        !["string", "inside-track", "rigid-rod", "over-crest"].includes(
          constraint,
        )
      ) {
        issues.push({
          code: "INVALID_CONSTRAINT_KIND",
          message: `Unsupported vertical-circle constraintKind: ${String(constraint)}`,
          path: "constraintKind",
        });
      }
      const refPos =
        spec.referencePosition ??
        (spec.motionMode === "energy-conserving" ? "bottom" : "top");
      if (!["top", "bottom"].includes(refPos)) {
        issues.push({
          code: "INVALID_REFERENCE_POSITION",
          message: "referencePosition must be 'top' or 'bottom'",
          path: "referencePosition",
        });
      }
      const vOk =
        constraint === "rigid-rod"
          ? checkNonNegative(
              issues,
              spec.referenceSpeedMs,
              "referenceSpeedMs",
              "Reference speed",
            )
          : checkPositive(
              issues,
              spec.referenceSpeedMs,
              "referenceSpeedMs",
              "Reference speed",
            );

      if (mOk && rOk && gOk && vOk && issues.length === 0) {
        let topSpeedSq: number;
        if (spec.motionMode === "uniform") {
          topSpeedSq = spec.referenceSpeedMs ** 2;
        } else if (refPos === "bottom") {
          topSpeedSq = spec.referenceSpeedMs ** 2 - 4 * g * spec.radiusM;
        } else {
          topSpeedSq = spec.referenceSpeedMs ** 2;
        }

        if (topSpeedSq < -1e-7) {
          issues.push({
            code: "INSUFFICIENT_ENERGY_FOR_TOP",
            message:
              "Bottom speed is insufficient to reach the top of the vertical circle",
            path: "referenceSpeedMs",
          });
        } else {
          const vTop = Math.sqrt(Math.max(0, topSpeedSq));
          const vCrit = Math.sqrt(g * spec.radiusM);
          if (
            (constraint === "string" || constraint === "inside-track") &&
            vTop < vCrit - 1e-7
          ) {
            issues.push({
              code: "BELOW_MINIMUM_TOP_SPEED",
              message: `Top speed (${vTop.toFixed(4)} m/s) is below minimum critical speed sqrt(gR) = ${vCrit.toFixed(4)} m/s`,
              path: "referenceSpeedMs",
            });
          }
          if (constraint === "over-crest" && vTop > vCrit + 1e-7) {
            issues.push({
              code: "EXCEEDS_CREST_CONTACT_SPEED",
              message: `Crest speed (${vTop.toFixed(4)} m/s) exceeds contact limit sqrt(gR) = ${vCrit.toFixed(4)} m/s`,
              path: "referenceSpeedMs",
            });
          }
        }
      }
      break;
    }

    case "planetary-field-potential": {
      checkPositive(
        issues,
        spec.centralMassKg,
        "centralMassKg",
        "Central planet mass",
      );
      checkPositive(
        issues,
        spec.planetRadiusM,
        "planetRadiusM",
        "Planet radius",
      );
      checkPositive(issues, spec.probeRadiusM, "probeRadiusM", "Probe radius");
      if (spec.testMassKg !== undefined) {
        checkPositive(issues, spec.testMassKg, "testMassKg", "Test mass");
      }
      checkPositive(
        issues,
        spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT,
        "gravitationalConstant",
        "Gravitational constant G",
      );
      if (
        spec.plotQuantity !== undefined &&
        !["field-strength", "potential"].includes(spec.plotQuantity)
      ) {
        issues.push({
          code: "INVALID_PLOT_QUANTITY",
          message: "plotQuantity must be 'field-strength' or 'potential'",
          path: "plotQuantity",
        });
      }
      break;
    }

    case "circular-orbit-energy": {
      checkPositive(
        issues,
        spec.centralMassKg,
        "centralMassKg",
        "Central body mass",
      );
      const rCentralOk = checkPositive(
        issues,
        spec.centralRadiusM,
        "centralRadiusM",
        "Central body radius",
      );
      checkPositive(
        issues,
        spec.satelliteMassKg,
        "satelliteMassKg",
        "Satellite mass",
      );
      const rOrbOk = checkPositive(
        issues,
        spec.orbitRadiusM,
        "orbitRadiusM",
        "Orbital radius",
      );
      checkPositive(
        issues,
        spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT,
        "gravitationalConstant",
        "Gravitational constant G",
      );
      if (rCentralOk && rOrbOk && spec.orbitRadiusM <= spec.centralRadiusM) {
        issues.push({
          code: "ORBIT_INSIDE_CENTRAL_BODY",
          message: "Orbital radius must exceed central body radius",
          path: "orbitRadiusM",
        });
      }
      if (spec.targetOrbitRadiusM !== undefined) {
        const rTargetOk = checkPositive(
          issues,
          spec.targetOrbitRadiusM,
          "targetOrbitRadiusM",
          "Target orbital radius",
        );
        if (
          rCentralOk &&
          rTargetOk &&
          spec.targetOrbitRadiusM <= spec.centralRadiusM
        ) {
          issues.push({
            code: "TARGET_ORBIT_INSIDE_CENTRAL_BODY",
            message: "Target orbital radius must exceed central body radius",
            path: "targetOrbitRadiusM",
          });
        }
        if (
          rOrbOk &&
          rTargetOk &&
          Math.abs(spec.targetOrbitRadiusM - spec.orbitRadiusM) <=
            1e-9 * spec.orbitRadiusM
        ) {
          issues.push({
            code: "DEGENERATE_ORBITAL_TRANSFER",
            message:
              "Target orbital radius must differ from initial orbital radius",
            path: "targetOrbitRadiusM",
          });
        }
      }
      if (
        spec.diagramVariant !== undefined &&
        !["energy-curves", "orbit-schematic", "split-orbit-energy"].includes(
          spec.diagramVariant,
        )
      ) {
        issues.push({
          code: "INVALID_DIAGRAM_VARIANT",
          message: `Unsupported orbit diagramVariant: ${String(spec.diagramVariant)}`,
          path: "diagramVariant",
        });
      }
      break;
    }

    case "two-body-null-point": {
      const m1Ok = checkPositive(
        issues,
        spec.primaryMassKg,
        "primaryMassKg",
        "Primary mass M1",
      );
      const r1Ok = checkPositive(
        issues,
        spec.primaryRadiusM,
        "primaryRadiusM",
        "Primary radius R1",
      );
      const m2Ok = checkPositive(
        issues,
        spec.secondaryMassKg,
        "secondaryMassKg",
        "Secondary mass M2",
      );
      const r2Ok = checkPositive(
        issues,
        spec.secondaryRadiusM,
        "secondaryRadiusM",
        "Secondary radius R2",
      );
      const dOk = checkPositive(
        issues,
        spec.separationM,
        "separationM",
        "Center-to-center separation",
      );
      checkPositive(
        issues,
        spec.gravitationalConstant ?? GRAVITATIONAL_CONSTANT,
        "gravitationalConstant",
        "Gravitational constant G",
      );
      if (spec.testMassKg !== undefined) {
        checkPositive(issues, spec.testMassKg, "testMassKg", "Test mass");
      }

      if (m1Ok && r1Ok && m2Ok && r2Ok && dOk) {
        if (spec.separationM <= spec.primaryRadiusM + spec.secondaryRadiusM) {
          issues.push({
            code: "OVERLAPPING_BODIES",
            message:
              "Separation must exceed the sum of primary and secondary radii",
            path: "separationM",
          });
        } else {
          const root1 = Math.sqrt(spec.primaryMassKg);
          const root2 = Math.sqrt(spec.secondaryMassKg);
          const x0 = (root1 / (root1 + root2)) * spec.separationM;
          if (
            x0 <= spec.primaryRadiusM ||
            x0 >= spec.separationM - spec.secondaryRadiusM
          ) {
            issues.push({
              code: "NULL_POINT_INSIDE_BODY",
              message:
                "Collinear gravitational null point must lie outside both body interiors",
              path: "separationM",
            });
          }
        }

        if (spec.probeDistanceFromPrimaryM !== undefined) {
          const probeOk = checkPositive(
            issues,
            spec.probeDistanceFromPrimaryM,
            "probeDistanceFromPrimaryM",
            "Probe distance from primary",
          );
          if (
            probeOk &&
            (spec.probeDistanceFromPrimaryM < spec.primaryRadiusM ||
              spec.probeDistanceFromPrimaryM >
                spec.separationM - spec.secondaryRadiusM)
          ) {
            issues.push({
              code: "PROBE_OUTSIDE_INTERBODY_SPACE",
              message:
                "Probe position must lie on the segment between the two body surfaces",
              path: "probeDistanceFromPrimaryM",
            });
          }
        }
      }
      break;
    }

    case "stellar-radiation": {
      checkPositive(
        issues,
        spec.surfaceTempK,
        "surfaceTempK",
        "Stellar surface temperature",
      );
      const rOk = checkPositive(
        issues,
        spec.stellarRadiusM,
        "stellarRadiusM",
        "Stellar radius",
      );
      const dOk = checkPositive(
        issues,
        spec.distanceM,
        "distanceM",
        "Observer distance",
      );
      if (rOk && dOk && spec.distanceM <= spec.stellarRadiusM) {
        issues.push({
          code: "OBSERVER_INSIDE_STAR",
          message: "Observer distance must exceed stellar radius",
          path: "distanceM",
        });
      }
      checkPositive(
        issues,
        spec.wienConstantMK ?? WIEN_DISPLACEMENT_MK,
        "wienConstantMK",
        "Wien constant",
      );
      checkPositive(
        issues,
        spec.stefanBoltzmannWm2K4 ?? STEFAN_BOLTZMANN_WM2K4,
        "stefanBoltzmannWm2K4",
        "Stefan-Boltzmann constant",
      );
      if (spec.comparisonStar !== undefined) {
        checkPositive(
          issues,
          spec.comparisonStar.surfaceTempK,
          "comparisonStar.surfaceTempK",
          "Comparison star temperature",
        );
        checkPositive(
          issues,
          spec.comparisonStar.stellarRadiusM,
          "comparisonStar.stellarRadiusM",
          "Comparison star radius",
        );
      }
      if (
        spec.diagramVariant !== undefined &&
        !["blackbody-curve", "inverse-square"].includes(spec.diagramVariant)
      ) {
        issues.push({
          code: "INVALID_DIAGRAM_VARIANT",
          message: "diagramVariant must be 'blackbody-curve' or 'inverse-square'",
          path: "diagramVariant",
        });
      }
      break;
    }

    case "hr-diagram": {
      if (
        !Array.isArray(spec.stars) ||
        spec.stars.length < 1 ||
        spec.stars.length > 12
      ) {
        issues.push({
          code: "INVALID_STAR_LIST",
          message: "HR diagram requires between 1 and 12 stars",
          path: "stars",
        });
      } else {
        const seenIds = new Set<string>();
        spec.stars.forEach((star, index) => {
          if (!star.id || !star.id.trim()) {
            issues.push({
              code: "EMPTY_STAR_ID",
              message: "Star id must be non-empty",
              path: `stars[${index}].id`,
            });
          } else if (seenIds.has(star.id)) {
            issues.push({
              code: "DUPLICATE_STAR_ID",
              message: `Duplicate star id: ${star.id}`,
              path: `stars[${index}].id`,
            });
          } else {
            seenIds.add(star.id);
          }
          if (!star.label || !star.label.trim()) {
            issues.push({
              code: "EMPTY_STAR_LABEL",
              message: "Star label must be non-empty",
              path: `stars[${index}].label`,
            });
          }
          if (
            !Number.isFinite(star.surfaceTempK) ||
            star.surfaceTempK < 1500 ||
            star.surfaceTempK > 100000
          ) {
            issues.push({
              code: "INVALID_HR_TEMPERATURE",
              message: "HR star temperature must lie between 1500 K and 100000 K",
              path: `stars[${index}].surfaceTempK`,
            });
          }
          if (
            !Number.isFinite(star.luminositySolar) ||
            star.luminositySolar < 1e-6 ||
            star.luminositySolar > 1e8
          ) {
            issues.push({
              code: "INVALID_HR_LUMINOSITY",
              message:
                "HR star luminosity must lie between 1e-6 L_sun and 1e8 L_sun",
              path: `stars[${index}].luminositySolar`,
            });
          }
          if (
            star.region !== undefined &&
            ![
              "main-sequence",
              "red-giant",
              "supergiant",
              "white-dwarf",
            ].includes(star.region)
          ) {
            issues.push({
              code: "INVALID_HR_REGION",
              message: `Unsupported HR region: ${String(star.region)}`,
              path: `stars[${index}].region`,
            });
          }
        });
        if (
          spec.targetStarId !== undefined &&
          !seenIds.has(spec.targetStarId)
        ) {
          issues.push({
            code: "MISSING_TARGET_STAR",
            message: `targetStarId "${spec.targetStarId}" is not present in stars`,
            path: "targetStarId",
          });
        }
      }
      checkPositive(
        issues,
        spec.wienConstantMK ?? WIEN_DISPLACEMENT_MK,
        "wienConstantMK",
        "Wien constant",
      );
      checkPositive(
        issues,
        spec.stefanBoltzmannWm2K4 ?? STEFAN_BOLTZMANN_WM2K4,
        "stefanBoltzmannWm2K4",
        "Stefan-Boltzmann constant",
      );
      break;
    }

    case "stellar-parallax": {
      const pOk = checkPositive(
        issues,
        spec.parallaxArcsec,
        "parallaxArcsec",
        "Parallax angle",
      );
      if (pOk && spec.parallaxArcsec > 5) {
        issues.push({
          code: "PARALLAX_OUT_OF_SMALL_ANGLE_RANGE",
          message:
            "Stellar parallax angle must not exceed 5 arcseconds in small-angle parsec geometry",
          path: "parallaxArcsec",
        });
      }
      checkPositive(
        issues,
        spec.baselineAu ?? 1,
        "baselineAu",
        "Orbital baseline (AU)",
      );
      checkPositive(
        issues,
        spec.parsecM ?? PARSEC_M,
        "parsecM",
        "Parsec length in meters",
      );
      if (spec.stellarLuminosityW !== undefined) {
        checkPositive(
          issues,
          spec.stellarLuminosityW,
          "stellarLuminosityW",
          "Stellar luminosity",
        );
      }
      break;
    }

    case "cosmological-redshift": {
      const restOk = checkPositive(
        issues,
        spec.restWavelengthM,
        "restWavelengthM",
        "Rest wavelength",
      );
      const obsOk = checkPositive(
        issues,
        spec.observedWavelengthM,
        "observedWavelengthM",
        "Observed wavelength",
      );
      checkPositive(
        issues,
        spec.hubbleConstantKmSMpc ?? DEFAULT_HUBBLE_CONSTANT_KMS_MPC,
        "hubbleConstantKmSMpc",
        "Hubble constant H0",
      );
      checkPositive(
        issues,
        spec.speedOfLightMs ?? SPEED_OF_LIGHT_MS,
        "speedOfLightMs",
        "Speed of light c",
      );
      checkPositive(
        issues,
        spec.parsecM ?? PARSEC_M,
        "parsecM",
        "Parsec length in meters",
      );
      if (restOk && obsOk) {
        if (spec.observedWavelengthM <= spec.restWavelengthM) {
          issues.push({
            code: "NON_POSITIVE_REDSHIFT",
            message:
              "Cosmological redshift requires observedWavelengthM > restWavelengthM",
            path: "observedWavelengthM",
          });
        } else {
          const z =
            (spec.observedWavelengthM - spec.restWavelengthM) /
            spec.restWavelengthM;
          if (spec.lowRedshiftApprox !== false && z >= 1) {
            issues.push({
              code: "REDSHIFT_EXCEEDS_LINEAR_HUBBLE_REGIME",
              message:
                "Linear v = z c approximation requires z < 1 unless lowRedshiftApprox is set to false",
              path: "observedWavelengthM",
            });
          }
        }
      }
      if (
        spec.diagramVariant !== undefined &&
        !["spectral-shift", "hubble-plot"].includes(spec.diagramVariant)
      ) {
        issues.push({
          code: "INVALID_DIAGRAM_VARIANT",
          message: "diagramVariant must be 'spectral-shift' or 'hubble-plot'",
          path: "diagramVariant",
        });
      }
      break;
    }

    default: {
      const exhaustive: never = spec;
      issues.push({
        code: "UNSUPPORTED_SCENARIO_KIND",
        message: `Unsupported scenario: ${JSON.stringify(exhaustive)}`,
        path: "kind",
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
