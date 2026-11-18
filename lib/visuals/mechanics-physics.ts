export type MechanicsScenario =
  | { kind: "projectile-flight" }
  | {
      kind: "cart-collision";
      massXKg: number;
      massYKg: number;
      initialXMs: number;
      initialYMs: number;
      finalYMs: number;
    }
  | {
      kind: "circle-bottom";
      massKg: number;
      radiusM: number;
      speedMs: number;
      gravityMs2: number;
    }
  | {
      kind: "ramp-resistance";
      weightN: number;
      lengthM: number;
      heightM: number;
    }
  | {
      kind: "incline-friction";
      massKg: number;
      lengthM: number;
      angleDegrees: number;
      finalSpeedMs: number;
      gravityMs2: number;
    }
  | {
      kind: "pendulum-collision";
      massKg: number;
      targetMassKg: number;
      lengthM: number;
      gravityMs2: number;
    }
  | {
      kind: "elastic-rope";
      massKg: number;
      lengthM: number;
      extensionM: number;
      intervalS: number;
      gravityMs2: number;
    }
  | {
      kind: "truck";
      deflectionDegrees: number;
      inclineDegrees: number;
      radiusM: number;
      frictionCoefficient: number;
      massKg: number;
      initialSpeedMs: number;
      resistanceN: number;
      gravityMs2: number;
    };

export type MechanicsResults = Record<string, number | string>;
const positive = (name: string, value: number): number => {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be positive and finite`);
  return value;
};
const angle = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0 || value >= 90)
    throw new Error("Mechanics angle must be between zero and 90 degrees");
  return (value * Math.PI) / 180;
};
export function projectileFlightTime(
  speedMs: number,
  angleDegrees: number,
  gravityMs2: number,
): number {
  return (
    (2 * positive("Speed", speedMs) * Math.sin(angle(angleDegrees))) /
    positive("Gravity", gravityMs2)
  );
}
export function solveMechanicsScenario(
  scenario: MechanicsScenario,
): MechanicsResults {
  for (const [key, value] of Object.entries(scenario))
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`${key} must be finite`);
  switch (scenario.kind) {
    case "projectile-flight":
      return { flightTimeExpression: "2v sinθ/g" };
    case "cart-collision": {
      positive("Mass X", scenario.massXKg);
      positive("Mass Y", scenario.massYKg);
      const momentumBefore =
        scenario.massXKg * scenario.initialXMs +
        scenario.massYKg * scenario.initialYMs;
      return {
        finalXMs:
          (momentumBefore - scenario.massYKg * scenario.finalYMs) /
          scenario.massXKg,
        momentumBeforeKgMs: momentumBefore,
      };
    }
    case "circle-bottom": {
      const mass = positive("Mass", scenario.massKg),
        radius = positive("Radius", scenario.radiusM),
        speed = positive("Speed", scenario.speedMs),
        g = positive("Gravity", scenario.gravityMs2);
      return {
        tensionN: mass * (speed ** 2 / radius + g),
        centripetalForceN: (mass * speed ** 2) / radius,
      };
    }
    case "ramp-resistance": {
      const weight = positive("Weight", scenario.weightN),
        length = positive("Length", scenario.lengthM),
        height = positive("Height", scenario.heightM);
      if (height >= length)
        throw new Error("Ramp height must be smaller than its length");
      return {
        resistanceN: (weight * height) / length,
        lostPotentialEnergyJ: weight * height,
      };
    }
    case "incline-friction": {
      const mass = positive("Mass", scenario.massKg),
        length = positive("Length", scenario.lengthM),
        g = positive("Gravity", scenario.gravityMs2);
      const a = angle(scenario.angleDegrees);
      const speed = positive("Final speed", scenario.finalSpeedMs);
      const potentialJ = mass * g * length * Math.sin(a),
        kineticJ = (mass * speed ** 2) / 2;
      const frictionLossJ = potentialJ - kineticJ;
      if (frictionLossJ < 0)
        throw new Error(
          "Final kinetic energy exceeds the available gravitational energy",
        );
      return {
        potentialJ,
        kineticJ,
        frictionLossJ,
        frictionCoefficient: frictionLossJ / (mass * g * Math.cos(a) * length),
        workExplanation:
          "mgh is independent of ramp angle because force and distance compensate",
      };
    }
    case "pendulum-collision": {
      const mass = positive("Mass", scenario.massKg),
        target = positive("Target mass", scenario.targetMassKg),
        length = positive("String length", scenario.lengthM),
        g = positive("Gravity", scenario.gravityMs2);
      const bottomSpeedMs = Math.sqrt(2 * g * length),
        combinedSpeedMs = (mass * bottomSpeedMs) / (mass + target);
      return {
        bottomSpeedMs,
        tensionN: mass * (g + bottomSpeedMs ** 2 / length),
        combinedSpeedMs,
        riseM: combinedSpeedMs ** 2 / (2 * g),
      };
    }
    case "elastic-rope": {
      const mass = positive("Mass", scenario.massKg),
        length = positive("Natural length", scenario.lengthM),
        extension = positive("Extension", scenario.extensionM),
        interval = positive("Time interval", scenario.intervalS),
        g = positive("Gravity", scenario.gravityMs2);
      const speedAtAMs = Math.sqrt(2 * g * length);
      const springConstantNm =
        (2 * mass * g * (length + extension)) / extension ** 2;
      const tensionAtBN = springConstantNm * extension;
      return {
        speedAtAMs,
        springConstantNm,
        tensionAtBN,
        upwardAccelerationAtBMs2: tensionAtBN / mass - g,
        equilibriumAtB: "no, the resultant force is upward",
        meanRopeForceN: (mass * speedAtAMs) / interval + mass * g,
        hookeLaw: "F = kx within the elastic range",
      };
    }
    case "truck": {
      const g = positive("Gravity", scenario.gravityMs2),
        radius = positive("Road radius", scenario.radiusM),
        mu = positive("Friction coefficient", scenario.frictionCoefficient),
        mass = positive("Truck mass", scenario.massKg),
        speed = positive("Initial speed", scenario.initialSpeedMs),
        resistance = positive("Resistance", scenario.resistanceN);
      angle(scenario.inclineDegrees);
      if (mu > 2)
        throw new Error(
          "Friction coefficient is outside the supported road model",
        );
      const initialEnergyJ = (mass * speed ** 2) / 2,
        arcLengthM = Math.PI * radius,
        resistingWorkJ = resistance * arcLengthM;
      const remaining = initialEnergyJ - resistingWorkJ;
      return {
        accelerationMs2: g * Math.tan(angle(scenario.deflectionDegrees)),
        constantSpeedVerticalAngleDegrees: 0,
        maximumCornerSpeedMs: Math.sqrt(mu * g * radius),
        arcLengthM,
        stoppingDistanceM: initialEnergyJ / resistance,
        initialEnergyJ,
        resistingWorkJ,
        reachesStation: remaining >= 0 ? "yes" : "no",
        arrivalSpeedMs: Math.sqrt(Math.max(0, (2 * remaining) / mass)),
      };
    }
    default: {
      const exhaustive: never = scenario;
      throw new Error(`Unsupported mechanics scenario: ${exhaustive}`);
    }
  }
}
