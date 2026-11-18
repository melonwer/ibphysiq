/**
 * Unified 3-Syllabus Physics Crosswalk & Query Engine
 *
 * Maps 56 canonical physics concept clusters across:
 * - IB Diploma Programme Physics (First Assessment May 2025: SL & HL)
 * - UK GCE AS & A-Level Physics (DfE Core + AQA 7407/7408, OCR H556, CIE 9702: Y12 & Y13)
 * - NCUK International Foundation Year Physics (IFYPH005: IFY-S1, IFY-S2 & cumulative IFY)
 *
 * Design invariants:
 * 1. Topic-name overlap NEVER implies identical scope: every mapping records exact
 *    board-level equations, sign conventions (e.g. ΔU = Q - W vs ΔU = ΔQ + ΔW),
 *    g-values (9.8 vs 9.81 m s^-2), calculus/exponential requirements, and relativistic limits.
 * 2. Every canonical concept binds deterministically to one primary VisualFamilyHint solver
 *    module ('graphs', 'circuits', 'fields', 'mechanics', 'waves', 'optics-shm', 'thermal',
 *    'grav-astro', 'em-induction', 'quantum-nuclear').
 */

import { ALEVEL_PHYSICS_SYLLABUS, ALEVEL_PHYSICS_TOPICS } from '@/lib/constants/syllabi/a-level-physics';
import { IB_PHYSICS_SYLLABUS, IB_PHYSICS_TOPICS } from '@/lib/constants/syllabi/ib-physics';
import { NCUK_PHYSICS_SYLLABUS, NCUK_PHYSICS_TOPICS } from '@/lib/constants/syllabi/ncuk-physics';
import {
  CrosswalkEntry,
  CrosswalkSyllabusMapping,
  GeneratableSlice,
  QuestionFormat,
  SubtopicSpec,
  SYLLABUS_IDS,
  SyllabusId,
  SyllabusLevel,
  SyllabusSpecificationCatalogue,
  SyllabusTopicSpec,
  VisualFamilyHint,
} from '@/lib/constants/syllabi/types';

function excludedMapping(
  syllabus: SyllabusId,
  reason: string,
): CrosswalkSyllabusMapping {
  return {
    syllabus,
    included: false,
    levels: [],
    topicIds: [],
    subtopicIds: [],
    questionFormats: [],
    equationsUsed: [],
    assumptionAndSignNotes: reason,
    calculusOrExponentialRequired: false,
    relativisticRequired: false,
  };
}

export const SYLLABUS_CATALOGUES: Readonly<
  Record<SyllabusId, SyllabusSpecificationCatalogue>
> = {
  ib: IB_PHYSICS_SYLLABUS,
  alevel: ALEVEL_PHYSICS_SYLLABUS,
  ncuk: NCUK_PHYSICS_SYLLABUS,
};

