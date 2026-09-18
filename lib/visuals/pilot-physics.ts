import { PilotFixture } from "./pilot-fixtures";
import { Point2D } from "./types";

/** Exact area under a piecewise-linear graph, including vertical jumps. */
export function integratePolyline(
  points: readonly Point2D[],
  start: number,
  end: number,
): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error("Invalid integration interval");
  }
  let total = 0;
  let covered = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.x < previous.x)
      throw new Error("Polyline x values must be ordered");
    if (current.x === previous.x) continue;
    const left = Math.max(start, previous.x);
    const right = Math.min(end, current.x);
    if (right <= left) continue;
    const ordinate = (x: number) =>
      previous.y +
      ((current.y - previous.y) * (x - previous.x)) / (current.x - previous.x);
    total += ((ordinate(left) + ordinate(right)) * (right - left)) / 2;
    covered += right - left;
  }
  if (Math.abs(covered - (end - start)) > 1e-7) {
    throw new Error("Polyline does not cover integration interval");
  }
  return total;
}

export function kineticEnergyFraction(
  time: number,
  angularFrequency: number,
): number {
  return Math.sin(angularFrequency * time) ** 2;
}

export function computePilotMetric(fixture: PilotFixture): number {
  const { kind, inputs } = fixture.check;
  const points = Object.values(fixture.data)[0];
  const area = () => {
    if (!points) throw new Error("Plot has no public series");
    return integratePolyline(points, inputs.start ?? 0, inputs.end);
  };
  switch (kind) {
    case "area-speed":
      return area();
    case "mean-force":
      return (area() / (inputs.end - inputs.start)) * inputs.mass;
    case "dissipated-energy":
      return (Math.abs(area()) * inputs.mass) / 1000;
    case "harmonic-speed": {
      const frequency = (2 * Math.PI) / inputs.period;
      return Math.abs(
        inputs.amplitude * frequency * Math.cos(frequency * inputs.time),
      );
    }
    case "work-speed":
      return Math.sqrt((2 * area() * inputs.forceScale) / inputs.mass);
    case "terminal-drag-speed": {
      const buoyancy = inputs.density * inputs.volume * inputs.gravity;
      return (
        (buoyancy - inputs.weight) /
        (6 * Math.PI * inputs.viscosity * inputs.radius)
      );
    }
    case "spring-max-speed": {
      const minimumExtension = Math.sqrt(
        (2 * inputs.energyMin) / inputs.springConstant,
      );
      const maximumExtension = Math.sqrt(
        (2 * inputs.energyMax) / inputs.springConstant,
      );
      const amplitude = (maximumExtension - minimumExtension) / 2;
      return ((2 * Math.PI) / inputs.period) * amplitude;
    }
    case "harmonic-max-acceleration":
      return inputs.angularFrequency ** 2 * inputs.amplitude;
  }
}
