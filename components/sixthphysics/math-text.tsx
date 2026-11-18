import React from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

export interface MathTextProps {
  text: string;
  className?: string;
  block?: boolean;
  /**
   * Typeset plain-text physics (quantities, units, equations, subscripts) through KaTeX.
   * Defaults to `true`. Set `false` for the legacy `<sup>`/`<sub>` rendering.
   */
  katexPhysics?: boolean;
}

export interface LatexRenderOptions {
  displayMode?: boolean;
}

const UNICODE_SUP_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6',
  '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(',
  '⁾': ')', ⁿ: 'n',
};

const UNICODE_SUB_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6',
  '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−', '₌': '=', '₍': '(',
  '₎': ')', ₐ: 'a', ₑ: 'e', ₒ: 'o', ₓ: 'x', ₕ: 'h', ₖ: 'k', ₗ: 'l',
  ₘ: 'm', ₙ: 'n', ₚ: 'p', ᵣ: 'r', ₛ: 's', ₜ: 't',
};

const SUP_CLASS = 'text-[0.74em] leading-none font-normal';
const SUB_CLASS = 'text-[0.74em] leading-none font-normal';

/**
 * Renders a LaTeX expression string to sanitized HTML via KaTeX.
 */
export function renderLatexToHtml(
  latex: string,
  options: LatexRenderOptions = {}
): string {
  const rendered = katex.renderToString(latex.trim(), {
    displayMode: Boolean(options.displayMode),
    throwOnError: false,
    strict: false,
    trust: false,
  });
  // Preserve accessible MathML `<mrow>` tree while stripping raw TeX source annotations
  // so raw `\frac` / `\sqrt` commands never appear in DOM textContent or HTML output.
  return rendered.replace(
    /<annotation encoding="application\/x-tex">[\s\S]*?<\/annotation>/g,
    ''
  );
}

const PHYSICS_HTML_CACHE = new Map<string, string>();

/**
 * Renders auto-detected plain-text physics through KaTeX (HTML output only; the
 * wrapping span carries the original text as its accessible name).
 */
export function renderPhysicsLatexToHtml(latex: string): string {
  const cached = PHYSICS_HTML_CACHE.get(latex);
  if (cached !== undefined) return cached;
  const html = katex.renderToString(latex, {
    displayMode: false,
    throwOnError: false,
    strict: false,
    trust: false,
    output: 'html',
  });
  if (PHYSICS_HTML_CACHE.size > 4000) PHYSICS_HTML_CACHE.clear();
  PHYSICS_HTML_CACHE.set(latex, html);
  return html;
}

type TopLevelSegment =
  | { kind: 'text'; value: string }
  | { kind: 'latex'; latex: string; displayMode: boolean };

function looksLikeCurrencySpan(inner: string): boolean {
  // Rejects spans like "$50 and $100" where inner starts with digits + space + prose words
  // and contains no LaTeX commands or mathematical operators.
  if (/\\[A-Za-z]/.test(inner)) return false;
  if (/[=+*/^_<>≤≥≈∝±×÷−]/.test(inner)) return false;
  return /^\d[\d,.]*\s+[A-Za-z]{2,}/.test(inner);
}

/**
 * Splits a string into explicit LaTeX segments ($...$, $$...$$, \(...\), \[...\])
 * and plain-physics prose segments, plus handles un-delimited raw \frac/\sqrt expressions.
 */
export function splitLatexSegments(
  input: string,
  block = false
): TopLevelSegment[] {
  if (!input) return [];

  // If rendered in block mode and the whole string is a bare formal LaTeX equation
  // (e.g. equation catalogue latex without surrounding $ delimiters), render directly via KaTeX.
  const trimmed = input.trim();
  if (
    block &&
    !trimmed.includes('$') &&
    !trimmed.includes('\\(') &&
    !trimmed.includes('\\[') &&
    /\\(?:frac|dfrac|tfrac|sqrt|Delta|Omega|Sigma|Phi|Psi|Lambda|Theta|Gamma|Pi|alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|varphi|omega|text|mathrm|mathbf|left|right|cdot|times|pm|mp|le|ge|neq|approx|propto|Rightarrow|quad|sin|cos|tan|ln|log|sum|int)\b/.test(
      trimmed
    )
  ) {
    return [{ kind: 'latex', latex: trimmed, displayMode: true }];
  }

  const rawSegments: TopLevelSegment[] = [];
  let cursor = 0;
  let plainBuffer = '';

  const flushPlain = () => {
    if (plainBuffer.length > 0) {
      rawSegments.push({ kind: 'text', value: plainBuffer });
      plainBuffer = '';
    }
  };

  while (cursor < input.length) {
    // Escaped \$ -> literal dollar sign
    if (input[cursor] === '\\' && input[cursor + 1] === '$') {
      plainBuffer += '$';
      cursor += 2;
      continue;
    }

    // Display math: $$...$$
    if (input[cursor] === '$' && input[cursor + 1] === '$') {
      const closeIdx = input.indexOf('$$', cursor + 2);
      if (closeIdx !== -1) {
        const inner = input.slice(cursor + 2, closeIdx);
        if (inner.trim().length > 0) {
          flushPlain();
          rawSegments.push({ kind: 'latex', latex: inner, displayMode: true });
          cursor = closeIdx + 2;
          continue;
        }
      }
    }

    // Display math: \[...\]
    if (input[cursor] === '\\' && input[cursor + 1] === '[') {
      const closeIdx = input.indexOf('\\]', cursor + 2);
      if (closeIdx !== -1) {
        const inner = input.slice(cursor + 2, closeIdx);
        if (inner.trim().length > 0) {
          flushPlain();
          rawSegments.push({ kind: 'latex', latex: inner, displayMode: true });
          cursor = closeIdx + 2;
          continue;
        }
      }
    }

    // Inline math: \(...\)
    if (input[cursor] === '\\' && input[cursor + 1] === '(') {
      const closeIdx = input.indexOf('\\)', cursor + 2);
      if (closeIdx !== -1) {
        const inner = input.slice(cursor + 2, closeIdx);
        if (inner.trim().length > 0) {
          flushPlain();
          rawSegments.push({ kind: 'latex', latex: inner, displayMode: false });
          cursor = closeIdx + 2;
          continue;
        }
      }
    }

    // Inline math: $...$ (single line, closing $ not immediately followed by a digit)
    if (input[cursor] === '$' && input[cursor + 1] !== '$') {
      let searchIdx = cursor + 1;
      let matchedClose = -1;
      while (searchIdx < input.length) {
        const ch = input[searchIdx];
        if (ch === '\n') break;
        if (ch === '\\') {
          searchIdx += 2;
          continue;
        }
        if (ch === '$' && input[searchIdx + 1] !== '$') {
          const nextChar = input[searchIdx + 1] ?? '';
          if (!/\d/.test(nextChar)) {
            matchedClose = searchIdx;
          }
          break;
        }
        searchIdx += 1;
      }

      if (matchedClose !== -1) {
        const inner = input.slice(cursor + 1, matchedClose);
        if (inner.trim().length > 0 && !looksLikeCurrencySpan(inner)) {
          flushPlain();
          rawSegments.push({ kind: 'latex', latex: inner, displayMode: false });
          cursor = matchedClose + 1;
          continue;
        }
      }
    }

    plainBuffer += input[cursor];
    cursor += 1;
  }

  flushPlain();

  // Second pass on plain segments: catch any bare un-delimited \frac{...}{...} or \sqrt{...}
  // so raw \frac / \sqrt macros never leak into student text.
  const finalSegments: TopLevelSegment[] = [];
  for (const seg of rawSegments) {
    if (seg.kind !== 'text' || !/\\(?:frac|dfrac|tfrac|sqrt)\b/.test(seg.value)) {
      finalSegments.push(seg);
      continue;
    }
    finalSegments.push(...splitBareLatexMacros(seg.value));
  }

  if (block && finalSegments.length === 1 && finalSegments[0].kind === 'latex') {
    return [{ ...finalSegments[0], displayMode: true }];
  }

  return finalSegments;
}