export const SYLLABUS_CROSSWALK: readonly CrosswalkEntry[] = [
  // ============================================================================
  // DOMAIN 1: MEASUREMENT, UNCERTAINTIES & GRAPHICAL ANALYSIS ('graphs')
  // ============================================================================
  {
    conceptId: 'si-units-dimensional-analysis',
    title: 'SI Base Units, Prefixes and Dimensional Homogeneity',
    domain: 'Measurement & Experimental Skills',
    summary:
      'Conversion across SI prefixes (including squared/cubed units), expressing derived units in SI base units, dimensional consistency checks, and order-of-magnitude estimation.',
    primaryVisualFamily: 'graphs',
    supportingVisualFamilies: ['mechanics'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-tools'],
        subtopicIds: ['ib-tools-measurement-uncertainties'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['[F] = kg m s^-2', '[E] = kg m^2 s^-2', '[P] = kg m^2 s^-3'],
        assumptionAndSignNotes:
          'Uses negative-exponent SI format (m s^-1); assessed across Paper 1A, Paper 1B, and Paper 2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec1-measurements-errors'],
        subtopicIds: ['alevel-3-1-si-uncertainties-estimation'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['1 eV = 1.60 × 10^-19 J', '1 kW h = 3.60 × 10^6 J'],
        assumptionAndSignNotes:
          'Includes Fermi order-of-magnitude physical estimation alongside base-unit homogeneity.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac1'],
        subtopicIds: ['ncuk-ac1-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['1 V = 1 J C^-1 = 1 N m C^-1 = 1 J A^-1 s^-1'],
        assumptionAndSignNotes:
          'Requires 4 s.f. intermediate working and 3 s.f. final answers with mandatory SI units (1-mark paper-level deduction for omission).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'All three syllabi share identical 7 SI base units, negative-index notation, prefix powers, and dimensional homogeneity checks.',
    divergenceNotes: [
      'NCUK enforces a strict paper-wide rule of 4 s.f. working and 3 s.f. final answers, whereas IB and A-Level match final sig figs to the least precise input datum.',
    ],
  },
  {
    conceptId: 'uncertainties-error-propagation',
    title: 'Random/Systematic Errors and Uncertainty Propagation',
    domain: 'Measurement & Experimental Skills',
    summary:
      'Distinguishing accuracy vs precision and random vs systematic error, plus worst-case absolute, fractional, and percentage uncertainty propagation.',
    primaryVisualFamily: 'graphs',
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-tools'],
        subtopicIds: ['ib-tools-measurement-uncertainties'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'Δ(a ± b) = Δa + Δb',
          'Δy / y = Δa / a + Δb / b',
          'Δy / y = |n| (Δa / a)',
        ],
        assumptionAndSignNotes:
          'Absolute uncertainties typically rounded to 1 s.f. with the measured mean matched to the same decimal place.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec1-measurements-errors'],
        subtopicIds: ['alevel-3-1-si-uncertainties-estimation'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          '% uncertainty = (half-range / mean) × 100%',
          '%_total = Σ |power_i| × %_i',
        ],
        assumptionAndSignNotes:
          'Repeat readings use half-range ((max - min)/2) for absolute uncertainty; single readings use instrument resolution.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac1'],
        subtopicIds: ['ncuk-ac1-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'Δ(A ± B) = ΔA + ΔB',
          'Δy / y = |a|(ΔA / A) + |b|(ΔB / B)',
        ],
        assumptionAndSignNotes:
          'Uses worst-case deterministic addition of fractional uncertainties; heavily assessed in Coursework (30%) and EoS1/Final.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'All three syllabi use linear worst-case uncertainty propagation (not quadrature root-sum-of-squares).',
    divergenceNotes: [
      'AQA explicitly emphasises half-range of repeats vs vernier/micrometer resolution percentages in Paper 3A.',
    ],
  },
  {
    conceptId: 'graphical-linearization-gradients',
    title: 'Graph Linearization, Gradients, Intercepts and Lines of Worst Fit',
    domain: 'Measurement & Experimental Skills',
    summary:
      'Transforming non-linear laws into y = mx + c form, extracting physical constants with units from gradients and intercepts, and bounding uncertainty via steepest/shallowest worst-fit lines.',
    primaryVisualFamily: 'graphs',
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-tools'],
        subtopicIds: ['ib-tools-measurement-uncertainties'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['y = mx + c', 'ln y = n ln x + ln k', 'ln y = -λt + ln y_0'],
        assumptionAndSignNotes:
          'Algebraic linearization (e.g. T^2 vs L) is SL+HL; logarithmic log-log and semi-log linearization is HL-only.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec1-measurements-errors'],
        subtopicIds: ['alevel-3-1-si-uncertainties-estimation'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['y = mx + c', 'Δm = |m_best - m_worst|'],
        assumptionAndSignNotes:
          'Algebraic linearization in Y12; logarithmic ln(V) vs t and ln(R) vs ln(A) linearization in Y13 Paper 2/3A.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac1'],
        subtopicIds: ['ncuk-ac1-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['y = mx + c', 'ln(x^n) = n ln x', 'ln(e^{kx}) = kx'],
        assumptionAndSignNotes:
          'Natural log rules are printed in the NCUK Data Booklet; both algebraic and ln linearization (e.g. RC discharge in S1, decay in S2) are examined alongside worst-fit gradient uncertainty.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Best-fit straight lines, large gradient triangles, unit-bearing slopes/intercepts, and error-bar worst-fit lines are shared across all three syllabi.',
    divergenceNotes: [
      'Logarithmic linearization is reserved for HL in IB and Y13 in A-Level, whereas NCUK introduces natural-log RC linearization already in Semester 1 (AC4.4).',
    ],
  },

  // ============================================================================
  // DOMAIN 2: CLASSICAL MECHANICS & MATERIALS ('mechanics')
  // ============================================================================
  {
    conceptId: 'vectors-equilibrium-moments',
    title: '2D Vector Resolution, Static Equilibrium, Moments and Couples',
    domain: 'Mechanics',
    summary:
      'Orthogonal component resolution, vector addition, translational equilibrium (ΣF = 0), principle of moments (ΣM = 0), centre of gravity, and torque of a couple.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a2-forces-momentum', 'ib-a4-rigid-body-mechanics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F_x = F cos θ', 'F_y = F sin θ', 'τ = F r sin θ (HL A.4)'],
        assumptionAndSignNotes:
          'IMPORTANT LEVEL SPLIT: Translational point-mass force equilibrium (ΣF = 0) is SL+HL (A.2), whereas torque/moment rotational equilibrium (Στ = 0) on beams and couples is HL-only (A.4) in IB 2025. Uses g = 9.8 m s^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['M = Fd', 'T = Fd (couple)', 'ΣF = 0, ΣM = 0'],
        assumptionAndSignNotes:
          'Both 2D force triangles and multi-support beam moments/couples are compulsory AS / Year 12 core. Uses g = 9.81 m s^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac1', 'ncuk-ac2'],
        subtopicIds: ['ncuk-ac1-3', 'ncuk-ac2-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Moment = F × d_⊥', 'T = Fd', 'ΣF = 0, ΣM = 0'],
        assumptionAndSignNotes:
          'Covers 2D vector cosine/parallelogram rules (AC1.3) and hinged-beam/see-saw moments and couples (AC2.3) in Semester 1. Uses g = 9.81 m s^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Vector decomposition and closed force polygons are universal; moment/couple equilibrium uses identical perpendicular-lever-arm mechanics.',
    divergenceNotes: [
      'Beam moments and couples are entry-level Y12 in A-Level and Semester 1 in NCUK, but strictly HL-only (A.4) in IB Physics 2025.',
      'IB uses g = 9.8 m s^-2; A-Level and NCUK use g = 9.81 m s^-2.',
    ],
  },
  {
    conceptId: 'kinematics-suvat',
    title: '1D Uniformly Accelerated Rectilinear Motion (SUVAT)',
    domain: 'Mechanics',
    summary:
      'Multi-stage constant-acceleration rectilinear motion, stopping distances, and free-fall determination of g.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a1-kinematics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          's = (u + v)t / 2',
          'v = u + at',
          's = ut + (1/2)at^2',
          'v^2 = u^2 + 2as',
        ],
        assumptionAndSignNotes: 'IB Data Booklet uses g = 9.8 m s^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'v = u + at',
          's = ((u + v)/2)t',
          's = ut + (1/2)at^2',
          'v^2 = u^2 + 2as',
        ],
        assumptionAndSignNotes: 'AQA Data Booklet uses g = 9.81 m s^-2; includes electromagnet/light-gate g practical (Required Practical 3).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'v = u + at',
          's = ut + (1/2)at^2',
          'v^2 = u^2 + 2as',
          's = (1/2)(u + v)t',
        ],
        assumptionAndSignNotes: 'NCUK Data Booklet uses g = 9.81 m s^-2; answers reported to 3 s.f.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical four suvat equations and sign-sensitive displacement/velocity kinematics across all three syllabi.',
    divergenceNotes: [
      'Free-fall acceleration is 9.8 m s^-2 in IB vs 9.81 m s^-2 in A-Level and NCUK; cross-syllabus stems should either state g explicitly or keep MCQ distractors >1% apart.',
    ],
  },
  {
    conceptId: 'motion-graphs',
    title: 'Displacement-Time, Velocity-Time and Acceleration-Time Graphs',
    domain: 'Mechanics',
    summary:
      'Extracting instantaneous/average velocity and acceleration from gradients and signed displacement/velocity changes from areas under piecewise and curved motion graphs.',
    primaryVisualFamily: 'graphs',
    supportingVisualFamilies: ['mechanics'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a1-kinematics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['v = Δs / Δt', 'a = Δv / Δt', 'Δs = ∫ v dt (area)', 'Δv = ∫ a dt (area)'],
        assumptionAndSignNotes: 'Includes bouncing-ball sign reversals and curved drag v-t profiles.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['gradient of s-t = v', 'gradient of v-t = a', 'area under v-t = Δs'],
        assumptionAndSignNotes: 'Includes counting grid squares under non-uniform acceleration curves.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['v = gradient of s-t', 'a = gradient of v-t', 's = area under v-t'],
        assumptionAndSignNotes: 'Assesses both piecewise linear trapezium areas and tangent gradients on curved s-t/v-t plots.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Fully compatible across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S1/IFY with no formula divergence.',
    divergenceNotes: [
      'Ensure velocity/displacement axes explicitly specify positive reference direction when rebound motion is plotted.',
    ],
  },
  {
    conceptId: 'projectile-motion',
    title: '2D Projectile Motion in a Uniform Gravitational Field',
    domain: 'Mechanics',
    summary:
      'Horizontal and oblique launches over level or elevated terrain solved via independent horizontal constant velocity and vertical constant gravitational acceleration.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a1-kinematics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'v_x = u cos θ',
          'x = (u cos θ) t',
          'v_y = u sin θ - gt',
          'y = (u sin θ) t - (1/2)gt^2',
        ],
        assumptionAndSignNotes:
          'Uses g = 9.8 m s^-2; includes qualitative comparison of ideal parabolic trajectory vs trajectory with air resistance (reduced peak height and asymmetric steeper descent).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'u_H = u cos θ, u_V = u sin θ',
          's_H = u_H t',
          's_V = u_V t - (1/2)gt^2',
        ],
        assumptionAndSignNotes:
          'Uses g = 9.81 m s^-2; closed-form range formula R = u^2 sin(2θ)/g is not in the Data Booklet (derive from components).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'v_x = u cos θ = const',
          'v_y^2 = u_y^2 - 2gΔy',
          'v = sqrt(v_x^2 + v_y^2)',
        ],
        assumptionAndSignNotes:
          'Uses g = 9.81 m s^-2; frequently examines aircraft/cliff horizontal release and speed magnitude sqrt(v_x^2 + v_y^2) at intermediate heights (e.g. IFYPH005 2526 V3 Q18).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Universal component-by-component parabolic projectile modelling with zero horizontal acceleration in vacuum and qualitative drag trajectory comparisons.',
    divergenceNotes: [
      'g = 9.8 m s^-2 (IB) vs g = 9.81 m s^-2 (A-Level & NCUK). Never assume memorised range formulas without component derivation.',
    ],
  },
  {
    conceptId: 'newtonian-dynamics-friction',
    title: "Newton's Laws, Inclined Planes, Friction and Connected Bodies",
    domain: 'Mechanics',
    summary:
      'Free-body force diagrams, Newton’s three laws, static vs dynamic friction on horizontal and inclined surfaces, lifts, and coupled two-body pulley/towing systems.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a2-forces-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F_net = ma', 'F_f <= μ_s F_N', 'F_f = μ_d F_N'],
        assumptionAndSignNotes:
          'IB explicitly distinguishes static friction coefficient μ_s and dynamic friction coefficient μ_d in the Data Booklet (g = 9.8 m s^-2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ΣF = ma', 'W_parallel = mg sin θ', 'R = mg cos θ'],
        assumptionAndSignNotes:
          'AQA usually gives friction force F directly in N rather than requiring F = μR unless μ is defined in the stem (CIE 9702 and OCR use F = μR sparingly; g = 9.81 m s^-2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = ma = Δp / Δt', 'F_friction = W sin θ (stationary slope)'],
        assumptionAndSignNotes:
          'Covers inclined planes, connected pulley masses, lift apparent weight, and free-body arrow labelling (g = 9.81 m s^-2); if μ is used, define F_f = μR in stem.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Free-body diagrams, inclined-plane component resolution (mg sin θ, mg cos θ), Atwood/table pulleys, and Newton’s third-law pair identification are universal.',
    divergenceNotes: [
      'IB prints F_f <= μ_s F_N and F_f = μ_d F_N in its Data Booklet, whereas AQA and NCUK data sheets omit μ; define μ explicitly in stems if cross-tagging.',
    ],
  },
  {
    conceptId: 'fluid-drag-buoyancy',
    title: 'Density, Hydrostatic Pressure, Archimedes Buoyancy and Fluid Drag',
    domain: 'Mechanics & Fluids',
    summary:
      'Bulk density, hydrostatic pressure Δp = ρgΔh, Archimedes upthrust on submerged/floating bodies, viscous drag (Stokes’ law where applicable), and terminal velocity.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs', 'thermal'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a', 'ib-theme-b'],
        subtopicIds: ['ib-a2-forces-momentum', 'ib-b1-thermal-energy-transfers'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = m / V', 'F_b = ρVg', 'F_d = 6πηrv'],
        assumptionAndSignNotes:
          'IB 2025 includes quantitative Stokes viscous drag F_d = 6πηrv and Archimedes buoyancy F_b = ρVg at SL+HL.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials', 'alevel-options-9-13'],
        subtopicIds: [
          'alevel-3-4-1-force-energy-momentum',
          'alevel-3-4-2-materials-young-modulus',
          'alevel-3-12-turning-points',
        ],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = m / V', 'W = F_drag at terminal speed', 'F = 6πηrv (Option 3.12)'],
        assumptionAndSignNotes:
          'AQA Core covers density ρ = m/V (3.4.2) and terminal speed force/v-t analysis (3.4.1); hydrostatic p = ρgh and upthrust are core in OCR H556/CIE 9702, while Stokes F = 6πηrv sits in AQA Option 3.12 (Millikan).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2', 'ncuk-ac3'],
        subtopicIds: ['ncuk-ac2-2', 'ncuk-ac3-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = m / V', 'Δp = ρgΔh', 'F_upthrust = ρ_fluid V_disp g'],
        assumptionAndSignNotes:
          'NCUK AC3.1 assesses density, gauge/absolute hydrostatic pressure, Archimedes buoyancy, and Brownian motion; AC2.2 assesses drag and terminal velocity without Stokes 6πηrv.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Density ρ = m/V and terminal-velocity force balance (drag increasing with speed until net force = 0) are shared across all three syllabi.',
    divergenceNotes: [
      'Quantitative Stokes’ law F_d = 6πηrv is compulsory SL in IB, optional Y13 (3.12) in AQA, and excluded from NCUK.',
      'Hydrostatic Δp = ρgΔh and Archimedes buoyancy are compulsory in IB and NCUK (and OCR/CIE A-Level), but omitted from AQA 7408 core.',
    ],
  },
  {
    conceptId: 'linear-momentum-impulse',
    title: 'Linear Momentum, Impulse and 1D/2D Collisions',
    domain: 'Mechanics',
    summary:
      'Conservation of linear momentum in isolated 1D and 2D collisions and explosions, impulse from F-t graphs, and kinetic-energy classification of elastic vs inelastic impacts.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a2-forces-momentum', 'ib-a3-work-energy-power'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['p = mv', 'J = FΔt = Δp', 'F_net = Δp / Δt', 'E_k = p^2 / (2m)'],
        assumptionAndSignNotes:
          'Covers both 1D and 2D glancing collisions at SL+HL, plus E_k = p^2/(2m) in Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['p = mv', 'F = Δ(mv) / Δt', 'FΔt = Δ(mv)'],
        assumptionAndSignNotes:
          'Covers 1D and oblique 2D momentum conservation, F-t area impulse, water-jet/conveyor mass-flow F = v(Δm/Δt), and elastic vs inelastic tests.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-6'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['p = mv', 'F = Δp / Δt', 'FΔt = Δp'],
        assumptionAndSignNotes:
          'NCUK explicitly names elastic, inelastic, and plastic (perfectly inelastic / coalescing) collisions across 1D and 2D.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      '1D/2D momentum conservation, impulse = area under F-t graph, and ΣE_k comparison for elastic vs inelastic collisions are identical across all three syllabi.',
    divergenceNotes: [
      'NCUK uses the term "plastic collision" alongside "perfectly inelastic" when colliding bodies stick together.',
    ],
  },
  {
    conceptId: 'work-energy-power',
    title: 'Mechanical Work, Conservation of Energy, Power and Efficiency',
    domain: 'Mechanics',
    summary:
      'Work done by constant and variable forces, kinetic and uniform-field gravitational potential energy transfers with resistive losses, P = Fv, and efficiency.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a3-work-energy-power'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'W = Fs cos θ',
          'E_k = (1/2)mv^2 = p^2 / (2m)',
          'ΔE_p = mgΔh',
          'P = ΔW / Δt = Fv',
          'η = E_out / E_in = P_out / P_in',
        ],
        assumptionAndSignNotes: 'Uses g = 9.8 m s^-2; includes Sankey energy-flow representations.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-1-force-energy-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'W = Fs cos θ',
          'E_k = (1/2)mv^2',
          'ΔE_p = mgΔh',
          'P = ΔW / Δt = Fv',
          'efficiency = useful output / total input',
        ],
        assumptionAndSignNotes: 'Uses g = 9.81 m s^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-5'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'W = Fs cos θ',
          'E_k = (1/2)mv^2',
          'E_p = mgh',
          'P = Fv',
          'efficiency = useful output / input',
        ],
        assumptionAndSignNotes: 'Uses g = 9.81 m s^-2; includes non-constant force F-x graph work.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Universal mechanical work-energy theorem, F-x area integration, P = Fv, and efficiency across all three syllabi.',
    divergenceNotes: [
      'Only numerical constant difference is g = 9.8 m s^-2 (IB) vs 9.81 m s^-2 (A-Level & NCUK).',
    ],
  },
  {
    conceptId: 'elasticity-young-modulus',
    title: "Hooke's Law, Stress, Strain and Young's Modulus",
    domain: 'Materials & Mechanics',
    summary:
      'Spring Hooke’s law and elastic strain energy, plus bulk material tensile stress, tensile strain, Young’s modulus E = σ/ε, and ductile/brittle/polymeric force-extension curves.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a2-forces-momentum', 'ib-a3-work-energy-power'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F_H = -kx', 'E_H = (1/2)k(Δx)^2'],
        assumptionAndSignNotes:
          'SCOPE RESTRICTION: IB 2025 covers ONLY spring Hooke’s law F_H = -kx and elastic energy E_H = (1/2)k(Δx)^2; bulk tensile stress σ = F/A, strain ε = ΔL/L, and Young’s modulus E = FL/(Ae) are NOT in IB 2025.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec4-mechanics-materials'],
        subtopicIds: ['alevel-3-4-2-materials-young-modulus'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = kΔL',
          'E_p = (1/2)FΔL = (1/2)k(ΔL)^2',
          'σ = F / A',
          'ε = ΔL / L',
          'E = σ / ε = FL / (AΔL)',
        ],
        assumptionAndSignNotes:
          'Full stress-strain curves (limit of proportionality, elastic limit, yield point, UTS, rubber hysteresis) and Young modulus wire practical (Required Practical 4) in Y12.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac3'],
        subtopicIds: ['ncuk-ac3-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = -kx',
          'E = (1/2)Fx = (1/2)kx^2',
          'E = FL / (Ae) = σ / ε',
        ],
        assumptionAndSignNotes:
          'Heavily examined in Semester 1 (AC3.2) and Final: wire diameter-to-area conversions, Young’s modulus E = FL/(Ae), and F-x / σ-ε curve interpretation.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Linear Hooke’s law and triangular area E = (1/2)Fx under force-extension graphs apply to all three syllabi.',
    divergenceNotes: [
      'Young’s modulus E = FL/(Ae), tensile stress, and tensile strain must ONLY be tagged for A-Level (Y12/Y13) and NCUK (IFY-S1/IFY), NEVER for IB Physics 2025.',
    ],
  },
  {
    conceptId: 'rigid-body-rotational-dynamics',
    title: 'Rigid Body Rotational Kinematics, Moment of Inertia and Angular Momentum',
    domain: 'Mechanics',
    summary:
      'Rotational suvat equations, moment of inertia I = Σmr^2, rotational Newton’s second law τ = Iα, rotational kinetic energy (1/2)Iω^2, rolling without slipping, and conservation of angular momentum L = Iω.',
    primaryVisualFamily: 'mechanics',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a4-rigid-body-mechanics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'τ = Fr sin θ = Iα',
          'ω_f = ω_i + αt',
          'ω_f^2 = ω_i^2 + 2αθ',
          'L = Iω',
          'E_k,rot = (1/2)Iω^2',
        ],
        assumptionAndSignNotes:
          'Compulsory HL-only subtopic (A.4) in IB 2025; standard moments of inertia (hoop, disc, cylinder, sphere, rod) are supplied in the question stem.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-11-engineering-physics'],
        questionFormats: ['structured'],
        equationsUsed: ['I = Σmr^2', 'T = Iα', 'L = Iω', 'E_k = (1/2)Iω^2', 'W = Tθ, P = Tω'],
        assumptionAndSignNotes:
          'Assessed only in AQA Year 13 Option 11 (Engineering Physics, Paper 3 Section B structured questions); absent from AQA compulsory core.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: excludedMapping(
        'ncuk',
        'Excluded from NCUK IFYPH005: NCUK covers static moments/couples (AC2.3) and point-mass circular motion (AC2.4), but omits moment of inertia I, angular acceleration α, and angular momentum L = Iω.',
      ),
    },
    sharedCoreSummary:
      'Shared between compulsory IB HL (A.4) and AQA Option 3.11 (Engineering Physics) with identical rotational equations.',
    divergenceNotes: [
      'Completely absent from IB SL, AQA Core (3.1-3.8), and NCUK IFY.',
    ],
  },

  // ============================================================================
  // DOMAIN 3: CIRCULAR MOTION, GRAVITATION & ASTROPHYSICS ('grav-astro')
  // ============================================================================
  {
    conceptId: 'uniform-circular-motion',
    title: 'Uniform Circular Motion, Centripetal Acceleration and Banked/Vertical Circles',
    domain: 'Circular Motion & Gravitation',
    summary:
      'Angular velocity ω, centripetal acceleration a = v^2/r = ω^2 r, and radial Newton’s second law across horizontal turntables, conical pendulums, banked curves, and vertical loops.',
    primaryVisualFamily: 'grav-astro',
    supportingVisualFamilies: ['mechanics'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a2-forces-momentum'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['v = 2πr / T = ωr', 'a = v^2 / r = ω^2 r = 4π^2 r / T^2', 'F_c = mv^2 / r'],
        assumptionAndSignNotes:
          'Compulsory SL+HL in IB A.2 (g = 9.8 m s^-2), including banked tracks and vertical circles.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal'],
        subtopicIds: ['alevel-3-6-1-periodic-motion-shm'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ω = v / r = 2πf', 'a = v^2 / r = ω^2 r', 'F = mv^2 / r = mω^2 r'],
        assumptionAndSignNotes:
          'Year 13 only (Section 3.6.1, A-Level Paper 1); not examined in AS / Year 12 (g = 9.81 m s^-2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac2'],
        subtopicIds: ['ncuk-ac2-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ω = Δθ / Δt = v / r', 'a = v^2 / r = rω^2', 'T = 1 / f = 2π / ω'],
        assumptionAndSignNotes:
          'Taught and examined in Semester 1 (AC2.4) and cumulative Final (g = 9.81 m s^-2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical kinematics and radial force-balance equations across IB SL/HL, A-Level Y13, and NCUK IFY-S1/IFY.',
    divergenceNotes: [
      'Level inversion: circular motion is SL/S1 in IB and NCUK, but deferred to Year 13 (A2) in UK A-Level.',
    ],
  },
  {
    conceptId: 'gravitational-force-field',
    title: "Newton's Law of Gravitation and Radial Gravitational Field Strength",
    domain: 'Circular Motion & Gravitation',
    summary:
      'Universal gravitational attraction F = GMm/r^2 between point/spherical masses, radial gravitational field g = GM/r^2, and two-body collinear null-field points.',
    primaryVisualFamily: 'grav-astro',
    supportingVisualFamilies: ['fields', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d1-gravitational-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = G m_1 m_2 / r^2', 'g = F / m = GM / r^2'],
        assumptionAndSignNotes:
          'Assessed at both SL and HL in D.1 (including uniform-density sphere interior g(r) ∝ r curves).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-2-gravitational-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = G m_1 m_2 / r^2', 'g = F / m', 'g = GM / r^2'],
        assumptionAndSignNotes: 'Year 13 only (Section 3.7.2, A-Level Paper 2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = GMm / r^2', 'g = F / m = GM / r^2'],
        assumptionAndSignNotes: 'Semester 2 (AC5.1), assessed on the cumulative IFY Final Examination.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Universal inverse-square law F = GMm/r^2 and g = GM/r^2 with G = 6.67 × 10^-11 N m^2 kg^-2 across all three syllabi.',
    divergenceNotes: [
      'Assessed at IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY (excluded from A-Level Y12 and NCUK EoS1).',
    ],
  },
  {
    conceptId: 'gravitational-potential-orbits',
    title: "Gravitational Potential, Escape Velocity, Kepler's Laws and Satellite Energy",
    domain: 'Circular Motion & Gravitation',
    summary:
      'Gravitational potential V_g = -GM/r, potential energy E_p = -GMm/r, potential gradients, escape speed v_esc = sqrt(2GM/r), Kepler’s third law, and circular orbital energy budgets.',
    primaryVisualFamily: 'grav-astro',
    supportingVisualFamilies: ['fields', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d1-gravitational-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'V_g = -GM / r',
          'E_p = mV_g = -GMm / r',
          'g = -ΔV_g / Δr',
          'v_orb = sqrt(GM / r)',
          'v_esc = sqrt(2GM / r)',
        ],
        assumptionAndSignNotes:
          'IMPORTANT: While circular v_orb = sqrt(GM/r) and T^2 ∝ r^3 appear at SL, negative gravitational potential V_g = -GM/r, escape speed, and total orbital energy E_tot = -GMm/(2r) are strictly HL-only in IB D.1.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-2-gravitational-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'V = -GM / r',
          'ΔW = mΔV',
          'g = -ΔV / Δr',
          'T^2 = (4π^2 / GM) r^3',
          'v_esc = sqrt(2GM / r)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (Section 3.7.2): includes geostationary/polar satellite comparisons and area under g-r graph = ΔV.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'V = W / m = -GM / r',
          '(1/2)mv_esc^2 = GMm / r',
          'T^2 = kr^3 = (4π^2 / GM) r^3',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 (AC5.1): NCUK Data Booklet prints V = W/m and (1/2)mv^2 = GMm/r alongside T^2 = kr^3; students must apply negative sign relative to zero at infinity.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Zero potential at infinity (V_g = -GM/r <= 0), escape speed sqrt(2GM/r), and Kepler’s T^2 = (4π^2/GM)r^3 are consistent across IB HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Do not tag V_g = -GM/r or escape-speed questions as IB SL; restrict IB level to HL.',
    ],
  },
  {
    conceptId: 'stellar-radiation-hr-diagram',
    title: 'Blackbody Stellar Luminosity, Wien & Stefan-Boltzmann Laws and HR Diagrams',
    domain: 'Astrophysics & Cosmology',
    summary:
      'Blackbody radiation spectra, Wien’s displacement law, Stefan-Boltzmann luminosity L = 4πR^2σT^4, apparent brightness/intensity I = L/(4πd^2), Hertzsprung-Russell diagrams, and mass-dependent stellar evolution.',
    primaryVisualFamily: 'grav-astro',
    supportingVisualFamilies: ['thermal', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b', 'ib-theme-e'],
        subtopicIds: ['ib-b1-thermal-energy-transfers', 'ib-e5-fusion-stars'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'λ_max T = 2.9 × 10^-3 m K',
          'L = σAT^4 = 4πR^2 σT^4',
          'b = L / (4πd^2)',
          'd(parsec) = 1 / p(arcsec)',
        ],
        assumptionAndSignNotes:
          'Compulsory SL+HL in IB 2025 (Wien/Stefan in B.1; stellar parallax, HR diagram, and life cycles in E.5; HL adds Jeans criterion and s/r-process nucleosynthesis).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-9-astrophysics'],
        questionFormats: ['structured'],
        equationsUsed: [
          'λ_max T = 2.9 × 10^-3 m K',
          'P = σAT^4',
          'I = P / (4πd^2)',
          'm - M = 5 log_10(d / 10)',
        ],
        assumptionAndSignNotes:
          'In AQA 7408, stellar radiation and HR diagrams sit in Option 3.9 (Paper 3B structured, adding logarithmic magnitude m - M); in OCR H556 (Module 5.5) and CIE 9702 (Topic 25) Wien/Stefan/HR are compulsory Y13 core.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['λ_max = b / T (b = 2.90 × 10^-3 m K)', 'L = 4πr^2 σT^4'],
        assumptionAndSignNotes:
          'Compulsory for ALL NCUK IFY candidates in Semester 2 (AC5.2); logarithmic apparent/absolute magnitude m - M is NOT in NCUK IFY.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Wien’s law, Stefan-Boltzmann stellar radius-luminosity scaling, HR diagram regions, and stellar life cycles are shared across IB SL/HL, A-Level (AQA 3.9 / OCR & CIE Core), and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Hipparchus/Pogson magnitude equation m - M = 5 log_10(d/10) is specific to AQA Option 3.9 and excluded from IB 2025 and NCUK IFY.',
    ],
  },
  {
    conceptId: 'cosmology-hubble-law',
    title: "Cosmological Redshift, Hubble's Law, CMBR and Big Bang Expansion",
    domain: 'Astrophysics & Cosmology',
    summary:
      'Galactic recession speed from spectral redshift, Hubble’s law v = H_0 d, Hubble-time age of the universe, Cosmic Microwave Background Radiation (CMBR), and Big Bang expansion.',
    primaryVisualFamily: 'grav-astro',
    supportingVisualFamilies: ['waves', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e5-fusion-stars'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['z = Δλ / λ_0 ≈ v / c', 'z = R / R_0 - 1', 'v = H_0 d', 't ≈ 1 / H_0'],
        assumptionAndSignNotes:
          'In IB 2025 E.5, cosmic scale factor z = R/R_0 - 1 and quantitative Hubble law v = H_0 d are AHL (HL-only) extensions.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-9-astrophysics'],
        questionFormats: ['structured'],
        equationsUsed: ['z = Δλ / λ = v / c (v ≪ c)', 'v = Hd', 't ≈ 1 / H'],
        assumptionAndSignNotes:
          'Option 3.9 in AQA 7408 (including Type Ia supernovae dark-energy acceleration and quasars); compulsory Y13 core in OCR H556 and CIE 9702.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Δλ / λ ≈ Δf / f ≈ v / c', 'v = H_0 d'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 (AC5.3): covers AU/ly/pc distance units, Cosmological Principle, Hubble’s law, and CMBR.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Low-redshift v/c ≈ Δλ/λ, Hubble’s law v = H_0 d, Hubble age 1/H_0, and CMBR evidence are shared across IB HL, A-Level (3.9 / OCR / CIE), and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Cosmological scale-factor ratio z = R/R_0 - 1 is tested in IB HL (and OCR), whereas NCUK focuses on Δλ/λ ≈ v/c and v = H_0 d.',
    ],
  },

  // ============================================================================
  // DOMAIN 4: THERMAL PHYSICS, IDEAL GASES & THERMODYNAMICS ('thermal')
  // ============================================================================
  {
    conceptId: 'specific-heat-latent-heat',
    title: 'Calorimetry, Specific Heat Capacity and Specific Latent Heat Curves',
    domain: 'Thermal Physics',
    summary:
      'Sensible heat transfer Q = mcΔT, isothermal phase transitions Q = mL across fusion and vaporisation, thermal equilibrium mixing, and electrical continuous-flow heating.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b1-thermal-energy-transfers'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Q = mcΔT', 'Q = mL', 'T(K) = θ(°C) + 273'],
        assumptionAndSignNotes: 'IB Data Booklet prints T(K) = T(°C) + 273.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal'],
        subtopicIds: ['alevel-3-6-2-thermal-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Q = mcΔθ', 'Q = ml', 'T / K = θ / °C + 273.15'],
        assumptionAndSignNotes:
          'Year 13 only (Section 3.6.2, Paper 2); frequently includes continuous-flow calorimetry heat-loss elimination.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac3'],
        subtopicIds: ['ncuk-ac3-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = mcΔθ', 'Q = LΔm', 'T / K = θ / °C + 273.2'],
        assumptionAndSignNotes:
          'Semester 1 (AC3.3) and Final; note NCUK Data Booklet prints T/K = θ/°C + 273.2 (temperature differences Δθ are unaffected).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Multi-stage heating/cooling curves, Q = mcΔT, Q = mL, and microscopic kinetic-vs-potential internal energy explanations during phase change are identical across all three syllabi.',
    divergenceNotes: [
      'Kelvin offset printed in booklets differs slightly (+273 in IB, +273.15 in AQA, +273.2 in NCUK), though ΔT in calorimetry is invariant.',
      'Calorimetry is SL/S1 in IB and NCUK, but Year 13 in UK A-Level.',
    ],
  },
  {
    conceptId: 'thermal-conduction-radiation',
    title: 'Thermal Conduction and Blackbody Radiation Transfer',
    domain: 'Thermal Physics',
    summary:
      'Steady-state Fourier thermal conduction ΔQ/Δt = kAΔT/Δx alongside radiative power P = eσAT^4 and Wien peak-wavelength shifts.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs', 'grav-astro'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b1-thermal-energy-transfers'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ΔQ / Δt = kA (ΔT / Δx)', 'L = σAT^4', 'λ_max T = 2.9 × 10^-3 m K'],
        assumptionAndSignNotes:
          'IB B.1 assesses BOTH quantitative Fourier conduction ΔQ/Δt = kAΔT/Δx and radiative blackbody laws at SL+HL.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: excludedMapping(
        'alevel',
        'Quantitative Fourier conduction ΔQ/Δt = kAΔT/Δx is NOT in UK A-Level Physics (Wien and Stefan-Boltzmann stellar laws are mapped under stellar-radiation-hr-diagram in Option 3.9).',
      ),
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['λ_max = b / T', 'L = 4πr^2 σT^4'],
        assumptionAndSignNotes:
          'SCOPE RESTRICTION: NCUK covers Wien and Stefan-Boltzmann blackbody radiation in AC5.2; quantitative slab thermal conductivity ΔQ/Δt = kAΔT/Δx is IB-only.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Blackbody spectral curves, Wien’s displacement law, and T^4 radiative scaling link IB B.1 and NCUK AC5.2.',
    divergenceNotes: [
      'Fourier slab conduction ΔQ/Δt = kAΔT/Δx is exclusive to IB Physics 2025 (B.1) and must not be tagged for A-Level or NCUK.',
    ],
  },
  {
    conceptId: 'greenhouse-albedo-energy-balance',
    title: 'Solar Constant, Planetary Albedo, Emissivity and Greenhouse Radiative Balance',
    domain: 'Thermal Physics',
    summary:
      'Solar constant S, planetary albedo α, surface/atmospheric emissivity e, incoming vs outgoing radiative power balance, and IR molecular resonance in greenhouse gases.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b2-greenhouse-effect'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'α = P_scattered / P_incident',
          'e = P_radiated / (σAT^4)',
          'I_avg,in = (1 - α) S / 4',
        ],
        assumptionAndSignNotes: 'Compulsory SL+HL subtopic B.2 in IB Physics 2025.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: excludedMapping(
        'alevel',
        'Planetary albedo, emissivity energy-balance models, and solar-constant climate calculations are NOT in UK A-Level Physics.',
      ),
      ncuk: excludedMapping(
        'ncuk',
        'Planetary albedo and greenhouse radiative-balance calculations are NOT in NCUK IFYPH005.',
      ),
    },
    sharedCoreSummary: 'IB-exclusive compulsory environmental physics cluster (Theme B.2).',
    divergenceNotes: [
      'Strictly IB-only (SL & HL); never assign to UK A-Level or NCUK IFY.',
    ],
  },
  {
    conceptId: 'ideal-gas-kinetic-theory',
    title: 'Ideal Gas Equation of State and Molecular Kinetic Theory',
    domain: 'Thermal Physics',
    summary:
      'Boyle’s, Charles’s, and Pressure laws, pV = nRT = Nk_B T, microscopic kinetic-theory pressure derivation, RMS molecular speed, and mean translational kinetic energy (3/2)k_B T.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b3-gas-laws'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'PV = nRT = Nk_B T',
          'P = (1/3)ρ v_rms^2',
          'E_k,avg = (3/2)k_B T = (3/2)(R / N_A)T',
          'U = (3/2)nRT = (3/2)PV',
        ],
        assumptionAndSignNotes: 'Compulsory SL+HL (B.3); models monatomic ideal gas internal energy U = (3/2)nRT.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal'],
        subtopicIds: ['alevel-3-6-2-thermal-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'pV = nRT = NkT',
          'pV = (1/3)Nm (c_rms)^2',
          '(1/2)m(c_rms)^2 = (3/2)kT = 3RT / (2N_A)',
        ],
        assumptionAndSignNotes:
          'Year 13 Core (Section 3.6.2, including Required Practical 8 Boyle/Charles laws and step-by-step cubic-box derivation of pV = (1/3)Nm c_rms^2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac3'],
        subtopicIds: ['ncuk-ac3-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['pV = nRT', 'pV = NkT', 'R / k = N_A'],
        assumptionAndSignNotes:
          'Semester 1 (AC3.4) and Final: Boyle, Charles, and Pressure laws + pV = nRT = NkT (with T/K = θ/°C + 273.2). Note pV = (1/3)Nm c_rms^2 is NOT printed in the NCUK Data Booklet, so supply it if quantitative RMS speed is asked.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Empirical gas laws, absolute Kelvin temperature requirement, pV = nRT = Nk_B T, and kinetic-theory wall-momentum reasoning are shared across all three syllabi.',
    divergenceNotes: [
      'IB and A-Level print p = (1/3)ρ v_rms^2 / pV = (1/3)Nm c_rms^2 and (3/2)k_B T in their data booklets, whereas NCUK omits the RMS formula from its data sheet.',
    ],
  },
  {
    conceptId: 'ideal-gas-pv-cycles',
    title: 'First Law of Thermodynamics and Ideal Gas P-V / P-T / V-T State Changes',
    domain: 'Thermal Physics',
    summary:
      'Isobaric, isochoric, and isothermal state transitions on P-V, P-T, and V-T diagrams, boundary work W = pΔV (area under P-V curve), and First Law energy balances.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b3-gas-laws', 'ib-b4-thermodynamics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['PV = nRT', 'W = PΔV', 'Q = ΔU + W (HL B.4)'],
        assumptionAndSignNotes:
          'SIGN CONVENTION: IB HL B.4 writes Q = ΔU + W (so ΔU = Q - W), where +W is work done BY the gas (expansion W > 0). Simple P-V/P-T/V-T gas-law state plots are SL+HL (B.3); First Law cycle balances are HL-only (B.4).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal', 'alevel-options-9-13'],
        subtopicIds: ['alevel-3-6-2-thermal-physics', 'alevel-3-11-engineering-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['W = pΔV (3.6.2 Core)', 'Q = ΔU + W (Option 3.11)'],
        assumptionAndSignNotes:
          'SIGN CONVENTION: Core physics textbooks/CIE use ΔU = q + w (+w on gas), whereas AQA Option 3.11 Engineering Physics prints Q = ΔU + W (+W by gas) alongside W = pΔV in Core 3.6.2. Always state work direction explicitly in stems.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac3'],
        subtopicIds: ['ncuk-ac3-3', 'ncuk-ac3-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ΔU = ΔQ + ΔW', 'p_1 V_1 / T_1 = p_2 V_2 / T_2'],
        assumptionAndSignNotes:
          'SIGN CONVENTION: NCUK Data Booklet prints ΔU = ΔQ + ΔW, where +ΔW is work done ON the gas (compression ΔW > 0, expansion ΔW < 0). Closed Carnot/adiabatic engine cycles are outside NCUK scope.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'State tables (P, V, T), isobaric/isochoric/isothermal graph geometry, and work magnitude = area under P-V curve are shared across IB, A-Level Y13, and NCUK IFY-S1/IFY.',
    divergenceNotes: [
      'CRITICAL SIGN OPPOSITION: IB HL uses Q = ΔU + W (+W = work done BY gas), whereas NCUK (and CIE A-Level) prints ΔU = ΔQ + ΔW (+ΔW = work done ON gas). Questions must phrase "work done by/on the gas" unambiguously.',
    ],
  },
  {
    conceptId: 'thermodynamics-entropy-engines',
    title: 'Adiabatic Processes, Closed Heat-Engine Cycles, Carnot Efficiency and Entropy',
    domain: 'Thermal Physics',
    summary:
      'Adiabatic ideal-gas law PV^γ = const, multi-leg closed heat-engine and heat-pump P-V cycles, Carnot efficiency η = 1 - T_C/T_H, and quantitative Clausius/Boltzmann entropy.',
    primaryVisualFamily: 'thermal',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b4-thermodynamics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'Q = ΔU + W',
          'P V^(5/3) = const (monatomic)',
          'ΔS = ΔQ / T',
          'S = k_B ln Ω',
          'η_Carnot = 1 - T_c / T_h',
        ],
        assumptionAndSignNotes:
          'Compulsory HL-only subtopic B.4 in IB 2025; restricts adiabatic exponent explicitly to monatomic γ = 5/3 and includes both ΔS = ΔQ/T and statistical S = k_B ln Ω.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-11-engineering-physics'],
        questionFormats: ['structured'],
        equationsUsed: [
          'p V^γ = const',
          'W = nRT ln(V_2 / V_1) (isothermal)',
          'η_max = (T_H - T_C) / T_H',
        ],
        assumptionAndSignNotes:
          'AQA Year 13 Option 3.11 (Engineering Physics, Paper 3B structured): includes diatomic γ = 1.4 Otto/Diesel cycles and refrigerator/heat-pump COP, without Boltzmann S = k_B ln Ω.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: excludedMapping(
        'ncuk',
        'Excluded from NCUK IFYPH005: NCUK introduces qualitative 2nd/3rd law entropy statements in AC3.3, but excludes adiabatic PV^γ equations, Carnot efficiency, and quantitative ΔS = ΔQ/T.',
      ),
    },
    sharedCoreSummary:
      'Adiabatic curves steeper than isotherms, closed-loop net work enclosed area, and Carnot efficiency η = 1 - T_C/T_H link IB HL B.4 and AQA Option 3.11.',
    divergenceNotes: [
      'Boltzmann microstate entropy S = k_B ln Ω is exclusive to IB HL B.4; Otto/Diesel indicator loops and COP are specific to AQA Option 3.11.',
    ],
  },

  // ============================================================================
  // DOMAIN 5: DC ELECTRICITY & CIRCUIT NETWORKS ('circuits')
  // ============================================================================
  {
    conceptId: 'charge-current-potential-difference',
    title: 'Electric Charge, Conduction Current, Drift Velocity and Potential Difference',
    domain: 'Electricity & Circuits',
    summary:
      'Quantised charge Q = It, energy-per-unit-charge potential difference V = W/Q, electrical power P = IV, and microscopic charge-carrier drift speed I = nAvq.',
    primaryVisualFamily: 'circuits',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['I = Δq / Δt', 'V = W / q', 'P = IV'],
        assumptionAndSignNotes:
          'IB 2025 B.5 omits I = nAvq from the Data Booklet (removed with old 2016 5.1 streamlining); avoid requiring memorised I = nAvq on IB-tagged items unless given in stem.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity'],
        subtopicIds: ['alevel-3-5-1-current-electricity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['I = ΔQ / Δt', 'V = W / Q', 'P = IV', 'I = nAvq (OCR H556 / CIE 9702)'],
        assumptionAndSignNotes:
          'Core Year 12 across all UK boards; note I = nAvq is printed in OCR H556 and CIE 9702 data booklets though omitted from AQA 7408.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['I = ΔQ / Δt', 'W = QV = IVt', 'I = nAve'],
        assumptionAndSignNotes:
          'Semester 1 (AC4.1) and Final; I = nAve is explicitly printed in the NCUK Data Booklet and taught in AC4.1.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'I = ΔQ/Δt, V = W/Q, conventional vs electron flow, and P = IV are identical across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S1/IFY.',
    divergenceNotes: [
      'Mean drift speed I = nAve is core in NCUK (AC4.1) and OCR/CIE A-Level, but omitted from IB 2025 and AQA 7408 booklets; supply I = nAve in the stem if cross-tagging.',
    ],
  },
  {
    conceptId: 'ohms-law-iv-characteristics',
    title: "Ohm's Law and Ohmic / Non-Ohmic I-V Characteristics",
    domain: 'Electricity & Circuits',
    summary:
      'Static resistance R = V/I (never tangent slope dV/dI) and symmetric/asymmetric I-V curves for metallic ohmic resistors, filament lamps, thermistors, and semiconductor diodes/LEDs.',
    primaryVisualFamily: 'graphs',
    supportingVisualFamilies: ['circuits'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['R = V / I', 'P = IV = I^2 R = V^2 / R'],
        assumptionAndSignNotes:
          'Covers ohmic conductor, filament lamp, diode/LED, and NTC thermistor I-V curves at SL+HL.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity'],
        subtopicIds: ['alevel-3-5-1-current-electricity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['R = V / I', 'P = IV = I^2 R = V^2 / R'],
        assumptionAndSignNotes:
          'Compulsory Y12 core; frequently tests whether I is on y-axis vs V on y-axis and static ratio V/I vs chord/tangent traps.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['R = V / I', 'P = I^2 R = V^2 / R = IV'],
        assumptionAndSignNotes:
          'Semester 1 (AC4.2) and Final: resistor, filament lamp, and diode I-V curves (e.g. IFYPH005 2526 V3 Q4).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      '100% compatible across all three syllabi; always define R = V/I at a point rather than the reciprocal tangent gradient on curved I-V plots.',
    divergenceNotes: [
      'Always label axes explicitly (I vs V or V vs I), as both orientations appear across all three boards.',
    ],
  },
  {
    conceptId: 'resistivity-ohmic-conductors',
    title: 'Electrical Resistivity, Wire Geometry and Temperature Effects',
    domain: 'Electricity & Circuits',
    summary:
      'Material resistivity ρ = RA/L, cylindrical wire diameter/cross-section scaling, constant-volume wire stretching, and temperature dependence in metals, semiconductors, and superconductors.',
    primaryVisualFamily: 'circuits',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = RA / L', 'A = πd^2 / 4'],
        assumptionAndSignNotes: 'SL+HL core in B.5; superconductors are not assessed in IB 2025.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity'],
        subtopicIds: ['alevel-3-5-1-current-electricity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = RA / L', 'A = πd^2 / 4'],
        assumptionAndSignNotes:
          'Includes Required Practical 5 (micrometer wire resistivity R vs L gradient) AND critical temperature T_c superconductivity in AQA 3.5.1.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ρ = RA / L', 'A = πr^2 = πd^2 / 4'],
        assumptionAndSignNotes:
          'Semester 1 (AC4.2) and Final (e.g. IFYPH005 2526 V3 Q21b); superconductivity is not assessed.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Wire resistivity ρ = RA/L, diameter-squared scaling (R ∝ L/d^2), and constant-volume stretching (R ∝ L^2) are shared across all three syllabi.',
    divergenceNotes: [
      'Superconductivity and critical temperature T_c are specific to AQA A-Level (3.5.1) and excluded from IB and NCUK.',
    ],
  },
  {
    conceptId: 'kirchhoff-dc-circuits',
    title: "Series/Parallel DC Networks and Kirchhoff's Circuit Laws",
    domain: 'Electricity & Circuits',
    summary:
      'Series and parallel resistor reductions, multi-branch current/voltage division, ammeter/voltmeter loading, and Kirchhoff’s junction (charge) and loop (energy) equations.',
    primaryVisualFamily: 'circuits',
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'R_s = ΣR_i',
          '1 / R_p = Σ(1 / R_i)',
          'ΣI = 0 (junction)',
          'ΣV = 0 (loop)',
        ],
        assumptionAndSignNotes:
          'Uses IEC rectangular resistor symbols; assesses single-cell and multi-cell DC networks and non-ideal meter resistance at SL+HL.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity', 'alevel-options-9-13'],
        subtopicIds: ['alevel-3-5-1-current-electricity', 'alevel-3-13-electronics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'R_T = R_1 + R_2 + ...',
          '1 / R_T = 1 / R_1 + 1 / R_2 + ...',
          'ΣI_in = ΣI_out, Σɛ = ΣIR',
        ],
        assumptionAndSignNotes:
          'Uses IEC rectangular resistor symbols; Core 3.5.1 covers series/parallel/opposing-cell DC loops in Y12/Y13 (Option 3.13 adds virtual-earth op-amp networks).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'R = R_1 + R_2 + R_3',
          '1 / R = 1 / R_1 + 1 / R_2 + 1 / R_3',
          'ΣI_in = ΣI_out, Σɛ = ΣIR',
        ],
        assumptionAndSignNotes:
          'Uses IEC rectangular resistor symbols; explicitly examines opposing series cells (e.g. IFYPH005 2526 V3 Q17) and multi-loop Kirchhoff systems in Semester 1 and Final.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Highest-compatibility DC circuit cluster: IEC symbols, series/parallel combinations, opposing cells, and Kirchhoff’s laws match across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S1/IFY.',
    divergenceNotes: [
      'Operational-amplifier feedback circuits (AQA Option 3.13) must not be tagged onto IB or NCUK.',
    ],
  },
  {
    conceptId: 'potential-divider-sensors',
    title: 'Potential Dividers, Rheostats and Thermistor/LDR Sensing Circuits',
    domain: 'Electricity & Circuits',
    summary:
      'Unloaded and loaded potential-divider ratios, potentiometer variable taps, and automatic voltage switching with NTC thermistors and light-dependent resistors (LDRs).',
    primaryVisualFamily: 'circuits',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V_out = V_in × R_2 / (R_1 + R_2)'],
        assumptionAndSignNotes: 'SL+HL core in B.5, including NTC thermistor and LDR sensor dividers and parallel-load sag.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity'],
        subtopicIds: ['alevel-3-5-1-current-electricity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V_1 / V_2 = R_1 / R_2', 'V_out = V_s R_2 / (R_1 + R_2)'],
        assumptionAndSignNotes: 'Compulsory Y12 core across AQA, OCR, and CIE (CIE 9702 also includes null-method slide-wire potentiometers).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V_out = V_in R_2 / (R_1 + R_2)'],
        assumptionAndSignNotes: 'Compulsory Semester 1 (AC4.2) and Final: potential dividers and thermistor/LDR sensing circuits.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Fully compatible across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S1/IFY with identical IEC thermistor/LDR sensor behaviour.',
    divergenceNotes: [
      'Specify NTC (resistance decreases as temperature rises) explicitly whenever a thermistor is used.',
    ],
  },
  {
    conceptId: 'emf-internal-resistance',
    title: 'Cell Electromotive Force (EMF), Internal Resistance and Terminal V-I Graphs',
    domain: 'Electricity & Circuits',
    summary:
      'Terminal potential difference V = ε - Ir, lost volts Ir, determining ε (intercept) and r (-gradient) from V-I plots, short-circuit current I_max = ε/r, and load power matching.',
    primaryVisualFamily: 'circuits',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-b'],
        subtopicIds: ['ib-b5-current-circuits'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ε = I(R + r)', 'V = ε - Ir'],
        assumptionAndSignNotes: 'Compulsory SL+HL in B.5.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec5-electricity'],
        subtopicIds: ['alevel-3-5-1-current-electricity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['ε = E / Q', 'ε = I(R + r)', 'V = ε - Ir'],
        assumptionAndSignNotes: 'Compulsory Y12 core including Required Practical 6 (V vs I cell internal resistance).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V = ε - Ir', 'P = I^2 R'],
        assumptionAndSignNotes:
          'Signature NCUK Semester 1 topic (AC4.3, Coursework 1 lab report, and IFYPH005 2526 V3 Q3 & Q21a).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical equations (V = ε - Ir, ε = I(R + r)), V-I intercept/gradient interpretation, and experimental methodology across all three syllabi.',
    divergenceNotes: [
      'Zero formula or notation divergence across IB, A-Level, and NCUK.',
    ],
  },
  {
    conceptId: 'capacitor-networks-energy',
    title: 'Capacitance, Dielectric Parallel Plates, Capacitor Networks and Stored Energy',
    domain: 'Electricity, Capacitance & Induction',
    summary:
      'Definition C = Q/V, parallel-plate dielectric capacitance C = Aε_0ε_r/d, series and parallel capacitor networks, charge conservation on isolated plates, and stored energy E = (1/2)QV = (1/2)CV^2 = Q^2/(2C).',
    primaryVisualFamily: 'circuits',
    supportingVisualFamilies: ['em-induction', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: excludedMapping(
        'ib',
        'REMOVED FROM IB 2025: Capacitance and capacitor networks (former 2016 HL Topic 11.3) are NOT in IB Physics (First Assessment 2025).',
      ),
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-4-capacitance'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'C = Q / V',
          'C = Aε_0 ε_r / d',
          'E = (1/2)QV = (1/2)CV^2 = (1/2)Q^2 / C',
          'C_p = C_1 + C_2, 1/C_s = 1/C_1 + 1/C_2 (OCR H556 / CIE 9702)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (Section 3.7.4). Note AQA 3.7.4 emphasises C = Aε_0ε_r/d and energy, while OCR H556 and CIE 9702 also examine series/parallel combinations.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'C = Q / V',
          'W = (1/2)CV^2 = (1/2)QV = (1/2)Q^2 / C',
          'C_p = C_1 + C_2 + C_3',
          '1 / C_s = 1 / C_1 + 1 / C_2 + 1 / C_3',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 1 (AC4.4) and Final: emphasises Q-V graph area and series/parallel capacitor combinations; dielectric C = Aε_0ε_r/d is not in the NCUK Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'C = Q/V, Q-V triangular energy area W = (1/2)CV^2 = (1/2)QV = Q^2/(2C), and series/parallel combinations link UK A-Level (Y13) and NCUK (IFY-S1/IFY).',
    divergenceNotes: [
      'Strictly excluded from IB Physics 2025.',
      'Parallel-plate relative permittivity C = Aε_0ε_r/d is AQA Y13 specific and not printed in the NCUK Data Booklet.',
    ],
  },
  {
    conceptId: 'capacitor-rc-decay',
    title: 'Exponential RC Charging/Discharging Transients and Time Constant',
    domain: 'Electricity, Capacitance & Induction',
    summary:
      'RC time constant τ = RC, exponential discharge Q/V/I = X_0 e^{-t/RC}, charging V = V_0(1 - e^{-t/RC}) and I = I_0 e^{-t/RC}, half-time t_{1/2} = RC ln 2, and semi-log ln(V) vs t gradient extraction.',
    primaryVisualFamily: 'em-induction',
    supportingVisualFamilies: ['circuits', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: excludedMapping(
        'ib',
        'REMOVED FROM IB 2025: RC capacitor transients (former 2016 HL Topic 11.3) are NOT in IB Physics (First Assessment 2025).',
      ),
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences', 'alevel-options-9-13'],
        subtopicIds: ['alevel-3-7-4-capacitance', 'alevel-3-13-electronics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'τ = RC',
          'Q = Q_0 e^{-t / RC}',
          'Q = Q_0 (1 - e^{-t / RC})',
          'T_{1/2} = 0.693 RC',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.7.4, including Required Practical 9 charging/discharging log plots) and timing circuits in Option 3.13.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S1', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'τ = RC',
          'Q = Q_0 e^{-t/τ}, I = I_0 e^{-t/τ}, V = V_0 e^{-t/τ}',
          'ln V = ln V_0 - t / (RC)',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 1 (AC4.4) and Final; requires exponential and natural-logarithm algebra.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Shared directly between UK A-Level Year 13 (3.7.4) and NCUK IFY (AC4.4, S1 & Final) with identical exponential RC equations and semi-log analysis.',
    divergenceNotes: [
      'Strictly excluded from IB Physics 2025.',
      'Energy decays as e^{-2t/RC} (twice as fast as V and Q), a classic distractor trap in both A-Level and NCUK.',
    ],
  },
  // ============================================================================
  // DOMAIN 6: ELECTROSTATIC & MAGNETIC FIELDS ('fields' & 'em-induction')
  // ============================================================================
  {
    conceptId: 'electrostatic-coulomb-uniform-fields',
    title: "Coulomb's Law, Point-Charge Radial Fields and Parallel-Plate Uniform Fields",
    domain: 'Electric & Magnetic Fields',
    summary:
      'Electrostatic force F = Q_1 Q_2 / (4πε_0 r^2), vector electric field strength E = F/q in radial and uniform parallel-plate geometries (E = V/d), and parabolic charged-particle trajectories.',
    primaryVisualFamily: 'fields',
    supportingVisualFamilies: ['mechanics', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d2-electric-magnetic-fields', 'ib-d3-motion-em-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = k q_1 q_2 / r^2',
          'E = F / q = kQ / r^2',
          'E = V / d',
        ],
        assumptionAndSignNotes:
          'Compulsory SL+HL in D.2/D.3; prints both k = 8.99 × 10^9 N m^2 C^-2 and ε_0 = 8.85 × 10^-12 C^2 N^-1 m^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-3-electric-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = (1 / 4πε_0) (Q_1 Q_2 / r^2)',
          'E = F / Q = (1 / 4πε_0) (Q / r^2)',
          'E = V / d',
        ],
        assumptionAndSignNotes:
          'Year 13 only in AQA 3.7.3 and OCR Module 6.2 (note CIE 9702 introduces uniform E = V/d in AS Topic 18, reserving radial Coulomb fields for A2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-5'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = Q_1 Q_2 / (4πε_0 r^2)',
          'E = F / Q = Q / (4πε_0 r^2)',
          'E = V / d',
        ],
        assumptionAndSignNotes:
          'Assessed in Semester 2 / Final (AC4.5, LO4); prints both ε_0 and k = 1/(4πε_0) = 8.99 × 10^9 N m^2 C^-2.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical Coulomb inverse-square force, radial and uniform E = V/d field strengths, and projectile-analog parabolic plate deflection across IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Positive test-charge convention defines field-line direction (+ to -) in all three syllabi.',
    ],
  },
  {
    conceptId: 'electric-potential-equipotentials',
    title: 'Radial Electric Potential, Potential Energy and Equipotential Surfaces',
    domain: 'Electric & Magnetic Fields',
    summary:
      'Signed scalar electric potential V_e = Q / (4πε_0 r), electrostatic potential energy E_p = Qq / (4πε_0 r), work W = qΔV, potential gradient E = -ΔV/Δr, and orthogonal field-equipotential geometry.',
    primaryVisualFamily: 'fields',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d2-electric-magnetic-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'V_e = kQ / r',
          'E_p = qV_e = kQq / r',
          'E = -ΔV_e / Δr',
          'W = qΔV_e',
        ],
        assumptionAndSignNotes:
          'Strictly HL-only (AHL extension in D.2) in IB Physics 2025; SL covers only W = qV in uniform plates.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-3-electric-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'V = (1 / 4πε_0) (Q / r)',
          'ΔW = QΔV',
          'E = -ΔV / Δr (area under E-r = ΔV)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (Section 3.7.3): zero potential at infinity, positive for +Q and negative for -Q.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-5'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V = Q / (4πε_0 r)', 'W = QV'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC4.5): emphasises scalar addition of potentials (where V = 0 midway between ±Q even though E != 0) and speed gain from W = qΔV.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Signed scalar potential V = Q/(4πε_0 r) relative to zero at infinity and work W = qΔV match across IB HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Never tag radial V = kQ/r questions as IB SL; restrict IB to HL.',
    ],
  },
  {
    conceptId: 'magnetic-force-charges-currents',
    title: 'Magnetic Lorentz Force on Currents/Moving Charges, Cyclotron Orbits and Velocity Selectors',
    domain: 'Electric & Magnetic Fields',
    summary:
      'Magnetic force F = BIL sin θ on current-carrying wires, F = Bqv sin θ on moving charges, circular cyclotron motion r = mv/(Bq), crossed E/B velocity selection v = E/B, and motor coil torque.',
    primaryVisualFamily: 'em-induction',
    supportingVisualFamilies: ['fields'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d3-motion-em-fields'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'F = qvB sin θ',
          'F = BIL sin θ',
          'r = mv / (qB)',
          'v = E / B (crossed fields)',
        ],
        assumptionAndSignNotes:
          'Compulsory SL+HL in D.3 (also includes F/L = μ_0 I_1 I_2 / (2πr) between parallel wires); motor coil torque T = BIAn is not in the IB Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences', 'alevel-options-9-13'],
        subtopicIds: ['alevel-3-7-5-magnetic-fields-induction-ac', 'alevel-3-12-turning-points'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = BIL', 'F = BQv', 'r = mv / (BQ)', 'v = E / B'],
        assumptionAndSignNotes:
          'Year 13 Core (3.7.5, including Required Practical 10 wire force on top-pan balance and cyclotron frequency). CIE 9702 also includes Hall voltage V_H = BI/(ntq).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-5'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['F = Bqv', 'F = BIL sin θ', 'T = BIAn'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC4.5): Fleming’s left-hand rule, Laplace wire force, circular particle deflection, and rectangular coil torque T = BIAn.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'F = BIL sin θ, F = Bqv, circular radius r = mv/(Bq), zero magnetic work on isolated charges, and right-hand/Fleming left-hand deflection rules are shared across IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'NCUK explicitly prints coil torque T = BIAn in its Data Booklet; IB D.3 uniquely prints parallel-wire force per unit length μ_0 I_1 I_2 / (2πr); CIE uniquely assesses Hall probe V_H.',
    ],
  },
  {
    conceptId: 'electromagnetic-induction-faraday-lenz',
    title: "Magnetic Flux Linkage, Faraday's Law, Lenz's Law and Motional EMF",
    domain: 'Electromagnetic Induction',
    summary:
      'Magnetic flux Φ = BA cos θ (θ to coil normal), flux linkage NΦ, Faraday’s law ε = -NΔΦ/Δt, Lenz’s law conservation-of-energy polarity, and straight-rod motional EMF ε = BLv.',
    primaryVisualFamily: 'em-induction',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d4-induction'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Φ = BA cos θ', 'ε = -N ΔΦ / Δt', 'ε = BvL'],
        assumptionAndSignNotes:
          'Strictly HL-only subtopic D.4 in IB Physics 2025; angle θ is measured between B and the normal to the loop area.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-5-magnetic-fields-induction-ac'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Φ = BA', 'NΦ = BAN cos θ', 'ε = N ΔΦ / Δt', 'ε = Blv'],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.7.5, including Required Practical 11 search-coil flux linkage vs angle). Note AQA prints magnitude ε = NΔΦ/Δt while testing Lenz’s law qualitatively and graphically.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-6'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['NΦ = NBA cos θ', 'ε = -N ΔΦ / Δt', 'ε = BLv'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC4.6); prints negative Lenz sign in ε = -NΔΦ/Δt and measures θ to the area normal.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical flux-normal angle convention (NΦ = NBA cos θ), Faraday rate-of-change law, motional rod ε = BLv, and negative-derivative Φ(t) -> ε(t) graph relationships across IB HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Excluded from IB SL, A-Level Y12, and NCUK EoS1.',
    ],
  },
  {
    conceptId: 'ac-generators-transformers',
    title: 'Rotating-Coil AC Generators, Sinusoidal RMS Power and Transformers',
    domain: 'Electromagnetic Induction',
    summary:
      'Rotating-coil sinusoidal EMF ε(t) = BANω sin(ωt), RMS current/voltage (I_0/√2, V_0/√2), oscilloscope waveforms, and step-up/step-down transformer turns ratios and losses.',
    primaryVisualFamily: 'em-induction',
    supportingVisualFamilies: ['graphs', 'circuits'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-d'],
        subtopicIds: ['ib-d4-induction'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Φ(t) = BA cos(ωt)', 'ε(t) = NBAω sin(ωt)'],
        assumptionAndSignNotes:
          'SCOPE RESTRICTION: IB 2025 HL D.4 covers rotating-coil AC generator EMF waveforms (doubling ω doubles both frequency and peak EMF), but OMITS RMS 1/√2 equations, transformers V_p/V_s = N_p/N_s, and rectification.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec7-fields-consequences'],
        subtopicIds: ['alevel-3-7-5-magnetic-fields-induction-ac'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'ε = BANω sin(ωt)',
          'I_rms = I_0 / √2, V_rms = V_0 / √2',
          'N_s / N_p = V_s / V_p',
          'efficiency = I_s V_s / (I_p V_p)',
        ],
        assumptionAndSignNotes:
          'Full coverage in Year 13 Core (3.7.5): rotating coils, RMS 1/√2 power, CRO timebase/y-gain, transformers, and HV grid I^2 R transmission losses (CIE 9702 adds diode bridge rectification).',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac4'],
        subtopicIds: ['ncuk-ac4-6'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['V_p / V_s = N_p / N_s', 'P_s = η P_p (V_s I_s = η V_p I_p)'],
        assumptionAndSignNotes:
          'NCUK AC4.6 assesses AC slip-ring generators and ideal/non-ideal transformers (V_p/V_s = N_p/N_s); RMS 1/√2 formulas are not printed in the NCUK Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Slip-ring AC generator flux-to-EMF phase quadrature is shared across IB HL, A-Level Y13, and NCUK IFY-S2/IFY; transformer turns ratio V_p/V_s = N_p/N_s is shared between A-Level Y13 and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Do NOT tag transformer or RMS 1/√2 questions to IB 2025; restrict RMS 1/√2 questions without supplied formula to A-Level Y13.',
    ],
  },

  // ============================================================================
  // DOMAIN 7: OSCILLATIONS & GEOMETRIC OPTICS ('optics-shm')
  // ============================================================================
  {
    conceptId: 'simple-harmonic-motion',
    title: 'Simple Harmonic Motion (SHM): Mass-Spring, Simple Pendulum and Energy Curves',
    domain: 'Oscillations & Optics',
    summary:
      'Defining condition a = -ω^2 x, sinusoidal x(t), v(t), a(t) phase relationships, phase-circle speed v = ±ω√(x_0^2 - x^2), mass-spring and simple-pendulum periods, and parabolic E_k(x)/E_p(x) exchange.',
    primaryVisualFamily: 'optics-shm',
    supportingVisualFamilies: ['graphs', 'mechanics'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c1-shm'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'a = -ω^2 x',
          'T = 1 / f = 2π / ω',
          'T = 2π sqrt(m / k), T = 2π sqrt(l / g)',
          'x = x_0 sin(ωt + φ), v = ω x_0 cos(ωt + φ), v = ±ω sqrt(x_0^2 - x^2) (HL)',
          'E_T = (1/2)mω^2 x_0^2, E_p = (1/2)mω^2 x^2 (HL)',
        ],
        assumptionAndSignNotes:
          'LEVEL SPLIT: Defining condition a = -ω^2 x, periods, and qualitative graphs/energy are SL+HL; explicit phase angle φ, v = ±ω√(x_0^2 - x^2), and quantitative energy equations are HL-only in IB C.1 (g = 9.8 m s^-2).',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal'],
        subtopicIds: ['alevel-3-6-1-periodic-motion-shm'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'a = -ω^2 x',
          'x = A cos(ωt)',
          'v = ±ω sqrt(A^2 - x^2)',
          'v_max = ωA, a_max = ω^2 A',
          'T = 2π sqrt(m / k), T = 2π sqrt(l / g)',
        ],
        assumptionAndSignNotes:
          'Year 13 Core (3.6.1, including Required Practical 7 mass-spring & pendulum). Note AQA prints x = A cos(ωt) assuming release from +A at t = 0 (g = 9.81 m s^-2).',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'x = A sin(ωt)',
          'a = -ω^2 x',
          'v = Aω cos(ωt) = ±ω sqrt(A^2 - x^2)',
          'T = 2π sqrt(l / g), T = 2π sqrt(m / k)',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.1). Note NCUK Data Booklet prints x = A sin(ωt) assuming x = 0 at t = 0 (g = 9.81 m s^-2).',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'a = -ω^2 x, mass-spring and pendulum period formulas, v = ±ω√(A^2 - x^2), and E_k/E_p interchange match across IB (HL full / SL core), A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'PHASE NOTATION: AQA prints x = A cos(ωt) whereas NCUK prints x = A sin(ωt) and IB HL prints x = x_0 sin(ωt + φ); always state initial t = 0 position explicitly in stems.',
    ],
  },
  {
    conceptId: 'forced-oscillations-resonance',
    title: 'Free vs Forced Oscillations, Light/Critical/Heavy Damping and Resonance',
    domain: 'Oscillations & Optics',
    summary:
      'Exponential/envelope amplitude decay under light, critical, and heavy damping, natural vs driving frequency, and resonance amplitude-frequency response curves.',
    primaryVisualFamily: 'optics-shm',
    supportingVisualFamilies: ['graphs', 'waves'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c4-standing-waves-resonance'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['f_driving ≈ f_0 at resonance'],
        assumptionAndSignNotes:
          'Assessed qualitatively and graphically in IB C.4 at both SL and HL (including π/2 phase lag at resonance).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec6-further-mechanics-thermal'],
        subtopicIds: ['alevel-3-6-1-periodic-motion-shm'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['f_d = f_0 (light damping peak)'],
        assumptionAndSignNotes:
          'Year 13 Core (3.6.1): includes slight downward shift of peak frequency with increased damping and Barton’s pendulums / bridge damping applications.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['f_drive = f_natural'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.1): graphical comparison of damping regimes and driven resonance curves.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Resonance response curves (sharper higher peak for lighter damping) and critical-damping return-to-equilibrium curves are fully compatible across IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'No quantitative Q-factor formula is required in any of the three core specifications.',
    ],
  },
  {
    conceptId: 'refraction-snell-tir',
    title: "Planar Refraction, Snell's Law, Critical Angle and Step-Index Optical Fibres",
    domain: 'Oscillations & Optics',
    summary:
      'Refractive index n = c/v, Snell’s law n_1 sin θ_1 = n_2 sin θ_2 (angles to normal), wavelength shortening at constant frequency, critical angle sin θ_c = n_2/n_1, total internal reflection, and optical fibres.',
    primaryVisualFamily: 'optics-shm',
    supportingVisualFamilies: ['waves'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c3-wave-phenomena'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'n_1 / n_2 = sin θ_2 / sin θ_1 = v_2 / v_1',
          'sin θ_c = n_2 / n_1',
        ],
        assumptionAndSignNotes:
          'Compulsory SL+HL in C.3; angles always measured from the boundary normal.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec3-waves'],
        subtopicIds: ['alevel-3-3-2-refraction-diffraction-interference'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'n = c / c_s',
          'n_1 sin θ_1 = n_2 sin θ_2',
          'sin θ_c = n_2 / n_1',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 12 core (3.3.2): includes step-index optical fibre cladding, modal (multipath) and material (spectral) pulse broadening.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'n = sin i / sin r = c / v',
          'n = 1 / sin C (into air)',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.3): planar reflection, Snell’s law, prism colour dispersion, critical angle, and fibre-optic TIR.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Universal compatibility across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY for Snell’s law, wave-speed/wavelength change, critical angle, and TIR.',
    divergenceNotes: [
      'Modal vs material pulse-broadening terminology is emphasised in AQA 3.3.2; core-cladding sin θ_c = n_2/n_1 geometry works cleanly across all three.',
    ],
  },
  {
    conceptId: 'thin-lenses-geometric-optics',
    title: 'Converging & Diverging Thin Lenses, Principal-Ray Diagrams and Optical Instruments',
    domain: 'Oscillations & Optics',
    summary:
      'Thin-lens equation 1/f = 1/u + 1/v, linear magnification m = v/u (or -v/u), real vs virtual / upright vs inverted image classification, dioptre lens power P = 1/f, and refracting telescopes.',
    primaryVisualFamily: 'optics-shm',
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: excludedMapping(
        'ib',
        'REMOVED FROM IB 2025: Thin-lens equations and geometric ray diagrams (former 2016 Option C Imaging) are NOT in IB Physics (First Assessment 2025).',
      ),
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-9-astrophysics', 'alevel-3-10-medical-physics'],
        questionFormats: ['structured'],
        equationsUsed: [
          '1 / f = 1 / u + 1 / v',
          'M = f_0 / f_e (normal-adjustment telescope, 3.9)',
          'P = 1 / f (dioptres, 3.10)',
          'm = v / u',
        ],
        assumptionAndSignNotes:
          'SIGN CONVENTION: UK A-Level uses REAL-IS-POSITIVE: converging f > 0, diverging f < 0, real image v > 0, virtual image v < 0. Sits in AQA Options 3.9 & 3.10 (and Edexcel Core Topic 5 / OCR Module 6.5).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: excludedMapping(
        'ncuk',
        'Excluded from NCUK IFYPH005: NCUK AC6.3 covers planar reflection, Snell’s law, dispersion, and fibre-optic TIR, and omits 1/f = 1/u + 1/v thin-lens ray optics.',
      ),
    },
    sharedCoreSummary:
      'UK A-Level geometric optics cluster (AQA Options 3.9/3.10, Edexcel Core Topic 5, OCR Module 6.5) using the real-is-positive sign convention.',
    divergenceNotes: [
      'Do NOT assign thin-lens questions to IB Physics 2025 or NCUK IFYPH005.',
    ],
  },

  // ============================================================================
  // DOMAIN 8: WAVES, INTERFERENCE & DIFFRACTION ('waves')
  // ============================================================================
  {
    conceptId: 'progressive-waves-polarization',
    title: "Progressive Waves, Phase Difference, Intensity and Malus's Law Polarisation",
    domain: 'Waves & Interference',
    summary:
      'Wave speed v = fλ, transverse vs longitudinal waves, y(x) vs y(t) displacement graphs, phase difference Δφ = 2πΔx/λ, inverse-square intensity I = P/(4πr^2) ∝ A^2, and plane polarisation (Malus’s law I = I_0 cos^2 θ).',
    primaryVisualFamily: 'waves',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c2-wave-model'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['v = fλ', 'I ∝ A^2', 'I ∝ x^-2'],
        assumptionAndSignNotes:
          'IB 2025 C.2 covers v = fλ, phase, I ∝ A^2 ∝ x^-2, and qualitative polarisation, but streamlined quantitative Malus’s law I = I_0 cos^2 θ out of the 2025 Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec3-waves'],
        subtopicIds: ['alevel-3-3-1-progressive-stationary-waves'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'c = fλ',
          'Δφ = 2π d / λ',
          'I = P / (4πr^2) ∝ A^2 (OCR/CIE)',
          'I = I_0 cos^2 θ (CIE 9702 / OCR)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 12 core across UK boards: AQA tests qualitative polaroid crossed-filter/glare reasoning; CIE 9702 Topic 7 prints I = I_0 cos^2 θ explicitly.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['v = fλ', 'I = P / A', 'I = I_0 cos^2 θ'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.2): NCUK Data Booklet explicitly prints Malus’s law I = I_0 cos^2 θ alongside v = fλ and I = P/A.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'v = fλ, y(x)/y(t) profile reading, phase difference, I ∝ A^2, and transverse-only polarisation apply across all three syllabi.',
    divergenceNotes: [
      'Quantitative Malus’s law I = I_0 cos^2 θ is printed in NCUK (AC6.2) and CIE 9702, whereas IB 2025 and AQA 7408 omit the equation from their booklets (supply I = I_0 cos^2 θ in stem if cross-tagging).',
    ],
  },
  {
    conceptId: 'double-slit-interference',
    title: "Superposition, Path/Phase Difference and Young's Double-Slit Interference",
    domain: 'Waves & Interference',
    summary:
      'Coherence, constructive (Δx = nλ) and destructive (Δx = (n + 1/2)λ) two-source superposition, and Young’s double-slit fringe spacing.',
    primaryVisualFamily: 'waves',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c3-wave-phenomena'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['s = λD / d', 'Δx = nλ (constructive)', 'Δx = (n + 1/2)λ (destructive)'],
        assumptionAndSignNotes:
          'NOTATION: IB uses s for fringe spacing and d for slit separation (s = λD/d); HL adds single-slit envelope modulation of double-slit fringes.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec3-waves'],
        subtopicIds: ['alevel-3-3-2-refraction-diffraction-interference'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['w = λD / s'],
        assumptionAndSignNotes:
          'NOTATION: AQA (Required Practical 2) uses w for fringe spacing and s for slit separation (w = λD/s; OCR/CIE use x = λD/a). Valid in small-angle s ≪ D regime.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['w = λD / s'],
        assumptionAndSignNotes:
          'NOTATION: NCUK Data Booklet matches AQA exactly: w = λD/s (w = fringe width, s = slit spacing, D = slit-to-screen distance).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical physical law across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'SYMBOL COLLISION WARNING: Symbol "s" means FRINGE SPACING in IB (s = λD/d) but SLIT SEPARATION in AQA & NCUK (w = λD/s)! Always spell out words ("slit separation", "fringe spacing") in question stems.',
    ],
  },
  {
    conceptId: 'single-slit-diffraction-gratings',
    title: 'Transmission Diffraction Gratings and Single-Slit Diffraction Envelopes',
    domain: 'Waves & Interference',
    summary:
      'Normal-incidence diffraction grating maxima d sin θ = nλ, maximum observable order n_max = floor(d/λ), spectroscopic line resolution, and single-slit central maximum diffraction.',
    primaryVisualFamily: 'waves',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c3-wave-phenomena'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['nλ = d sin θ', 'θ = λ / b (single-slit first minimum)'],
        assumptionAndSignNotes:
          'Strictly HL-only (AHL extension in C.3) in IB Physics 2025; includes quantitative single-slit first minimum θ = λ/b in radians.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec3-waves'],
        subtopicIds: ['alevel-3-3-2-refraction-diffraction-interference'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['d sin θ = nλ', 'd = 1 / N (lines per metre)'],
        assumptionAndSignNotes:
          'Compulsory Year 12 core (Required Practical 2): quantitative d sin θ = nλ and qualitative single-slit intensity profile (central fringe twice width of outer fringes; quantitative θ = λ/b sits in Option 3.9 Rayleigh criterion).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-4'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['d sin θ = nλ', 'n_max = floor(d / λ)'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.4): quantitative d sin θ = nλ wavelength calculations and qualitative single-gap diffraction (omits quantitative θ = λ/b).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Diffraction grating equation d sin θ = nλ, lines-per-mm conversion d = 1/N, and n_max = floor(d/λ) match across IB HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Quantitative single-slit θ = λ/b is IB HL specific; keep cross-tagged items focused on d sin θ = nλ or qualitative central-maximum width scaling.',
    ],
  },
  {
    conceptId: 'standing-waves-harmonics',
    title: 'Stationary Waves and Harmonics on Stretched Strings and Open/Closed Pipes',
    domain: 'Waves & Interference',
    summary:
      'Counter-propagating wave superposition, node/antinode spacing (λ/2), intra-loop vs inter-loop phase (0 vs π rad), and harmonic series on fixed strings, open-open pipes, and closed-one-end pipes.',
    primaryVisualFamily: 'waves',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c4-standing-waves-resonance'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'f_n = n v / (2L) (fixed string / open pipe, n = 1,2,3,...)',
          'f_n = n v / (4L) (closed-open pipe, odd n = 1,3,5,...)',
        ],
        assumptionAndSignNotes:
          'Compulsory SL+HL in C.4; derives harmonics geometrically from boundary conditions + v = fλ (does NOT print f = (1/2L)sqrt(T/μ) in the IB Data Booklet).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec3-waves'],
        subtopicIds: ['alevel-3-3-1-progressive-stationary-waves'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'f = (1 / 2l) sqrt(T / μ) (first harmonic on string)',
          'f_n = n v / (2L), f_odd = n v / (4L)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 12 core (Required Practical 1 string harmonics vs tension T and mass per unit length μ); AQA prints f = (1/2l)sqrt(T/μ).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac6'],
        subtopicIds: ['ncuk-ac6-5'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'v = fλ',
          'f_n = n v / (2L) (strings & open pipes)',
          'f_n = n v / (4L) (closed-end pipes, odd n)',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC6.5); like IB, NCUK omits f = (1/2l)sqrt(T/μ) from its Data Booklet (supply v = sqrt(T/μ) if tension is tested).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Boundary-condition wavelengths, odd-only closed-pipe harmonics, and stationary-vs-progressive wave comparisons match across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'String tension/mass-per-unit-length f = (1/2l)sqrt(T/μ) is in the AQA Data Booklet only; supply v = sqrt(T/μ) in the stem if sharing with IB or NCUK.',
    ],
  },
  {
    conceptId: 'doppler-effect',
    title: 'Acoustic and Electromagnetic Doppler Frequency/Wavelength Shifts',
    domain: 'Waves & Astrophysics',
    summary:
      'Wavefront compression/rarefaction for moving sources and observers, exact acoustic Doppler equations, and low-speed electromagnetic Δf/f ≈ Δλ/λ ≈ v/c shift.',
    primaryVisualFamily: 'waves',
    supportingVisualFamilies: ['grav-astro', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-c'],
        subtopicIds: ['ib-c5-doppler-effect'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'Δf / f = Δλ / λ ≈ v / c (SL & HL)',
          "f' = f v / (v ∓ u_s) (HL moving source)",
          "f' = f (v ± u_o) / v (HL moving observer)",
        ],
        assumptionAndSignNotes:
          'LEVEL SPLIT: Qualitative wavefronts and EM Δf/f ≈ v/c are SL+HL; exact moving-source and moving-observer sound formulas are HL-only in IB C.5.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-9-astrophysics'],
        questionFormats: ['structured'],
        equationsUsed: [
          'z = Δf / f = v / c (AQA Option 3.9, v ≪ c)',
          'f_o = f_s v / (v ± v_s) (CIE 9702 AS Topic 7 / OCR H556)',
        ],
        assumptionAndSignNotes:
          'AQA 7408 places optical/radio Doppler z = v/c in Option 3.9 (binary stars, exoplanets, quasars), whereas CIE 9702 (AS Topic 7) and OCR H556 assess moving-source acoustic Doppler in core.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5'],
        subtopicIds: ['ncuk-ac5-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Δλ / λ ≈ Δf / f ≈ v / c'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC5.3): uses non-relativistic optical Doppler Δλ/λ ≈ Δf/f ≈ v/c (v ≪ c); exact acoustic moving-observer equations are not in the NCUK Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Low-speed electromagnetic Doppler shift Δλ/λ ≈ Δf/f ≈ v/c (v ≪ c) and qualitative wavefront diagrams are compatible across IB SL/HL, A-Level (3.9 / OCR / CIE), and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Exact acoustic moving-source/observer equations without supplied formula should be restricted to IB HL (and CIE/OCR A-Level).',
    ],
  },

  // ============================================================================
  // DOMAIN 9 & 10: ATOMIC, NUCLEAR, QUANTUM & RELATIVISTIC PHYSICS ('quantum-nuclear')
  // ============================================================================
  {
    conceptId: 'atomic-spectra-energy-levels',
    title: 'Discrete Atomic Energy Levels, Excitation, Ionisation and Line Spectra',
    domain: 'Quantum & Atomic Physics',
    summary:
      'Quantised electron energy levels (in eV and J), photon emission and absorption line spectra ΔE = hf = hc/λ, ionisation energy from ground state, and collisional excitation.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs', 'grav-astro'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e1-structure-atom'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'E = hf = hc / λ',
          'E_n = -13.6 / n^2 eV, mvr = nh / (2π) (HL E.1)',
        ],
        assumptionAndSignNotes:
          'Discrete transition spectra ΔE = hf are SL+HL; explicit Bohr hydrogen E_n = -13.6/n^2 eV and angular momentum quantisation are HL-only in E.1.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec2-particles-radiation'],
        subtopicIds: ['alevel-3-2-2-quantum-phenomena'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['hf = E_1 - E_2', 'E = hf = hc / λ'],
        assumptionAndSignNotes:
          'Compulsory Year 12 core (3.2.2): includes fluorescent tube mercury excitation by electron impact vs exact-energy photon absorption.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac5', 'ncuk-ac8'],
        subtopicIds: ['ncuk-ac5-2', 'ncuk-ac8-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = hf = hc / λ', 'hf = |E_2 - E_1|', '1 eV = 1.60 × 10^-19 J'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final across AC5.2 (stellar absorption lines) and AC8.1 (atomic emission line spectra). Uses h = 6.63 × 10^-34 J s.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Energy-level ladder diagrams, eV-to-Joule conversion, and ΔE = hf = hc/λ spectral line transitions match across IB SL/HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Bohr angular momentum mvr = nh/(2π) is exclusive to IB HL E.1.',
    ],
  },
  {
    conceptId: 'rutherford-scattering-nuclear-radius',
    title: 'Rutherford Alpha Scattering, Closest Approach, Nuclear Radius and Nuclear Density',
    domain: 'Nuclear Physics',
    summary:
      'Geiger-Marsden-Rutherford gold-foil alpha scattering, head-on electrostatic distance of closest approach, empirical Fermi nuclear radius R = R_0 A^{1/3}, and constant nuclear matter density.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['fields', 'graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e1-structure-atom'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E_k = k (2e)(Ze) / d_min', 'R = R_0 A^(1/3)', 'ρ_nuc = 3u / (4π R_0^3)'],
        assumptionAndSignNotes:
          'While qualitative Rutherford gold-foil deductions are SL+HL, quantitative closest-approach d_min, R = R_0 A^(1/3), and nuclear density are HL-only in IB E.1.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec8-nuclear-physics'],
        subtopicIds: ['alevel-3-8-nuclear-decay-energy'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'E_k = (1 / 4πε_0) (Q_1 Q_2 / r_min)',
          'R = R_0 A^(1/3)',
          'sin θ ≈ 0.61 λ / R (high-energy electron diffraction)',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.8.1.5): compares alpha closest-approach upper bound vs high-energy electron diffraction nuclear radius.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac7'],
        subtopicIds: ['ncuk-ac7-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['R = r_0 A^(1/3)', 'ρ = m / ((4/3)πR^3)'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC7.1): Rutherford scattering deductions, R = r_0 A^(1/3) (printed on IFYPH005 data sheet), and constant nuclear density estimation.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Rutherford scattering evidence, R = R_0 A^(1/3), and A-independent nuclear density ~2 × 10^17 kg m^-3 match across IB HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'High-energy electron nuclear diffraction sin θ ≈ 0.61λ/R is specific to AQA 3.8.',
    ],
  },
  {
    conceptId: 'photoelectric-effect',
    title: "Photoelectric Effect, Work Function, Threshold Frequency and Stopping Potential",
    domain: 'Quantum & Atomic Physics',
    summary:
      'One-to-one photon-electron interaction, threshold frequency f_0 = Φ/h, Einstein’s photoelectric equation hf = Φ + E_k,max, stopping potential eV_s = E_k,max, and E_k,max vs f graphs.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e2-quantum-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E_max = hf - Φ', 'E_max = eV_s'],
        assumptionAndSignNotes:
          'LEVEL INVERSION: Photoelectric effect is strictly HL-only (E.2) in IB Physics 2025 (h = 6.63 × 10^-34 J s).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec2-particles-radiation'],
        subtopicIds: ['alevel-3-2-2-quantum-phenomena'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['hf = φ + E_k(max)', 'eV_s = E_k(max)'],
        assumptionAndSignNotes:
          'Compulsory AS / Year 12 core in AQA 3.2.2 and OCR Module 4.5 (A2 in CIE 9702 Topic 22; h = 6.63 × 10^-34 J s).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac8'],
        subtopicIds: ['ncuk-ac8-1'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = hf', 'hf = Φ + E_k,max', 'eV_s = E_k,max'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC8.1; h = 6.63 × 10^-34 J s, 1 eV = 1.60 × 10^-19 J).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      '100% identical physics, constants (h = 6.63 × 10^-34 J s), stopping-potential equations, and E_k,max-vs-f linear slope/intercept graphs across IB HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Major level inversion: entry-level Y12 in UK A-Level, Semester 2 in NCUK IFY, and HL-only in IB 2025.',
    ],
  },
  {
    conceptId: 'wave-particle-duality-de-broglie',
    title: 'Wave-Particle Duality, de Broglie Wavelength and Electron Diffraction',
    domain: 'Quantum & Atomic Physics',
    summary:
      'Matter-wave wavelength λ = h/p = h/(mv), non-relativistic electron acceleration p = sqrt(2m_e eV), and polycrystalline graphite electron-diffraction ring geometry.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['waves'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e2-quantum-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['λ = h / p', 'p = sqrt(2m eV)'],
        assumptionAndSignNotes: 'Strictly HL-only (E.2) in IB Physics 2025; non-relativistic electron regime.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec2-particles-radiation', 'alevel-options-9-13'],
        subtopicIds: ['alevel-3-2-2-quantum-phenomena', 'alevel-3-12-turning-points'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['λ = h / (mv) = h / sqrt(2meV)'],
        assumptionAndSignNotes: 'Compulsory Year 12 core in AQA 3.2.2 (extended to electron microscopes/STM in Option 3.12).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac8'],
        subtopicIds: ['ncuk-ac8-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['λ = h / (mv)', '(1/2)mv^2 = eV'],
        assumptionAndSignNotes: 'Compulsory Semester 2 / Final (AC8.2); assumes non-relativistic speed v ≪ c.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Identical de Broglie relation λ = h/(mv) = h/sqrt(2m_e eV) and electron-diffraction ring contraction with increasing accelerating voltage across IB HL, A-Level Y12/Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Restrict to non-relativistic speeds (accelerating voltage <= ~5 kV) so p = mv remains accurate across all three syllabi.',
    ],
  },
  {
    conceptId: 'compton-scattering-heisenberg-uncertainty',
    title: "Compton Photon Scattering and Heisenberg's Uncertainty Principle",
    domain: 'Quantum & Atomic Physics',
    summary:
      'X-ray photon-electron Compton wavelength shift Δλ = (h / m_e c)(1 - cos θ) and Heisenberg’s fundamental quantum uncertainty bounds Δx Δp >= h/(4π).',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e2-quantum-physics'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'Δλ = (h / (m_e c))(1 - cos θ)',
          'Δx Δp >= h / (4π)',
          'ΔE Δt >= h / (4π)',
        ],
        assumptionAndSignNotes:
          'IB 2025 HL E.2 covers Compton shift Δλ quantitatively in the Data Booklet alongside quantum uncertainty.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: excludedMapping(
        'alevel',
        'Neither the Compton scattering equation nor Heisenberg’s uncertainty inequality is assessed in UK A-Level Physics (AQA 7408 / OCR H556).',
      ),
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac8'],
        subtopicIds: ['ncuk-ac8-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Δx Δp >= h / (4π)'],
        assumptionAndSignNotes:
          'SCOPE RESTRICTION: NCUK AC8.2 assesses Heisenberg’s position-momentum uncertainty Δx Δp >= h/(4π) ONLY; Compton scattering Δλ = (h/m_e c)(1 - cos θ) is NOT in NCUK IFY.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Position-momentum Heisenberg uncertainty Δx Δp >= h/(4π) links IB HL and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Compton wavelength shift Δλ = (h/m_e c)(1 - cos θ) is strictly IB HL-only; Heisenberg Δx Δp >= h/(4π) is IB HL + NCUK IFY-S2/IFY (excluded from A-Level).',
    ],
  },
  {
    conceptId: 'radioactive-decay-half-life',
    title: 'Alpha/Beta/Gamma Radiation, Exponential Decay Law, Activity and Half-Life',
    domain: 'Nuclear Physics',
    summary:
      'Properties and balanced nuclear equations of α, β^-, β^+, and γ decay, background subtraction, random/spontaneous decay constant λ, activity A = λN, half-life T_{1/2} = ln 2 / λ, and exponential N(t) = N_0 e^{-λt}.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e3-radioactive-decay'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'N = N_0 / 2^n (SL integer half-lives)',
          'N = N_0 e^{-λt}, A = λN = A_0 e^{-λt}, T_{1/2} = ln 2 / λ (HL E.3)',
        ],
        assumptionAndSignNotes:
          'LEVEL SPLIT: α/β/γ properties, decay equations, background correction, and integer half-life curves are SL+HL; continuous exponential decay e^{-λt} and A = λN are HL-only in IB E.3.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec8-nuclear-physics'],
        subtopicIds: ['alevel-3-8-nuclear-decay-energy'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'ΔN / Δt = -λN (A = λN)',
          'N = N_0 e^{-λt}, A = A_0 e^{-λt}',
          'T_{1/2} = ln 2 / λ',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.8.1, including Required Practical 12 gamma inverse-square I = k/x^2 with background subtraction and N-vs-Z stability belt).',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac7'],
        subtopicIds: ['ncuk-ac7-2'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'A = λN',
          'λ t_{1/2} = ln 2',
          'A = A_0 e^{-λt}, N = N_0 e^{-λt}',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC7.2): full exponential decay equations, ln(A)-t graphs, background-corrected count rates, and radiometric dating.',
        calculusOrExponentialRequired: true,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Continuous exponential decay N = N_0 e^{-λt}, A = λN, T_{1/2} = ln 2 / λ, and background count subtraction match identically across IB HL, A-Level Y13, and NCUK IFY-S2/IFY (integer half-lives also valid for IB SL).',
    divergenceNotes: [
      'Do not tag continuous e^{-λt} or A = λN calculations to IB SL; restrict IB to HL whenever non-integer half-lives or decay constants λ are required.',
    ],
  },
  {
    conceptId: 'mass-defect-binding-energy',
    title: 'Nuclear Mass Defect, Mass-Energy Equivalence and Binding Energy per Nucleon',
    domain: 'Nuclear Physics',
    summary:
      'Mass defect Δm between separated nucleons and bound nucleus, E = Δmc^2 in J and MeV (1 u ≈ 931.5 MeV/c^2), and the binding-energy-per-nucleon stability curve peaking near Fe-56.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e3-radioactive-decay', 'ib-e4-fission'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = mc^2', '1 u = 1.661 × 10^-27 kg = 931.5 MeV c^-2'],
        assumptionAndSignNotes:
          'Compulsory SL+HL in IB E.3/E.4; 931.5 MeV c^-2 conversion is printed directly in the IB Data Booklet.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec8-nuclear-physics'],
        subtopicIds: ['alevel-3-8-nuclear-decay-energy'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = mc^2', '1 u = 1.661 × 10^-27 kg = 931.5 MeV c^-2'],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.8.1.6); carefully distinguishes nuclear rest mass vs neutral atomic mass (electron masses).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac7'],
        subtopicIds: ['ncuk-ac7-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = mc^2', 'u = 1.66 × 10^-27 kg', '1 eV = 1.60 × 10^-19 J'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC7.3). Note NCUK Data Booklet prints u = 1.66 × 10^-27 kg (3 s.f.) rather than 931.5 MeV c^-2; supply high-precision u and 931.5 MeV conversion in stems so 4-s.f. mass differences stay consistent across boards.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Mass defect Δm, ΔE = Δmc^2, and binding-energy-per-nucleon curve interpretation match across IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Always state u = 1.661 × 10^-27 kg (or 1 u = 931.5 MeV/c^2) in mass-defect stems because Δm is a small difference of 4-5 s.f. numbers.',
    ],
  },
  {
    conceptId: 'nuclear-fission-fusion',
    title: 'Induced Nuclear Fission, Thermal Reactor Physics and Thermonuclear Fusion',
    domain: 'Nuclear Physics',
    summary:
      'Thermal-neutron induced U-235 fission chain reactions, reaction Q-values from Δm or BE/A curves, moderator/control-rod/coolant/shielding engineering, and high-T/high-density plasma fusion.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['SL', 'HL'],
        topicIds: ['ib-theme-e'],
        subtopicIds: ['ib-e4-fission', 'ib-e5-fusion-stars'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Q = (m_initial - m_final)c^2 = ΣBE_products - ΣBE_reactants'],
        assumptionAndSignNotes: 'Compulsory SL+HL across E.4 (fission reactors & waste) and E.5 (proton-proton stellar fusion).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-sec8-nuclear-physics'],
        subtopicIds: ['alevel-3-8-nuclear-decay-energy'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['Q = Δmc^2'],
        assumptionAndSignNotes:
          'Compulsory Year 13 core (3.8.1.6-3.8.1.8): elastic neutron-moderator collision momentum logic, boron/cadmium control rods, critical mass, and electrostatic Coulomb barrier in fusion.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac7'],
        subtopicIds: ['ncuk-ac7-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: ['E = mc^2'],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC7.3): fission vs fusion energy release and moderator, control-rod, coolant, and shielding functions.',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Q-value calculations from mass defect or BE/A curves and thermal fission reactor component roles are 100% compatible across IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    divergenceNotes: [
      'Assessed at IB SL/HL, A-Level Y13, and NCUK IFY-S2/IFY.',
    ],
  },
  {
    conceptId: 'fundamental-particles-quarks-leptons',
    title: 'Standard Model: Quarks, Leptons, Hadrons, Antimatter and Quark-Level Beta Decay',
    domain: 'Particle Physics',
    summary:
      'Fundamental interactions, elementary quarks and leptons vs composite baryons/mesons, matter-antimatter pair production and annihilation, conservation of charge/baryon/lepton numbers, and quark-level β^- / β^+ decay.',
    primaryVisualFamily: 'quantum-nuclear',
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: excludedMapping(
        'ib',
        'REMOVED FROM IB 2025: Quarks, leptons, hadrons, Feynman diagrams, and baryon/strangeness conservation (former 2016 Topic 7.3) are NOT in IB Physics (First Assessment 2025), aside from nucleons/neutrinos in E.3 β decay.',
      ),
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y12', 'Y13'],
        topicIds: ['alevel-sec2-particles-radiation'],
        subtopicIds: ['alevel-3-2-1-particles-quarks'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'specific charge = Q / m',
          'E_photon = hf = E_rest (annihilation: 2hf_min = 2E_0; pair production: hf_min = 2E_0)',
          'd -> u + e^- + anti-ν_e, u -> d + e^+ + ν_e',
        ],
        assumptionAndSignNotes:
          'Compulsory Year 12 core in AQA 3.2.1 (and CIE AS Topic 11; Y13 in OCR Module 6.4). AQA additionally tests strangeness S (u,d,s), kaons/pions, and exchange bosons (γ, W±, Z^0, pion).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
      ncuk: {
        syllabus: 'ncuk',
        included: true,
        levels: ['IFY-S2', 'IFY'],
        topicIds: ['ncuk-ac8'],
        subtopicIds: ['ncuk-ac8-3'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'p = uud, n = udd',
          'n -> p + e^- + anti-ν_e (d -> u + e^- + anti-ν_e)',
          'p -> n + e^+ + ν_e (u -> d + e^+ + ν_e)',
          '2mc^2 = 2hf (annihilation)',
        ],
        assumptionAndSignNotes:
          'Compulsory Semester 2 / Final (AC8.3): Standard Model forces, quarks vs leptons, proton/neutron u/d composition, antimatter annihilation, and quark-level β^-/β^+ decay (strangeness S and kaon tables are AQA-specific, not required in NCUK).',
        calculusOrExponentialRequired: false,
        relativisticRequired: false,
      },
    },
    sharedCoreSummary:
      'Fundamental interactions, quarks vs leptons, p = uud / n = udd, charge/baryon/lepton conservation, antimatter annihilation, and quark-level β^-/β^+ decay are shared between UK A-Level (Y12/Y13) and NCUK IFY (AC8.3).',
    divergenceNotes: [
      'Strictly excluded from IB Physics 2025.',
      'Strangeness conservation (ΔS = 0 strong vs ΔS = ±1 weak) and kaon/pion meson tables are AQA 3.2.1 specific; keep shared A-Level + NCUK items focused on u/d quarks, leptons, annihilation, and β^-/β^+ decay.',
    ],
  },
  {
    conceptId: 'special-relativity-spacetime',
    title: 'Special Relativity: Lorentz Transformations, Time Dilation, Length Contraction and Spacetime',
    domain: 'Relativity',
    summary:
      'Einstein’s postulates, Lorentz factor γ = 1/sqrt(1 - v^2/c^2), proper time dilation Δt = γΔt_0, proper length contraction L = L_0/γ, relativistic velocity addition, invariant spacetime intervals, and Minkowski diagrams.',
    primaryVisualFamily: 'quantum-nuclear',
    supportingVisualFamilies: ['graphs'],
    questionFormats: ['mcq', 'structured'],
    mappings: {
      ib: {
        syllabus: 'ib',
        included: true,
        levels: ['HL'],
        topicIds: ['ib-theme-a'],
        subtopicIds: ['ib-a5-galilean-special-relativity'],
        questionFormats: ['mcq', 'structured'],
        equationsUsed: [
          'γ = 1 / sqrt(1 - v^2 / c^2)',
          "x' = γ(x - vt), ct' = γ(ct - vx/c)",
          "u' = (u - v) / (1 - uv / c^2)",
          'Δt = γ Δt_0, L = L_0 / γ',
          "(Δs)^2 = (cΔt)^2 - (Δx)^2, tan θ = v / c",
        ],
        assumptionAndSignNotes:
          'Compulsory HL-only subtopic A.5 in IB Physics 2025; emphasises Lorentz coordinate transformations, relativistic 1D velocity addition, and Minkowski spacetime diagrams (omits relativistic momentum/energy γmc^2).',
        calculusOrExponentialRequired: false,
        relativisticRequired: true,
      },
      alevel: {
        syllabus: 'alevel',
        included: true,
        levels: ['Y13'],
        topicIds: ['alevel-options-9-13'],
        subtopicIds: ['alevel-3-12-turning-points'],
        questionFormats: ['structured'],
        equationsUsed: [
          't = t_0 / sqrt(1 - v^2 / c^2)',
          'l = l_0 sqrt(1 - v^2 / c^2)',
          'm = m_0 / sqrt(1 - v^2 / c^2), E = γ m_0 c^2',
        ],
        assumptionAndSignNotes:
          'AQA Year 13 Option 3.12 (Turning Points, Paper 3B structured): covers Michelson-Morley, cosmic-ray muon time dilation, length contraction, and relativistic energy E = γm_0 c^2 (omits Minkowski worldline geometry and relativistic velocity addition).',
        calculusOrExponentialRequired: false,
        relativisticRequired: true,
      },
      ncuk: excludedMapping(
        'ncuk',
        'Excluded from NCUK IFYPH005: Special relativity (Lorentz transformations, time dilation, length contraction) is not part of the NCUK IFY Physics syllabus (only rest-mass E = mc^2 in nuclear binding energy is taught).',
      ),
    },
    sharedCoreSummary:
      'Einstein’s two postulates, Lorentz factor γ >= 1, muon time dilation Δt = γΔt_0, and length contraction L = L_0/γ overlap between compulsory IB HL (A.5) and AQA Option 3.12.',
    divergenceNotes: [
      'Minkowski spacetime diagrams and u\' = (u - v)/(1 - uv/c^2) are IB HL A.5 exclusive; relativistic total energy E = γm_0 c^2 is AQA Option 3.12 exclusive; NCUK excludes all of special relativity.',
    ],
  },
];

