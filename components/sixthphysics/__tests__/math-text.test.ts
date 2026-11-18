import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MathText,
  renderLatexToHtml,
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

  describe('Non-LaTeX physics typography & prose preservation', () => {
    it('typesets scientific notation, inline subscripts, and Unicode SI units cleanly', () => {
      const sci = renderMath('Grating spacing d = 2.50 × 10⁻⁶ m and 10⁻³ m.');
      expect(sci).toContain('2.50 × 10<sup');
      expect(sci).toContain('>−6</sup>');
      expect(sci).toContain('10<sup');
      expect(sci).toContain('>−3</sup>');

      const subs = renderMath(
        'Compare v_rms, E_p, V_s, f_0, λ_max, and E_k,max.'
      );
      expect(subs).toContain('v<sub');
      expect(subs).toContain('>rms</sub>');
      expect(subs).toContain('E<sub');
      expect(subs).toContain('>p</sub>');
      expect(subs).toContain('V<sub');
      expect(subs).toContain('>s</sub>');
      expect(subs).toContain('f<sub');
      expect(subs).toContain('>0</sub>');
      expect(subs).toContain('λ<sub');
      expect(subs).toContain('>max</sub>');
      expect(subs).toContain('>k,max</sub>');

      const units = renderMath(
        'Take g = 9.8 m s⁻² and grating ruling 400 lines mm⁻¹.'
      );
      expect(units).toContain('m s<sup');
      expect(units).toContain('>−2</sup>');
      expect(units).toContain('lines mm<sup');
      expect(units).toContain('>−1</sup>');

      const carets = renderMath(
        'Discharge V₀e^(−t/RC), adiabatic P_A V_A^(5/3), and secant (r⁻²)_max.'
      );
      expect(carets).toContain('>−t/RC</sup>');
      expect(carets).toContain('>5/3</sup>');
      expect(carets).toContain('>max</sub>');
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
      expect(html).toContain('160 kg');
      expect(html).toContain('32.5 m');
      expect(html).toContain('$50 and $100');
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
      expect(plateHtml).toContain('bg-white');
      expect(plateHtml).toContain('border-[#E5E7EB]');
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
