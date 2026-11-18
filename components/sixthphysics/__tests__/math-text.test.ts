import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MathText,
  polishPhysicsProse,
  renderLatexToHtml,
  segmentPlainPhysics,
} from '@/components/sixthphysics/math-text';
import {
  SvgFigurePlate,
  scopeSvgMarkup,
} from '@/components/sixthphysics/svg-figure-plate';
import { FormulaDrawer } from '@/components/sixthphysics/formula-drawer';
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_PHYSICS_SYLLABUS,
} from '@/lib/constants/syllabi';

interface RawBankItem {
  id: string;
  stem?: string;
  svgMarkup?: string;
  options?: Array<{
    text?: string;
    distractorRationale?: string;
  }>;
  parts?: Array<{
    prompt?: string;
    expectedAnswer?: string;
  }>;
  workedSolution?: string | string[];
  markScheme?: Array<{
    criterion?: string;
  }>;
}

function renderMath(text: string, block = false): string {
  return renderToStaticMarkup(
    React.createElement(MathText, { text, block })
  );
}

describe('SixthPhysics <MathText />, <SvgFigurePlate />, and <FormulaDrawer />', () => {
  describe('Explicit LaTeX rendering via KaTeX', () => {
    it('renders inline $...$, display $$...$$, \\(...\\), and \\[...\\] without katex-error', () => {
      const inlineDollar = renderMath(
        'Kinetic energy is $E_k = \\frac{1}{2}mv^2$ in joules.'
      );
      expect(inlineDollar).toContain('class="katex"');
      expect(inlineDollar).not.toContain('katex-error');
      expect(inlineDollar).not.toMatch(/\\frac\b/);

      const blockDollar = renderMath('$$F = -\\frac{GMm}{r^2}$$');
      expect(blockDollar).toContain('katex-display');
      expect(blockDollar).not.toContain('katex-error');

      const inlineParen = renderMath(
        'Wien peak \\(\\lambda_{\\max} = \\frac{b}{T}\\) shifts blueward.'
      );
      expect(inlineParen).toContain('class="katex"');
      expect(inlineParen).not.toContain('katex-error');

      const blockBracket = renderMath('\\[\\Delta E = hf - \\phi\\]');
      expect(blockBracket).toContain('katex-display');
      expect(blockBracket).not.toContain('katex-error');
    });

    it('catches bare un-delimited \\frac and \\sqrt macros so raw commands never leak', () => {
      const bareHtml = renderMath(
        'Speed is \\sqrt{2gh} and energy is \\frac{1}{2}mv^2.'
      );
      expect(bareHtml).toContain('class="katex"');
      expect(bareHtml).not.toContain('katex-error');
      expect(bareHtml).not.toMatch(/\\(?:frac|sqrt)\b/);
    });
  });

  describe('Plain-text physics through real KaTeX', () => {
    it('typesets scientific notation, units, and exponents as KaTeX with an accessible source label', () => {
      const option = renderMath('4.03 × 10³ N');
      expect(option).toContain('class="katex"');
      expect(option).toContain('role="math"');
      expect(option).toContain('aria-label="4.03 × 10³ N"');
      expect(option).toContain('whitespace-nowrap');
      expect(option).not.toContain('<sup');
      expect(option).not.toContain('katex-error');

      const sci = renderMath('Grating spacing d = 2.50 × 10⁻⁶ m and 10⁻³ m.');
      expect(sci).toContain('aria-label="d = 2.50 × 10⁻⁶ m"');
      expect(sci).toContain('aria-label="10⁻³ m"');
      expect(sci.match(/class="katex"/g)).toHaveLength(2);

      const units = renderMath('Take g = 9.8 m s⁻² and grating ruling 400 lines mm⁻¹.');
      expect(units).toContain('aria-label="g = 9.8 m s⁻²"');
      expect(units).toContain('aria-label="mm⁻¹"');
      expect(units).toContain('Take ');
      expect(units).toContain(' and grating ruling 400 lines ');
    });

    it('renders equations, radicals, functions, and subscripts as whole KaTeX runs', () => {
      const ws = renderMath(
        'Because the circular path lies in a horizontal plane, vertical acceleration is zero: N cos θ = mg, so N = (880 × 9.81) / cos 25° = 9.53 × 10³ N.'
      );
      expect(ws).toContain('aria-label="N cos θ = mg"');
      expect(ws).toContain('aria-label="N = (880 × 9.81) / cos 25° = 9.53 × 10³ N"');
      expect(ws).toContain('vertical acceleration is zero: ');
      expect(ws).not.toContain('katex-error');

      const eqs = renderMath('Using v = √(g r tan θ) and d sin θ = nλ with v = u + at.');
      expect(eqs).toContain('aria-label="v = √(g r tan θ)"');
      expect(eqs).toContain('aria-label="d sin θ = nλ"');
      expect(eqs).toContain('aria-label="v = u + at"');
      expect(eqs).toContain('class="mord sqrt"');

      const subs = renderMath('Compare v_rms, E_p, V_s, f_0, λ_max, and E_k,max.');
      for (const sym of ['v_rms', 'E_p', 'V_s', 'f_0', 'λ_max', 'E_k,max']) {
        expect(subs).toContain(`aria-label="${sym}"`);
      }
      expect(subs).toContain('Compare ');
      expect(subs).toContain(' and ');

      const carets = renderMath(
        'Discharge V₀e^(−t/RC), adiabatic P_A V_A^(5/3), and secant (r⁻²)_max.'
      );
      expect(carets).toContain('aria-label="V₀e^(−t/RC)"');
      expect(carets).toContain('aria-label="V_A^(5/3)"');
      expect(carets).toContain('aria-label="(r⁻²)_max"');
      expect(carets).not.toContain('katex-error');

      const helium = renderMath('Ionised He⁺(Z = 2) emits.');
      expect(helium).toMatch(/<span class="whitespace-nowrap">\(<span role="math" aria-label="Z = 2"/);

      const doubleSub = renderMath('E_k_max');
      expect(doubleSub).not.toContain('katex-error');
    });

    it('fixes Damien\'s stem: `25 °` -> `25°`, `a 880 kg` -> `an 880 kg`, and KaTeX quantities', () => {
      const stem =
        'Sensors on an iced banked chute corner (radius 215 m, banking 25 °) measure the perpendicular load of a 880 kg bobsleigh cruising with zero side-friction. Using g = 9.81 m s⁻², calculate the normal reaction.';
      const html = renderMath(stem);
      expect(html).toContain('aria-label="25°"');
      expect(html).not.toContain('25 °');
      expect(html).toContain('load of an ');
      expect(html).toContain('aria-label="880 kg"');
      expect(html).toContain('aria-label="215 m"');
      expect(html).toContain('aria-label="g = 9.81 m s⁻²"');
      expect(html).toContain('side-friction');
      expect(html).not.toContain('katex-error');

      expect(polishPhysicsProse('a 880 kg sled')).toBe('an 880 kg sled');
      expect(polishPhysicsProse('A 11 V cell and a 18 Ω load')).toBe('An 11 V cell and an 18 Ω load');
      expect(polishPhysicsProse('a 110 V supply, a 1.5 kg mass')).toBe('a 110 V supply, a 1.5 kg mass');
      expect(polishPhysicsProse('a 8.0 N force and a 11,000 V line')).toBe(
        'an 8.0 N force and an 11,000 V line'
      );
      expect(polishPhysicsProse('θ = 25 ° and 20 ° C')).toBe('θ = 25° and 20 °C');
    });

    it('never mangles normal English prose, hyphenated words, currency, or plain numbers', () => {
      const prose =
        'In an A-Level cross-section of a mass-spring system, 160 kg moves 32.5 m while equipment costs $50 and $100.';
      const html = renderMath(prose);
      expect(html).not.toContain('katex-error');
      expect(html).not.toContain('<sub');
      expect(html).not.toContain('<sup');
      expect(html).toContain('A-Level');
      expect(html).toContain('cross-section');
      expect(html).toContain('mass-spring');
      expect(html).toContain('aria-label="160 kg"');
      expect(html).toContain('aria-label="32.5 m"');
      expect(html).toContain('$50 and $100');

      const plain = renderMath('Answer all 3 questions in Section A. I measured it as a class.');
      expect(plain).not.toContain('class="katex"');
      expect(plain).toContain('Answer all 3 questions in Section A. I measured it as a class.');

      const parts = segmentPlainPhysics('(c) v = 2.0 m s⁻¹ (B)');
      expect(parts[0]).toEqual({ kind: 'text', value: '(c) ' });
      expect(parts[parts.length - 1]).toEqual({ kind: 'text', value: ' (B)' });
    });

    it('handles design-critic round 1 cases: elements, day units, uncertainties, trap prose, lone variables', () => {
      const tex = (t: string) =>
        segmentPlainPhysics(polishPhysicsProse(t)).map((g) =>
          g.kind === 'text' ? g.value : `[[${g.latex}]]`
        );
      expect(tex('Ionised He⁺(Z = 2) emits.')).toEqual([
        'Ionised ',
        '[[\\mathrm{He}^{+}]]',
        '(',
        '[[Z = 2]]',
        ') emits.',
      ]);
      expect(tex('t = 120 d')).toEqual(['[[t = 120\\ \\mathrm{d}]]']);
      expect(tex('1.67(3) × 10⁻²⁷ kg')).toEqual(['[[1.67(3) \\times  10^{-27}\\ \\mathrm{kg}]]']);
      expect(tex('g = 9.81 N kg⁻¹ (m s⁻²)')[0]).toContain('(\\mathrm{m}\\,\\mathrm{s}^{-2})');
      expect(tex('The trap uses mg tan θ instead of mg / cos θ.')).toEqual([
        'The trap uses ',
        '[[mg \\tan  \\theta]]',
        ' instead of ',
        '[[mg / \\cos  \\theta]]',
        '.',
      ]);
      expect(tex('Use 1/f = 1/u + 1/v where v is the image distance.')).toEqual([
        'Use ',
        '[[1/f = 1/u + 1/v]]',
        ' where ',
        '[[v]]',
        ' is the image distance.',
      ]);
      expect(tex('across Sections 1–8 (g = 9.81 m s⁻²).')).toEqual([
        'across Sections 1–8 (',
        '[[g = 9.81\\ \\mathrm{m}\\,\\mathrm{s}^{-2}]]',
        ').',
      ]);
      expect(tex('e.g. a lens; (c) part; I think a car')).toEqual(['e.g. a lens; (c) part; I think a car']);
      expect(tex('coherent SI base units (kg m⁻³)?')).toEqual([
        'coherent SI base units (',
        '[[\\mathrm{kg}\\,\\mathrm{m}^{-3}]]',
        ')?',
      ]);
      expect(tex('torque in N m, action in J s, ruling in mm⁻¹')).toEqual([
        'torque in ',
        '[[\\mathrm{N}\\,\\mathrm{m}]]',
        ', action in ',
        '[[\\mathrm{J}\\,\\mathrm{s}]]',
        ', ruling in ',
        '[[\\mathrm{mm}^{-1}]]',
      ]);
      expect(tex('speed v² and T⁴')).toEqual(['speed ', '[[v^{2}]]', ' and ', '[[T^{4}]]']);
    });

    it('keeps the legacy <sup>/<sub> renderer available via katexPhysics={false}', () => {
      const legacy = renderToStaticMarkup(
        React.createElement(MathText, {
          text: 'Grating spacing d = 2.50 × 10⁻⁶ m and v_rms.',
          katexPhysics: false,
        })
      );
      expect(legacy).toContain('2.50 × 10<sup');
      expect(legacy).toContain('>−6</sup>');
      expect(legacy).toContain('v<sub');
    });
  });

  describe('MANDATORY full-bank verification (7,643 items)', () => {
    it('renders every math/text field across all 7,643 bank items with 0 katex-error, 0 raw \\frac/\\sqrt leaks, and 0 thrown errors', () => {
      const bankPath = path.resolve(
        process.cwd(),
        'dataset/sixthphysics-bank/bank/all-items.json'
      );
      const summaryPath = path.resolve(
        process.cwd(),
        'dataset/sixthphysics-bank/SUMMARY.json'
      );
      expect(fs.existsSync(bankPath)).toBe(true);
      expect(fs.existsSync(summaryPath)).toBe(true);

      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
        totalCompiledItems: number;
      };
      const items = JSON.parse(
        fs.readFileSync(bankPath, 'utf8')
      ) as RawBankItem[];
      expect(summary.totalCompiledItems).toBeGreaterThanOrEqual(7200);
      expect(items).toHaveLength(summary.totalCompiledItems);

      let checkedStrings = 0;
      let katexRuns = 0;
      const failures: string[] = [];

      for (const item of items) {
        const fields: Array<{ label: string; value: string | undefined }> = [
          { label: 'stem', value: item.stem },
        ];

        for (let i = 0; i < (item.options?.length ?? 0); i++) {
          const opt = item.options![i];
          fields.push({ label: `options[${i}].text`, value: opt.text });
          fields.push({
            label: `options[${i}].distractorRationale`,
            value: opt.distractorRationale,
          });
        }

        for (let i = 0; i < (item.parts?.length ?? 0); i++) {
          const part = item.parts![i];
          fields.push({ label: `parts[${i}].prompt`, value: part.prompt });
          fields.push({
            label: `parts[${i}].expectedAnswer`,
            value: part.expectedAnswer,
          });
        }

        if (Array.isArray(item.workedSolution)) {
          item.workedSolution.forEach((step, idx) => {
            fields.push({ label: `workedSolution[${idx}]`, value: step });
          });
        } else {
          fields.push({
            label: 'workedSolution',
            value: item.workedSolution,
          });
        }

        for (let i = 0; i < (item.markScheme?.length ?? 0); i++) {
          fields.push({
            label: `markScheme[${i}].criterion`,
            value: item.markScheme![i].criterion,
          });
        }

        for (const field of fields) {
          if (!field.value) continue;
          checkedStrings += 1;

          const html = renderMath(field.value);
          katexRuns += (html.match(/class="katex"/g) ?? []).length;
          if (html.includes('katex-error')) {
            failures.push(`${item.id} (${field.label}): katex-error`);
          }
          if (/\\(?:frac|dfrac|tfrac|sqrt)\b/.test(html)) {
            failures.push(`${item.id} (${field.label}): raw \\frac/\\sqrt leak`);
          }
          const visibleText = html.replace(/<[^>]+>/g, '');
          if (visibleText.includes('_') || visibleText.includes('^')) {
            failures.push(
              `${item.id} (${field.label}): unformatted subscript/exponent in "${visibleText}"`
            );
          }
        }
      }

      expect(checkedStrings).toBeGreaterThan(40000);
      // Quantities, equations, and symbols now flow through real KaTeX.
      expect(katexRuns).toBeGreaterThan(100000);
      expect(failures).toEqual([]);
    });
  });

  describe('<SvgFigurePlate /> ID scoping & paper specimen framing', () => {
    it('scopes internal id="..." and url(#...) references by questionId so multiple SVGs never collide', () => {
      const sampleSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460"><defs><marker id="arrow-blue"></marker></defs><line x1="0" y1="0" x2="10" y2="10" marker-end="url(#arrow-blue)" /></svg>';

      const scopedA = scopeSvgMarkup(sampleSvg, 'q-001');
      const scopedB = scopeSvgMarkup(sampleSvg, 'q-002');

      expect(scopedA).toContain('id="sp-fig-q-001--arrow-blue"');
      expect(scopedA).toContain('marker-end="url(#sp-fig-q-001--arrow-blue)"');
      expect(scopedB).toContain('id="sp-fig-q-002--arrow-blue"');
      expect(scopedB).toContain('marker-end="url(#sp-fig-q-002--arrow-blue)"');
      expect(scopedA).not.toContain('id="arrow-blue"');

      const plateHtml = renderToStaticMarkup(
        React.createElement(SvgFigurePlate, {
          svgMarkup: sampleSvg,
          questionId: 'q-001',
        })
      );
      expect(plateHtml).toContain('background:#ffffff');
      expect(plateHtml).toContain('border-[#E2E8F0]');
      expect(plateHtml).toContain('Expand diagram');
    });
  });

  describe('<FormulaDrawer /> official syllabus booklets & KaTeX equations', () => {
    it('renders all 173 syllabus equations across IB, A-Level, and NCUK without katex-error and distinguishes g = 9.8 vs 9.81', () => {
      for (const catalogue of [
        IB_PHYSICS_SYLLABUS,
        ALEVEL_PHYSICS_SYLLABUS,
        NCUK_PHYSICS_SYLLABUS,
      ]) {
        for (const topic of catalogue.topics) {
          for (const sub of topic.subtopics) {
            for (const eq of sub.equations) {
              const eqHtml = renderLatexToHtml(eq.latex, { displayMode: true });
              expect(eqHtml).not.toContain('katex-error');
            }
          }
        }
      }

      const ibDrawer = renderToStaticMarkup(
        React.createElement(FormulaDrawer, {
          open: true,
          onClose: () => {},
          activeSyllabus: 'ib',
          activeLevel: 'HL',
        })
      );
      expect(ibDrawer).toContain('g = 9.8 m s');
      expect(ibDrawer).not.toContain('katex-error');

      const alevelDrawer = renderToStaticMarkup(
        React.createElement(FormulaDrawer, {
          open: true,
          onClose: () => {},
          activeSyllabus: 'alevel',
          activeLevel: 'Y13',
        })
      );
      expect(alevelDrawer).toContain('g = 9.81 m s');
      expect(alevelDrawer).not.toContain('katex-error');

      const ncukDrawer = renderToStaticMarkup(
        React.createElement(FormulaDrawer, {
          open: true,
          onClose: () => {},
          activeSyllabus: 'ncuk',
          activeLevel: 'IFY',
        })
      );
      expect(ncukDrawer).toContain('g = 9.81 m s');
      expect(ncukDrawer).not.toContain('katex-error');
    });
  });
});