// ============================================================================
// INDEXED LOOKUPS & DETERMINISTIC QUERY HELPERS
// ============================================================================

export const CROSSWALK_BY_CONCEPT_ID: Readonly<Record<string, CrosswalkEntry>> =
  Object.freeze(
    Object.fromEntries(
      SYLLABUS_CROSSWALK.map((entry) => [entry.conceptId, entry]),
    ),
  );

const TOPIC_BY_ID: Readonly<Record<string, SyllabusTopicSpec>> = Object.freeze(
  Object.fromEntries(
    [
      ...IB_PHYSICS_TOPICS,
      ...ALEVEL_PHYSICS_TOPICS,
      ...NCUK_PHYSICS_TOPICS,
    ].map((topic) => [topic.id, topic]),
  ),
);

const SUBTOPIC_BY_ID: Readonly<
  Record<string, { topic: SyllabusTopicSpec; subtopic: SubtopicSpec }>
> = Object.freeze(
  Object.fromEntries(
    [
      ...IB_PHYSICS_TOPICS,
      ...ALEVEL_PHYSICS_TOPICS,
      ...NCUK_PHYSICS_TOPICS,
    ].flatMap((topic) =>
      topic.subtopics.map((subtopic) => [subtopic.id, { topic, subtopic }]),
    ),
  ),
);

