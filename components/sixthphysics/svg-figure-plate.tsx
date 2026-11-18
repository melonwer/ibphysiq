'use client';

import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MathText } from '@/components/sixthphysics/math-text';

export interface SvgFigurePlateProps {
  svgMarkup: string;
  questionId: string;
  className?: string;
  /** Disable physics label typesetting (raw generator labels). Defaults to `true`. */
  typeset?: boolean;
  /** Disable tight content framing of the viewBox. Defaults to `true`. */
  autoFrame?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Typography tokens                                                          */
/* -------------------------------------------------------------------------- */

/** Word labels: the app's Plus Jakarta Sans (next/font variable) with safe fallbacks. */
export const SVG_SANS_STYLE_STACK =
  "var(--font-jakarta), 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Presentation-attribute fallback (CSS variables are not valid in SVG attributes). */
export const SVG_SANS_ATTR_STACK =
  "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
/** Italic physics symbols: KaTeX's own math italic so diagrams match stem/option math. */
export const SVG_MATH_FAMILY =
  "KaTeX_Math, 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', Georgia, serif";

const SUB_SIZE = '72%';
const SUB_DY = '0.36em';
const SUB_DY_RESET = '-0.36em';
const SUP_DY = '-0.62em';
const SUP_DY_RESET = '0.62em';
const SYMBOL_SIZE = '116%';
const ZWSP = '&#8203;';
const LABEL_SIZE_BOOST = 1.08;

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/* -------------------------------------------------------------------------- */
/*  Entity helpers                                                             */
/* -------------------------------------------------------------------------- */

function decodeXmlEntities(raw: string): string {
  return raw.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g,
    (_full, ent: string) => {
      if (ent[0] === '#') {
        const code =
          ent[1] === 'x' || ent[1] === 'X'
            ? parseInt(ent.slice(2), 16)
            : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      }
      switch (ent) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        case 'nbsp':
          return '\u00a0';
        default:
          return '';
      }
    }
  );
}

function escapeXmlText(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* -------------------------------------------------------------------------- */
/*  Physics label typesetter                                                   */
/* -------------------------------------------------------------------------- */

const UNI_SUP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6',
  '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(',
  '⁾': ')', ⁿ: 'n',
};

const UNI_SUB: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6',
  '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−', '₌': '=', '₍': '(',
  '₎': ')', ₐ: 'a', ₑ: 'e', ₒ: 'o', ₓ: 'x', ₕ: 'h', ₖ: 'k', ₗ: 'l',
  ₘ: 'm', ₙ: 'n', ₚ: 'p', ᵣ: 'r', ₛ: 's', ₜ: 't',
};

const LETTER = 'A-Za-zα-ωΑ-Ωµϑϕ';
const SUB_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚᵣₛₜ';
const SUP_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ';

/** Standalone upper-case labels that are physical quantities (not points, meters, or foci). */
const UPPER_QUANTITY_LABELS = new Set(['N', 'T', 'E', 'I', 'L', 'R', 'W']);

export type SvgLabelFragment =
  | { kind: 'text'; value: string }
  | { kind: 'symbol'; value: string; italic: boolean }
  | { kind: 'sub'; value: string }
  | { kind: 'sup'; value: string };

const LABEL_PATTERN = new RegExp(
  [
    // underscore subscript with 1-3 letter base: v_ideal, μ_s, E_k,max, V_g
    `(?<![${LETTER}])(?<usBase>[${LETTER}]{1,3})(?<usPrime>[′']?)_(?:\\{(?<usBraced>[^}]{1,24})\\}|(?<usPlain>[A-Za-z0-9α-ωΑ-Ω]{1,14}(?:,[A-Za-z0-9α-ωΑ-Ω]{1,10})?))`,
    // bracket subscript: (L/A)_max
    `(?<=[)\\]])_(?:\\{(?<bsBraced>[^}]{1,24})\\}|(?<bsPlain>[A-Za-z0-9α-ωΑ-Ω]{1,14}))`,
    // unicode subscript run attached to a single-letter base: T₁, εᵣ, Cₚ₂
    `(?<![${LETTER}])(?<ubBase>[${LETTER}])(?<ubPrime>[′']?)(?<ub>[${SUB_CHARS}]+)`,
    // unicode superscript run attached to a symbol, digit, or bracket: m s⁻¹, 10⁻³, c²
    `(?<=[${LETTER}0-9)′])(?<usup>[${SUP_CHARS}]+)`,
    // caret exponent: 10^-3, r^2, e^(−t/RC), 10^{8}
    `(?<=[${LETTER}0-9)}\\]])\\^(?:\\{(?<cBraced>[^}]{1,24})\\}|\\((?<cParen>[^()]{1,24})\\)|(?<cPlain>[+\\-−]?\\d+(?:\\.\\d+)?|[A-Za-zα-ω]))`,
    // any stray underscore/caret: never leave them raw
    `(?<strayOp>[_^])(?<strayArg>[^\\s_^]{0,14})`,
  ].join('|'),
  'gu'
);

function mapChars(raw: string, table: Record<string, string>): string {
  return Array.from(raw)
    .map((ch) => table[ch] ?? ch)
    .join('');
}

function normalizeMinus(raw: string): string {
  return raw.replace(/-/g, '−');
}

/** Splits a multi-letter base like `Δm` or `Σm` into an upright operator + a symbol. */
function pushBase(out: SvgLabelFragment[], base: string, prime: string) {
  const chars = Array.from(base);
  if (chars.length === 1) {
    out.push({ kind: 'symbol', value: base + prime, italic: true });
    return;
  }
  if (chars.length === 2 && /[ΔΣδ∂]/u.test(chars[0])) {
    out.push({ kind: 'text', value: chars[0] });
    out.push({ kind: 'symbol', value: chars[1] + prime, italic: true });
    return;
  }
  out.push({ kind: 'text', value: base + prime });
}

/**
 * Phase 1: lexes subscripts/superscripts out of a decoded label.
 */
function lexLabel(label: string): SvgLabelFragment[] {
  const out: SvgLabelFragment[] = [];
  let last = 0;
  for (const m of label.matchAll(LABEL_PATTERN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: 'text', value: label.slice(last, idx) });
    const g = m.groups ?? {};
    if (g.usBase !== undefined) {
      pushBase(out, g.usBase, g.usPrime ?? '');
      out.push({ kind: 'sub', value: g.usBraced ?? g.usPlain ?? '' });
    } else if (g.bsBraced !== undefined || g.bsPlain !== undefined) {
      out.push({ kind: 'sub', value: g.bsBraced ?? g.bsPlain ?? '' });
    } else if (g.ubBase !== undefined) {
      pushBase(out, g.ubBase, g.ubPrime ?? '');
      out.push({ kind: 'sub', value: mapChars(g.ub, UNI_SUB) });
    } else if (g.usup !== undefined) {
      out.push({ kind: 'sup', value: mapChars(g.usup, UNI_SUP) });
    } else if (
      g.cBraced !== undefined ||
      g.cParen !== undefined ||
      g.cPlain !== undefined
    ) {
      out.push({
        kind: 'sup',
        value: normalizeMinus(g.cBraced ?? g.cParen ?? g.cPlain ?? ''),
      });
    } else if (g.strayOp !== undefined) {
      const arg = g.strayArg ?? '';
      if (arg) {
        out.push({
          kind: g.strayOp === '^' ? 'sup' : 'sub',
          value: g.strayOp === '^' ? normalizeMinus(arg) : arg,
        });
      }
    }
    last = idx + m[0].length;
  }
  if (last < label.length) out.push({ kind: 'text', value: label.slice(last) });
  return out;
}

