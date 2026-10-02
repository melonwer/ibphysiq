import { AxisSpec } from "./types";

export function measurementAxisTicks(
  domain: [number, number],
): Pick<AxisSpec, "tickStrategy" | "tickValues" | "minorTickStep"> {
  const [minimum, maximum] = domain;
  const interval = maximum - minimum;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || interval <= 0)
    throw new Error("Measurement axis needs an increasing finite domain");
  const targetStep = interval / 10;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = [1, 2, 5, 10].map(multiplier => multiplier * magnitude)
    .find(candidate => candidate >= targetStep * (1 - 1e-12));
  if (step === undefined) throw new Error("Measurement axis step is unsupported");
  const first = Math.ceil(minimum / step - 1e-12);
  const last = Math.floor(maximum / step + 1e-12);
  return {
    tickStrategy: "fixed",
    tickValues: Array.from({ length: last - first + 1 }, (_, index) =>
      Number(((first + index) * step).toPrecision(12))),
    minorTickStep: Number((step / 2).toPrecision(12)),
  };
}
