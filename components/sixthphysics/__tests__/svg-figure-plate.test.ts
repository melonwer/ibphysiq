import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SvgFigurePlate,
  enforceLabelFloor,
  estimateSvgContentBox,
  extractFigureCaptions,
  frameSvgMarkup,
  parseViewBox,
  prepareSvgFigure,
  prepareSvgFigureParts,
  readableA11yText,
  scopeSvgMarkup,
  tidyStackedLegends,
  typesetSvgLabel,
  typesetSvgMarkup,
} from '@/components/sixthphysics/svg-figure-plate';

interface BankItem {
  id: string;
  svgMarkup?: string;
}

const BANKED_CURVE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460" role="img" aria-label="Banked circular road curve force diagram"><title>Banked circular road curve force diagram</title><defs><marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1d4ed8"/></marker></defs><rect width="720" height="460" fill="#ffffff"/><g font-family="Arial, sans-serif"><polygon points="129.6,358.8 547.2,358.8 547.2,164.07" fill="#f9fafb" stroke="#1f2937" stroke-width="2.2"/><text x="203.798" y="346.351" text-anchor="start" font-size="13" fill="#1f2937">θ = 25 °</text><g transform="translate(339.99 243.039) rotate(-25)"><rect x="-24" y="-14" width="48" height="28" rx="4" fill="#ffffff" stroke="#1f2937" stroke-width="2.2"/></g><line x1="339.99" y1="243.039" x2="307.026" y2="172.347" stroke="#1d4ed8" stroke-width="2" marker-end="url(#arrow-blue)"/><text x="299.026" y="164.347" text-anchor="end" font-size="13" fill="#1d4ed8" font-weight="bold">N</text><text x="349.99" y="321.039" text-anchor="start" font-size="13" fill="#b91c1c">m = 880 kg</text><text x="267.99" y="199.039" text-anchor="middle" font-size="12" fill="#047857">a_c (to center)</text><text x="172.8" y="73.6" text-anchor="start" font-size="13" fill="#1f2937">r = 215 m</text><text x="172.8" y="105.8" text-anchor="start" font-size="13" fill="#1f2937">v_ideal</text><text x="172.8" y="138" text-anchor="start" font-size="13" fill="#1f2937">Smooth bank (μ_s = 0)</text></g></svg>';

/** Visible character data of every `<text>` node (tags stripped, ZWSP removed). */
function visibleTextNodes(svg: string): string[] {
  return (svg.match(/<text\b[\s\S]*?<\/text>/g) ?? []).map((node) =>
    node
      .replace(/<[^>]+>/g, '')
      .replace(/&#8203;/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

/**
 * Strict-enough XML well-formedness check: balanced tags, quoted unique attributes,
 * no stray `<`, and only valid entity references.
 */
function xmlProblems(svg: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
  let i = 0;
  while (i < svg.length) {
    const lt = svg.indexOf('<', i);
    const textChunk = svg.slice(i, lt === -1 ? svg.length : lt);
    for (const amp of textChunk.matchAll(/&([^;\s]{0,12});?/g)) {
      if (!/^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);$/.test(amp[0])) {
        problems.push(`bad entity ${amp[0]}`);
      }
    }
    if (lt === -1) break;
    tagRe.lastIndex = lt;
    const m = tagRe.exec(svg);
    if (!m) {
      problems.push(`malformed tag near ${svg.slice(lt, lt + 40)}`);
      break;
    }
    const [, closing, name, attrs, selfClose] = m;
    const names = Array.from(attrs.matchAll(/([A-Za-z_:][\w:.-]*)\s*=/g)).map((a) => a[1]);
    if (new Set(names).size !== names.length) problems.push(`duplicate attribute on <${name}>`);
    if (closing) {
      const open = stack.pop();
      if (open !== name) problems.push(`mismatched </${name}> (open <${open}>)`);
    } else if (!selfClose) {
      stack.push(name);
    }
    i = tagRe.lastIndex;
  }
  if (stack.length) problems.push(`unclosed <${stack.join('>, <')}>`);
  return problems;
}

const SCRIPT_ASCII: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8',
  '⁹': '9', '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', ⁿ: 'n', '₀': '0', '₁': '1',
  '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+',
  '₋': '-', '₌': '=', '₍': '(', '₎': ')', ₐ: 'a', ₑ: 'e', ₒ: 'o', ₓ: 'x', ₕ: 'h', ₖ: 'k',
  ₗ: 'l', ₘ: 'm', ₙ: 'n', ₚ: 'p', ᵣ: 'r', ₛ: 's', ₜ: 't',
};

/** Label identity modulo typesetting: script markers, brackets, spacing, and minus glyphs. */
function normalizeLabel(raw: string): string {
  return Array.from(raw)
    .map((ch) => SCRIPT_ASCII[ch] ?? ch)
    .join('')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/−/g, '-')
    .replace(/[_^{}()\s]/g, '')
    .replace(/intopage$/, '');
}