function buildLevelFormatsForSyllabus(
  syllabusId: SyllabusId,
): Readonly<Record<string, ReadonlySet<QuestionFormat>>> {
  const catalogue = SYLLABUS_CATALOGUES[syllabusId];
  const byLevel: Record<string, Set<QuestionFormat>> = {};
  for (const level of catalogue.levels) {
    byLevel[level] = new Set<QuestionFormat>();
  }
  for (const paper of catalogue.papers) {
    for (const level of paper.levels) {
      if (!byLevel[level]) {
        byLevel[level] = new Set<QuestionFormat>();
      }
      for (const format of paper.formats) {
        byLevel[level].add(format);
      }
    }
  }
  return Object.freeze(byLevel);
}

const LEVEL_ASSESSED_FORMATS: Readonly<
  Record<SyllabusId, Readonly<Record<string, ReadonlySet<QuestionFormat>>>>
> = Object.freeze({
  ib: buildLevelFormatsForSyllabus('ib'),
  alevel: buildLevelFormatsForSyllabus('alevel'),
  ncuk: buildLevelFormatsForSyllabus('ncuk'),
});

export interface GetTopicsBySyllabusOptions {
  level?: SyllabusLevel;
  includeOptions?: boolean;
}

export interface GetCompatibleSyllabiOptions {
  level?: SyllabusLevel;
  format?: QuestionFormat;
  excludeOptionTopics?: boolean;
  requireNonCalculus?: boolean;
  requireNonRelativistic?: boolean;
}

