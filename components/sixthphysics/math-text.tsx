import React from 'react';
import katex from 'katex';
import { cn } from '@/lib/utils';

export interface MathTextProps {
  text: string;
  className?: string;
  block?: boolean;
}

export interface LatexRenderOptions {
  displayMode?: boolean;
}

const UNICODE_SUP_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '−',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  ⁿ: 'n',
};

const UNICODE_SUB_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '−',
  '₌': '=',
  '₍': '(',
  '₎': ')',
  ₐ: 'a',
  ₑ: 'e',
  ₒ: 'o',
  ₓ: 'x',
  ₕ: 'h',
  ₖ: 'k',
  ₗ: 'l',
  ₘ: 'm',
  ₙ: 'n',
  ₚ: 'p',
  ᵣ: 'r',
  ₛ: 's',
  ₜ: 't',
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
          rawSegments.push({
            kind: 'latex',
            latex: inner,
            displayMode: true,
          });
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
          rawSegments.push({
            kind: 'latex',
            latex: inner,
            displayMode: true,
          });
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
          rawSegments.push({
            kind: 'latex',
            latex: inner,
            displayMode: false,
          });
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
          rawSegments.push({
            kind: 'latex',
            latex: inner,
            displayMode: false,
          });
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

  if (
    block &&
    finalSegments.length === 1 &&
    finalSegments[0].kind === 'latex'
  ) {
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
    out.push({
      kind: 'latex',
      latex: text.slice(start, macroEnd),
      displayMode: false,
    });
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

export type InlinePhysicsToken =
  | { type: 'text'; text: string }
  | { type: 'sci'; prefix: string; exponent: string }
  | { type: 'sub'; base: string; sub: string }
  | { type: 'sup'; sup: string }
  | { type: 'usub'; sub: string };

/**
 * Combined left-to-right pattern for non-LaTeX physics typography:
 * 1. URLs (preserved verbatim)
 * 2. Scientific notation: `2.50 × 10⁻⁶`, `10⁻³`, `6.67 × 10^-11`, `3.00 × 10^{8}`
 * 3. Inline physics subscripts: `v_rms`, `E_p`, `V_s`, `f_0`, `λ_max`, `E_k,max`, `2u_y`, `Σm_reactants`
 * 4. Unicode superscript runs: `⁻²`, `⁻¹`, `²`, `³`, `⁴`
 * 5. Unicode subscript runs: `₀`, `₁`, `₂`, `ᵣ`
 * 6. Caret superscripts attached to a preceding term: `^(3/2)`, `^(−t/RC)`, `^{-6}`, `^2`, `^-2`
 *
 * Normal English prose, hyphenated words (`cross-section`, `mass-spring`, `A-Level`),
 * and plain numbers pass through untouched.
 */
const INLINE_PHYSICS_PATTERN = new RegExp(
  [
    // 1: URLs
    '(?<url>https?:\\/\\/[^\\s)]+)',
    // 2: Scientific notation (optional mantissa × 10^exp or standalone 10^exp)
    '(?<![A-Za-z0-9.])(?<sciPrefix>(?:[+-−]?\\d+(?:\\.\\d+)?\\s*(?:×|⋅|·)\\s*|(?:[+-−]?\\d+(?:\\.\\d+)?)\\s+x\\s+)?)10(?<sciExp>[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|\\^\\{[+-−]?\\d+\\}|\\^\\([+-−]?\\d+\\)|\\^[+-−]?\\d+(?!\\.[0-9]))',
    // 3: Inline physics subscripts (e.g. v_rms, E_p, E_k,max, 2u_y, R_1's, (L/A)_max)
    '(?:(?<![A-Za-zα-ωΑ-Ω_])(?<subBase>[A-Za-zα-ωΑ-Ω]{1,3})|(?<=[)\\]])(?<subBracketBase>))_(?:\\{(?<subBraced>[^}\\n]{1,16})\\}|(?<subPlain>[A-Za-z0-9α-ωΑ-Ω]{1,12}(?:,[A-Za-z0-9α-ωΑ-Ω]{1,8})?))(?![A-Za-z0-9_])',
    // 4: Unicode superscripts (units like m s⁻², mm⁻¹, v², T⁴)
    '(?<uSup>[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾]+)',
    // 5: Unicode subscripts (V₀, n₁, θ₂, εᵣ)
    '(?<uSub>[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚᵣₛₜ]+)',
    // 6: Caret superscripts attached to a preceding symbol, number, or closing bracket
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
    } else if (
      groups.subBase !== undefined ||
      groups.subBracketBase !== undefined
    ) {
      const subText = groups.subBraced ?? groups.subPlain ?? '';
      tokens.push({
        type: 'sub',
        base: groups.subBase ?? '',
        sub: subText,
      });
    } else if (groups.uSup !== undefined) {
      tokens.push({ type: 'sup', sup: mapUnicodeSuperscript(groups.uSup) });
    } else if (groups.uSub !== undefined) {
      tokens.push({ type: 'usub', sub: mapUnicodeSubscript(groups.uSub) });
    } else if (
      groups.caretParen !== undefined ||
      groups.caretBrace !== undefined ||
      groups.caretSimple !== undefined
    ) {
      const raw =
        groups.caretParen ?? groups.caretBrace ?? groups.caretSimple ?? '';
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

export function MathText({ text, className, block = false }: MathTextProps) {
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