function loadBankItems(): BankItem[] {
  const bankPath = path.resolve(process.cwd(), 'dataset/sixthphysics-bank/bank/all-items.json');
  return JSON.parse(fs.readFileSync(bankPath, 'utf8')) as BankItem[];
}

function loadPublicChunkItems(): BankItem[] {
  const dir = path.resolve(process.cwd(), 'public/sixthphysics-data/chunks');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const chunk = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as {
        items?: BankItem[];
      };
      return chunk.items ?? [];
    });
}

describe('SVG physics label typesetter', () => {
  it("xml checker self-test", () => {
    expect(xmlProblems("<svg><text>a</svg>").length).toBeGreaterThan(0);
    expect(xmlProblems("<svg a=\"1\" a=\"2\"/>").length).toBeGreaterThan(0);
    expect(xmlProblems("<svg><text>a & b</text></svg>").length).toBeGreaterThan(0);
    expect(xmlProblems("<svg><text>a &amp; b</text></svg>")).toEqual([]);
    expect(normalizeLabel("v_ideal")).toBe(normalizeLabel("videal"));
  });
  it('turns base_sub labels into italic KaTeX symbols with tspan subscripts', () => {
    expect(typesetSvgLabel('v_ideal')).toEqual([
      { kind: 'symbol', value: 'v', italic: true },
      { kind: 'sub', value: 'ideal' },
    ]);
    expect(typesetSvgLabel('Smooth bank (μ_s = 0)')).toEqual([
      { kind: 'text', value: 'Smooth bank (' },
      { kind: 'symbol', value: 'μ', italic: true },
      { kind: 'sub', value: 's' },
      { kind: 'text', value: ' = 0)' },
    ]);
    expect(typesetSvgLabel('a_c (to center)')[1]).toEqual({ kind: 'sub', value: 'c' });
    expect(typesetSvgLabel('E_k,max')[1]).toEqual({ kind: 'sub', value: 'k,max' });
    expect(typesetSvgLabel('T₁')).toEqual([
      { kind: 'symbol', value: 'T', italic: true },
      { kind: 'sub', value: '1' },
    ]);
  });

  it('italicises variables but keeps units, meters, and point labels upright', () => {
    const r = typesetSvgLabel('r = 215 m');
    expect(r[0]).toEqual({ kind: 'symbol', value: 'r', italic: true });
    expect(r[1]).toEqual({ kind: 'text', value: ' = 215 m' });

    // Point / ammeter labels stay upright; normal force N is a quantity.
    expect(typesetSvgLabel('A')).toEqual([{ kind: 'text', value: 'A' }]);
    expect(typesetSvgLabel('V')).toEqual([{ kind: 'text', value: 'V' }]);
    expect(typesetSvgLabel('N')).toEqual([{ kind: 'symbol', value: 'N', italic: true }]);

    // Axis captions: quantity italic, unit after the slash upright.
    const axis = typesetSvgLabel('volume V / 10⁻³ m³');
    expect(axis).toContainEqual({ kind: 'symbol', value: 'V', italic: true });
    expect(axis).toContainEqual({ kind: 'sup', value: '−3' });
    expect(axis).toContainEqual({ kind: 'sup', value: '3' });

    // Symbolic equations: every single-letter symbol is italic.
    const debroglie = typesetSvgLabel('λ = h / p');
    expect(debroglie.filter((f) => f.kind === 'symbol').map((f) => f.value)).toEqual([
      'λ',
      'h',
      'p',
    ]);
  });

  it('tightens degree spacing, typesets carets, and never leaves raw _ or ^', () => {
    const theta = typesetSvgLabel('θ = 25 °');
    expect(theta[theta.length - 1]).toEqual({ kind: 'text', value: ' = 25°' });

    expect(typesetSvgLabel('10^-3 m')).toContainEqual({ kind: 'sup', value: '−3' });
    expect(typesetSvgLabel('e^(−t/RC)')).toContainEqual({ kind: 'sup', value: '−t/RC' });

    for (const label of ['x_', 'a_b_c', 'k^', '_lead', 'Δm_e', '(L/A)_max']) {
      const visible = typesetSvgLabel(label)
        .filter((f) => f.kind === 'text' || f.kind === 'symbol')
        .map((f) => f.value)
        .join('');
      expect(visible).not.toMatch(/[_^]/);
    }
  });

  it('rewrites the ga-banked-curve-mcq-051 diagram with tspans, Jakarta, and KaTeX italics', () => {
    const out = typesetSvgMarkup(BANKED_CURVE_SVG);
    expect(out).not.toContain('font-family="Arial');
    expect(out).toContain('var(--font-jakarta)');
    expect(out).toContain('font-family="KaTeX_Math');
    expect(out).toContain('font-style="italic"');
    expect(out).toContain('dy="0.36em">ideal</tspan>');
    expect(out).toContain('dy="0.36em">c</tspan>');
    expect(out).toContain('dy="0.36em">s</tspan>');
    expect(out).toContain('25°');
    expect(out).not.toContain('25 °');
    for (const text of visibleTextNodes(out)) {
      expect(text).not.toMatch(/[A-Za-zα-ωΑ-Ω0-9]_[A-Za-z0-9]/);
      expect(text).not.toMatch(/[_^]/);
    }
    expect(xmlProblems(out)).toEqual([]);
  });
});