export interface GeneratableSliceFilter {
  syllabus?: SyllabusId | readonly SyllabusId[];
  level?: SyllabusLevel | readonly SyllabusLevel[];
  visualFamily?: VisualFamilyHint | readonly VisualFamilyHint[];
  format?: QuestionFormat | readonly QuestionFormat[];
  conceptId?: string | readonly string[];
  includeOptionTopics?: boolean;
  includeSecondarySubtopics?: boolean;
}

function matchesFilterValue<T extends string>(
  value: T,
  filterValue?: T | readonly T[],
): boolean {
  if (filterValue === undefined) {
    return true;
  }
  if (typeof filterValue === 'string') {
    return value === filterValue;
  }
  return filterValue.includes(value);
}

export function getSyllabusCatalogue(
  syllabus: SyllabusId,
): SyllabusSpecificationCatalogue {
  return SYLLABUS_CATALOGUES[syllabus];
}

export function getTopicById(topicId: string): SyllabusTopicSpec | undefined {
  return TOPIC_BY_ID[topicId];
}

export function getSubtopicById(subtopicId: string): SubtopicSpec | undefined {
  return SUBTOPIC_BY_ID[subtopicId]?.subtopic;
}

export function getCrosswalkEntry(
  conceptId: string,
): CrosswalkEntry | undefined {
  return CROSSWALK_BY_CONCEPT_ID[conceptId];
}

