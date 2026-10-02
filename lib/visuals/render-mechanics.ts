import { validateVisualSpec } from "./template-registry";
import { MechanicsLabel, MechanicsPanel, Point2D, VisualSpec } from "./types";

const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
const num = (value: number): string => String(Number(value.toFixed(4)));

export function renderMechanicsScene(
  spec: VisualSpec<"mechanics_scene">,
  options: { width?: number; height?: number } = {},
): string {
  const count = spec.payload.panels.length;
  const width = options.width ?? (count > 1 ? 960 : 620);
  const height = options.height ?? 430;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 1800 ||
    height < 240 ||
    height > 1400
  )
    throw new Error("Invalid mechanics SVG dimensions");
  const validation = validateVisualSpec(spec);
  if (!validation.valid)
    throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  if (
    spec.layers?.length ||
    count < 1 ||
    count > 3 ||
    spec.composition?.kind !== (count === 1 ? "single" : "panel-grid") ||
    (count > 1 && spec.composition.columns !== count)
  )
    throw new Error("Unsupported mechanics composition");
  if (
    spec.visibility.labelMode !== "allowlist" ||
    spec.visibility.altTextMode !== "student-safe"
  )
    throw new Error("Mechanics student rendering requires an allowlist");
  if (new Set(spec.payload.panels.map((p) => p.id)).size !== count)
    throw new Error("Mechanics panel IDs must be unique");
  const publicIds = new Set(spec.visibility.publicParameterIds);
  const point = (value: Point2D) => {
    if (
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      value.x < 0 ||
      value.x > 1 ||
      value.y < 0 ||
      value.y > 1
    )
      throw new Error("Invalid normalized mechanics point");
  };
  const visible = (label?: MechanicsLabel) => {
    if (label && (!label.text.trim() || !publicIds.has(label.parameterId)))
      throw new Error("Private or unbound mechanics label");
  };
  const marker = `mechanics-arrow-${spec.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const descriptions: string[] = [];
  const renderPanel = (panel: MechanicsPanel, index: number): string => {
    const ids = [
      panel.id,
      ...panel.bodies.map((p) => p.id),
      ...panel.paths.map((p) => p.id),
      ...panel.vectors.map((p) => p.id),
      ...panel.angles.map((p) => p.id),
    ];
    if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length)
      throw new Error("Mechanics primitive IDs must be unique");
    if (!panel.bodies.length) throw new Error("Mechanics scene needs a body");
    const tileWidth = width / count;
    const size = Math.min(tileWidth - 40, height - 70);
    if (size < 180) throw new Error("Mechanics panels are too small to read");
    const x = (value: number) =>
      index * tileWidth + (tileWidth - size) / 2 + value * size;
    const y = (value: number) => 25 + value * size;
    const lines: string[] = [];
    const text = (
      label: MechanicsLabel | undefined,
      at: Point2D,
      dx = 0,
      dy = -14,
    ) => {
      visible(label);
      if (label) {
        descriptions.push(label.text);
        lines.push(
          `<text x="${num(x(at.x) + dx)}" y="${num(y(at.y) + dy)}" text-anchor="middle">${escapeXml(label.text)}</text>`,
        );
      }
    };
    for (const path of panel.paths) {
      if (
        !["surface", "connector", "trajectory", "dimension", "spring"].includes(
          path.kind,
        ) ||
        path.points.length < 2
      )
        throw new Error("Unsupported mechanics path");
      path.points.forEach(point);
      visible(path.label);
      const pts = path.points
        .map((p) => `${num(x(p.x))},${num(y(p.y))}`)
        .join(" ");
      const arrows =
        path.kind === "dimension"
          ? ` marker-start="url(#${marker})" marker-end="url(#${marker})"`
          : "";
      const dash = path.dashed ? ' stroke-dasharray="6 4"' : "";
      lines.push(
        `<${path.closed ? "polygon" : "polyline"} points="${pts}" fill="none" stroke="#202020" stroke-width="${path.kind === "surface" ? "2" : "1.5"}"${arrows}${dash}/>`,
      );
      const first = path.points[0],
        last = path.points[path.points.length - 1];
      const vertical = Math.abs(first.x - last.x) < 0.02;
      text(
        path.label,
        { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
        vertical ? 37 : 0,
        vertical ? 0 : -10,
      );
    }
    for (const body of panel.bodies) {
      point(body.position);
      if (
        !Number.isFinite(body.angleDegrees) ||
        !["block", "ball", "cart"].includes(body.kind)
      )
        throw new Error("Unsupported mechanics body");
      visible(body.label);
      const cx = x(body.position.x),
        cy = y(body.position.y);
      if (body.kind === "ball")
        lines.push(
          `<circle cx="${num(cx)}" cy="${num(cy)}" r="7" fill="white" stroke="#202020" stroke-width="2"/>`,
        );
      else {
        lines.push(
          `<g transform="translate(${num(cx)} ${num(cy)}) rotate(${num(body.angleDegrees)})"><rect x="-19" y="-13" width="38" height="26" fill="white" stroke="#202020" stroke-width="2"/>${body.kind === "cart" ? '<circle cx="-12" cy="17" r="4"/><circle cx="12" cy="17" r="4"/>' : ""}</g>`,
        );
      }
      text(body.label, body.position, 0, body.kind === "ball" ? 26 : -25);
    }
    for (const vector of panel.vectors) {
      const body = panel.bodies.find((p) => p.id === vector.originRef);
      if (
        !body ||
        !Number.isFinite(vector.direction.x) ||
        !Number.isFinite(vector.direction.y) ||
        Math.hypot(vector.direction.x, vector.direction.y) === 0
      )
        throw new Error("Invalid mechanics vector origin or direction");
      const end = {
        x: body.position.x + vector.direction.x,
        y: body.position.y + vector.direction.y,
      };
      point(end);
      visible(vector.label);
      lines.push(
        `<line x1="${num(x(body.position.x))}" y1="${num(y(body.position.y))}" x2="${num(x(end.x))}" y2="${num(y(end.y))}" stroke="#202020" stroke-width="2" marker-end="url(#${marker})"/>`,
      );
      text(vector.label, end, 0, -12);
    }
    for (const angle of panel.angles) {
      point(angle.vertex);
      visible(angle.label);
      if (
        !Number.isFinite(angle.startDegrees) ||
        !Number.isFinite(angle.endDegrees) ||
        Math.abs(angle.endDegrees - angle.startDegrees) > 180
      )
        throw new Error("Invalid mechanics angle");
      const radius = 32;
      const a = (angle.startDegrees * Math.PI) / 180,
        b = (angle.endDegrees * Math.PI) / 180;
      const cx = x(angle.vertex.x),
        cy = y(angle.vertex.y);
      lines.push(
        `<path d="M ${num(cx + radius * Math.cos(a))} ${num(cy - radius * Math.sin(a))} A ${radius} ${radius} 0 0 ${b > a ? 0 : 1} ${num(cx + radius * Math.cos(b))} ${num(cy - radius * Math.sin(b))}" fill="none" stroke="#202020"/>`,
      );
      const mid = (a + b) / 2;
      text(
        angle.label,
        {
          x: angle.vertex.x + (48 * Math.cos(mid)) / size,
          y: angle.vertex.y - (48 * Math.sin(mid)) / size,
        },
        0,
        4,
      );
    }
    return lines.join("");
  };
  const rendered = spec.payload.panels.map(renderPanel).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>Mechanics diagram</title><desc>${escapeXml([...new Set(descriptions)].join("; "))}</desc><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><g font-family="Arial, sans-serif" font-size="15">${rendered}<text x="${width / 2}" y="${height - 12}" text-anchor="middle" font-size="12">Diagrams not to scale</text></g></svg>`;
}