describe('Tight auto-framing', () => {
  it('ignores the full-canvas background and frames the ramp + labels tightly', () => {
    const box = estimateSvgContentBox(BANKED_CURVE_SVG);
    expect(box).not.toBeNull();
    expect(box!.minX).toBeGreaterThan(100);
    expect(box!.minY).toBeGreaterThan(50);
    expect(box!.maxX).toBeLessThan(600);
    expect(box!.maxY).toBeLessThan(400);

    const framed = frameSvgMarkup(typesetSvgMarkup(BANKED_CURVE_SVG));
    expect(framed.tightened).toBe(true);
    expect(framed.originalViewBox).toEqual({ x: 0, y: 0, width: 720, height: 460 });
    const area = framed.viewBox.width * framed.viewBox.height;
    expect(area / (720 * 460)).toBeLessThan(0.6);
    // Every label anchor still sits inside the new frame.
    for (const [x, y] of [
      [203.8, 346.4],
      [299, 164.3],
      [172.8, 73.6],
      [172.8, 138],
    ]) {
      expect(x).toBeGreaterThan(framed.viewBox.x);
      expect(y).toBeGreaterThan(framed.viewBox.y);
      expect(x).toBeLessThan(framed.viewBox.x + framed.viewBox.width);
      expect(y).toBeLessThan(framed.viewBox.y + framed.viewBox.height);
    }
    expect(framed.markup).toContain('data-sp-orig-viewbox="0 0 720 460"');
    expect(framed.markup).toContain('data-sp-bg="1"');
    expect(framed.markup).toContain('var(--sp-fig-max-h, 290px)');
  });

  it('keeps id scoping intact after typesetting and framing', () => {
    const out = prepareSvgFigure(BANKED_CURVE_SVG, 'q-051');
    expect(out).toContain('id="sp-fig-q-051--arrow-blue"');
    expect(out).toContain('marker-end="url(#sp-fig-q-051--arrow-blue)"');
    expect(out).not.toContain('id="arrow-blue"');
    expect(scopeSvgMarkup(out, 'q-051')).toBe(out);
  });

  it('renders a compact dot-grid studio plate with a tactile expand control', () => {
    const html = renderToStaticMarkup(
      React.createElement(SvgFigurePlate, { svgMarkup: BANKED_CURVE_SVG, questionId: 'q-051' })
    );
    expect(html).toContain('aria-label="Expand diagram"');
    expect(html).toContain('[--sp-fig-max-h:260px]');
    expect(html).toContain('sm:[--sp-fig-max-h:290px]');
    expect(html).toContain('radial-gradient');
    expect(html).toContain('bg-[#F8FAFC]');
    expect(html).not.toContain('v_ideal');

    const raw = renderToStaticMarkup(
      React.createElement(SvgFigurePlate, {
        svgMarkup: BANKED_CURVE_SVG,
        questionId: 'q-051',
        typeset: false,
        autoFrame: false,
      })
    );
    expect(raw).toContain('v_ideal');
  });
});