function readBalancedBraces(str: string, openBraceIdx: number): number {
  if (str[openBraceIdx] !== '{') return -1;
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    if (str[i] === '\\') {
      i += 1;
      continue;
    }
    if (str[i] === '{') depth += 1;
    else if (str[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitBareLatexMacros(text: string): TopLevelSegment[] {
  const out: TopLevelSegment[] = [];
  const macroRegex = /\\(frac|dfrac|tfrac|sqrt)\b/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = macroRegex.exec(text)) !== null) {
    const cmd = match[1];
    const start = match.index;
    if (start < lastIndex) continue;

    let pos = start + match[0].length;
    while (pos < text.length && /\s/.test(text[pos])) pos++;

    // Optional [n] root index for \sqrt[3]{x}
    if (cmd === 'sqrt' && text[pos] === '[') {
      const closeBracket = text.indexOf(']', pos + 1);
      if (closeBracket !== -1) {
        pos = closeBracket + 1;
        while (pos < text.length && /\s/.test(text[pos])) pos++;
      }
    }

    const firstEnd = readBalancedBraces(text, pos);
    if (firstEnd === -1) continue;

    let macroEnd = firstEnd + 1;
    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
      let secondStart = macroEnd;
      while (secondStart < text.length && /\s/.test(text[secondStart])) {
        secondStart++;
      }
      const secondEnd = readBalancedBraces(text, secondStart);
      if (secondEnd === -1) continue;
      macroEnd = secondEnd + 1;
    }

    if (start > lastIndex) {
      out.push({ kind: 'text', value: text.slice(lastIndex, start) });
    }
    out.push({ kind: 'latex', latex: text.slice(start, macroEnd), displayMode: false });
    lastIndex = macroEnd;
    macroRegex.lastIndex = macroEnd;
  }

  if (lastIndex < text.length) {
    out.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return out;
}

function mapUnicodeSuperscript(raw: string): string {
  return Array.from(raw)
    .map((ch) => UNICODE_SUP_MAP[ch] ?? ch)
    .join('');
}

function mapUnicodeSubscript(raw: string): string {
  return Array.from(raw)
    .map((ch) => UNICODE_SUB_MAP[ch] ?? ch)
    .join('');
}

function normalizeExponentMinus(raw: string): string {
  return raw.replace(/^-/, '−').replace(/([(\s+-])-/g, '$1−');
}

/* -------------------------------------------------------------------------- */
/*  Display polish                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Safe, display-only prose polish:
 * - `25 °` -> `25°`, `20 ° C` -> `20 °C`
 * - `a 880 kg` -> `an 880 kg`, `a 11 V` -> `an 11 V`, `a 18` -> `an 18`
 */
export function polishPhysicsProse(text: string): string {
  if (!text) return text;
  return text
    .replace(/(\d)\s+°(?!\s*C\b)/g, '$1°')
    .replace(/°\s+C\b/g, '°C')
    .replace(
      /(^|[\s(“"])([Aa]) (?=(\d[\d,]*)(?:\.\d+)?(?![\d,]))/g,
      (full, lead: string, article: string, _n: string, offset: number, src: string) => {
        const rest = src.slice(offset + full.length);
        const intPart = (rest.match(/^\d[\d,]*/)?.[0] ?? '').replace(/,/g, '');
        if (!intPart) return full;
        const vowelSound =
          intPart.startsWith('8') ||
          ((intPart.startsWith('11') || intPart.startsWith('18')) &&
            intPart.length % 3 === 2);
        return vowelSound ? `${lead}${article}n ` : full;
      }
    );
}

/* -------------------------------------------------------------------------- */
/*  Legacy plain-physics tokenizer (sup/sub HTML)                              */
/* -------------------------------------------------------------------------- */

export type InlinePhysicsToken =
  | { type: 'text'; text: string }
  | { type: 'sci'; prefix: string; exponent: string }
  | { type: 'sub'; base: string; sub: string }
  | { type: 'sup'; sup: string }
  | { type: 'usub'; sub: string };

const INLINE_PHYSICS_PATTERN = new RegExp(
  [
    '(?<url>https?:\\/\\/[^\\s)]+)',
    '(?<![A-Za-z0-9.])(?<sciPrefix>(?:[+-−]?\\d+(?:\\.\\d+)?\\s*(?:×|⋅|·)\\s*|(?:[+-−]?\\d+(?:\\.\\d+)?)\\s+x\\s+)?)10(?<sciExp>[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|\\^\\{[+-−]?\\d+\\}|\\^\\([+-−]?\\d+\\)|\\^[+-−]?\\d+(?!\\.[0-9]))',
    '(?:(?<![A-Za-zα-ωΑ-Ω_])(?<subBase>[A-Za-zα-ωΑ-Ω]{1,3})|(?<=[)\\]])(?<subBracketBase>))_(?:\\{(?<subBraced>[^}\\n]{1,16})\\}|(?<subPlain>[A-Za-z0-9α-ωΑ-Ω]{1,12}(?:,[A-Za-z0-9α-ωΑ-Ω]{1,8})?))(?![A-Za-z0-9_])',
    '(?<uSup>[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾]+)',
    '(?<uSub>[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚᵣₛₜ]+)',
    '(?<=[A-Za-z0-9α-ωΑ-Ω)\\]}₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚᵣₛₜ])\\^(?:\\((?<caretParen>[^()\\n]{1,28})\\)|\\{(?<caretBrace>[^}\\n]{1,28})\\}|(?<caretSimple>[+-−]?\\d+(?:\\.\\d+)?|[A-Za-z])(?![A-Za-z0-9]))',
  ].join('|'),
  'g'
);

export function tokenizePlainPhysics(text: string): InlinePhysicsToken[] {
  if (!text) return [];

  const tokens: InlinePhysicsToken[] = [];
  let lastIndex = 0;

  const pushText = (chunk: string) => {
    if (!chunk) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === 'text') {
      prev.text += chunk;
    } else {
      tokens.push({ type: 'text', text: chunk });
    }
  };

  for (const match of text.matchAll(INLINE_PHYSICS_PATTERN)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      pushText(text.slice(lastIndex, idx));
    }

    const groups = match.groups ?? {};

    if (groups.url !== undefined) {
      pushText(groups.url);
    } else if (groups.sciExp !== undefined) {
      const prefix = (groups.sciPrefix ?? '').replace(/\sx\s+$/, ' × ');
      const rawExp = groups.sciExp;
      let cleanExp: string;
      if (rawExp.startsWith('^{') || rawExp.startsWith('^(')) {
        cleanExp = normalizeExponentMinus(rawExp.slice(2, -1));
      } else if (rawExp.startsWith('^')) {
        cleanExp = normalizeExponentMinus(rawExp.slice(1));
      } else {
        cleanExp = mapUnicodeSuperscript(rawExp);
      }
      tokens.push({ type: 'sci', prefix, exponent: cleanExp });
    } else if (groups.subBase !== undefined || groups.subBracketBase !== undefined) {
      const subText = groups.subBraced ?? groups.subPlain ?? '';
      tokens.push({ type: 'sub', base: groups.subBase ?? '', sub: subText });
    } else if (groups.uSup !== undefined) {
      tokens.push({ type: 'sup', sup: mapUnicodeSuperscript(groups.uSup) });
    } else if (groups.uSub !== undefined) {
      tokens.push({ type: 'usub', sub: mapUnicodeSubscript(groups.uSub) });
    } else if (
      groups.caretParen !== undefined ||
      groups.caretBrace !== undefined ||
      groups.caretSimple !== undefined
    ) {
      const raw = groups.caretParen ?? groups.caretBrace ?? groups.caretSimple ?? '';
      tokens.push({ type: 'sup', sup: normalizeExponentMinus(raw) });
    } else {
      pushText(match[0]);
    }

    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return tokens;
}

function renderInlineTokens(
  tokens: InlinePhysicsToken[],
  keyPrefix: string
): React.ReactNode[] {
  return tokens.map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (tok.type) {
      case 'text':
        return <React.Fragment key={key}>{tok.text}</React.Fragment>;
      case 'sci':
        return (
          <span key={key} className="whitespace-nowrap tabular-nums">
            {tok.prefix}10
            <sup className={SUP_CLASS}>{tok.exponent}</sup>
          </span>
        );
      case 'sub':
        return (
          <React.Fragment key={key}>
            {tok.base}
            <sub className={SUB_CLASS}>{tok.sub}</sub>
          </React.Fragment>
        );
      case 'usub':
        return (
          <sub key={key} className={SUB_CLASS}>
            {tok.sub}
          </sub>
        );
      case 'sup':
        return (
          <sup key={key} className={SUP_CLASS}>
            {tok.sup}
          </sup>
        );
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  KaTeX physics engine for plain text                                        */
/* -------------------------------------------------------------------------- */

type LexKind =
  | 'ws'
  | 'num'
  | 'word'
  | 'prose'
  | 'usc'
  | 'caret'
  | 'usub'
  | 'usup'
  | 'rel'
  | 'op'
  | 'lp'
  | 'rp'
  | 'sqrt'
  | 'deg'
  | 'pct'
  | 'frac'
  | 'punct'
  | 'bar'
  | 'other';

interface Lex {
  k: LexKind;
  v: string;
}

const LEX_PATTERN = new RegExp(
  [
    '(?<prose>https?:\\/\\/[^\\s)]+|\\d+(?:st|nd|rd|th)\\b|[A-Za-z]+(?:[-‑][A-Za-z0-9]+)+|[A-Za-z]+\\d+[A-Za-z0-9]*)',
    '(?<ws>\\s+)',
    '(?<num>\\d{1,3}(?:,\\d{3})+(?![\\d])(?:\\.\\d+)?|\\d+(?:\\.\\d+)?(?:[eE][+\\-−]?\\d+(?![A-Za-z]))?)',
    "(?<word>[A-Za-zα-ωΑ-Ωµϑϕ]+(?:['’][a-z]+)?[′″]*)",
    '(?<usc>_(?:\\{[^}\\n]{1,24}\\}|[A-Za-z0-9α-ωΑ-Ω]{1,14}(?:,[A-Za-z0-9α-ωΑ-Ω]{1,10})?))',
    '(?<caret>\\^(?:\\{[^}\\n]{1,28}\\}|\\([^()\\n]{1,28}\\)|[+\\-−]?\\d+(?:\\.\\d+)?|[A-Za-zα-ω]))',
    '(?<usub>[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚᵣₛₜ]+)',
    '(?<usup>[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ]+)',
    '(?<rel>[=≈≠≤≥∝≡])',
    '(?<op>[+\\-−×·⋅÷±∓/*])',
    '(?<lp>[(\\[])',
    '(?<rp>[)\\]])',
    '(?<sqrt>√)',
    '(?<deg>°)',
    '(?<pct>%)',
    '(?<frac>[½⅓⅔¼¾⅛])',
    '(?<punct>[,;:.!?])',
    '(?<bar>\\|)',
    '(?<other>[\\s\\S])',
  ].join('|'),
  'gu'
);

function lexPlain(text: string): Lex[] {
  const out: Lex[] = [];
  for (const m of text.matchAll(LEX_PATTERN)) {
    const g = m.groups ?? {};
    const k = (Object.keys(g).find((key) => g[key] !== undefined) ?? 'other') as LexKind;
    out.push({ k, v: m[0] });
  }
  return out;
}

const UNIT_BASES = [
  'm', 's', 'g', 'N', 'J', 'W', 'V', 'A', 'K', 'C', 'T', 'Pa', 'Hz', 'Ω', 'eV',
  'F', 'H', 'Wb', 'Bq', 'L', 'mol', 'Sv', 'Gy', 'lm', 'lx', 'cd', 'rad', 'sr',
];
const UNIT_PREFIXES = ['p', 'n', 'μ', 'µ', 'm', 'c', 'd', 'k', 'M', 'G', 'T'];
const UNIT_SET = new Set<string>([
  'min', 'h', 'd', 'hr', 'yr', 'year', 'years', 'day', 'days', 'ly', 'pc', 'kpc', 'Mpc', 'AU',
  'au', 'u', 'kWh', 'dB', 'atm', 'mL', 'rpm', 'eV', 'keV', 'MeV', 'GeV', 'TeV', 'MeV/c²',
]);
for (const base of UNIT_BASES) {
  UNIT_SET.add(base);
  for (const prefix of UNIT_PREFIXES) {
    if (base === 'm' && prefix === 'm') {
      UNIT_SET.add('mm');
      continue;
    }
    UNIT_SET.add(prefix + base);
  }
}
// Remove prefixed forms that are far more often prose or variables than units.
['dA', 'cA', 'cC', 'cT', 'dT', 'TT', 'Tm', 'cN', 'ds', 'cs', 'dg', 'Ts', 'TA', 'TV', 'TC',
  'TK', 'cK', 'dK', 'mK', 'Mm', 'dH', 'cH', 'Ms', 'Mg', 'cd', 'dL', 'cL', 'nT', 'MV', 'Tg',
  'MA', 'kA', 'MK', 'GK', 'kK', 'GA', 'kC', 'MC', 'GC', 'Gs', 'ks', 'cg', 'kH', 'GH', 'MH',
  'TH', 'pL', 'nL', 'kL', 'ML', 'GL', 'TL', 'cmol', 'dmol', 'Mmol', 'Gmol', 'Tmol',
].forEach((u) => UNIT_SET.delete(u));
['nT', 'MV', 'kA', 'mK', 'Ms', 'cd'].forEach((u) => UNIT_SET.add(u));

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh',
  'tanh', 'ln', 'log', 'exp', 'lg',
]);

const CHEMICAL_SYMBOL =
  /^(?:He|Li|Be|Ne|Na|Mg|Al|Si|Cl|Ar|Ca|Ti|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Zr|Mo|Ru|Ag|Cd|Sn|Sb|Te|Xe|Cs|Ba|La|Ce|Nd|Pt|Au|Hg|Pb|Bi|Po|Rn|Ra|Ac|Th|Pa|Np|Pu|Am|Cm|Cf)$/;

/** Multi-letter abbreviations that are names, not products of variables. */
const UPRIGHT_WORDS = new Set(['emf', 'EMF', 'NA', 'KE', 'PE', 'GPE', 'rms', 'max', 'min', 'net']);

const ENGLISH_SHORT = new Set([
  'a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my',
  'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'am', 'ok', 'oh', 'and', 'the',
  'for', 'are', 'was', 'its', 'per', 'via', 'but', 'not', 'has', 'had', 'can', 'all',
  'any', 'one', 'two', 'new', 'own', 'use', 'out', 'off', 'max', 'min', 'net', 'top',
  'end', 'set', 'see', 'how', 'why', 'who', 'may', 'now', 'way', 'get', 'got', 'let',
]);

const GREEK_TO_LATEX: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta',
  η: '\\eta', θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda',
  μ: '\\mu', µ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma',
  ς: '\\varsigma', τ: '\\tau', υ: '\\upsilon', φ: '\\phi', ϕ: '\\phi', χ: '\\chi',
  ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda',
  Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Υ: '\\Upsilon', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O',
  Ρ: 'P', Τ: 'T', Χ: 'X', ο: 'o',
};

const isGreek = (s: string) => /[α-ωΑ-Ωµϑϕ]/u.test(s);

/** Escapes arbitrary text for KaTeX `\text{...}` / `\mathrm{...}`. */
function texEscapeText(raw: string): string {
  return raw.replace(/[\\{}$&#^_%~]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\textbackslash{}';
      case '~':
        return '\\textasciitilde{}';
      case '^':
        return '\\textasciicircum{}';
      default:
        return `\\${ch}`;
    }
  });
}

/** Converts a letter run in math context: Greek -> commands, primes -> `'`. */
function lettersToTex(word: string, upright = false): string {
  let out = '';
  let latinRun = '';
  const flushLatin = () => {
    if (!latinRun) return;
    out += upright ? `\\mathrm{${latinRun}}` : latinRun;
    latinRun = '';
  };
  for (const ch of Array.from(word)) {
    if (GREEK_TO_LATEX[ch]) {
      flushLatin();
      out += `${GREEK_TO_LATEX[ch]} `;
    } else if (ch === '′' || ch === "'" || ch === '’') {
      flushLatin();
      out += "'";
    } else if (ch === '″') {
      flushLatin();
      out += "''";
    } else if (/[A-Za-z]/.test(ch)) {
      latinRun += ch;
    } else {
      flushLatin();
      out += `\\text{${texEscapeText(ch)}}`;
    }
  }
  flushLatin();
  return out.trimEnd();
}

function unitToTex(unit: string): string {
  if (unit === 'Ω') return '\\Omega';
  let out = '';
  let latinRun = '';
  const flush = () => {
    if (latinRun) out += `\\mathrm{${latinRun}}`;
    latinRun = '';
  };
  for (const ch of Array.from(unit)) {
    if (ch === 'μ' || ch === 'µ') {
      flush();
      out += '\\text{μ}';
    } else if (ch === 'Ω') {
      flush();
      out += '\\Omega';
    } else if (ch === '²') {
      flush();
      out += '^{2}';
    } else if (ch === '/') {
      flush();
      out += '/';
    } else {
      latinRun += ch;
    }
  }
  flush();
  return out;
}

function exponentToTex(raw: string): string {
  const cleaned = raw.replace(/−/g, '-');
  return scriptBodyToTex(cleaned, false);
}

/** Script (sub/sup) bodies: digits/signs stay as math, words become upright text. */
function scriptBodyToTex(raw: string, uprightWords: boolean): string {
  let out = '';
  for (const m of raw.matchAll(/([A-Za-zα-ωΑ-Ωµ]+)|(\d+(?:\.\d+)?)|(\s+)|([\s\S])/gu)) {
    if (m[1]) {
      const word = m[1];
      if (FUNCS.has(word)) out += `\\${word} `;
      else if (uprightWords && /^[A-Za-z]{2,}$/.test(word)) out += `\\mathrm{${word}}`;
      else if (uprightWords && /^[A-Za-z]$/.test(word) && !/^[xyz]$/.test(word))
        out += `\\mathrm{${word}}`;
      else out += lettersToTex(word);
    } else if (m[2]) {
      out += m[2];
    } else if (m[3]) {
      out += '\\,';
    } else if (m[4]) {
      const ch = m[4];
      if (ch === '−' || ch === '-') out += '-';
      else if (ch === '×') out += '\\times ';
      else if (ch === '·' || ch === '⋅') out += '\\cdot ';
      else if ('+/=(),.'.includes(ch)) out += ch;
      else if (ch === '[' || ch === ']') out += ch;
      else if (ch === '∞') out += '\\infty ';
      else out += `\\text{${texEscapeText(ch)}}`;
    }
  }
  return out;
}

function subscriptToTex(raw: string): string {
  let body = raw;
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1);
  return scriptBodyToTex(body, true);
}

function caretToTex(raw: string): string {
  let body = raw.slice(1);
  if ((body.startsWith('{') && body.endsWith('}')) || (body.startsWith('(') && body.endsWith(')'))) {
    body = body.slice(1, -1);
  }
  return exponentToTex(body);
}

function numToTex(raw: string): string {
  let n = raw.replace(/,/g, '{,}');
  const e = n.match(/^(.*?)[eE]([+\-−]?\d+)$/);
  if (e) n = `${e[1]}\\mathrm{e}{${e[2].replace('−', '-')}}`;
  return n;
}

/**
 * A lone lower-case Latin letter used as a variable in prose (`image distance v`,
 * `focal length f.`), excluding the article `a`, `e.g.`/`i.e.`, and part labels `(c)`.
 */
function isLoneProseVariable(toks: Lex[], i: number): boolean {
  const w = toks[i].v;
  if (!/^[b-z][′″]?$/.test(w)) return false;
  const prev = toks[i - 1];
  const next = toks[i + 1];
  if (prev && !['ws', 'lp', 'punct'].includes(prev.k)) return false;
  if (next && !['ws', 'rp', 'punct'].includes(next.k)) return false;
  // `(c)` part labels and `(i)` sub-parts
  if (prev?.k === 'lp' && next?.k === 'rp') return false;
  // `e.g.`, `i.e.`, `c.f.`
  if (next?.k === 'punct' && next.v === '.' && toks[i + 2]?.k === 'word' && toks[i + 2].v.length === 1) {
    return false;
  }
  if (prev?.k === 'punct' && prev.v === '.' && toks[i - 2]?.k === 'word' && toks[i - 2].v.length === 1) {
    return false;
  }
  // A preceding word (`distance v`) or a following verb phrase (`v is`) should exist.
  const p = prevSignificant(toks, i);
  const q = nextSignificant(toks, i);
  return (p !== -1 && toks[p].k === 'word') || (q !== -1 && toks[q].k === 'word');
}

/**
 * A unit group without a number (`kg m⁻³`, `N m`, `J s`, `mm⁻¹`, `m s⁻²`): returns the
 * last token index, or -1. Single letters with positive exponents (`v²`, `r²`) stay variables.
 */
function bareUnitRunEnd(toks: Lex[], i: number): number {
  const t = toks[i];
  if (t.k !== 'word' || !UNIT_SET.has(t.v)) return -1;
  const end = readUnitSequence(toks, i);
  if (end === -1) return -1;
  let factors = 0;
  let multiLetter = false;
  let negativeExp = false;
  let anyExp = false;
  for (let k = i; k <= end; k++) {
    const tok = toks[k];
    if (tok.k === 'word') {
      factors++;
      if (Array.from(tok.v).length > 1) multiLetter = true;
    } else if (tok.k === 'usup' || tok.k === 'caret') {
      anyExp = true;
      if (/[⁻\-−]/.test(tok.v)) negativeExp = true;
    }
  }
  const firstIsUpperUnit = /^[NJWVCTAK]$/.test(t.v);
  if (factors >= 2 && (anyExp || multiLetter || firstIsUpperUnit)) return end;
  if (factors === 1 && (negativeExp || (multiLetter && anyExp))) return end;
  return -1;
}

/** Converts a bare unit group to upright LaTeX. */
function unitRunToTex(toks: Lex[], start: number, end: number): string {
  let out = '';
  for (let k = start; k <= end; k++) {
    const tok = toks[k];
    if (tok.k === 'word') out += unitToTex(tok.v);
    else if (tok.k === 'ws') out += '\\,';
    else if (tok.k === 'op' && tok.v === '/') out += '/';
    else if (tok.k === 'usup') out += `^{${exponentToTex(mapUnicodeSuperscript(tok.v))}}`;
    else if (tok.k === 'caret') out += `^{${caretToTex(tok.v)}}`;
  }
  return out;
}

/** Inclusive token range rendered through KaTeX. */
interface MathSpan {
  start: number;
  end: number;
  kind: 'eq' | 'qty' | 'sym' | 'unit';
}

/** Can this word-token belong to an equation run? */
function isMathWord(toks: Lex[], i: number): boolean {
  const w = toks[i].v;
  if (isGreek(w)) return true;
  if (FUNCS.has(w)) return true;
  const bare = w.replace(/[′″]+$/, '');
  const lower = bare.toLowerCase();
  const prevSig = prevSignificant(toks, i);
  const nextSig = nextSignificant(toks, i);
  const prevIsOp = prevSig !== -1 && ['rel', 'op', 'lp', 'sqrt'].includes(toks[prevSig].k);
  const nextIsOp =
    nextSig !== -1 && ['rel', 'op', 'rp', 'usc', 'caret', 'usup', 'usub'].includes(toks[nextSig].k);
  const glued = i + 1 < toks.length && ['usc', 'caret', 'usup', 'usub'].includes(toks[i + 1].k);
  if (bare.length === 1) {
    // Article / pronoun guard: `a car`, `I measured`
    if ((bare === 'a' || bare === 'I' || bare === 'A') && !prevIsOp && !nextIsOp && !glued) {
      return false;
    }
    return true;
  }
  if (/['’]/.test(bare)) return false;
  // Chemical element symbols (`He⁺`, `Na`, `Fe`) are upright names, not products.
  if (CHEMICAL_SYMBOL.test(bare) && !prevIsOp) return false;
  if (bare.length <= 3 && /^[A-Za-z]+$/.test(bare)) {
    if (ENGLISH_SHORT.has(lower)) return prevIsOp && bare.length <= 2;
    if (UNIT_SET.has(bare) && endsNumeric(toks, i)) return true;
    const nextIsFunc = nextSig !== -1 && FUNCS.has(toks[nextSig].v);
    return prevIsOp || nextIsOp || glued || nextIsFunc;
  }
  if (UNIT_SET.has(bare) && endsNumeric(toks, i)) return true;
  return false;
}

function prevSignificant(toks: Lex[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (toks[j].k !== 'ws') return j;
  return -1;
}

function nextSignificant(toks: Lex[], i: number): number {
  for (let j = i + 1; j < toks.length; j++) if (toks[j].k !== 'ws') return j;
  return -1;
}

function isEquationToken(toks: Lex[], i: number): boolean {
  const t = toks[i];
  switch (t.k) {
    case 'ws':
      return !t.v.includes('\n') && t.v.length <= 3;
    case 'num':
    case 'usc':
    case 'caret':
    case 'usub':
    case 'usup':
    case 'rel':
    case 'op':
    case 'lp':
    case 'rp':
    case 'sqrt':
    case 'deg':
    case 'pct':
    case 'frac':
      return true;
    case 'word':
      return isMathWord(toks, i);
    case 'bar':
      // Absolute-value bars glued to a symbol: `|E₁| = 1.44 N C⁻¹`
      return (
        (i > 0 && toks[i - 1].k !== 'ws') || (i + 1 < toks.length && toks[i + 1].k !== 'ws')
      );
    case 'punct':
      // Decimal-free commas inside brackets like `(x, y)` are not supported; stop.
      return false;
    default:
      return false;
  }
}

/** Unit sequence starting at `i` (after a number + single space). Returns last index or -1. */
function readUnitSequence(toks: Lex[], i: number): number {
  let last = -1;
  let j = i;
  while (j < toks.length) {
    const t = toks[j];
    if (t.k === 'word' && UNIT_SET.has(t.v)) {
      last = j;
      j++;
      while (j < toks.length && (toks[j].k === 'usup' || toks[j].k === 'caret')) {
        last = j;
        j++;
      }
      // `m/s`, `km/h`
      if (
        j + 1 < toks.length &&
        toks[j].k === 'op' &&
        toks[j].v === '/' &&
        toks[j + 1].k === 'word' &&
        UNIT_SET.has(toks[j + 1].v)
      ) {
        j++;
        continue;
      }
      // Next unit factor separated by a single space: `m s⁻²`, `J kg⁻¹ K⁻¹`
      if (
        j + 1 < toks.length &&
        toks[j].k === 'ws' &&
        toks[j].v === ' ' &&
        toks[j + 1].k === 'word' &&
        UNIT_SET.has(toks[j + 1].v) &&
        // `2 m s⁻¹ at t = ...`: the following unit must itself look like a unit factor
        (toks[j + 2]?.k === 'usup' ||
          toks[j + 2]?.k === 'caret' ||
          toks[j + 1].v.length > 1 ||
          /^[sKAJWNVCm]$/.test(toks[j + 1].v)) &&
        !(toks[j + 2]?.k === 'ws' && toks[j + 3]?.k === 'rel')
      ) {
        j++;
        continue;
      }
      break;
    }
    break;
  }
  return last;
}

/**
 * Finds standalone quantity spans: number [(uncertainty)] [× 10^n] [unit sequence | ° | %]
 * [(alternative unit)].
 */
function findQuantity(toks: Lex[], i: number): number {
  if (toks[i].k !== 'num') return -1;
  let end = i;
  let hasUnitish = false;
  // Concise uncertainty glued to the mantissa: `1.67(3)`
  if (toks[i + 1]?.k === 'lp' && toks[i + 2]?.k === 'num' && toks[i + 3]?.k === 'rp') {
    end = i + 3;
  }
  // Scientific notation: `× 10³`, `x 10^-3`
  const sci = (() => {
    let j = end + 1;
    if (toks[j]?.k === 'ws') j++;
    const times = toks[j];
    if (!times) return -1;
    if (
      !(times.k === 'op' && (times.v === '×' || times.v === '·' || times.v === '⋅')) &&
      !(times.k === 'word' && times.v === 'x')
    ) {
      return -1;
    }
    j++;
    if (toks[j]?.k === 'ws') j++;
    if (toks[j]?.k !== 'num' || toks[j].v !== '10') return -1;
    j++;
    if (toks[j]?.k === 'usup' || toks[j]?.k === 'caret') return j;
    return -1;
  })();
  if (sci !== -1) {
    end = sci;
    hasUnitish = true;
  } else if (toks[i].v === '10' && (toks[i + 1]?.k === 'usup' || toks[i + 1]?.k === 'caret')) {
    end = i + 1;
    hasUnitish = true;
  }
  const after = toks[end + 1];
  if (after?.k === 'deg') {
    end += 1;
    if (toks[end + 1]?.k === 'word' && toks[end + 1].v === 'C') end += 1;
    return end;
  }
  if (after?.k === 'pct') return end + 1;
  if (after?.k === 'ws' && after.v === ' ') {
    if (toks[end + 2]?.k === 'deg') {
      end += 2;
      if (toks[end + 1]?.k === 'word' && toks[end + 1].v === 'C') end += 1;
      return end;
    }
    const unitEnd = readUnitSequence(toks, end + 2);
    if (unitEnd !== -1) {
      // Alternative unit in brackets: `9.81 N kg⁻¹ (m s⁻²)`
      if (toks[unitEnd + 1]?.k === 'ws' && toks[unitEnd + 2]?.k === 'lp') {
        const altEnd = readUnitSequence(toks, unitEnd + 3);
        if (altEnd !== -1 && toks[altEnd + 1]?.k === 'rp') return altEnd + 1;
      }
      return unitEnd;
    }
  }
  return hasUnitish || end > i ? end : -1;
}

/** True when the significant token before `i` is a number or a `10ⁿ` exponent. */
function endsNumeric(toks: Lex[], i: number): boolean {
  const p = prevSignificant(toks, i + 0 === i ? i : i);
  if (p === -1) return false;
  if (toks[p].k === 'num' || toks[p].k === 'deg') return toks[p].k === 'num';
  if ((toks[p].k === 'usup' || toks[p].k === 'caret') && toks[p - 1]?.k === 'num') return true;
  return false;
}

/** Converts a token range (in math context) to LaTeX. */
function tokensToTex(toks: Lex[], start: number, end: number): string {
  let out = '';
  let unitMode = false;
  let prevKind: LexKind | null = null;
  for (let i = start; i <= end; i++) {
    const t = toks[i];
    switch (t.k) {
      case 'ws': {
        const next = toks[i + 1];
        if (endsNumeric(toks, i) && next?.k === 'word' && UNIT_SET.has(next.v) && readUnitSequence(toks, i + 1) !== -1) {
          out += '\\ ';
          unitMode = true;
        } else if (unitMode && next?.k === 'word' && UNIT_SET.has(next.v)) {
          out += '\\,';
        } else if (unitMode && next?.k === 'lp') {
          out += '\\ ';
        } else {
          unitMode = false;
          out += ' ';
          // Thin space between juxtaposed symbols (`g r`, `N cos`) keeps them legible.
          const prevTok = toks[prevSignificant(toks, i)];
          if (
            prevKind === 'word' &&
            next?.k === 'word' &&
            !FUNCS.has(next.v) &&
            !(prevTok && FUNCS.has(prevTok.v))
          ) {
            out += '\\,';
          }
        }
        break;
      }
      case 'num':
        out += numToTex(t.v);
        unitMode = false;
        break;
      case 'word': {
        if (unitMode && UNIT_SET.has(t.v)) {
          out += unitToTex(t.v);
        } else if (FUNCS.has(t.v)) {
          out += `\\${t.v} `;
          unitMode = false;
        } else if (prevKind === 'num' && UNIT_SET.has(t.v) && t.v.length > 1) {
          out += `\\,${unitToTex(t.v)}`;
          unitMode = true;
        } else if (t.v === 'x' && toks[i + 2]?.v === '10' && prevKind !== 'word') {
          out += '\\times ';
        } else if (UPRIGHT_WORDS.has(t.v) || CHEMICAL_SYMBOL.test(t.v)) {
          out += `\\mathrm{${t.v}}`;
          unitMode = false;
        } else {
          out += lettersToTex(t.v);
          unitMode = false;
        }
        break;
      }
      case 'usc':
      case 'usub':
      case 'caret':
      case 'usup': {
        // Merge consecutive scripts of the same kind (`E_k_max`, `T₁_a`, `x²^3`) so KaTeX
        // never sees a double subscript/superscript.
        const isSub = (k: LexKind) => k === 'usc' || k === 'usub';
        const subParts: string[] = [];
        const supParts: string[] = [];
        let j = i;
        while (j <= end && ['usc', 'usub', 'caret', 'usup'].includes(toks[j].k)) {
          const s = toks[j];
          if (isSub(s.k)) {
            subParts.push(
              s.k === 'usc'
                ? subscriptToTex(s.v.slice(1))
                : scriptBodyToTex(mapUnicodeSubscript(s.v), true)
            );
          } else {
            supParts.push(
              s.k === 'caret' ? caretToTex(s.v) : exponentToTex(mapUnicodeSuperscript(s.v))
            );
          }
          j++;
        }
        if (subParts.length) out += `_{${subParts.join(',')}}`;
        if (supParts.length) out += `^{${supParts.join('')}}`;
        i = j - 1;
        prevKind = toks[i].k;
        continue;
      }
      case 'rel':
        out += { '=': '=', '≈': '\\approx ', '≠': '\\neq ', '≤': '\\le ', '≥': '\\ge ', '∝': '\\propto ', '≡': '\\equiv ' }[t.v] ?? t.v;
        unitMode = false;
        break;
      case 'op':
        out +=
          { '+': '+', '-': '-', '−': '-', '×': '\\times ', '·': '\\cdot ', '⋅': '\\cdot ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ', '/': '/', '*': '\\ast ' }[t.v] ?? t.v;
        if (t.v !== '/') unitMode = false;
        break;
      case 'lp': {
        out += t.v === '(' ? '(' : '[';
        // `9.81 N kg⁻¹ (m s⁻²)`: an alternative unit in brackets stays upright.
        const altEnd: number = unitMode ? readUnitSequence(toks, i + 1) : -1;
        unitMode = altEnd !== -1 && toks[altEnd + 1]?.k === 'rp';
        break;
      }
      case 'rp':
        out += t.v === ')' ? ')' : ']';
        break;
      case 'sqrt': {
        // √(expr) -> \sqrt{expr}; √x -> \sqrt{x}
        const next = toks[i + 1];
        if (next?.k === 'lp') {
          let depth = 0;
          let close = -1;
          for (let j = i + 1; j <= end; j++) {
            if (toks[j].k === 'lp') depth++;
            else if (toks[j].k === 'rp') {
              depth--;
              if (depth === 0) {
                close = j;
                break;
              }
            }
          }
          if (close !== -1) {
            out += `\\sqrt{${tokensToTex(toks, i + 2, close - 1)}}`;
            i = close;
            prevKind = 'rp';
            continue;
          }
        } else if (next && (next.k === 'num' || next.k === 'word')) {
          let j = i + 1;
          while (j + 1 <= end && ['usc', 'usub', 'usup', 'caret'].includes(toks[j + 1].k)) j++;
          out += `\\sqrt{${tokensToTex(toks, i + 1, j)}}`;
          i = j;
          prevKind = 'word';
          continue;
        }
        out += '\\surd ';
        break;
      }
      case 'deg':
        out += '^{\\circ}';
        if (toks[i + 1]?.k === 'word' && toks[i + 1].v === 'C' && i + 1 <= end) {
          out += '\\mathrm{C}';
          i++;
        }
        break;
      case 'pct':
        out += '\\%';
        break;
      case 'bar':
        out += '|';
        break;
      case 'frac':
        out += { '½': '\\tfrac{1}{2}', '⅓': '\\tfrac{1}{3}', '⅔': '\\tfrac{2}{3}', '¼': '\\tfrac{1}{4}', '¾': '\\tfrac{3}{4}', '⅛': '\\tfrac{1}{8}' }[t.v] ?? '';
        break;
      default:
        out += `\\text{${texEscapeText(t.v)}}`;
    }
    if (t.k !== 'ws') prevKind = t.k;
  }
  return out.trim();
}

export type PlainPhysicsSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; latex: string; source: string; nowrap: boolean };

/** Trims unmatched or wholly-enclosing brackets from a span's edges. */
function trimSpan(toks: Lex[], span: MathSpan): MathSpan | null {
  let { start, end } = span;
  const trimWs = () => {
    while (start <= end && toks[start].k === 'ws') start++;
    while (end >= start && toks[end].k === 'ws') end--;
  };
  trimWs();
  // Leading part label `(c)` / `(ii)` and trailing option letter `(B)` stay in prose.
  if (
    end - start >= 3 &&
    toks[start].k === 'lp' &&
    toks[start + 1]?.k === 'word' &&
    /^(?:[a-h]|i{1,3}|iv|v|vi{0,3})$/.test(toks[start + 1].v) &&
    toks[start + 2]?.k === 'rp'
  ) {
    start += 3;
    trimWs();
  }
  if (
    end - start >= 3 &&
    toks[end].k === 'rp' &&
    toks[end - 1]?.k === 'word' &&
    /^[A-E]$/.test(toks[end - 1].v) &&
    toks[end - 2]?.k === 'lp'
  ) {
    end -= 3;
    trimWs();
  }
  for (let guard = 0; guard < 6 && start <= end; guard++) {
    // Balance check
    let depth = 0;
    let minDepth = 0;
    for (let i = start; i <= end; i++) {
      if (toks[i].k === 'lp') depth++;
      else if (toks[i].k === 'rp') {
        depth--;
        minDepth = Math.min(minDepth, depth);
      }
    }
    if (minDepth < 0 && toks[end].k === 'rp') {
      end--;
      trimWs();
      continue;
    }
    if (depth > 0 && toks[start].k === 'lp') {
      start++;
      trimWs();
      continue;
    }
    if (minDepth < 0 && toks[start].k === 'rp') {
      start++;
      trimWs();
      continue;
    }
    if (depth > 0 && toks[end].k === 'lp') {
      end--;
      trimWs();
      continue;
    }
    // Strip trailing operators (`=`, `+`) and leading binary operators that dangle.
    if (toks[end].k === 'rel' || (toks[end].k === 'op' && toks[end].v !== '−')) {
      end--;
      trimWs();
      continue;
    }
    if (toks[start].k === 'rel' || (toks[start].k === 'op' && !['−', '-', '+', '±'].includes(toks[start].v))) {
      start++;
      trimWs();
      continue;
    }
    if (depth !== 0 || minDepth < 0) {
      // Unbalanced in the middle: give up on this span.
      return null;
    }
    // Enclosing `( ... )` around the whole span stays in prose for typographic rhythm.
    if (toks[start].k === 'lp' && toks[end].k === 'rp') {
      let d = 0;
      let enclosing = true;
      for (let i = start; i <= end; i++) {
        if (toks[i].k === 'lp') d++;
        else if (toks[i].k === 'rp') d--;
        if (d === 0 && i < end) {
          enclosing = false;
          break;
        }
      }
      if (enclosing) {
        start++;
        end--;
        trimWs();
        continue;
      }
    }
    break;
  }
  if (start > end) return null;
  return { ...span, start, end };
}

/**
 * Expands an anchor (relation or function) over equation-eligible tokens. An unmatched
 * bracket ends the run: in `Sections 1–8 (g = 9.81 m s⁻²)` the equation lives inside
 * the parentheses, so nothing before `(` may join it.
 */
function expandRun(toks: Lex[], claimed: boolean[], anchor: number): [number, number] {
  let left = anchor;
  let depth = 0;
  for (let j = anchor - 1; j >= 0; j--) {
    if (claimed[j] || !isEquationToken(toks, j)) break;
    if (toks[j].k === 'rp') depth++;
    else if (toks[j].k === 'lp') {
      depth--;
      if (depth < 0) {
        left = j;
        break;
      }
    }
    left = j;
  }
  let right = anchor;
  depth = 0;
  for (let j = anchor + 1; j < toks.length; j++) {
    if (claimed[j] || !isEquationToken(toks, j)) break;
    if (toks[j].k === 'lp') depth++;
    else if (toks[j].k === 'rp') {
      depth--;
      if (depth < 0) {
        right = j;
        break;
      }
    }
    right = j;
  }
  return [left, right];
}

/**
 * Segments plain physics prose into text and KaTeX-ready math spans:
 * equations (`N cos θ = mg`), quantities (`4.03 × 10³ N`, `9.81 m s⁻²`, `25°`),
 * and subscripted / exponentiated symbols (`v_max`, `μ_s`, `E_k`, `mm⁻¹`).
 */
export function segmentPlainPhysics(text: string): PlainPhysicsSegment[] {
  if (!text) return [];
  const toks = lexPlain(text);
  const n = toks.length;
  const claimed = new Array<boolean>(n).fill(false);
  const spans: MathSpan[] = [];

  // 1) Equation runs anchored on relational operators.
  for (let r = 0; r < n; r++) {
    if (toks[r].k !== 'rel' || claimed[r]) continue;
    const [left, right] = expandRun(toks, claimed, r);
    const span = trimSpan(toks, { start: left, end: right, kind: 'eq' });
    if (!span) continue;
    // Require a real left-hand side and right-hand side.
    const hasRel = toks.slice(span.start, span.end + 1).some((t) => t.k === 'rel');
    const relIdx = toks.findIndex((t, idx) => idx >= span.start && idx <= span.end && t.k === 'rel');
    if (!hasRel || relIdx === span.start || relIdx === span.end) continue;
    for (let i = span.start; i <= span.end; i++) claimed[i] = true;
    spans.push(span);
  }

  // 1b) Function-anchored expressions without a relation: `mg tan θ`, `mg / cos θ`.
  for (let f = 0; f < n; f++) {
    if (claimed[f] || toks[f].k !== 'word' || !FUNCS.has(toks[f].v)) continue;
    const arg = nextSignificant(toks, f);
    if (arg === -1 || !['word', 'num', 'lp'].includes(toks[arg].k)) continue;
    if (toks[arg].k === 'word' && !isGreek(toks[arg].v) && toks[arg].v.length > 1) continue;
    const [left, right] = expandRun(toks, claimed, f);
    const span = trimSpan(toks, { start: left, end: right, kind: 'eq' });
    if (!span || span.end <= f) continue;
    let free = true;
    for (let i = span.start; i <= span.end; i++) if (claimed[i]) free = false;
    if (!free) continue;
    for (let i = span.start; i <= span.end; i++) claimed[i] = true;
    spans.push(span);
  }

  // 2a) Bracketed groups with a trailing subscript: `(r⁻²)_max`, `(L/A)_max`.
  for (let i = 0; i < n; i++) {
    if (claimed[i] || toks[i].k !== 'rp' || toks[i + 1]?.k !== 'usc') continue;
    let depth = 0;
    let open = -1;
    for (let j = i; j >= 0 && i - j < 24; j--) {
      if (claimed[j] || toks[j].k === 'ws') break;
      if (toks[j].k === 'rp') depth++;
      else if (toks[j].k === 'lp') {
        depth--;
        if (depth === 0) {
          open = j;
          break;
        }
      }
    }
    if (open === -1) continue;
    let end = i + 1;
    while (end + 1 < n && ['usc', 'caret', 'usup'].includes(toks[end + 1].k)) end++;
    for (let k = open; k <= end; k++) claimed[k] = true;
    spans.push({ start: open, end, kind: 'sym' });
    i = end;
  }

  // 2b) Standalone quantities and symbol chunks.
  for (let i = 0; i < n; i++) {
    if (claimed[i]) continue;
    const t = toks[i];
    if (t.k === 'num') {
      const prev = toks[i - 1];
      // Skip numbers glued to a preceding symbol/decimal (`Q1` is prose-lexed already).
      if (prev && (prev.k === 'word' || prev.k === 'num')) continue;
      let start = i;
      // Leading sign: `−3.2 × 10⁻¹⁹ C`
      if (prev?.k === 'op' && (prev.v === '−' || prev.v === '-' || prev.v === '+') && !claimed[i - 1]) {
        const before = toks[i - 2];
        if (!before || before.k === 'ws' || before.k === 'lp') start = i - 1;
      }
      const end = findQuantity(toks, i);
      if (end === -1) continue;
      let ok = true;
      for (let k = start; k <= end; k++) if (claimed[k]) ok = false;
      if (!ok) continue;
      for (let k = start; k <= end; k++) claimed[k] = true;
      spans.push({ start, end, kind: 'qty' });
      i = end;
      continue;
    }
    if (t.k === 'word') {
      const next = toks[i + 1];
      const hasScript = next && ['usc', 'caret', 'usup', 'usub'].includes(next.k);
      const loneGreek = /^[α-ωϑϕ][′″]?$/u.test(t.v);
      const prevWordish = toks[i - 1] && ['word', 'num'].includes(toks[i - 1].k);
      if (prevWordish) continue;
      // Bare unit groups with no number: `(kg m⁻³)`, `N m`, `J s`, `mm⁻¹`.
      const unitEnd = bareUnitRunEnd(toks, i);
      if (unitEnd !== -1) {
        let free = true;
        for (let k = i; k <= unitEnd; k++) if (claimed[k]) free = false;
        if (free) {
          for (let k = i; k <= unitEnd; k++) claimed[k] = true;
          spans.push({ start: i, end: unitEnd, kind: 'unit' });
          i = unitEnd;
          continue;
        }
      }
      if (!hasScript && !loneGreek && isLoneProseVariable(toks, i)) {
        claimed[i] = true;
        spans.push({ start: i, end: i, kind: 'sym' });
        continue;
      }
      if (!hasScript && !loneGreek) continue;
      if (hasScript && t.v.length > 3 && !isGreek(t.v)) continue;
      let end = i;
      while (end + 1 < n && ['usc', 'caret', 'usup', 'usub'].includes(toks[end + 1].k) && !claimed[end + 1]) end++;
      // `V₀e^(−t/RC)`: absorb a directly glued symbol + script
      while (
        end + 2 < n &&
        toks[end + 1].k === 'word' &&
        toks[end + 1].v.length <= 2 &&
        ['usc', 'caret', 'usup', 'usub'].includes(toks[end + 2].k)
      ) {
        end += 2;
        while (end + 1 < n && ['usc', 'caret', 'usup', 'usub'].includes(toks[end + 1].k)) end++;
      }
      for (let k = i; k <= end; k++) claimed[k] = true;
      spans.push({ start: i, end, kind: 'sym' });
      i = end;
      continue;
    }
    if (t.k === 'rp' && toks[i + 1]?.k === 'usc') {
      // `(r⁻²)_max` -> find the matching open bracket in unclaimed tokens
      let depth = 0;
      let open = -1;
      for (let j = i; j >= 0; j--) {
        if (claimed[j]) break;
        if (toks[j].k === 'rp') depth++;
        else if (toks[j].k === 'lp') {
          depth--;
          if (depth === 0) {
            open = j;
            break;
          }
        }
      }
      if (open !== -1) {
        let end = i + 1;
        while (end + 1 < n && ['usc', 'caret', 'usup'].includes(toks[end + 1].k)) end++;
        for (let k = open; k <= end; k++) claimed[k] = true;
        spans.push({ start: open, end, kind: 'sym' });
        i = end;
      }
      continue;
    }
    if ((t.k === 'usup' || t.k === 'usub' || t.k === 'usc' || t.k === 'caret') && i > 0) {
      // Orphan script attached to a closing bracket or a claimed span: render alone.
      for (let k = i; k <= i; k++) claimed[k] = true;
      spans.push({ start: i, end: i, kind: 'sym' });
      continue;
    }
  }

  spans.sort((a, b) => a.start - b.start);

  const out: PlainPhysicsSegment[] = [];
  let cursor = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'text') prev.value += value;
    else out.push({ kind: 'text', value });
  };
  for (const span of spans) {
    if (span.start < cursor) continue;
    pushText(toks.slice(cursor, span.start).map((t) => t.v).join(''));
    const source = toks.slice(span.start, span.end + 1).map((t) => t.v).join('');
    let latex = '';
    if (toks[span.start].k === 'usup' && span.start === span.end) {
      latex = `{}^{${exponentToTex(mapUnicodeSuperscript(toks[span.start].v))}}`;
    } else if (toks[span.start].k === 'usub' && span.start === span.end) {
      latex = `{}_{${scriptBodyToTex(mapUnicodeSubscript(toks[span.start].v), true)}}`;
    } else if ((toks[span.start].k === 'usc' || toks[span.start].k === 'caret') && span.start === span.end) {
      latex =
        toks[span.start].k === 'usc'
          ? `{}_{${subscriptToTex(toks[span.start].v.slice(1))}}`
          : `{}^{${caretToTex(toks[span.start].v)}}`;
    } else if (span.kind === 'unit') {
      latex = unitRunToTex(toks, span.start, span.end);
    } else {
      latex = tokensToTex(toks, span.start, span.end);
    }
    if (!latex) {
      pushText(source);
    } else {
      out.push({ kind: 'math', latex, source, nowrap: span.kind !== 'eq' || source.length <= 28 });
    }
    cursor = span.end + 1;
  }
  pushText(toks.slice(cursor).map((t) => t.v).join(''));
  return out;
}

function renderPlainPhysics(text: string, keyPrefix: string): React.ReactNode[] {
  const polished = polishPhysicsProse(text);
  const segments = segmentPlainPhysics(polished);
  // Glue an opening bracket to the math that follows (`He⁺ (Z = 2)` never strands `(`)
  // and closing brackets/punctuation to the math that precedes it.
  const glued: Array<PlainPhysicsSegment & { lead?: string; trail?: string }> = segments.map(
    (seg) => ({ ...seg })
  );
  for (let k = 0; k < glued.length; k++) {
    const seg = glued[k];
    if (seg.kind !== 'math') continue;
    const prev = glued[k - 1];
    if (prev && prev.kind === 'text') {
      const m = prev.value.match(/[([]$/);
      if (m) {
        prev.value = prev.value.slice(0, -1);
        seg.lead = m[0];
      }
    }
    const next = glued[k + 1];
    if (next && next.kind === 'text') {
      const m = next.value.match(/^[)\].,;:?!]+/);
      if (m) {
        next.value = next.value.slice(m[0].length);
        seg.trail = m[0];
      }
    }
  }
  return glued.map((seg, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (seg.kind === 'text') {
      // Any scripts the KaTeX path declined fall back to the legacy sup/sub renderer.
      if (/[_^⁰¹²³⁴⁵⁶⁷⁸⁹⁻₀₁₂₃₄₅₆₇₈₉]/.test(seg.value)) {
        return (
          <React.Fragment key={key}>
            {renderInlineTokens(tokenizePlainPhysics(seg.value), key)}
          </React.Fragment>
        );
      }
      return <React.Fragment key={key}>{seg.value}</React.Fragment>;
    }
    const math = (
      <span
        key={key}
        role="math"
        aria-label={seg.source}
        data-sp-math=""
        className={cn(
          // KaTeX sets 1.21em; 0.9em lands math at ~1.09em beside Plus Jakarta Sans.
          'sp-math inline text-[0.9em]',
          seg.nowrap && 'whitespace-nowrap'
        )}
        dangerouslySetInnerHTML={{ __html: renderPhysicsLatexToHtml(seg.latex) }}
      />
    );
    if (!seg.lead && !seg.trail) return math;
    if (!seg.nowrap) {
      // Long equations must stay breakable; keep brackets as plain siblings.
      return (
        <React.Fragment key={key}>
          {seg.lead}
          {math}
          {seg.trail}
        </React.Fragment>
      );
    }
    return (
      <span key={key} className="whitespace-nowrap">
        {seg.lead}
        {math}
        {seg.trail}
      </span>
    );
  });
}

export function MathText({
  text,
  className,
  block = false,
  katexPhysics = true,
}: MathTextProps) {
  const Wrapper = block ? 'div' : 'span';

  if (!text) {
    return <Wrapper className={className} />;
  }

  const segments = splitLatexSegments(text, block);

  return (
    <Wrapper className={cn(block ? 'block' : 'inline', className)}>
      {segments.map((segment, segIdx) => {
        if (segment.kind === 'latex') {
          const html = renderLatexToHtml(segment.latex, {
            displayMode: segment.displayMode,
          });
          if (segment.displayMode) {
            return (
              <span
                key={`latex-${segIdx}`}
                className="my-1.5 block overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }
          return (
            <span
              key={`latex-${segIdx}`}
              className="inline"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        if (katexPhysics) {
          return (
            <React.Fragment key={`txt-${segIdx}`}>
              {renderPlainPhysics(segment.value, `t-${segIdx}`)}
            </React.Fragment>
          );
        }

        const inlineTokens = tokenizePlainPhysics(segment.value);
        return (
          <React.Fragment key={`txt-${segIdx}`}>
            {renderInlineTokens(inlineTokens, `t-${segIdx}`)}
          </React.Fragment>
        );
      })}
    </Wrapper>
  );
}