const STANDALONE_SYMBOL = new RegExp(
  `(?<![${LETTER}0-9])(?<delta>Δ)?(?<sym>[A-Za-zα-ω])(?<prime>[′']?)(?![${LETTER}])`,
  'gu'
);

/** Equation segments whose right-hand side has no digits are symbolic (`λ = h / p`, `B = Δm c²`). */
function symbolicSegmentRanges(label: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  const parts = label.split(/(\||,\s|:\s)/);
  for (const part of parts) {
    const end = start + part.length;
    const eq = part.indexOf('=');
    if (eq !== -1 && !/\d/.test(part.slice(eq + 1)) && /[A-Za-zα-ω]/.test(part)) {
      ranges.push([start, end]);
    }
    start = end;
  }
  return ranges;
}

/**
 * Phase 2: decides which single letters in plain text runs are physics variables (italic)
 * versus units, point labels, or meter glyphs (upright).
 */
function markSymbols(
  label: string,
  frags: SvgLabelFragment[],
  uprightLabels?: ReadonlySet<string>
): SvgLabelFragment[] {
  const flat = frags
    .map((f) => (f.kind === 'text' || f.kind === 'symbol' ? f.value : '\u0001'))
    .join('');
  const symbolic = symbolicSegmentRanges(flat);
  const trimmedWhole = label
    .trim()
    .replace(/^[+−-]\s*/, '')
    .replace(/[′']$/, '');

  const out: SvgLabelFragment[] = [];
  let offset = 0;
  for (const frag of frags) {
    if (frag.kind !== 'text') {
      out.push(frag);
      offset += frag.kind === 'symbol' ? frag.value.length : 1;
      continue;
    }
    const text = frag.value;
    let last = 0;
    for (const m of text.matchAll(STANDALONE_SYMBOL)) {
      const idx = m.index ?? 0;
      const g = m.groups ?? {};
      const sym = g.sym;
      const absStart = offset + idx;
      const before = flat.slice(0, absStart + (g.delta ? 1 : 0));
      const after = flat.slice(absStart + m[0].length);
      const isGreek = /[α-ω]/u.test(sym);
      const afterDigitSpace = /\d\s*$/.test(before.replace(/Δ$/, ''));

      let italic = false;
      if (isGreek) italic = true;
      else if (g.delta) italic = true;
      else if (afterDigitSpace) italic = false;
      else if (/^\s*(=|≈|≠|<|>|≤|≥|\()/.test(after)) italic = true;
      else if (/\($/.test(before) && /^\)/.test(after)) italic = true;
      else if (/(^|\s)$/.test(before) && /^\s*\/(?!\/)/.test(after)) italic = true;
      else if (symbolic.some(([s, e]) => absStart >= s && absStart < e)) italic = true;
      else if (/[a-z]/.test(sym) && /[A-Za-z]{3,}\s$/.test(before) && /^\s*$/.test(after)) {
        // Axis caption ending in its symbol: `molecular speed v`
        italic = true;
      } else if (trimmedWhole === sym) {
        italic =
          (/[a-z]/.test(sym) || UPPER_QUANTITY_LABELS.has(sym)) && !uprightLabels?.has(sym);
      }

      if (!italic) continue;
      if (idx > last) out.push({ kind: 'text', value: text.slice(last, idx) });
      if (g.delta) out.push({ kind: 'text', value: 'Δ' });
      out.push({ kind: 'symbol', value: sym + (g.prime ?? ''), italic: true });
      last = idx + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
    offset += text.length;
  }
  return out;
}

/**
 * Typesets one decoded SVG label into fragments (exported for tests / previews).
 */
export function typesetSvgLabel(
  rawLabel: string,
  options: { uprightLabels?: ReadonlySet<string> } = {}
): SvgLabelFragment[] {
  const label = rawLabel
    // `25 °` -> `25°` (keep `° C` tight too)
    .replace(/(\d)\s+°/g, '$1°')
    .replace(/°\s+C\b/g, '°C')
    // ASCII hyphen used as a sign: `-12 nC` -> `−12 nC`
    .replace(/(^|[\s(=])-(?=\d)/g, '$1−')
    // Legend shorthands `Ek`, `Ep`, `Etot` -> subscripted energies
    .replace(/(?<![A-Za-z])E(k|p|tot)(?![A-Za-z])/g, 'E_$1');
  return markSymbols(label, lexLabel(label), options.uprightLabels);
}

function fragmentsToTspans(frags: SvgLabelFragment[]): string {
  let out = '';
  for (const f of frags) {
    switch (f.kind) {
      case 'text':
        out += escapeXmlText(f.value);
        break;
      case 'symbol':
        out += f.italic
          ? `<tspan font-family="${SVG_MATH_FAMILY}" font-style="italic" font-size="${SYMBOL_SIZE}">${escapeXmlText(f.value)}</tspan>`
          : escapeXmlText(f.value);
        break;
      case 'sub':
        out += `<tspan font-size="${SUB_SIZE}" dy="${SUB_DY}">${escapeXmlText(f.value)}</tspan><tspan font-size="${SUB_SIZE}" dy="${SUB_DY_RESET}">${ZWSP}</tspan>`;
        break;
      case 'sup':
        out += `<tspan font-size="${SUB_SIZE}" dy="${SUP_DY}">${escapeXmlText(f.value)}</tspan><tspan font-size="${SUB_SIZE}" dy="${SUP_DY_RESET}">${ZWSP}</tspan>`;
        break;
    }
  }
  return out;
}

const GENERIC_FONT_RE = /\bfont-family=(["'])([^"']*)\1/g;

function upgradeFontAttributes(attrs: string): string {
  let next = attrs;
  let hadFamily = false;
  next = next.replace(GENERIC_FONT_RE, (full, _q: string, value: string) => {
    if (/arial|helvetica|verdana/i.test(value)) {
      hadFamily = true;
      return `font-family="${SVG_SANS_ATTR_STACK}"`;
    }
    return full;
  });
  // Generator bug: `style="italic"` is not valid CSS; promote to the presentation attribute.
  next = next.replace(/\bstyle=(["'])italic\1/g, 'font-style="italic"');
  if (hadFamily) {
    if (/\bstyle=(["'])/.test(next)) {
      next = next.replace(
        /\bstyle=(["'])([^"']*)\1/,
        (_f, q: string, css: string) =>
          `style=${q}font-family:${SVG_SANS_STYLE_STACK.replace(/'/g, q === "'" ? '"' : "'")};${css}${q}`
      );
    } else {
      next += ` style="font-family:${SVG_SANS_STYLE_STACK}"`;
    }
  }
  return next;
}

/**
 * Typesets every visible `<text>` label in an SVG: subscripts/superscripts become
 * `<tspan>`s, single-letter physics variables become KaTeX-italic, generic Arial is
 * upgraded to the app's Plus Jakarta Sans, and `25 °` is tightened to `25°`.
 * Raw `_` / `^` never survive inside a `<text>` node.
 */
export function typesetSvgMarkup(svgMarkup: string): string {
  if (!svgMarkup) return '';

  // Standing-wave diagrams label nodes/antinodes `N`/`A`: points, not quantities.
  const uprightLabels = new Set<string>();
  if (/>\s*N\s*<\/text>/.test(svgMarkup) && />\s*A\s*<\/text>/.test(svgMarkup)) {
    uprightLabels.add('N');
  }

  let out = svgMarkup;
  // Banked-curve cross-sections draw the ideal speed perpendicular to the page.
  if (/aria-label="[^"]*\bBanked\b/i.test(out)) {
    out = out.replace(/(<text\b[^>]*>)\s*v_ideal\s*(<\/text>)/g, '$1v_ideal (into page)$2');
  }

  // Screen-reader text (`<desc>`, `aria-label`) reads `a c`, `μ s` instead of `a_c`, `μ_s`.
  out = out
    .replace(/(<desc>)([\s\S]*?)(<\/desc>)/g, (_f, o: string, body: string, c: string) => o + readableA11yText(body) + c)
    .replace(/(<svg\b[^>]*\baria-label=")([^"]*)(")/, (_f, o: string, body: string, c: string) => o + readableA11yText(body) + c);

  // Upgrade generic font stacks on any element (typically the root `<g>` or `<text>`).
  out = out.replace(
    /<(g|text|svg|tspan)\b([^>]*?)(\/?)>/g,
    (full, tag: string, attrs: string, selfClose: string) => {
      const upgraded = upgradeFontAttributes(attrs);
      return upgraded === attrs ? full : `<${tag}${upgraded}${selfClose}>`;
    }
  );

  // Small generator labels (11–14 px in 700+ px canvases) read as ~10 px once scaled into the
  // compact plate; nudge them up so labels stay legible beside the 16 px stem.
  out = out.replace(/<(text|g)\b([^>]*?)>/g, (full, tag: string, attrs: string) => {
    const fs = attrs.match(/\sfont-size=(["'])(\d+(?:\.\d+)?)(?:px)?\1/);
    if (!fs || /data-sp-fs=/.test(attrs)) return full;
    const size = parseFloat(fs[2]);
    if (!(size > 0 && size <= 14)) return full;
    const bumped = fmt(size * LABEL_SIZE_BOOST);
    return `<${tag}${attrs.replace(fs[0], ` font-size="${bumped}"`)} data-sp-fs="${fs[2]}">`;
  });

  out = out.replace(
    /(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g,
    (_full, open: string, inner: string, close: string) => {
      // Typeset only character data between any nested tags.
      const body = inner.replace(/(^|>)([^<]+)(?=<|$)/g, (_m, lead: string, chunk: string) => {
        const decoded = decodeXmlEntities(chunk);
        if (!decoded.trim()) return lead + chunk;
        return lead + fragmentsToTspans(typesetSvgLabel(decoded, { uprightLabels }));
      });
      return open + body + close;
    }
  );

  return tidyStackedLegends(out);
}

/** Makes `_` / `^` notation readable for assistive tech without changing meaning. */
export function readableA11yText(raw: string): string {
  return raw
    .replace(/(\d)\s+°/g, '$1°')
    .replace(/_\{([^}]*)\}/g, ' $1')
    .replace(/(?<=\S)_(?=\S)/g, ' ')
    .replace(/\^\{([^}]*)\}|\^\(([^)]*)\)|\^(\S+)/g, (_f, a?: string, b?: string, c?: string) => ` to the power ${a ?? b ?? c ?? ''}`);
}

interface RawTextNode {
  start: number;
  end: number;
  open: string;
  inner: string;
  x: number;
  y: number;
  anchor: string;
  fontSize: number;
}

function readTextNodes(markup: string): RawTextNode[] {
  const nodes: RawTextNode[] = [];
  for (const m of markup.matchAll(/(<text\b([^>]*)>)([\s\S]*?)<\/text>/g)) {
    const attrs = m[2];
    nodes.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      open: m[1],
      inner: m[3],
      x: parseFloat(attr(attrs, 'x') ?? 'NaN'),
      y: parseFloat(attr(attrs, 'y') ?? 'NaN'),
      anchor: attr(attrs, 'text-anchor') ?? 'start',
      fontSize: parseFloat(attr(attrs, 'font-size') ?? '13') || 13,
    });
  }
  return nodes;
}

function visibleLength(inner: string): number {
  return Array.from(decodeXmlEntities(inner.replace(/<[^>]+>/g, '')).replace(/\u200b/g, '')).length;
}

/**
 * Groups left-aligned label columns near the top of a figure (e.g. the bobsleigh's
 * `r = 215 m` / `v_ideal` / `Smooth bank` stack) into one tidy legend card at a single size.
 */
export function tidyStackedLegends(markup: string): string {
  const vb = parseViewBox(markup);
  if (!vb) return markup;
  const nodes = readTextNodes(markup).filter(
    (n) =>
      n.anchor === 'start' &&
      Number.isFinite(n.x) &&
      Number.isFinite(n.y) &&
      !/\btransform=/.test(n.open) &&
      n.y < vb.y + vb.height * 0.4 &&
      // Legends live at the left; right-hand value columns belong to level lines.
      n.x < vb.x + vb.width * 0.5
  );
  // Horizontal rules (energy levels, axes) that a legend card must not cover.
  const rules: Array<{ y: number; x1: number; x2: number }> = [];
  for (const m of markup.matchAll(/<line\b([^>]*)\/?>/g)) {
    const y1 = parseFloat(attr(m[1], 'y1') ?? 'NaN');
    const y2 = parseFloat(attr(m[1], 'y2') ?? 'NaN');
    if (!Number.isFinite(y1) || Math.abs(y1 - y2) > 1) continue;
    const xa = parseFloat(attr(m[1], 'x1') ?? '0');
    const xb = parseFloat(attr(m[1], 'x2') ?? '0');
    rules.push({ y: y1, x1: Math.min(xa, xb), x2: Math.max(xa, xb) });
  }
  const byX = new Map<string, RawTextNode[]>();
  for (const n of nodes) {
    const key = n.x.toFixed(1);
    byX.set(key, [...(byX.get(key) ?? []), n]);
  }
  const edits: Array<{ at: number; insert?: string; replace?: [number, number, string] }> = [];
  for (const column of byX.values()) {
    if (column.length < 2) continue;
    column.sort((a, b) => a.y - b.y);
    const runs: RawTextNode[][] = [];
    let run: RawTextNode[] = [column[0]];
    for (let i = 1; i < column.length; i++) {
      const prev = run[run.length - 1];
      const gap = column[i].y - prev.y;
      const fs = Math.max(prev.fontSize, column[i].fontSize);
      if (gap >= fs * 1.2 && gap <= fs * 3.2) run.push(column[i]);
      else {
        runs.push(run);
        run = [column[i]];
      }
    }
    runs.push(run);
    for (const r of runs) {
      if (r.length < 2 || r.length > 6) continue;
      const fs = Math.max(...r.map((n) => n.fontSize));
      const width = Math.max(...r.map((n) => visibleLength(n.inner))) * fs * 0.6;
      const x = r[0].x - 10;
      const y = r[0].y - fs * 1.05 - 6;
      const h = r[r.length - 1].y - r[0].y + fs * 1.4 + 12;
      // Only free-standing stacks: no horizontal rule within the card (plus a line-height).
      const blocked = rules.some(
        (rule) =>
          rule.y > y - fs &&
          rule.y < y + h + fs &&
          rule.x2 > x - fs &&
          rule.x1 < x + width + 20 + fs
      );
      // Labels sitting on a level line's row (energy-level captions) are not a legend.
      const alignedWithRule = r.some((n) =>
        rules.some((rule) => rule.y > n.y - n.fontSize * 1.5 && rule.y < n.y + n.fontSize * 0.8)
      );
      if (blocked || alignedWithRule) continue;
      edits.push({
        at: r[0].start,
        insert: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width + 20)}" height="${fmt(h)}" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" data-sp-legend="1"/>`,
      });
      for (const n of r) {
        if (n.fontSize === fs) continue;
        const newOpen = /\sfont-size=/.test(n.open)
          ? n.open.replace(/\sfont-size=(["'])[^"']*\1/, ` font-size="${fmt(fs)}"`)
          : n.open.replace(/>$/, ` font-size="${fmt(fs)}">`);
        edits.push({ at: n.start, replace: [n.start, n.start + n.open.length, newOpen] });
      }
    }
  }
  if (!edits.length) return markup;
  // Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => b.at - a.at || (a.replace ? -1 : 1));
  let out = markup;
  for (const e of edits) {
    if (e.replace) {
      const [s0, s1, text] = e.replace;
      out = out.slice(0, s0) + text + out.slice(s1);
    }
    if (e.insert) out = out.slice(0, e.at) + e.insert + out.slice(e.at);
  }
  return out;
}

export interface FigureCaptions {
  markup: string;
  /** Header/footer key-value captions (`n = 4`, `v = 144 m s⁻¹`) lifted out of the canvas. */
  captions: string[];
  /** `Diagram not to scale` footnote, rendered as an HTML caption under the plate. */
  footnote: string | null;
}

/**
 * Lifts edge captions out of the SVG so they no longer pin the auto-frame: the
 * "Diagram(s) not to scale" footer, and `a = … | b = …` key-value strips hugging the
 * top or bottom edge. Their text is returned for HTML rendering with KaTeX.
 */
export function extractFigureCaptions(svgMarkup: string): FigureCaptions {
  const vb = parseViewBox(svgMarkup);
  if (!vb) return { markup: svgMarkup, captions: [], footnote: null };
  const removals: Array<[number, number]> = [];
  const captions: string[] = [];
  let footnote: string | null = null;
  for (const n of readTextNodes(svgMarkup)) {
    if (/<tspan\b/.test(n.inner)) continue;
    const content = decodeXmlEntities(n.inner).trim();
    if (/^diagrams? not to scale\.?$/i.test(content)) {
      footnote = content.replace(/\.$/, '');
      removals.push([n.start, n.end]);
      continue;
    }
    if (!/\s\|\s/.test(content) || !Number.isFinite(n.y)) continue;
    const parts = content.split(/\s+\|\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2 || !parts.every((p) => /=/.test(p))) continue;
    const nearEdge = n.y < vb.y + vb.height * 0.15 || n.y > vb.y + vb.height * 0.88;
    if (!nearEdge) continue;
    captions.push(...parts);
    removals.push([n.start, n.end]);
  }
  if (!removals.length) return { markup: svgMarkup, captions, footnote };
  let out = svgMarkup;
  for (const [a, b] of removals.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b);
  return { markup: out, captions, footnote };
}

/* -------------------------------------------------------------------------- */
/*  Tight auto-framing                                                         */
/* -------------------------------------------------------------------------- */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function parseNumbers(raw: string): number[] {
  return (raw.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
}

export function parseTransform(raw: string | undefined): Matrix {
  if (!raw) return IDENTITY;
  let m: Matrix = IDENTITY;
  for (const part of raw.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = parseNumbers(part[2]);
    let t: Matrix = IDENTITY;
    switch (part[1]) {
      case 'matrix':
        if (n.length >= 6) t = [n[0], n[1], n[2], n[3], n[4], n[5]];
        break;
      case 'translate':
        t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale':
        t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((n[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const r: Matrix = [c, s, -s, c, 0, 0];
        if (n.length >= 3) {
          t = multiply(multiply([1, 0, 0, 1, n[1], n[2]], r), [1, 0, 0, 1, -n[1], -n[2]]);
        } else {
          t = r;
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

class BoxAccumulator {
  box: Box | null = null;
  add(m: Matrix, x: number, y: number, pad = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    if (!this.box) {
      this.box = { minX: px - pad, minY: py - pad, maxX: px + pad, maxY: py + pad };
      return;
    }
    this.box.minX = Math.min(this.box.minX, px - pad);
    this.box.minY = Math.min(this.box.minY, py - pad);
    this.box.maxX = Math.max(this.box.maxX, px + pad);
    this.box.maxY = Math.max(this.box.maxY, py + pad);
  }
  addRect(m: Matrix, x: number, y: number, w: number, h: number, pad = 0) {
    this.add(m, x, y, pad);
    this.add(m, x + w, y, pad);
    this.add(m, x, y + h, pad);
    this.add(m, x + w, y + h, pad);
  }
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}=(["'])([^"']*)\\1`));
  return m ? m[2] : undefined;
}

function num(attrs: string, name: string, fallback = 0, ref = 0): number {
  const raw = attr(attrs, name);
  if (raw === undefined) return fallback;
  if (raw.trim().endsWith('%')) return (parseFloat(raw) / 100) * ref;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

function addArc(
  acc: BoxAccumulator,
  m: Matrix,
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
  pad: number
) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  acc.add(m, x2, y2, pad);
  if (rx === 0 || ry === 0) return;
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = largeArc === sweep ? -1 : 1;
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = theta1 + (delta * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    acc.add(m, cos * ex - sin * ey + cx, sin * ex + cos * ey + cy, pad);
  }
}

function addPath(acc: BoxAccumulator, m: Matrix, d: string, pad: number) {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const next = () => Number(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        if (!hasNum()) break;
        const nx = next();
        const ny = next();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        sx = x;
        sy = y;
        acc.add(m, x, y, pad);
        cmd = rel ? 'l' : 'L';
        continue;
      }
      case 'L':
      case 'T': {
        if (!hasNum()) break;
        const nx = next();
        const ny = next();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        acc.add(m, x, y, pad);
        continue;
      }
      case 'H': {
        if (!hasNum()) break;
        const nx = next();
        x = rel ? x + nx : nx;
        acc.add(m, x, y, pad);
        continue;
      }
      case 'V': {
        if (!hasNum()) break;
        const ny = next();
        y = rel ? y + ny : ny;
        acc.add(m, x, y, pad);
        continue;
      }
      case 'C':
      case 'S':
      case 'Q': {
        if (!hasNum()) break;
        const count = cmd.toUpperCase() === 'C' ? 3 : 2;
        let px = x;
        let py = y;
        for (let k = 0; k < count; k++) {
          const nx = next();
          const ny = next();
          px = rel ? x + nx : nx;
          py = rel ? y + ny : ny;
          acc.add(m, px, py, pad);
        }
        x = px;
        y = py;
        continue;
      }
      case 'A': {
        if (!hasNum()) break;
        const rx = next();
        const ry = next();
        const rot = next();
        const large = next();
        const sweep = next();
        const nx = next();
        const ny = next();
        const ex = rel ? x + nx : nx;
        const ey = rel ? y + ny : ny;
        addArc(acc, m, x, y, rx, ry, rot, large, sweep, ex, ey, pad);
        x = ex;
        y = ey;
        continue;
      }
      case 'Z':
        x = sx;
        y = sy;
        cmd = '';
        continue;
      default:
        i++;
        continue;
    }
    // A command with no numbers left: skip to next token.
    if (!hasNum() && i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) i++;
  }
}

const NON_RENDERED = new Set([
  'defs',
  'clipPath',
  'marker',
  'mask',
  'pattern',
  'symbol',
  'linearGradient',
  'radialGradient',
  'title',
  'desc',
  'metadata',
  'style',
  'filter',
]);

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseViewBox(svgMarkup: string): ViewBox | null {
  const open = svgMarkup.match(/<svg\b([^>]*)>/i);
  if (!open) return null;
  const vb = attr(open[1], 'viewBox');
  if (vb) {
    const n = parseNumbers(vb);
    if (n.length === 4 && n[2] > 0 && n[3] > 0) {
      return { x: n[0], y: n[1], width: n[2], height: n[3] };
    }
  }
  const w = parseFloat(attr(open[1], 'width') ?? '');
  const h = parseFloat(attr(open[1], 'height') ?? '');
  if (w > 0 && h > 0) return { x: 0, y: 0, width: w, height: h };
  return null;
}

function isBackgroundRect(attrs: string, vb: ViewBox): boolean {
  if (attr(attrs, 'transform')) return false;
  const x = num(attrs, 'x', 0, vb.width);
  const y = num(attrs, 'y', 0, vb.height);
  const w = num(attrs, 'width', 0, vb.width);
  const h = num(attrs, 'height', 0, vb.height);
  return (
    x <= vb.x + vb.width * 0.02 &&
    y <= vb.y + vb.height * 0.02 &&
    x + w >= vb.x + vb.width * 0.98 &&
    y + h >= vb.y + vb.height * 0.98
  );
}

/** Average advance of Plus Jakarta Sans per em, deliberately generous. */
const TEXT_ADVANCE_EM = 0.6;

/**
 * Statically estimates the drawn-content bounding box of an SVG in viewBox units,
 * honouring nested `transform`s and skipping full-canvas background rects and defs.
 */
export function estimateSvgContentBox(svgMarkup: string): Box | null {
  const vb = parseViewBox(svgMarkup);
  if (!vb) return null;
  const acc = new BoxAccumulator();

  interface Frame {
    tag: string;
    m: Matrix;
    hidden: boolean;
    fontSize: number;
    anchor: string;
    stroke: number;
  }
  const stack: Frame[] = [
    { tag: '#root', m: IDENTITY, hidden: false, fontSize: 16, anchor: 'start', stroke: 0 },
  ];

  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svgMarkup)) !== null) {
    const [, closing, tag, attrs, selfClose] = match;
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    const m = tag === 'svg' && stack.length === 1 ? parent.m : multiply(parent.m, parseTransform(attr(attrs, 'transform')));
    const hidden =
      parent.hidden ||
      NON_RENDERED.has(tag) ||
      attr(attrs, 'display') === 'none' ||
      attr(attrs, 'visibility') === 'hidden';
    const fsRaw = attr(attrs, 'font-size');
    const fontSize = fsRaw
      ? fsRaw.endsWith('%')
        ? (parent.fontSize * parseFloat(fsRaw)) / 100
        : parseFloat(fsRaw) || parent.fontSize
      : parent.fontSize;
    const anchor = attr(attrs, 'text-anchor') ?? parent.anchor;
    const strokeAttr = attr(attrs, 'stroke-width');
    const stroke = strokeAttr ? parseFloat(strokeAttr) || parent.stroke : parent.stroke;
    const frame: Frame = { tag, m, hidden, fontSize, anchor, stroke };
    const isSelfClosing = Boolean(selfClose);

    if (!hidden) {
      const pad = stroke / 2 + (attr(attrs, 'marker-end') || attr(attrs, 'marker-start') ? 4 + stroke * 2 : 0);
      switch (tag) {
        case 'line':
          acc.add(m, num(attrs, 'x1', 0, vb.width), num(attrs, 'y1', 0, vb.height), pad);
          acc.add(m, num(attrs, 'x2', 0, vb.width), num(attrs, 'y2', 0, vb.height), pad);
          break;
        case 'rect':
          if (!isBackgroundRect(attrs, vb)) {
            acc.addRect(
              m,
              num(attrs, 'x', 0, vb.width),
              num(attrs, 'y', 0, vb.height),
              num(attrs, 'width', 0, vb.width),
              num(attrs, 'height', 0, vb.height),
              pad
            );
          }
          break;
        case 'circle': {
          const r = num(attrs, 'r');
          acc.addRect(m, num(attrs, 'cx') - r, num(attrs, 'cy') - r, 2 * r, 2 * r, pad);
          break;
        }
        case 'ellipse': {
          const rx = num(attrs, 'rx');
          const ry = num(attrs, 'ry');
          acc.addRect(m, num(attrs, 'cx') - rx, num(attrs, 'cy') - ry, 2 * rx, 2 * ry, pad);
          break;
        }
        case 'polygon':
        case 'polyline': {
          const pts = parseNumbers(attr(attrs, 'points') ?? '');
          for (let k = 0; k + 1 < pts.length; k += 2) acc.add(m, pts[k], pts[k + 1], pad);
          break;
        }
        case 'path':
          addPath(acc, m, attr(attrs, 'd') ?? '', pad);
          break;
        case 'text': {
          const closeIdx = svgMarkup.indexOf('</text>', tagRe.lastIndex);
          const inner = closeIdx === -1 ? '' : svgMarkup.slice(tagRe.lastIndex, closeIdx);
          const content = decodeXmlEntities(inner.replace(/<[^>]+>/g, '')).replace(/\u200b/g, '');
          const chars = Array.from(content).length;
          const width = chars * fontSize * TEXT_ADVANCE_EM;
          const x = num(attrs, 'x', 0, vb.width) + num(attrs, 'dx');
          const y = num(attrs, 'y', 0, vb.height) + num(attrs, 'dy');
          const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
          acc.addRect(m, left, y - fontSize * 0.92, width, fontSize * 1.28, 1);
          if (closeIdx !== -1 && !isSelfClosing) {
            tagRe.lastIndex = closeIdx + '</text>'.length;
          }
          continue;
        }
      }
    }

    if (!isSelfClosing && !['line', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'path', 'img', 'image', 'use'].includes(tag)) {
      stack.push(frame);
    } else if (!isSelfClosing) {
      // Non-self-closing leaf (e.g. <path ...></path>): push so its closing tag pops cleanly.
      stack.push(frame);
    }
  }
  return acc.box;
}

export interface FramedSvg {
  markup: string;
  viewBox: ViewBox;
  originalViewBox: ViewBox | null;
  tightened: boolean;
}

/**
 * Tightens the root viewBox around drawn content (with breathing room), sizes the
 * root so it fills the figure plate up to `--sp-fig-max-h`, and marks background rects.
 */
export function frameSvgMarkup(svgMarkup: string): FramedSvg {
  const original = parseViewBox(svgMarkup);
  if (!original) {
    return { markup: svgMarkup, viewBox: { x: 0, y: 0, width: 1, height: 1 }, originalViewBox: null, tightened: false };
  }

  let target: ViewBox = original;
  let tightened = false;
  const box = estimateSvgContentBox(svgMarkup);
  if (box && box.maxX > box.minX && box.maxY > box.minY) {
    const bw = box.maxX - box.minX;
    const bh = box.maxY - box.minY;
    const pad = Math.max(14, 0.04 * Math.max(bw, bh));
    // Allow a little growth past the source canvas so boosted labels are never clipped.
    const growX = original.width * 0.06;
    const growY = original.height * 0.06;
    const minX = Math.max(original.x - growX, box.minX - pad);
    const minY = Math.max(original.y - growY, box.minY - pad);
    const maxX = Math.min(original.x + original.width + growX, box.maxX + pad);
    const maxY = Math.min(original.y + original.height + growY, box.maxY + pad);
    const candidate = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const areaRatio = (candidate.width * candidate.height) / (original.width * original.height);
    const overflows =
      candidate.x < original.x - 0.5 ||
      candidate.y < original.y - 0.5 ||
      candidate.x + candidate.width > original.x + original.width + 0.5 ||
      candidate.y + candidate.height > original.y + original.height + 0.5;
    if (candidate.width > 40 && candidate.height > 40 && (areaRatio < 0.93 || overflows)) {
      target = candidate;
      tightened = true;
    }
  }

  const vbString = `${fmt(target.x)} ${fmt(target.y)} ${fmt(target.width)} ${fmt(target.height)}`;
  const ratio = target.width / target.height;
  const sizeStyle = [
    'display:block',
    'margin-inline:auto',
    'max-width:100%',
    `width:min(100%, calc(var(--sp-fig-max-h, 290px) * ${ratio.toFixed(4)}))`,
    'height:auto',
    `aspect-ratio:${fmt(target.width)} / ${fmt(target.height)}`,
    'background:#ffffff',
    'overflow:hidden',
  ].join(';');

  let markup = svgMarkup.replace(/<svg\b([^>]*)>/i, (_open, rawAttrs: string) => {
    let attrs = rawAttrs
      .replace(/\s(viewBox|width|height|preserveAspectRatio)=(["'])[^"']*\2/g, '')
      .replace(/\sdata-sp-orig-viewbox=(["'])[^"']*\1/g, '');
    const existingStyle = attrs.match(/\sstyle=(["'])([^"']*)\1/);
    attrs = attrs.replace(/\sstyle=(["'])[^"']*\1/, '');
    const style = existingStyle ? `${sizeStyle};${existingStyle[2]}` : sizeStyle;
    return `<svg${attrs} viewBox="${vbString}" width="${fmt(target.width)}" height="${fmt(target.height)}" preserveAspectRatio="xMidYMid meet" data-sp-orig-viewbox="${fmt(original.x)} ${fmt(original.y)} ${fmt(original.width)} ${fmt(original.height)}" style="${style}">`;
  });

  // Mark full-canvas background rects so the client-side bbox guard can ignore them.
  markup = markup.replace(/<rect\b([^>]*?)(\/?)>/g, (full, attrs: string, sc: string) =>
    isBackgroundRect(attrs, original) && !/data-sp-bg=/.test(attrs)
      ? `<rect${attrs} data-sp-bg="1"${sc}>`
      : full
  );

  return { markup, viewBox: target, originalViewBox: original, tightened };
}

/* -------------------------------------------------------------------------- */
/*  ID scoping (unchanged public contract)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Deterministically scopes all internal SVG `id="..."`, `url(#...)`, `href="#..."`,
 * `xlink:href="#..."`, and `aria-labelledby`/`aria-describedby` references by `scopeKey`
 * so multiple physics diagrams rendered on the same page never collide `<marker>`,
 * `<clipPath>`, or gradient definitions.
 */
export function scopeSvgMarkup(svgMarkup: string, scopeKey: string): string {
  const trimmed = svgMarkup.trim();
  if (!trimmed) return '';

  const safeScope =
    'sp-fig-' +
    (scopeKey || 'item')
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const idMap = new Map<string, string>();
  for (const match of trimmed.matchAll(/\bid=(["'])([^"']+)\1/g)) {
    const rawId = match[2];
    if (rawId && !idMap.has(rawId)) {
      const scopedId = rawId.startsWith(`${safeScope}--`)
        ? rawId
        : `${safeScope}--${rawId}`;
      idMap.set(rawId, scopedId);
    }
  }

  let scoped = trimmed;

  if (idMap.size > 0) {
    scoped = scoped.replace(
      /\bid=(["'])([^"']+)\1/g,
      (full, quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `id=${quote}${mapped}${quote}` : full;
      }
    );

    scoped = scoped.replace(
      /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
      (full, _quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `url(#${mapped})` : full;
      }
    );

    scoped = scoped.replace(
      /\b(xlink:href|href)=(["'])#([^"']+)\2/g,
      (full, attrName: string, quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `${attrName}=${quote}#${mapped}${quote}` : full;
      }
    );

    scoped = scoped.replace(
      /\b(aria-labelledby|aria-describedby)=(["'])([^"']+)\2/g,
      (_full, attrName: string, quote: string, rawList: string) => {
        const remapped = rawList
          .split(/\s+/)
          .map((token) => idMap.get(token) ?? token)
          .join(' ');
        return `${attrName}=${quote}${remapped}${quote}`;
      }
    );
  }

  // Ensure proportional scaling inside responsive max-height containers
  scoped = scoped.replace(/<svg\b([^>]*)>/i, (openTag, attrs: string) => {
    if (/preserveAspectRatio=/i.test(attrs)) {
      return openTag;
    }
    return `<svg${attrs} preserveAspectRatio="xMidYMid meet">`;
  });

  return scoped;
}

export type PreparedSvgFigure = FigureCaptions;

/**
 * Full figure pipeline: lift edge captions -> typeset labels -> tight framing -> ID scoping.
 */
export function prepareSvgFigureParts(
  svgMarkup: string,
  scopeKey: string,
  options: { typeset?: boolean; autoFrame?: boolean } = {}
): PreparedSvgFigure {
  if (!svgMarkup || !svgMarkup.trim()) return { markup: '', captions: [], footnote: null };
  const { typeset = true, autoFrame = true } = options;
  let markup = svgMarkup.trim();
  let captions: string[] = [];
  let footnote: string | null = null;
  if (autoFrame) {
    const lifted = extractFigureCaptions(markup);
    markup = lifted.markup;
    captions = lifted.captions;
    footnote = lifted.footnote;
  }
  if (typeset) markup = typesetSvgMarkup(markup);
  if (autoFrame) markup = frameSvgMarkup(markup).markup;
  return { markup: scopeSvgMarkup(markup, scopeKey), captions, footnote };
}

/**
 * Backward-compatible string pipeline (captions stay inside the SVG).
 */
export function prepareSvgFigure(
  svgMarkup: string,
  scopeKey: string,
  options: { typeset?: boolean; autoFrame?: boolean } = {}
): string {
  if (!svgMarkup || !svgMarkup.trim()) return '';
  const { typeset = true, autoFrame = true } = options;
  let markup = svgMarkup.trim();
  if (typeset) markup = typesetSvgMarkup(markup);
  if (autoFrame) markup = frameSvgMarkup(markup).markup;
  return scopeSvgMarkup(markup, scopeKey);
}

/**
 * Extracts a human-readable figure description from `<svg aria-label="...">` or `<title>`.
 */
export function extractSvgLabel(svgMarkup: string): string | null {
  if (!svgMarkup) return null;
  const ariaMatch = svgMarkup.match(/<svg\b[^>]*\baria-label=(["'])([^"']+)\1/i);
  if (ariaMatch?.[2]?.trim()) {
    return decodeXmlEntities(ariaMatch[2].trim());
  }
  const titleMatch = svgMarkup.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return decodeXmlEntities(titleMatch[1].trim());
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Client-side legibility floor + clipping guard                              */
/* -------------------------------------------------------------------------- */

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Minimum rendered CSS px for word/symbol labels and for bare tick numbers. */
const MIN_LABEL_PX = 12;
const MIN_TICK_PX = 11;
/** Never inflate a label more than this over its source size (avoids collisions). */
const MAX_LABEL_GROWTH = 1.7;

/**
 * Raises every label to a legible rendered size for the current plate width:
 * with s = rendered width / viewBox width, any label whose size·s falls below
 * 12 px (11 px for numeric ticks) is set to min(12/s, 1.7 × source size).
 */
export function enforceLabelFloor(svg: SVGSVGElement | null): void {
  if (!svg || typeof window === 'undefined') return;
  const vb = svg.viewBox?.baseVal;
  const width = svg.getBoundingClientRect().width;
  if (!vb || !vb.width || !width) return;
  const scale = width / vb.width;
  const all = Array.from(svg.querySelectorAll<SVGTextElement>('text'));
  const anchors = all.map((t) => ({
    x: parseFloat(t.getAttribute('x') ?? 'NaN'),
    y: parseFloat(t.getAttribute('y') ?? 'NaN'),
    anchor: t.getAttribute('text-anchor') ?? 'start',
  }));
  all.forEach((text, idx) => {
    // Dense stacks (energy-level captions): never grow past ~85% of the row pitch.
    const me = anchors[idx];
    let pitch = Infinity;
    if (Number.isFinite(me.x) && Number.isFinite(me.y)) {
      anchors.forEach((o, j) => {
        if (j === idx || o.anchor !== me.anchor || Math.abs(o.x - me.x) > 4) return;
        const dy = Math.abs(o.y - me.y);
        if (dy > 0.5) pitch = Math.min(pitch, dy);
      });
    }
    let base = parseFloat(text.dataset.spFsBase ?? '');
    if (!Number.isFinite(base)) {
      const attrSize = parseFloat(text.getAttribute('font-size') ?? '');
      base = Number.isFinite(attrSize) ? attrSize : parseFloat(window.getComputedStyle(text).fontSize);
      if (!Number.isFinite(base) || base <= 0) return;
      text.dataset.spFsBase = String(base);
    }
    const isTick = /^[\s\d.,+\-−×%°]+$/.test(text.textContent ?? '');
    const floor = isTick ? MIN_TICK_PX : MIN_LABEL_PX;
    const target =
      base * scale < floor
        ? Math.max(base, Math.min(floor / scale, base * MAX_LABEL_GROWTH, pitch * 0.85))
        : base;
    const next = fmt(target);
    if (text.getAttribute('font-size') !== next) text.setAttribute('font-size', next);
  });
}

/**
 * Enlarged labels can collide (e.g. `E_tot` / `E_p` curve tags). Nudges a colliding label
 * vertically away from the one it overlaps, by at most ~1.1 line heights.
 */
export function separateCollidingLabels(svg: SVGSVGElement | null): void {
  if (!svg || typeof window === 'undefined') return;
  const vb = svg.viewBox?.baseVal;
  const width = svg.getBoundingClientRect().width;
  if (!vb || !vb.width || !width) return;
  const scale = width / vb.width;
  const texts = Array.from(svg.querySelectorAll<SVGTextElement>('text')).filter((t) => {
    if (t.closest('[transform]') && !t.hasAttribute('data-sp-nudge')) return false;
    return (t.textContent ?? '').trim().length > 0;
  });
  texts.forEach((t) => {
    if (t.hasAttribute('data-sp-nudge')) {
      t.removeAttribute('transform');
      t.removeAttribute('data-sp-nudge');
    }
  });
  const placed: DOMRect[] = [];
  const rects = texts
    .map((t) => ({ t, r: t.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top);
  for (const { t, r } of rects) {
    let shift = 0;
    const maxShift = r.height * 1.1;
    for (const p of placed) {
      const top = r.top + shift;
      const overlapX = Math.min(r.right, p.right) - Math.max(r.left, p.left);
      const overlapY = Math.min(top + r.height, p.bottom) - Math.max(top, p.top);
      if (overlapX > 2 && overlapY > 1) shift += overlapY + 1;
    }
    shift = Math.min(shift, maxShift);
    if (shift > 0.5) {
      t.setAttribute('transform', `translate(0 ${fmt(shift / scale)})`);
      t.setAttribute('data-sp-nudge', '1');
      placed.push(new DOMRect(r.left, r.top + shift, r.width, r.height));
    } else {
      placed.push(r);
    }
  }
}

/**
 * Measures the true content box with `getBBox()` and widens the statically-estimated
 * viewBox if any (possibly enlarged) label would otherwise be clipped.
 */
function guardViewBox(svg: SVGSVGElement | null) {
  if (!svg || typeof svg.getBBox !== 'function') return;
  const orig = svg.getAttribute('data-sp-orig-viewbox');
  const current = svg.viewBox?.baseVal;
  if (!orig || !current || current.width === 0) return;
  const [ox0, oy0, ow0, oh0] = orig.split(/\s+/).map(Number);
  const ox = ox0 - ow0 * 0.15;
  const oy = oy0 - oh0 * 0.15;
  const ow = ow0 * 1.3;
  const oh = oh0 * 1.3;
  const bgRects = Array.from(svg.querySelectorAll<SVGRectElement>('rect[data-sp-bg]'));
  const prevDisplay = bgRects.map((r) => r.style.display);
  bgRects.forEach((r) => (r.style.display = 'none'));
  let bbox: DOMRect | SVGRect | null = null;
  try {
    bbox = svg.getBBox();
  } catch {
    bbox = null;
  }
  bgRects.forEach((r, i) => (r.style.display = prevDisplay[i]));
  if (!bbox || bbox.width === 0 || bbox.height === 0) return;
  const pad = 8;
  const minX = Math.max(ox, Math.min(current.x, bbox.x - pad));
  const minY = Math.max(oy, Math.min(current.y, bbox.y - pad));
  const maxX = Math.min(ox + ow, Math.max(current.x + current.width, bbox.x + bbox.width + pad));
  const maxY = Math.min(oy + oh, Math.max(current.y + current.height, bbox.y + bbox.height + pad));
  const w = maxX - minX;
  const h = maxY - minY;
  if (
    Math.abs(minX - current.x) < 0.5 &&
    Math.abs(minY - current.y) < 0.5 &&
    Math.abs(w - current.width) < 0.5 &&
    Math.abs(h - current.height) < 0.5
  ) {
    return;
  }
  svg.setAttribute('viewBox', `${fmt(minX)} ${fmt(minY)} ${fmt(w)} ${fmt(h)}`);
  svg.setAttribute('width', fmt(w));
  svg.setAttribute('height', fmt(h));
  svg.style.aspectRatio = `${fmt(w)} / ${fmt(h)}`;
  svg.style.width = `min(100%, calc(var(--sp-fig-max-h, 290px) * ${(w / h).toFixed(4)}))`;
}

function useFigureLayout(ref: React.RefObject<HTMLDivElement | null>, markup: string) {
  useIsomorphicLayoutEffect(() => {
    const host = ref.current;
    if (!host || !markup) return;
    let frame = 0;
    const run = () => {
      const svg = host.querySelector('svg');
      enforceLabelFloor(svg);
      separateCollidingLabels(svg);
      guardViewBox(svg);
      // Widening shrinks the scale slightly; settle the floor once more.
      enforceLabelFloor(svg);
    };
    run();
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) run();
      });
    }
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      let lastWidth = host.getBoundingClientRect().width;
      observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (Math.abs(width - lastWidth) < 2) return;
        lastWidth = width;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(run);
      });
      observer.observe(host);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [markup]);
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

/** Dot-grid mat; `--sp-dot` flips to a faint slate in dark mode via a class. */
const MAT_STYLE: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle at 1px 1px, var(--sp-dot) 1px, transparent 0)',
  backgroundSize: '14px 14px',
};

const MAT_CLASS =
  'border-[#E2E8F0] bg-[#F8FAFC] [--sp-dot:rgba(100,116,139,0.22)] dark:border-[#263147] dark:bg-[#121a2b] dark:[--sp-dot:rgba(148,163,184,0.12)]';

const PLATE_SVG_CLASS =
  '[&_svg]:rounded-xl [&_svg]:ring-1 [&_svg]:ring-[#E2E8F0] [&_svg]:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_18px_-10px_rgba(15,23,42,0.18)] dark:[&_svg]:ring-[#334155] dark:[&_svg]:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_10px_28px_-12px_rgba(0,0,0,0.7)]';

function FigureCaptionRow({
  captions,
  footnote,
}: {
  captions: string[];
  footnote: string | null;
}) {
  if (!captions.length && !footnote) return null;
  return (
    <figcaption className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] leading-5 text-[#334155] dark:text-[#CBD5E1]">
      {captions.map((caption, idx) => (
        <span
          key={`${caption}-${idx}`}
          className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-[#0F172A] dark:border-[#334155] dark:bg-[#1A2336] dark:text-[#E2E8F0]"
        >
          <MathText text={caption} />
        </span>
      ))}
      {footnote && (
        <span className="ml-auto text-xs italic text-[#64748B] dark:text-[#94A3B8]">{footnote}</span>
      )}
    </figcaption>
  );
}

export function SvgFigurePlate({
  svgMarkup,
  questionId,
  className,
  typeset = true,
  autoFrame = true,
}: SvgFigurePlateProps) {
  const [expanded, setExpanded] = useState(false);
  const reactInstanceId = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const inlineHostRef = useRef<HTMLDivElement>(null);
  const modalHostRef = useRef<HTMLDivElement>(null);

  const inlineFigure = useMemo(
    () =>
      prepareSvgFigureParts(svgMarkup, `${questionId}-${reactInstanceId}`, {
        typeset,
        autoFrame,
      }),
    [svgMarkup, questionId, reactInstanceId, typeset, autoFrame]
  );

  const modalFigure = useMemo(
    () =>
      expanded
        ? prepareSvgFigureParts(svgMarkup, `${questionId}-${reactInstanceId}-zoom`, {
            typeset,
            autoFrame,
          })
        : null,
    [expanded, svgMarkup, questionId, reactInstanceId, typeset, autoFrame]
  );

  const figureLabel = useMemo(() => extractSvgLabel(svgMarkup), [svgMarkup]);

  useFigureLayout(inlineHostRef, inlineFigure.markup);
  useFigureLayout(modalHostRef, modalFigure?.markup ?? '');

  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded]);

  if (!inlineFigure.markup) {
    return null;
  }

  const modalNode =
    expanded && modalFigure && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-[2px] sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={figureLabel ?? 'Expanded physics diagram'}
            onClick={() => setExpanded(false)}
          >
            <div
              className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] shadow-2xl dark:border-[#263147] dark:bg-[#121a2b] dark:text-[#E2E8F0]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 py-2.5 sm:px-5 dark:border-[#263147] dark:bg-[#171F30]">
                <p className="truncate text-sm font-semibold">{figureLabel ?? 'Diagram'}</p>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Close expanded diagram"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-b-2 border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-semibold text-[#334155] transition-[transform,background-color] hover:bg-[#F1F5F9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] active:translate-y-px active:border-b dark:border-[#334155] dark:bg-[#1A2336] dark:text-[#E2E8F0] dark:hover:bg-[#222C42]"
                >
                  <span>Close</span>
                  <kbd className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px] text-[#475569] dark:bg-[#0F1420] dark:text-[#94A3B8]">
                    Esc
                  </kbd>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className={cn('overflow-auto p-4 sm:p-8', MAT_CLASS)} style={MAT_STYLE}>
                <div
                  ref={modalHostRef}
                  className={cn('w-full [--sp-fig-max-h:74vh]', PLATE_SVG_CLASS)}
                  style={{ colorScheme: 'light' }}
                  dangerouslySetInnerHTML={{ __html: modalFigure.markup }}
                />
                <FigureCaptionRow captions={modalFigure.captions} footnote={modalFigure.footnote} />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <figure
        className={cn(
          'group relative my-3 overflow-hidden rounded-2xl border px-3 py-3 text-[#0F172A] sm:px-5 sm:py-4',
          MAT_CLASS,
          className
        )}
        style={MAT_STYLE}
        data-sp-figure=""
      >
        <div
          ref={inlineHostRef}
          onClick={() => setExpanded(true)}
          title="Click to expand diagram"
          className={cn(
            'w-full cursor-zoom-in [--sp-fig-max-h:260px] sm:[--sp-fig-max-h:290px]',
            PLATE_SVG_CLASS
          )}
          style={{ colorScheme: 'light' }}
          dangerouslySetInnerHTML={{ __html: inlineFigure.markup }}
        />
        <FigureCaptionRow captions={inlineFigure.captions} footnote={inlineFigure.footnote} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand diagram"
          title="Expand diagram"
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-b-[3px] border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-semibold text-[#334155] shadow-sm transition-[transform,border-width,background-color] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] active:translate-y-[2px] active:border-b sm:right-3 sm:top-3 dark:border-[#334155] dark:bg-[#1A2336] dark:text-[#E2E8F0] dark:hover:bg-[#222C42]"
        >
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Expand</span>
        </button>
      </figure>
      {modalNode}
    </>
  );
}
