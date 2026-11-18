import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_DATA_BOOKLET_CONSTANTS,
  NCUK_PHYSICS_SYLLABUS,
  type EquationSpec,
  type SyllabusId,
  type SyllabusSpecificationCatalogue,
} from '@/lib/constants/syllabi';

export interface BookletConstantRow {
  symbolLatex: string;
  name: string;
  valueText: string;
  siUnit: string;
  highlight?: boolean;
}

export const IB_DATA_BOOKLET_CONSTANTS: readonly BookletConstantRow[] = [
  {
    symbolLatex: 'g',
    name: 'Acceleration of free fall (Earth surface)',
    valueText: '9.8',
    siUnit: 'm s⁻²',
    highlight: true,
  },
  {
    symbolLatex: 'G',
    name: 'Gravitational constant',
    valueText: '6.67 × 10⁻¹¹',
    siUnit: 'N m² kg⁻²',
  },
  {
    symbolLatex: 'c',
    name: 'Speed of light in vacuum',
    valueText: '3.00 × 10⁸',
    siUnit: 'm s⁻¹',
  },
  {
    symbolLatex: 'h',
    name: 'Planck constant',
    valueText: '6.63 × 10⁻³⁴',
    siUnit: 'J s',
  },
  {
    symbolLatex: 'e',
    name: 'Elementary charge',
    valueText: '1.60 × 10⁻¹⁹',
    siUnit: 'C',
  },
  {
    symbolLatex: 'N_{\\text{A}}',
    name: 'Avogadro constant',
    valueText: '6.02 × 10²³',
    siUnit: 'mol⁻¹',
  },
  {
    symbolLatex: 'R',
    name: 'Gas constant',
    valueText: '8.31',
    siUnit: 'J K⁻¹ mol⁻¹',
  },
  {
    symbolLatex: 'k_{\\text{B}}',
    name: 'Boltzmann constant',
    valueText: '1.38 × 10⁻²³',
    siUnit: 'J K⁻¹',
  },
  {
    symbolLatex: '\\sigma',
    name: 'Stefan-Boltzmann constant',
    valueText: '5.67 × 10⁻⁸',
    siUnit: 'W m⁻² K⁻⁴',
  },
  {
    symbolLatex: 'k',
    name: 'Coulomb constant',
    valueText: '8.99 × 10⁹',
    siUnit: 'N m² C⁻²',
  },
  {
    symbolLatex: '\\varepsilon_0',
    name: 'Permittivity of free space',
    valueText: '8.85 × 10⁻¹²',
    siUnit: 'C² N⁻¹ m⁻²',
  },
  {
    symbolLatex: '\\mu_0',
    name: 'Permeability of free space',
    valueText: '4π × 10⁻⁷',
    siUnit: 'T m A⁻¹',
  },
  {
    symbolLatex: 'm_{\\text{e}}',
    name: 'Electron rest mass',
    valueText: '9.110 × 10⁻³¹',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{p}}',
    name: 'Proton rest mass',
    valueText: '1.673 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{n}}',
    name: 'Neutron rest mass',
    valueText: '1.675 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'u',
    name: 'Unified atomic mass unit',
    valueText: '1.661 × 10⁻²⁷',
    siUnit: 'kg',
  },
];

export const ALEVEL_DATA_BOOKLET_CONSTANTS: readonly BookletConstantRow[] = [
  {
    symbolLatex: 'g',
    name: 'Gravitational field strength / free-fall acceleration',
    valueText: '9.81',
    siUnit: 'N kg⁻¹ (m s⁻²)',
    highlight: true,
  },
  {
    symbolLatex: 'G',
    name: 'Gravitational constant',
    valueText: '6.67 × 10⁻¹¹',
    siUnit: 'N m² kg⁻²',
  },
  {
    symbolLatex: 'c',
    name: 'Speed of electromagnetic waves in free space',
    valueText: '3.00 × 10⁸',
    siUnit: 'm s⁻¹',
  },
  {
    symbolLatex: 'h',
    name: 'Planck constant',
    valueText: '6.63 × 10⁻³⁴',
    siUnit: 'J s',
  },
  {
    symbolLatex: 'e',
    name: 'Magnitude of charge of electron',
    valueText: '1.60 × 10⁻¹⁹',
    siUnit: 'C',
  },
  {
    symbolLatex: 'm_{\\text{e}}',
    name: 'Electron rest mass',
    valueText: '9.11 × 10⁻³¹',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{p}}',
    name: 'Proton rest mass',
    valueText: '1.67(3) × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{n}}',
    name: 'Neutron rest mass',
    valueText: '1.67(5) × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'u',
    name: 'Atomic mass unit',
    valueText: '1.661 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'N_{\\text{A}}',
    name: 'Avogadro constant',
    valueText: '6.02 × 10²³',
    siUnit: 'mol⁻¹',
  },
  {
    symbolLatex: 'R',
    name: 'Molar gas constant',
    valueText: '8.31',
    siUnit: 'J K⁻¹ mol⁻¹',
  },
  {
    symbolLatex: 'k',
    name: 'Boltzmann constant',
    valueText: '1.38 × 10⁻²³',
    siUnit: 'J K⁻¹',
  },
  {
    symbolLatex: '\\varepsilon_0',
    name: 'Permittivity of free space',
    valueText: '8.85 × 10⁻¹²',
    siUnit: 'F m⁻¹',
  },
  {
    symbolLatex: '\\mu_0',
    name: 'Permeability of free space',
    valueText: '4π × 10⁻⁷',
    siUnit: 'T m A⁻¹',
  },
  {
    symbolLatex: '\\sigma',
    name: 'Stefan constant',
    valueText: '5.67 × 10⁻⁸',
    siUnit: 'W m⁻² K⁻⁴',
  },
  {
    symbolLatex: 'b',
    name: 'Wien constant',
    valueText: '2.90 × 10⁻³',
    siUnit: 'm K',
  },
];