describe('Design-critic round 1 fixes', () => {
  const STANDING =
    '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="420" viewBox="0 0 680 420" role="img" aria-label="Standing wave on a fixed string"><path d="M 92 200 Q 154 120 216 200" stroke="#1d4ed8" fill="none"/><text x="92" y="228" text-anchor="middle" font-size="11">N</text><text x="154" y="158" text-anchor="middle" font-size="11">A</text><text x="340" y="320" text-anchor="middle" font-size="13">L = 0.6 m</text><text x="92" y="30" text-anchor="start" font-size="12.5">n = 4   |   v = 144 m s⁻¹</text><text x="664" y="408" text-anchor="end" font-size="11" fill="#6b7280">Diagram not to scale</text></svg>';

  it('lifts "not to scale" footers and key-value header strips into HTML captions', () => {
    const lifted = extractFigureCaptions(STANDING);
    expect(lifted.footnote).toBe('Diagram not to scale');
    expect(lifted.captions).toEqual(['n = 4', 'v = 144 m s⁻¹']);
    expect(lifted.markup).not.toContain('not to scale');
    expect(lifted.markup).not.toContain('n = 4');
    expect(lifted.markup).toContain('L = 0.6 m');

    const html = renderToStaticMarkup(
      React.createElement(SvgFigurePlate, { svgMarkup: STANDING, questionId: 'sw' })
    );
    expect(html).toContain('<figcaption');
    expect(html).toContain('Diagram not to scale');
    expect(html).toContain('aria-label="v = 144 m s⁻¹"');
    expect(html).toContain('class="katex"');
  });

  it('keeps standing-wave node/antinode labels upright', () => {
    const out = typesetSvgMarkup(STANDING);
    expect(out).toMatch(/>N<\/text>/);
    expect(out).toMatch(/>A<\/text>/);
  });

  it('tidies the bobsleigh legend column into one card at one size, with v_ideal explained', () => {
    const out = typesetSvgMarkup(BANKED_CURVE_SVG);
    expect(out.match(/data-sp-legend="1"/g)).toHaveLength(1);
    expect(out).toContain('(into page)');
    const legendSizes = Array.from(
      out.matchAll(/<text x="172\.8"[^>]*font-size="([\d.]+)"/g)
    ).map((m) => m[1]);
    expect(legendSizes).toHaveLength(3);
    expect(new Set(legendSizes).size).toBe(1);
    expect(tidyStackedLegends('<svg viewBox="0 0 10 10"></svg>')).toBe('<svg viewBox="0 0 10 10"></svg>');

    // Energy-level value columns (right half, beside level lines) never get a legend card.
    const levels =
      '<svg viewBox="0 0 680 420"><line x1="120" y1="60" x2="500" y2="60"/><line x1="120" y1="84" x2="500" y2="84"/><line x1="120" y1="108" x2="500" y2="108"/>' +
      '<text x="510" y="64" font-size="11">−2.18 eV</text><text x="510" y="88" font-size="11">−3.4 eV</text><text x="510" y="112" font-size="11">E₃</text>' +
      '<text x="40" y="64" font-size="11">n = 5</text><text x="40" y="88" font-size="11">n = 4</text><text x="40" y="112" font-size="11">n = 3</text></svg>';
    expect(tidyStackedLegends(levels)).not.toContain('data-sp-legend');
  });

  it('makes <desc> and aria-label readable instead of a_c / μ_s', () => {
    expect(readableA11yText('a_c (to center); v_ideal; μ_s = 0; θ = 25 °; 10^-3')).toBe(
      'a c (to center); v ideal; μ s = 0; θ = 25°; 10 to the power -3'
    );
    const out = typesetSvgMarkup(BANKED_CURVE_SVG.replace('<title>', '<desc>a_c; μ_s</desc><title>'));
    expect(out).toContain('<desc>a c; μ s</desc>');
  });

  it('exposes a client legibility floor that is a safe no-op without a DOM', () => {
    expect(() => enforceLabelFloor(null)).not.toThrow();
  });

  it('switches the dot-grid mat to dark tokens in dark mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(SvgFigurePlate, { svgMarkup: BANKED_CURVE_SVG, questionId: 'dk' })
    );
    expect(html).toContain('dark:bg-[#121a2b]');
    expect(html).toContain('dark:[--sp-dot:rgba(148,163,184,0.12)]');
    expect(html).toContain('var(--sp-dot)');
  });
});