/**
 * Returns the topic catalogue for a syllabus, optionally narrowed to a specific
 * examination level (e.g. 'SL', 'Y12', 'IFY-S1') and/or excluding optional modules.
 */
export function getTopicsBySyllabus(
  syllabus: SyllabusId,
  options: GetTopicsBySyllabusOptions = {},
): SyllabusTopicSpec[] {
  const { level, includeOptions = true } = options;
  const sourceTopics = SYLLABUS_CATALOGUES[syllabus].topics;

  const filtered: SyllabusTopicSpec[] = [];
  for (const topic of sourceTopics) {
    if (!includeOptions && topic.isOption) {
      continue;
    }
    if (level && !topic.levelsCovered.includes(level)) {
      continue;
    }

    const matchingSubtopics = topic.subtopics.filter((subtopic) => {
      if (!includeOptions && subtopic.isOption) {
        return false;
      }
      if (level && !subtopic.levelsCovered.includes(level)) {
        return false;
      }
      return true;
    });

    if (matchingSubtopics.length > 0) {
      filtered.push({
        ...topic,
        subtopics: matchingSubtopics,
      });
    }
  }

  return filtered;
}

/**
 * Returns all syllabus mappings compatible with a canonical physics concept ID,
 * respecting optional format, option-module, calculus/exponential, and relativity constraints.
 */