const NCUK_SYMBOL_LATEX_MAP: Record<string, string> = {
  m_e: 'm_{\\text{e}}',
  m_p: 'm_{\\text{p}}',
  m_n: 'm_{\\text{n}}',
  '1 eV': '1\\,\\text{eV}',
  ε_0: '\\varepsilon_0',
  k_e: 'k_{\\text{e}}',
  N_A: 'N_{\\text{A}}',
  σ: '\\sigma',
};

export const NCUK_MAPPED_CONSTANTS: readonly BookletConstantRow[] =
  NCUK_DATA_BOOKLET_CONSTANTS.map((row) => ({
    symbolLatex: NCUK_SYMBOL_LATEX_MAP[row.symbol] ?? row.symbol,
    name: row.name,
    valueText: row.valueText,
    siUnit: row.siUnit,
    highlight: row.symbol === 'g',
  }));

export const SYLLABUS_CATALOGUES: Record<
  SyllabusId,
  SyllabusSpecificationCatalogue
> = {
  ib: IB_PHYSICS_SYLLABUS,
  alevel: ALEVEL_PHYSICS_SYLLABUS,
  ncuk: NCUK_PHYSICS_SYLLABUS,
};

export const SYLLABUS_CONSTANTS: Record<
  SyllabusId,
  readonly BookletConstantRow[]
> = {
  ib: IB_DATA_BOOKLET_CONSTANTS,
  alevel: ALEVEL_DATA_BOOKLET_CONSTANTS,
  ncuk: NCUK_MAPPED_CONSTANTS,
};

export interface PaperFormulaGroup {
  topicId: string;
  topicCode: string;
  topicTitle: string;
  equations: EquationSpec[];
}

function equationMatchesPaperLevel(
  syllabus: SyllabusId,
  level: string | undefined,
  eq: EquationSpec
): boolean {
  if (!level || level.toLowerCase() === 'all') {
    return true;
  }
  const normalized = level.trim().toUpperCase();
  if (syllabus === 'ib') {
    if (normalized === 'SL') return eq.level === 'SL';
    return true; // HL includes both SL core and HL equations
  }
  if (syllabus === 'alevel') {
    if (normalized === 'Y12' || normalized === 'AS') return eq.level === 'Y12';
    return true; // Y13 includes both Y12 and Y13
  }
  if (syllabus === 'ncuk') {
    if (normalized === 'S1' || normalized === 'IFY-S1') {
      return eq.level === 'IFY-S1' || eq.level === 'IFY';
    }
    if (normalized === 'S2' || normalized === 'IFY-S2') {
      return eq.level === 'IFY-S2' || eq.level === 'IFY';
    }
    return true;
  }
  return true;
}

/**
 * Selects syllabus-accurate `inDataBooklet` equations matching the topics
 * appearing on a generated exam paper, grouped by topic and capped cleanly
 * so the printed Data & Formulae sheet fits neatly on one page.
 */
export function selectBookletEquationsForPaper(
  syllabus: SyllabusId,
  level: string | undefined,
  topicIds: readonly string[],
  maxPerTopic = 6
): PaperFormulaGroup[] {
  const catalogue = SYLLABUS_CATALOGUES[syllabus];
  if (!catalogue) return [];

  const topicIdSet =
    topicIds.length > 0 ? new Set(topicIds) : null;

  const groups: PaperFormulaGroup[] = [];

  for (const topic of catalogue.topics) {
    if (topicIdSet && !topicIdSet.has(topic.id)) {
      continue;
    }

    const seenLatex = new Set<string>();
    const collected: EquationSpec[] = [];

    for (const subtopic of topic.subtopics) {
      for (const eq of subtopic.equations) {
        if (!eq.inDataBooklet) continue;
        if (!equationMatchesPaperLevel(syllabus, level, eq)) continue;
        if (seenLatex.has(eq.latex)) continue;
        seenLatex.add(eq.latex);
        collected.push(eq);
        if (collected.length >= maxPerTopic) break;
      }
      if (collected.length >= maxPerTopic) break;
    }

    if (collected.length > 0) {
      groups.push({
        topicId: topic.id,
        topicCode: topic.code,
        topicTitle: topic.title,
        equations: collected,
      });
    }
  }

  return groups;
}