describe('MANDATORY full-bank SVG proof (7,643 items)', () => {
  const bankItems = loadBankItems();
  const chunkItems = loadPublicChunkItems();

  it('covers every bank item and every shipped public chunk item', () => {
    expect(bankItems.length).toBeGreaterThanOrEqual(7643);
    if (chunkItems.length > 0) {
      expect(chunkItems.length).toBe(bankItems.length);
    }
  });

  it.each([
    ['dataset/sixthphysics-bank/bank/all-items.json', bankItems],
    ['public/sixthphysics-data/chunks/*.json', chunkItems],
  ])(
    'typesets + frames every svgMarkup in %s with 0 raw underscores, 0 malformed XML, 0 lost labels',
    (_label, items) => {
      const failures: string[] = [];
      let svgCount = 0;
      let textNodes = 0;
      let tightened = 0;
      let captionCount = 0;

      for (const item of items as BankItem[]) {
        if (!item.svgMarkup) continue;
        svgCount += 1;
        const allBefore = visibleTextNodes(item.svgMarkup);
        const parts = prepareSvgFigureParts(item.svgMarkup, item.id);
        const out = parts.markup;
        const after = visibleTextNodes(out);
        textNodes += after.length;
        captionCount += parts.captions.length + (parts.footnote ? 1 : 0);

        // Lifted captions are the only nodes allowed to leave the canvas.
        const lifted = (t: string) =>
          /^diagrams? not to scale\.?$/i.test(t.trim()) ||
          (/\s\|\s/.test(t) &&
            t.split(/\s+\|\s+/).every((p) => parts.captions.includes(p.trim())));
        const before = allBefore.filter((t) => !lifted(t));
        if (after.length !== before.length) {
          failures.push(`${item.id}: text node count ${before.length} -> ${after.length}`);
        }
        after.forEach((text, idx) => {
          if (/[A-Za-zα-ωΑ-Ω0-9]_[A-Za-z0-9]/.test(text) || /[_^]/.test(text)) {
            failures.push(`${item.id}: raw script marker in "${text}"`);
          }
          if (/\d\s+°/.test(text)) failures.push(`${item.id}: loose degree in "${text}"`);
          if (normalizeLabel(before[idx] ?? '') !== normalizeLabel(text)) {
            failures.push(`${item.id}: label content changed "${before[idx]}" -> "${text}"`);
          }
        });
        if (/font-family="Arial/i.test(out)) failures.push(`${item.id}: Arial font survived`);
        const problems = xmlProblems(out);
        if (problems.length) failures.push(`${item.id}: ${problems.slice(0, 2).join('; ')}`);
        const vb = parseViewBox(out);
        if (!vb || !(vb.width > 0 && vb.height > 0)) failures.push(`${item.id}: invalid viewBox`);
        if (/data-sp-orig-viewbox=/.test(out) && out.match(/viewBox="[^"]*"/)?.[0] !== item.svgMarkup.match(/viewBox="[^"]*"/)?.[0]) {
          tightened += 1;
        }
      }

      if (items.length > 0) {
        expect(svgCount).toBeGreaterThan(7000);
        expect(textNodes).toBeGreaterThan(55000);
        // The framing engine should reclaim dead space on most diagrams.
        expect(tightened / svgCount).toBeGreaterThan(0.5);
        // ~2,100 "not to scale" footers + key-value header strips move into HTML captions.
        expect(captionCount).toBeGreaterThan(2000);
      }
      expect(failures.slice(0, 25)).toEqual([]);
    }
  );
});