export function getCompatibleSyllabiForConcept(
  conceptId: string,
  options: GetCompatibleSyllabiOptions = {},
): CrosswalkSyllabusMapping[] {
  const entry = CROSSWALK_BY_CONCEPT_ID[conceptId];
  if (!entry) {
    return [];
  }

  const {
    level,
    format,
    excludeOptionTopics = false,
    requireNonCalculus = false,
    requireNonRelativistic = false,
  } = options;

  const compatible: CrosswalkSyllabusMapping[] = [];

  for (const syllabusId of SYLLABUS_IDS) {
    const mapping = entry.mappings[syllabusId];
    if (!mapping.included) {
      continue;
    }
    if (requireNonCalculus && mapping.calculusOrExponentialRequired) {
      continue;
    }
    if (requireNonRelativistic && mapping.relativisticRequired) {
      continue;
    }
    if (level && !mapping.levels.includes(level)) {
      continue;
    }
    if (format && !mapping.questionFormats.includes(format)) {
      continue;
    }

    let candidateSubtopicIds = mapping.subtopicIds;
    if (excludeOptionTopics) {
      candidateSubtopicIds = candidateSubtopicIds.filter((subId) => {
        const ref = SUBTOPIC_BY_ID[subId];
        return Boolean(ref && !ref.topic.isOption && !ref.subtopic.isOption);
      });
    }
    if (level) {
      candidateSubtopicIds = candidateSubtopicIds.filter((subId) =>
        Boolean(SUBTOPIC_BY_ID[subId]?.subtopic.levelsCovered.includes(level)),
      );
    }
    if (format) {
      candidateSubtopicIds = candidateSubtopicIds.filter((subId) =>
        Boolean(SUBTOPIC_BY_ID[subId]?.subtopic.questionFormats.includes(format)),
      );
    }
    if (candidateSubtopicIds.length === 0) {
      continue;
    }

    const retainedLevels = mapping.levels.filter((lvl) => {
      if (level && lvl !== level) {
        return false;
      }
      if (
        format &&
        LEVEL_ASSESSED_FORMATS[syllabusId]?.[lvl] &&
        !LEVEL_ASSESSED_FORMATS[syllabusId][lvl].has(format)
      ) {
        return false;
      }
      return candidateSubtopicIds.some((subId) =>
        SUBTOPIC_BY_ID[subId]?.subtopic.levelsCovered.includes(lvl),
      );
    });
    if (retainedLevels.length === 0) {
      continue;
    }

    const retainedFormats = mapping.questionFormats.filter((fmt) => {
      if (format && fmt !== format) {
        return false;
      }
      const subSupports = candidateSubtopicIds.some((subId) =>
        SUBTOPIC_BY_ID[subId]?.subtopic.questionFormats.includes(fmt),
      );
      const paperSupports = retainedLevels.some(
        (lvl) => !LEVEL_ASSESSED_FORMATS[syllabusId]?.[lvl] || LEVEL_ASSESSED_FORMATS[syllabusId][lvl].has(fmt),
      );
      return subSupports && paperSupports;
    });
    if (retainedFormats.length === 0) {
      continue;
    }

    if (
      candidateSubtopicIds.length !== mapping.subtopicIds.length ||
      retainedLevels.length !== mapping.levels.length ||
      retainedFormats.length !== mapping.questionFormats.length
    ) {
      const retainedTopicIds = Array.from(
        new Set(
          candidateSubtopicIds
            .map((subId) => SUBTOPIC_BY_ID[subId]?.topic.id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      compatible.push({
        ...mapping,
        topicIds: retainedTopicIds,
        subtopicIds: candidateSubtopicIds,
        levels: retainedLevels,
        questionFormats: retainedFormats,
      });
    } else {
      compatible.push(mapping);
    }
  }

  return compatible;
}

/**
 * Returns all crosswalk concept entries powered by a deterministic visual/solver family.
 */
export function getCrosswalkEntriesByVisualFamily(
  visualFamily: VisualFamilyHint,
  options: { includeSupporting?: boolean } = {},
): CrosswalkEntry[] {
  const { includeSupporting = false } = options;
  return SYLLABUS_CROSSWALK.filter(
    (entry) =>
      entry.primaryVisualFamily === visualFamily ||
      (includeSupporting &&
        Boolean(entry.supportingVisualFamilies?.includes(visualFamily))),
  );
}

/**
 * Enumerates valid, non-overlapping `(conceptId, syllabus, level, format)` slices
 * for deterministic bank work-order planning and static UI filtering.
 *
 * When a concept maps to multiple subtopics within the same syllabus and level
 * (for example a core subtopic plus an option subtopic), the primary compulsory
 * core subtopic is selected by default so each `(conceptId, syllabus, level, format)`
 * tuple appears at most once unless `includeSecondarySubtopics: true` is passed.
 */
export function getGeneratableSlices(
  filter: GeneratableSliceFilter = {},
): GeneratableSlice[] {
  const {
    syllabus,
    level,
    visualFamily,
    format,
    conceptId,
    includeOptionTopics = true,
    includeSecondarySubtopics = false,
  } = filter;

  const slices: GeneratableSlice[] = [];

  for (const entry of SYLLABUS_CROSSWALK) {
    if (!matchesFilterValue(entry.conceptId, conceptId)) {
      continue;
    }
    if (!matchesFilterValue(entry.primaryVisualFamily, visualFamily)) {
      continue;
    }

    for (const syllabusId of SYLLABUS_IDS) {
      if (!matchesFilterValue(syllabusId, syllabus)) {
        continue;
      }

      const mapping = entry.mappings[syllabusId];
      if (!mapping.included) {
        continue;
      }

      for (const lvl of mapping.levels) {
        if (!matchesFilterValue(lvl, level)) {
          continue;
        }

        const candidateRefs = mapping.subtopicIds
          .map((subId) => SUBTOPIC_BY_ID[subId])
          .filter(
            (ref): ref is { topic: SyllabusTopicSpec; subtopic: SubtopicSpec } =>
              Boolean(ref && ref.subtopic.levelsCovered.includes(lvl)),
          )
          .filter(
            (ref) =>
              includeOptionTopics ||
              (!ref.topic.isOption && !ref.subtopic.isOption),
          )
          .sort((a, b) => {
            const aOpt = a.topic.isOption || a.subtopic.isOption ? 1 : 0;
            const bOpt = b.topic.isOption || b.subtopic.isOption ? 1 : 0;
            return aOpt - bOpt;
          });

        if (candidateRefs.length === 0) {
          continue;
        }

        const selectedRefs = includeSecondarySubtopics
          ? candidateRefs
          : [candidateRefs[0]];

        const paperFormatsAtLevel = LEVEL_ASSESSED_FORMATS[syllabusId]?.[lvl];

        for (const ref of selectedRefs) {
          for (const qFormat of entry.questionFormats) {
            if (!matchesFilterValue(qFormat, format)) {
              continue;
            }
            if (!mapping.questionFormats.includes(qFormat)) {
              continue;
            }
            if (!ref.subtopic.questionFormats.includes(qFormat)) {
              continue;
            }
            if (paperFormatsAtLevel && !paperFormatsAtLevel.has(qFormat)) {
              continue;
            }

            slices.push({
              conceptId: entry.conceptId,
              conceptTitle: entry.title,
              syllabus: syllabusId,
              level: lvl,
              topicId: ref.topic.id,
              subtopicId: ref.subtopic.id,
              visualFamily: entry.primaryVisualFamily,
              format: qFormat,
              assumptionNotes: mapping.assumptionAndSignNotes,
            });
          }
        }
      }
    }
  }

  return slices;
}
