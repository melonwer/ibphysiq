/**
 * Official IB Diploma Programme Physics Syllabus Catalogue
 * Specification: IB Physics Guide & Data Booklet (First Assessment May 2025)
 *
 * Key structural facts verified against the 2025 specification:
 * - Five overarching themes (A to E) with 24 numbered subtopics (A.1-A.5, B.1-B.5,
 *   C.1-C.5, D.1-D.4, E.1-E.5) plus universal Tools for Physics (Paper 1B & Paper 2).
 * - Legacy Option Topics (Paper 3: Relativity, Engineering Physics, Imaging,
 *   Astrophysics, Particle Physics) were eliminated for first assessment 2025;
 *   selected concepts were folded into core/HL themes (A.4, A.5, B.4, E.5).
 * - Five subtopics are strictly HL-only: A.4, A.5, B.4, D.4, and E.2.
 * - Several shared subtopics (C.1, C.3, C.5, D.1, D.2, E.1, E.3, E.5) contain
 *   explicit Additional Higher Level (AHL) extensions and equations.
 */

import {
  AssessmentPaperSpec,
  SyllabusConventionsSpec,
  SyllabusSpecificationCatalogue,
  SyllabusTopicSpec,
} from '@/lib/constants/syllabi/types';

export const IB_PHYSICS_PAPERS: AssessmentPaperSpec[] = [
  {
    paperId: 'ib-sl-paper-1a',
    title: 'Paper 1A (SL): Multiple-Choice Questions',
    levels: ['SL'],
    formats: ['mcq'],
    durationMinutes: 90,
    maxMarks: 25,
    weightingPercent: 20,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Sat together with Paper 1B in a single 90-minute sitting (45 marks total, 36% combined weighting). Calculator and 2025 IB Physics Data Booklet allowed; 4 options (A-D), no negative marking.',
  },
  {
    paperId: 'ib-sl-paper-1b',
    title: 'Paper 1B (SL): Data-Based and Experimental Questions',
    levels: ['SL'],
    formats: ['structured'],
    durationMinutes: 90,
    maxMarks: 20,
    weightingPercent: 16,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Assesses experimental techniques, uncertainty propagation, error bars, linearization, and graphical analysis in a single 90-minute sitting with Paper 1A.',
  },
  {
    paperId: 'ib-sl-paper-2',
    title: 'Paper 2 (SL): Short-Answer and Extended-Response Questions',
    levels: ['SL'],
    formats: ['structured'],
    durationMinutes: 90,
    maxMarks: 50,
    weightingPercent: 44,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Compulsory multipart structured and synoptic extended-response questions spanning SL core content across Themes A-E.',
  },
  {
    paperId: 'ib-hl-paper-1a',
    title: 'Paper 1A (HL): Multiple-Choice Questions',
    levels: ['HL'],
    formats: ['mcq'],
    durationMinutes: 120,
    maxMarks: 40,
    weightingPercent: 24,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Sat together with Paper 1B in a single 120-minute sitting (60 marks total, 36% combined weighting). Covers both SL core and HL-only/AHL content; calculator and Data Booklet allowed.',
  },
  {
    paperId: 'ib-hl-paper-1b',
    title: 'Paper 1B (HL): Data-Based and Experimental Questions',
    levels: ['HL'],
    formats: ['structured'],
    durationMinutes: 120,
    maxMarks: 20,
    weightingPercent: 12,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Data-analysis, uncertainty propagation, power-law/logarithmic linearization, and experimental evaluation sat with Paper 1A.',
  },
  {
    paperId: 'ib-hl-paper-2',
    title: 'Paper 2 (HL): Short-Answer and Extended-Response Questions',
    levels: ['HL'],
    formats: ['structured'],
    durationMinutes: 150,
    maxMarks: 90,
    weightingPercent: 44,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Compulsory multipart structured and extended-response questions integrating SL core, HL-only subtopics (A.4, A.5, B.4, D.4, E.2), and AHL extensions.',
  },
];

export const IB_PHYSICS_CONVENTIONS: SyllabusConventionsSpec = {
  gravitationalAccelerationStandard:
    'g = 9.8 m s^-2 (2025 IB Physics Data Booklet printed value; question stems should state g explicitly if 9.81 m s^-2 is used)',
  unitFormattingStyle:
    'Negative index SI notation with thin/single space between units (e.g. m s^-1, kg m^-3, J kg^-1 K^-1, W m^-2); solidus (/) avoided.',
  significantFiguresRule:
    'Final numerical answers match the least precise input datum (typically 2 or 3 significant figures); absolute uncertainties rounded to 1 significant figure.',
  uncertaintyAndGraphConventions: [
    'Fractional/percentage uncertainty addition for products/quotients: Δy/y = Δa/a + Δb/b.',
    'Power uncertainty rule: if y = a^n then Δy/y = |n| (Δa/a).',
    'Maximum and minimum gradient lines drawn through error-bar extremes to determine gradient and intercept uncertainties.',
    'HL Paper 1B includes log-log and semi-log graph linearization of power-law and exponential relationships.',
  ],
  signConventions: [
    'First law of thermodynamics (B.4 HL): Q = ΔU + W, where W = +PΔV is work done BY the gas (opposite sign to IUPAC chemistry convention).',
    'Hooke restoring force (A.2): F_H = -kx opposing displacement x from equilibrium.',
    'Gravitational potential (D.1 HL): V_g = -GM/r is strictly negative with zero at infinity.',
    'Faraday-Lenz law (D.4 HL): ε = -N ΔΦ/Δt with minus sign encoding Lenz opposition to flux change.',
  ],
};

export const IB_PHYSICS_TOPICS: SyllabusTopicSpec[] = [
  {
    id: 'ib-tools',
    code: 'Tools',
    title: 'Tools for Physics: Measurement, Uncertainties and Graphical Analysis',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    summary:
      'Foundational SI measurement, orders of magnitude, random and systematic errors, uncertainty propagation, and graphical analysis assessed across Paper 1B and Paper 2.',
    boardOverlapNotes:
      'Directly parallels AQA 3.1 Measurements and their errors and NCUK IFY PH-01/PH-02.',
    subtopics: [
      {
        id: 'ib-tools-measurement-uncertainties',
        code: 'T.1-T.3',
        title: 'SI Units, Uncertainties, Error Bars and Linearization',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'si-units-dimensional-analysis',
          'uncertainties-error-propagation',
          'graphical-linearization-gradients',
        ],
        equations: [
          {
            id: 'ib-eq-uncertainty-sum',
            label: 'Absolute uncertainty in sum or difference',
            latex: 'y = a \\pm b \\Rightarrow \\Delta y = \\Delta a + \\Delta b',
            plainText: 'Δy = Δa + Δb',
            siUnitsSummary: 'Same unit as measured quantities a and b',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-eq-uncertainty-product',
            label: 'Fractional uncertainty in product or quotient',
            latex:
              'y = \\frac{ab}{c} \\Rightarrow \\frac{\\Delta y}{y} = \\frac{\\Delta a}{a} + \\frac{\\Delta b}{b} + \\frac{\\Delta c}{c}',
            plainText: 'Δy / y = Δa / a + Δb / b + Δc / c',
            siUnitsSummary: 'Dimensionless fractional ratio',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-eq-uncertainty-power',
            label: 'Fractional uncertainty for powers',
            latex:
              'y = a^n \\Rightarrow \\frac{\\Delta y}{y} = |n|\\frac{\\Delta a}{a}',
            plainText: 'Δy / y = |n| (Δa / a)',
            siUnitsSummary: 'Dimensionless fractional ratio',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'],
        quantitativeSkills: [
          'Convert compound quantities into fundamental SI base units and check dimensional homogeneity.',
          'Propagate absolute, fractional, and percentage uncertainties through sums, products, quotients, and powers.',
          'Extract physical constants and their uncertainties from best-fit, maximum-gradient, and minimum-gradient lines.',
        ],
        qualitativeSkills: [
          'Distinguish random uncertainties (reduced by repeated readings) from systematic errors (zero offset, calibration bias).',
          'Evaluate precision versus accuracy from scatter and systematic shift on experimental graphs.',
        ],
        visualFamilies: ['graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Linearization of power laws (ln y vs ln x) and exponential decays (ln y vs x) to extract exponents and decay constants.',
        ],
      },
    ],
  },
  {
    id: 'ib-theme-a',
    code: 'Theme A',
    title: 'Space, time and motion',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    teachingHours: { sl: 27, hl: 42 },
    summary:
      'Kinematics, Newtonian dynamics, momentum, mechanical energy, HL rotational mechanics, and HL Galilean/special relativity.',
    boardOverlapNotes:
      'A.1-A.3 align closely with A-Level Year 12 Mechanics (AQA 3.4.1) and circular motion (AQA 3.6.1.1). A.4 (Rigid body mechanics) corresponds to AQA Option 11 Engineering Physics; A.5 (Special relativity) corresponds to AQA Option 12 Turning Points.',
    subtopics: [
      {
        id: 'ib-a1-kinematics',
        code: 'A.1',
        title: 'Kinematics',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'kinematics-suvat',
          'motion-graphs',
          'projectile-motion',
        ],
        equations: [
          {
            id: 'ib-a1-suvat-avg',
            label: 'Displacement from average velocity',
            latex: 's = \\frac{u + v}{2}t',
            plainText: 's = ((u + v) / 2) * t',
            siUnitsSummary: 's in m, u and v in m s^-1, t in s',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a1-suvat-v',
            label: 'Velocity-time equation for uniform acceleration',
            latex: 'v = u + at',
            plainText: 'v = u + a * t',
            siUnitsSummary: 'v, u in m s^-1, a in m s^-2, t in s',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a1-suvat-s',
            label: 'Displacement-time equation for uniform acceleration',
            latex: 's = ut + \\frac{1}{2}at^2',
            plainText: 's = u * t + 0.5 * a * t^2',
            siUnitsSummary: 's in m, u in m s^-1, a in m s^-2, t in s',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a1-suvat-v2',
            label: 'Velocity-displacement equation',
            latex: 'v^2 = u^2 + 2as',
            plainText: 'v^2 = u^2 + 2 * a * s',
            siUnitsSummary: 'v, u in m s^-1, a in m s^-2, s in m',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['m', 's', 'm s^-1', 'm s^-2'],
        quantitativeSkills: [
          'Solve 1D uniform acceleration and free-fall problems with consistent vector sign conventions.',
          'Resolve initial velocity into horizontal and vertical components to calculate projectile range, time of flight, and maximum height.',
          'Determine instantaneous velocity from displacement-time tangents and displacement/change in velocity from areas under v-t and a-t graphs.',
        ],
        qualitativeSkills: [
          'Distinguish distance vs displacement and average speed vs instantaneous velocity.',
          'Explain qualitatively how fluid resistance reduces projectile range, lowers peak height, and produces an asymmetric trajectory with terminal speed.',
        ],
        visualFamilies: ['mechanics', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-a2-forces-momentum',
        code: 'A.2',
        title: 'Forces and momentum',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'vectors-equilibrium-moments',
          'newtonian-dynamics-friction',
          'fluid-drag-buoyancy',
          'linear-momentum-impulse',
          'uniform-circular-motion',
        ],
        equations: [
          {
            id: 'ib-a2-static-friction',
            label: 'Static friction bound',
            latex: 'F_{\\text{f}} \\le \\mu_{\\text{s}} F_{\\text{N}}',
            plainText: 'F_f <= μ_s * F_N',
            siUnitsSummary: 'F_f, F_N in N; μ_s dimensionless',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-dynamic-friction',
            label: 'Dynamic friction',
            latex: 'F_{\\text{f}} = \\mu_{\\text{d}} F_{\\text{N}}',
            plainText: 'F_f = μ_d * F_N',
            siUnitsSummary: 'F_f, F_N in N; μ_d dimensionless',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-hooke',
            label: 'Hooke restoring force',
            latex: 'F_{\\text{H}} = -kx',
            plainText: 'F_H = -k * x',
            siUnitsSummary: 'F_H in N, k in N m^-1, x in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-stokes',
            label: 'Stokes viscous drag on a sphere',
            latex: 'F_{\\text{d}} = 6\\pi\\eta r v',
            plainText: 'F_d = 6 * π * η * r * v',
            siUnitsSummary: 'F_d in N, η in Pa s, r in m, v in m s^-1',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-buoyancy',
            label: 'Archimedes buoyant force (upthrust)',
            latex: 'F_{\\text{b}} = \\rho V g',
            plainText: 'F_b = ρ * V * g',
            siUnitsSummary: 'F_b in N, ρ in kg m^-3, V in m^3, g in m s^-2',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-momentum',
            label: 'Linear momentum',
            latex: 'p = mv',
            plainText: 'p = m * v',
            siUnitsSummary: 'p in kg m s^-1 (or N s), m in kg, v in m s^-1',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-impulse',
            label: 'Impulse-momentum theorem',
            latex: 'J = F\\Delta t = \\Delta p',
            plainText: 'J = F * Δt = Δp',
            siUnitsSummary: 'J, Δp in N s, F in N, Δt in s',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-newton2',
            label: 'Newton second law',
            latex: 'F = ma = \\frac{\\Delta p}{\\Delta t}',
            plainText: 'F = m * a = Δp / Δt',
            siUnitsSummary: 'F in N, m in kg, a in m s^-2',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a2-centripetal',
            label: 'Centripetal acceleration and circular speed',
            latex:
              'a = \\frac{v^2}{r} = \\omega^2 r = \\frac{4\\pi^2 r}{T^2}, \\quad v = \\frac{2\\pi r}{T} = \\omega r',
            plainText: 'a = v^2 / r = ω^2 * r = 4π^2 r / T^2; v = ω * r',
            siUnitsSummary: 'a in m s^-2, v in m s^-1, ω in rad s^-1, r in m, T in s',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['N', 'kg', 'N s', 'kg m s^-1', 'Pa s', 'N m^-1', 'rad s^-1'],
        quantitativeSkills: [
          'Construct free-body diagrams on inclined planes, coupled pulley/Atwood systems, lifts, and banked/vertical circular paths.',
          'Apply conservation of linear momentum in 1D and 2D (glancing) collisions and explosions, testing elasticity via kinetic energy.',
          'Compute impulse from force-time graphs and terminal speed using buoyancy plus Stokes viscous drag.',
        ],
        qualitativeSkills: [
          'Identify Newton third-law action-reaction pairs acting on distinct bodies.',
          'Explain why centripetal force does zero mechanical work on a body in uniform circular motion.',
        ],
        visualFamilies: ['mechanics', 'graphs', 'grav-astro'],
        questionFormats: ['mcq', 'structured'],
        boardNotes:
          'Unlike AQA 3.4.2, IB 2025 does not assess Young modulus stress/strain curves, though it includes Stokes drag and buoyancy at SL. Moments/torques for rotational equilibrium are reserved for HL A.4.',
      },
      {
        id: 'ib-a3-work-energy-power',
        code: 'A.3',
        title: 'Work, energy and power',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['work-energy-power', 'elasticity-young-modulus'],
        equations: [
          {
            id: 'ib-a3-work',
            label: 'Mechanical work done by a constant force',
            latex: 'W = Fs\\cos\\theta',
            plainText: 'W = F * s * cos(θ)',
            siUnitsSummary: 'W in J, F in N, s in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a3-ek',
            label: 'Translational kinetic energy',
            latex: 'E_{\\text{k}} = \\frac{1}{2}mv^2 = \\frac{p^2}{2m}',
            plainText: 'E_k = 0.5 * m * v^2 = p^2 / (2 * m)',
            siUnitsSummary: 'E_k in J, m in kg, v in m s^-1, p in N s',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a3-ep-grav',
            label: 'Gravitational potential energy near Earth surface',
            latex: '\\Delta E_{\\text{p}} = mg\\Delta h',
            plainText: 'ΔE_p = m * g * Δh',
            siUnitsSummary: 'ΔE_p in J, m in kg, g in m s^-2, Δh in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a3-ep-elastic',
            label: 'Elastic potential energy',
            latex: 'E_{\\text{H}} = \\frac{1}{2}k\\Delta x^2',
            plainText: 'E_H = 0.5 * k * (Δx)^2',
            siUnitsSummary: 'E_H in J, k in N m^-1, Δx in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-a3-power-eff',
            label: 'Mechanical power and efficiency',
            latex:
              'P = \\frac{\\Delta W}{\\Delta t} = Fv, \\quad \\eta = \\frac{E_{\\text{useful}}}{E_{\\text{total}}} = \\frac{P_{\\text{useful}}}{P_{\\text{total}}}',
            plainText: 'P = ΔW / Δt = F * v; η = P_useful / P_total',
            siUnitsSummary: 'P in W (J s^-1), η dimensionless',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['J', 'W', 'N m'],
        quantitativeSkills: [
          'Calculate work done from variable force-displacement graphs and angled forces.',
          'Apply work-energy theorem and energy conservation with frictional dissipation on ramps, springs, and loops.',
          'Relate motive force, resistive drag, constant velocity, and engine output power via P = Fv.',
        ],
        qualitativeSkills: [
          'Account for energy transfers and thermal dissipation in open vs closed mechanical systems.',
          'Interpret Sankey energy-flow diagrams and efficiency cascades.',
        ],
        visualFamilies: ['mechanics', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-a4-rigid-body-mechanics',
        code: 'A.4',
        title: 'Rigid body mechanics (HL only)',
        syllabus: 'ib',
        level: 'HL',
        levelsCovered: ['HL'],
        canonicalConcepts: [
          'vectors-equilibrium-moments',
          'rigid-body-rotational-dynamics',
        ],
        equations: [
          {
            id: 'ib-a4-torque',
            label: 'Torque of a force',
            latex: '\\tau = Fr\\sin\\theta',
            plainText: 'τ = F * r * sin(θ)',
            siUnitsSummary: 'τ in N m, F in N, r in m',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a4-rot-suvat',
            label: 'Rotational kinematic equations',
            latex:
              '\\omega_{\\text{f}} = \\omega_{\\text{i}} + \\alpha t, \\; \\Delta\\theta = \\omega_{\\text{i}}t + \\frac{1}{2}\\alpha t^2, \\; \\omega_{\\text{f}}^2 = \\omega_{\\text{i}}^2 + 2\\alpha\\Delta\\theta',
            plainText:
              'ω_f = ω_i + αt; Δθ = ω_i t + 0.5 α t^2; ω_f^2 = ω_i^2 + 2 α Δθ',
            siUnitsSummary: 'Δθ in rad, ω in rad s^-1, α in rad s^-2, t in s',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a4-inertia-newton2',
            label: 'Moment of inertia and rotational Newton second law',
            latex: 'I = \\sum mr^2, \\quad \\tau = I\\alpha',
            plainText: 'I = Σ(m * r^2); τ = I * α',
            siUnitsSummary: 'I in kg m^2, τ in N m, α in rad s^-2',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a4-ang-momentum-ek',
            label: 'Angular momentum, angular impulse and rotational kinetic energy',
            latex:
              'L = I\\omega, \\quad \\Delta L = \\tau\\Delta t, \\quad E_{\\text{k}} = \\frac{1}{2}I\\omega^2 = \\frac{L^2}{2I}',
            plainText: 'L = I * ω; ΔL = τ * Δt; E_k = 0.5 * I * ω^2 = L^2 / (2 * I)',
            siUnitsSummary: 'L in J s (kg m^2 s^-1), E_k in J',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['N m', 'rad', 'rad s^-1', 'rad s^-2', 'kg m^2', 'kg m^2 s^-1'],
        quantitativeSkills: [
          'Solve static translational and rotational equilibrium problems for beams, ladders, and couples.',
          'Analyse rolling without slipping (v = ωr, a = αr) down inclines comparing hoops, cylinders, and spheres.',
          'Apply conservation of angular momentum to clutch/turntable collisions and variable moment-of-inertia systems.',
        ],
        qualitativeSkills: [
          'Explain why a hollow cylinder reaches the bottom of an incline more slowly than a solid sphere of identical mass and radius.',
        ],
        visualFamilies: ['mechanics', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-a5-galilean-special-relativity',
        code: 'A.5',
        title: 'Galilean and special relativity (HL only)',
        syllabus: 'ib',
        level: 'HL',
        levelsCovered: ['HL'],
        canonicalConcepts: ['special-relativity-spacetime'],
        equations: [
          {
            id: 'ib-a5-galilean',
            label: 'Galilean coordinate and velocity transformations',
            latex: "x' = x - vt, \\quad t' = t, \\quad u' = u - v",
            plainText: "x' = x - v*t; t' = t; u' = u - v",
            siUnitsSummary: 'x in m, t in s, u and v in m s^-1',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a5-lorentz-gamma',
            label: 'Lorentz factor and Lorentz spacetime transformations',
            latex:
              "\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}, \\quad x' = \\gamma(x - vt), \\quad t' = \\gamma\\left(t - \\frac{vx}{c^2}\\right)",
            plainText:
              "γ = 1 / sqrt(1 - v^2/c^2); x' = γ(x - vt); t' = γ(t - vx/c^2)",
            siUnitsSummary: 'γ >= 1 dimensionless, c = 3.00 x 10^8 m s^-1',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a5-vel-addition',
            label: 'Relativistic velocity addition',
            latex: "u' = \\frac{u - v}{1 - uv/c^2}",
            plainText: "u' = (u - v) / (1 - u*v / c^2)",
            siUnitsSummary: "u', u, v in m s^-1",
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-a5-dilation-contraction-interval',
            label: 'Time dilation, length contraction, invariant spacetime interval and Minkowski angle',
            latex:
              '\\Delta t = \\gamma\\Delta t_0, \\quad L = \\frac{L_0}{\\gamma}, \\quad (\\Delta s)^2 = (c\\Delta t)^2 - (\\Delta x)^2, \\quad \\tan\\theta = \\frac{v}{c}',
            plainText:
              'Δt = γ * Δt_0; L = L_0 / γ; (Δs)^2 = (cΔt)^2 - (Δx)^2; tan(θ) = v / c',
            siUnitsSummary: 'Δt in s, L and Δs in m, θ in rad/deg',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['m', 's', 'm s^-1', 'c'],
        quantitativeSkills: [
          'Calculate proper time, dilated time, proper length, and contracted length in muon decay and spacecraft scenarios.',
          'Apply Lorentz coordinate and relativistic velocity transformations between inertial reference frames.',
          'Read and construct Minkowski spacetime diagrams (ct vs x), worldlines, simultaneity axes, and light cones.',
        ],
        qualitativeSkills: [
          'State Einstein two postulates of special relativity and explain the relativity of simultaneity.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'ib-theme-b',
    code: 'Theme B',
    title: 'The particulate nature of matter',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    teachingHours: { sl: 24, hl: 32 },
    summary:
      'Thermal energy transfers, blackbody radiation & planetary greenhouse energy balance, ideal gas kinetic theory, HL thermodynamics, and DC electrical circuits.',
    boardOverlapNotes:
      'Note 2025 IB numbering: B.4 is Thermodynamics (HL only) and B.5 is Current and circuits (SL + HL). B.2 Greenhouse effect has no direct AQA core counterpart.',
    subtopics: [
      {
        id: 'ib-b1-thermal-energy-transfers',
        code: 'B.1',
        title: 'Thermal energy transfers',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'specific-heat-latent-heat',
          'thermal-conduction-radiation',
        ],
        equations: [
          {
            id: 'ib-b1-density-ek',
            label: 'Density and mean translational kinetic energy',
            latex:
              '\\rho = \\frac{m}{V}, \\quad \\overline{E_{\\text{k}}} = \\frac{3}{2}k_{\\text{B}}T',
            plainText: 'ρ = m / V; E_k_avg = (3/2) * k_B * T',
            siUnitsSummary: 'ρ in kg m^-3, E_k in J, T in K',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b1-calorimetry',
            label: 'Specific heat capacity and specific latent heat',
            latex: 'Q = mc\\Delta T, \\quad Q = mL',
            plainText: 'Q = m * c * ΔT; Q = m * L',
            siUnitsSummary: 'Q in J, m in kg, c in J kg^-1 K^-1, L in J kg^-1',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b1-conduction',
            label: 'Fourier steady-state thermal conduction',
            latex: '\\frac{\\Delta Q}{\\Delta t} = kA\\frac{\\Delta T}{\\Delta x}',
            plainText: 'ΔQ / Δt = k * A * (ΔT / Δx)',
            siUnitsSummary: 'ΔQ/Δt in W, k in W m^-1 K^-1, A in m^2, Δx in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b1-stefan-wien',
            label: 'Stefan-Boltzmann radiation and Wien displacement law',
            latex:
              'L = \\sigma A T^4, \\quad b = \\frac{L}{4\\pi d^2}, \\quad \\lambda_{\\max}T = 2.9 \\times 10^{-3}\\text{ m K}',
            plainText: 'L = σ * A * T^4; b = L / (4π d^2); λ_max * T = 2.9e-3 m K',
            siUnitsSummary: 'L in W, b in W m^-2, λ_max in m, T in K',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['K', 'J', 'J kg^-1 K^-1', 'J kg^-1', 'W m^-1 K^-1', 'W m^-2'],
        quantitativeSkills: [
          'Perform calorimetry and phase-change energy balances including electrical heater power inputs.',
          'Calculate steady-state thermal conduction rates through single and composite slabs.',
          'Apply Stefan-Boltzmann and Wien laws to blackbody spectra and apparent brightness.',
        ],
        qualitativeSkills: [
          'Explain why temperature remains constant during a phase transition in terms of intermolecular potential energy.',
          'Compare conduction, convection, and thermal radiation mechanisms microscopically.',
        ],
        visualFamilies: ['thermal', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-b2-greenhouse-effect',
        code: 'B.2',
        title: 'Greenhouse effect',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['greenhouse-albedo-energy-balance'],
        equations: [
          {
            id: 'ib-b2-albedo-emissivity',
            label: 'Planetary albedo, solar constant and emissivity',
            latex:
              '\\alpha = \\frac{P_{\\text{scattered}}}{P_{\\text{incident}}}, \\quad e = \\frac{P / A}{\\sigma T^4}',
            plainText: 'α = P_scattered / P_incident; e = (P / A) / (σ * T^4)',
            siUnitsSummary: 'α, e dimensionless (0 to 1); S ≈ 1.36 x 10^3 W m^-2',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['W m^-2', 'K'],
        quantitativeSkills: [
          'Compute mean incident solar intensity (S/4) over a spherical planet and solve zero-dimensional radiative equilibrium temperature models using albedo and emissivity.',
        ],
        qualitativeSkills: [
          'Explain infrared resonance absorption and isotropic re-emission by greenhouse gases (H2O, CO2, CH4, N2O).',
          'Analyse ice-albedo and water-vapour climate feedback loops.',
        ],
        visualFamilies: ['thermal', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-b3-gas-laws',
        code: 'B.3',
        title: 'Gas laws',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['ideal-gas-kinetic-theory', 'ideal-gas-pv-cycles'],
        equations: [
          {
            id: 'ib-b3-ideal-gas',
            label: 'Pressure and ideal gas equations of state',
            latex:
              'P = \\frac{F}{A}, \\quad n = \\frac{N}{N_{\\text{A}}}, \\quad PV = nRT = Nk_{\\text{B}}T',
            plainText: 'P = F / A; n = N / N_A; P * V = n * R * T = N * k_B * T',
            siUnitsSummary: 'P in Pa (N m^-2), V in m^3, n in mol, T in K',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b3-kinetic-pressure-u',
            label: 'Kinetic model gas pressure and monatomic internal energy',
            latex:
              'P = \\frac{1}{3}\\rho v_{\\text{rms}}^2, \\quad U = \\frac{3}{2}nRT = \\frac{3}{2}Nk_{\\text{B}}T',
            plainText: 'P = (1/3) * ρ * v_rms^2; U = (3/2) * n * R * T = (3/2) * N * k_B * T',
            siUnitsSummary: 'ρ in kg m^-3, v_rms in m s^-1, U in J',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['Pa', 'm^3', 'mol', 'K', 'J'],
        quantitativeSkills: [
          'Apply Boyle, Charles, Gay-Lussac, and combined ideal gas equations in Kelvin and SI units.',
          'Relate microscopic rms molecular speed and gas density to macroscopic pressure and internal energy.',
        ],
        qualitativeSkills: [
          'State the microscopic assumptions of an ideal gas and specify conditions (high pressure, low temperature near liquefaction) where real gases deviate.',
        ],
        visualFamilies: ['thermal', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-b4-thermodynamics',
        code: 'B.4',
        title: 'Thermodynamics (HL only)',
        syllabus: 'ib',
        level: 'HL',
        levelsCovered: ['HL'],
        canonicalConcepts: [
          'ideal-gas-pv-cycles',
          'thermodynamics-entropy-engines',
        ],
        equations: [
          {
            id: 'ib-b4-first-law-work',
            label: 'First law of thermodynamics and isobaric gas work',
            latex: 'Q = \\Delta U + W, \\quad W = P\\Delta V',
            plainText: 'Q = ΔU + W; W = P * ΔV',
            siUnitsSummary: 'Q, ΔU, W in J; P in Pa, ΔV in m^3',
            inDataBooklet: true,
            level: 'HL',
            notes: 'W > 0 when the gas expands (work done BY the gas).',
          },
          {
            id: 'ib-b4-adiabatic',
            label: 'Monatomic ideal gas adiabatic process',
            latex: 'PV^{5/3} = \\text{constant}',
            plainText: 'P * V^(5/3) = constant',
            siUnitsSummary: 'P in Pa, V in m^3 (γ = 5/3 for monatomic ideal gas)',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-b4-entropy',
            label: 'Clausius and Boltzmann entropy relations',
            latex: '\\Delta S = \\frac{\\Delta Q}{T}, \\quad S = k_{\\text{B}}\\ln\\Omega',
            plainText: 'ΔS = ΔQ / T; S = k_B * ln(Ω)',
            siUnitsSummary: 'S, ΔS in J K^-1; Ω dimensionless microstate count',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-b4-carnot',
            label: 'Heat engine thermal efficiency and Carnot efficiency',
            latex:
              '\\eta = \\frac{W}{Q_{\\text{H}}} = 1 - \\frac{Q_{\\text{C}}}{Q_{\\text{H}}}, \\quad \\eta_{\\text{Carnot}} = 1 - \\frac{T_{\\text{C}}}{T_{\\text{H}}}',
            plainText: 'η = W / Q_H = 1 - Q_C / Q_H; η_Carnot = 1 - T_C / T_H',
            siUnitsSummary: 'η dimensionless; T_C, T_H in K',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['J', 'Pa', 'm^3', 'J K^-1', 'K'],
        quantitativeSkills: [
          'Analyse cyclic P-V diagrams (isobaric, isovolumetric, isothermal, adiabatic) to compute net cycle work, heat inflows/outflows, and thermal efficiency.',
          'Calculate entropy changes in isothermal heat transfers and statistical microstate multiplicities.',
        ],
        qualitativeSkills: [
          'Compare adiabatic vs isothermal curves on P-V axes (steeper adiabatic slope) and state Clausius/Kelvin-Planck/entropy forms of the second law.',
        ],
        visualFamilies: ['thermal', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-b5-current-circuits',
        code: 'B.5',
        title: 'Current and circuits',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'charge-current-potential-difference',
          'ohms-law-iv-characteristics',
          'resistivity-ohmic-conductors',
          'kirchhoff-dc-circuits',
          'potential-divider-sensors',
          'emf-internal-resistance',
        ],
        equations: [
          {
            id: 'ib-b5-current-pd-r',
            label: 'Electric current, potential difference, resistance and resistivity',
            latex:
              'I = \\frac{\\Delta q}{\\Delta t}, \\quad V = \\frac{W}{q}, \\quad R = \\frac{V}{I}, \\quad \\rho = \\frac{RA}{L}',
            plainText: 'I = Δq / Δt; V = W / q; R = V / I; ρ = R * A / L',
            siUnitsSummary: 'I in A, q in C, V in V, R in Ω, ρ in Ω m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b5-power-networks',
            label: 'Electrical power and resistor networks',
            latex:
              'P = IV = I^2R = \\frac{V^2}{R}, \\quad R_{\\text{s}} = \\sum R_i, \\quad \\frac{1}{R_{\\text{p}}} = \\sum \\frac{1}{R_i}',
            plainText: 'P = I*V = I^2*R = V^2/R; R_s = R1 + R2; 1/R_p = 1/R1 + 1/R2',
            siUnitsSummary: 'P in W, R in Ω',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-b5-emf-divider',
            label: 'Cell emf, internal resistance and potential divider',
            latex:
              '\\varepsilon = I(R + r), \\quad V_{\\text{out}} = \\frac{R_2}{R_1 + R_2}V_{\\text{in}}',
            plainText: 'ε = I * (R + r); V_out = (R_2 / (R_1 + R_2)) * V_in',
            siUnitsSummary: 'ε, V in V; R, r in Ω; I in A',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['A', 'C', 'V', 'Ω', 'Ω m', 'W'],
        quantitativeSkills: [
          'Solve series-parallel DC resistor networks, Kirchhoff current/loop equations, ammeter/voltmeter loading, and potential-divider sensor circuits (LDR, thermistor).',
          'Extract cell emf (intercept) and internal resistance (-gradient) from terminal V-I graphs.',
        ],
        qualitativeSkills: [
          'Interpret non-ohmic I-V characteristics (metallic filament lamp, semiconductor diode, NTC thermistor) in terms of charge-carrier density and lattice vibrations.',
        ],
        visualFamilies: ['circuits', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        boardNotes:
          'Capacitors and RC circuits (old 2016 Topic 11.3) were removed from IB Physics 2025; do not assign capacitor questions to IB.',
      },
    ],
  },
  {
    id: 'ib-theme-c',
    code: 'Theme C',
    title: 'Wave behaviour',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    teachingHours: { sl: 17, hl: 29 },
    summary:
      'Simple harmonic motion, progressive waves, reflection/refraction/interference/diffraction, standing waves and resonance, and Doppler shifts.',
    subtopics: [
      {
        id: 'ib-c1-shm',
        code: 'C.1',
        title: 'Simple harmonic motion',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['simple-harmonic-motion'],
        equations: [
          {
            id: 'ib-c1-sl-core',
            label: 'SHM defining relation and oscillator periods',
            latex:
              'a = -\\omega^2 x, \\quad T = \\frac{1}{f} = \\frac{2\\pi}{\\omega}, \\quad T = 2\\pi\\sqrt{\\frac{m}{k}}, \\quad T = 2\\pi\\sqrt{\\frac{l}{g}}',
            plainText:
              'a = -ω^2 * x; T = 1/f = 2π/ω; T = 2π*sqrt(m/k); T = 2π*sqrt(l/g)',
            siUnitsSummary: 'a in m s^-2, ω in rad s^-1, x and l in m, T in s, f in Hz',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-c1-hl-kinematics-energy',
            label: 'SHM phase kinematics and mechanical energy (HL only)',
            latex:
              'x = x_0\\sin(\\omega t + \\phi), \\; v = \\pm\\omega\\sqrt{x_0^2 - x^2}, \\; E_{\\text{T}} = \\frac{1}{2}m\\omega^2 x_0^2, \\; E_{\\text{p}} = \\frac{1}{2}m\\omega^2 x^2',
            plainText:
              'x = x_0 sin(ωt + φ); v = ±ω sqrt(x_0^2 - x^2); E_T = 0.5 m ω^2 x_0^2; E_p = 0.5 m ω^2 x^2',
            siUnitsSummary: 'x, x_0 in m, v in m s^-1, φ in rad, E in J',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['Hz', 's', 'rad s^-1', 'm', 'J'],
        quantitativeSkills: [
          'Calculate period, frequency, angular frequency, and restoring acceleration for mass-spring and simple-pendulum oscillators.',
          'HL: Solve sinusoidal SHM equations with arbitrary phase angle φ and compute kinetic/potential energy at any displacement x.',
        ],
        qualitativeSkills: [
          'Identify phase relationships (π/2 lead of velocity over displacement; π antiphase between acceleration and displacement) on x-t, v-t, and a-t graphs.',
        ],
        visualFamilies: ['optics-shm', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Phase angle φ in x = x_0 sin(ωt + φ) and v = ω x_0 cos(ωt + φ).',
          'Quantitative parabolic E_k(x) and E_p(x) curves and total SHM energy E_T = (1/2) m ω^2 x_0^2.',
        ],
      },
      {
        id: 'ib-c2-wave-model',
        code: 'C.2',
        title: 'Wave model',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['progressive-waves-polarization'],
        equations: [
          {
            id: 'ib-c2-wave-speed',
            label: 'Wave speed relation',
            latex: 'v = f\\lambda = \\frac{\\lambda}{T}',
            plainText: 'v = f * λ = λ / T',
            siUnitsSummary: 'v in m s^-1, f in Hz, λ in m, T in s',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['m s^-1', 'Hz', 'm', 'W m^-2'],
        quantitativeSkills: [
          'Extract amplitude, wavelength, period, frequency, wave speed, and phase difference from coupled y(x) and y(t) wave profiles.',
          'Apply inverse-square intensity scaling (I ∝ x^-2) and amplitude-intensity proportionality (I ∝ A^2).',
        ],
        qualitativeSkills: [
          'Compare particle motion in transverse (electromagnetic, string) versus longitudinal (sound, ultrasound) progressive waves.',
        ],
        visualFamilies: ['waves', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-c3-wave-phenomena',
        code: 'C.3',
        title: 'Wave phenomena',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'refraction-snell-tir',
          'double-slit-interference',
          'single-slit-diffraction-gratings',
        ],
        equations: [
          {
            id: 'ib-c3-snell',
            label: 'Snell law of refraction',
            latex: '\\frac{n_1}{n_2} = \\frac{\\sin\\theta_2}{\\sin\\theta_1} = \\frac{v_2}{v_1}',
            plainText: 'n_1 / n_2 = sin(θ_2) / sin(θ_1) = v_2 / v_1',
            siUnitsSummary: 'n dimensionless, θ in deg/rad, v in m s^-1',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-c3-double-slit',
            label: 'Two-source path difference and Young double-slit fringe spacing',
            latex:
              '\\Delta\\ell_{\\text{con}} = n\\lambda, \\quad \\Delta\\ell_{\\text{des}} = \\left(n + \\frac{1}{2}\\right)\\lambda, \\quad s = \\frac{\\lambda D}{d}',
            plainText: 'Δl_con = nλ; Δl_des = (n + 0.5)λ; s = λ * D / d',
            siUnitsSummary: 's, λ, D, d in m; n integer',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-c3-hl-diffraction-grating',
            label: 'Single-slit diffraction minimum and diffraction grating (HL only)',
            latex: '\\theta = \\frac{\\lambda}{b}, \\quad n\\lambda = d\\sin\\theta',
            plainText: 'θ = λ / b; n * λ = d * sin(θ)',
            siUnitsSummary: 'θ in rad (single slit) or deg/rad (grating); λ, b, d in m',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['m', 'rad'],
        quantitativeSkills: [
          'Apply Snell law, critical angle (sin θ_c = n_2/n_1), and Young double-slit fringe spacing equations.',
          'HL: Compute single-slit central maximum angular width (2λ/b), double-slit missing/modulated orders, and maximum observable diffraction-grating order floor(d/λ).',
        ],
        qualitativeSkills: [
          'Describe wavefront refraction, diffraction around apertures comparable to λ, and coherence conditions for stable interference.',
        ],
        visualFamilies: ['waves', 'optics-shm', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Single-slit diffraction intensity envelope and first minimum angle θ = λ / b.',
          'Multi-slit interference and diffraction gratings (nλ = d sin θ).',
        ],
        boardNotes:
          'Thin-lens equations (1/f = 1/u + 1/v) from legacy Option C Imaging are NOT in IB Physics 2025; C.3 optics covers planar/boundary refraction, critical angle, TIR, interference, and diffraction.',
      },
      {
        id: 'ib-c4-standing-waves-resonance',
        code: 'C.4',
        title: 'Standing waves and resonance',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'standing-waves-harmonics',
          'forced-oscillations-resonance',
        ],
        equations: [
          {
            id: 'ib-c4-harmonics',
            label: 'Standing wave harmonic wavelengths on strings and pipes',
            latex:
              'f_n = \\frac{nv}{2L}\\;(\\text{both ends fixed/open}), \\quad f_n = \\frac{nv}{4L}\\;(n=1,3,5,\\dots\\;\\text{one end closed})',
            plainText:
              'f_n = n*v / (2L) (fixed-fixed or open-open); f_n = n*v / (4L) for odd n (closed-open)',
            siUnitsSummary: 'f_n in Hz, v in m s^-1, L in m',
            inDataBooklet: false,
            level: 'SL',
            notes:
              'Derived directly from node/antinode boundary conditions and v = fλ; IB Data Booklet requires students to construct λ_n from L.',
          },
        ],
        siUnits: ['Hz', 'm', 'm s^-1'],
        quantitativeSkills: [
          'Determine harmonic frequencies, wavelengths, and node-antinode spacings on stretched strings, open pipes, and pipes closed at one end (odd harmonics only).',
        ],
        qualitativeSkills: [
          'Contrast energy propagation, amplitude profile, and phase relationships (0 or π between adjacent loops) of standing waves vs progressive waves.',
          'Explain light, critical, and heavy damping and how damping shifts and flattens driven resonance amplitude-frequency curves.',
        ],
        visualFamilies: ['waves', 'optics-shm', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-c5-doppler-effect',
        code: 'C.5',
        title: 'Doppler effect',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['doppler-effect'],
        equations: [
          {
            id: 'ib-c5-em-approx',
            label: 'Low-speed electromagnetic Doppler approximation',
            latex: '\\frac{\\Delta f}{f} \\approx \\frac{\\Delta\\lambda}{\\lambda} \\approx \\frac{v}{c}',
            plainText: 'Δf / f ≈ Δλ / λ ≈ v / c',
            siUnitsSummary: 'f in Hz, λ in m, v and c in m s^-1 (for v << c)',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-c5-hl-sound',
            label: 'Acoustic Doppler equations for moving source or observer (HL only)',
            latex:
              "f' = f\\left(\\frac{v}{v \\mp u_{\\text{s}}}\\right), \\quad f' = f\\left(\\frac{v \\pm u_{\\text{o}}}{v}\\right)",
            plainText: "f' = f * v / (v ∓ u_s); f' = f * (v ± u_o) / v",
            siUnitsSummary: "f', f in Hz; v, u_s, u_o in m s^-1",
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['Hz', 'm', 'm s^-1'],
        quantitativeSkills: [
          'Calculate radial velocities of galaxies/stars or radar targets using Δλ/λ ≈ v/c.',
          'HL: Compute observed acoustic frequencies and wavelengths for moving sources and moving observers.',
        ],
        qualitativeSkills: [
          'Interpret compressed and stretched circular wavefront diagrams to distinguish moving source (shifted wavelength) from moving observer (unchanged wavelength, changed relative wave speed).',
        ],
        visualFamilies: ['waves', 'grav-astro'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Exact acoustic Doppler equations for moving source and moving observer.',
        ],
      },
    ],
  },
  {
    id: 'ib-theme-d',
    code: 'Theme D',
    title: 'Fields',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    teachingHours: { sl: 19, hl: 38 },
    summary:
      'Gravitational fields and orbital mechanics, electrostatic and magnetic fields, charged-particle motion in EM fields, and HL electromagnetic induction.',
    subtopics: [
      {
        id: 'ib-d1-gravitational-fields',
        code: 'D.1',
        title: 'Gravitational fields',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'gravitational-force-field',
          'gravitational-potential-orbits',
        ],
        equations: [
          {
            id: 'ib-d1-newton-grav',
            label: 'Newton law of gravitation and gravitational field strength',
            latex: 'F = G\\frac{m_1 m_2}{r^2}, \\quad g = \\frac{F}{m} = G\\frac{M}{r^2}',
            plainText: 'F = G * m_1 * m_2 / r^2; g = F / m = G * M / r^2',
            siUnitsSummary: 'F in N, g in N kg^-1 (m s^-2), r in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-d1-hl-potential-orbits',
            label: 'Gravitational potential, potential energy, orbital and escape speed (HL only)',
            latex:
              'V_{\\text{g}} = -\\frac{GM}{r}, \\; E_{\\text{p}} = mV_{\\text{g}} = -\\frac{GMm}{r}, \\; g = -\\frac{\\Delta V_{\\text{g}}}{\\Delta r}, \\; v_{\\text{orb}} = \\sqrt{\\frac{GM}{r}}, \\; v_{\\text{esc}} = \\sqrt{\\frac{2GM}{r}}',
            plainText:
              'V_g = -GM/r; E_p = -GMm/r; g = -ΔV_g/Δr; v_orb = sqrt(GM/r); v_esc = sqrt(2GM/r)',
            siUnitsSummary: 'V_g in J kg^-1, E_p in J, v in m s^-1',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['N', 'N kg^-1', 'J kg^-1', 'J', 'm s^-1'],
        quantitativeSkills: [
          'Calculate resultant gravitational field strength, circular orbital speed, and Kepler third-law orbital periods (T^2 = 4π^2 r^3 / GM).',
          'HL: Compute work done moving masses between gravitational equipotentials, escape velocity, and total circular orbit mechanical energy E_tot = -GMm/(2r).',
        ],
        qualitativeSkills: [
          'Sketch radial and two-body gravitational field lines and perpendicular equipotential surfaces.',
          'HL: Explain why atmospheric drag on a satellite decreases total energy and orbital radius while increasing orbital speed.',
        ],
        visualFamilies: ['grav-astro', 'fields', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Gravitational potential V_g = -GM/r, potential gradient g = -ΔV_g/Δr, escape speed, and satellite orbital energy graphs.',
        ],
      },
      {
        id: 'ib-d2-electric-magnetic-fields',
        code: 'D.2',
        title: 'Electric and magnetic fields',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'electrostatic-coulomb-uniform-fields',
          'electric-potential-equipotentials',
        ],
        equations: [
          {
            id: 'ib-d2-coulomb-uniform',
            label: 'Coulomb law and electric field strength',
            latex:
              'F = k\\frac{q_1 q_2}{r^2} = \\frac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}, \\quad E = \\frac{F}{q}, \\quad E = \\frac{V}{d}',
            plainText: 'F = k * q_1 * q_2 / r^2; E = F / q; E = V / d',
            siUnitsSummary: 'F in N, q in C, E in N C^-1 or V m^-1, V in V, d in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-d2-hl-potential',
            label: 'Electric potential, potential energy and potential gradient (HL only)',
            latex:
              'V_{\\text{e}} = \\frac{kQ}{r}, \\quad E_{\\text{p}} = qV_{\\text{e}} = \\frac{kQq}{r}, \\quad E = -\\frac{\\Delta V_{\\text{e}}}{\\Delta r}',
            plainText: 'V_e = k * Q / r; E_p = k * Q * q / r; E = -ΔV_e / Δr',
            siUnitsSummary: 'V_e in V (J C^-1), E_p in J, E in V m^-1',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['C', 'N C^-1', 'V m^-1', 'V', 'T'],
        quantitativeSkills: [
          'Superpose 1D and 2D Coulomb forces and electric field vectors for point charges and parallel plates.',
          'HL: Compute scalar electric potential sums, work done on test charges, and electric field from potential-position gradients.',
        ],
        qualitativeSkills: [
          'Map electric field lines and equipotentials for monopoles, dipoles, like-charge pairs, and parallel plates; map magnetic field lines around straight wires, flat loops, and solenoids.',
        ],
        visualFamilies: ['fields', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Radial electric potential V_e = kQ/r, electrostatic potential energy E_p = kQq/r, and E = -ΔV_e/Δr.',
        ],
      },
      {
        id: 'ib-d3-motion-em-fields',
        code: 'D.3',
        title: 'Motion in electromagnetic fields',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['magnetic-force-charges-currents'],
        equations: [
          {
            id: 'ib-d3-lorentz-force',
            label: 'Magnetic forces on moving charges and current-carrying conductors',
            latex:
              'F = qvB\\sin\\theta, \\quad F = BIL\\sin\\theta, \\quad \\frac{F}{L} = \\mu_0\\frac{I_1 I_2}{2\\pi r}',
            plainText: 'F = q * v * B * sin(θ); F = B * I * L * sin(θ); F/L = μ_0 I_1 I_2 / (2π r)',
            siUnitsSummary: 'F in N, q in C, v in m s^-1, B in T, I in A, L and r in m',
            inDataBooklet: true,
            level: 'SL',
          },
        ],
        siUnits: ['T', 'N', 'C', 'A', 'm'],
        quantitativeSkills: [
          'Solve circular cyclotron radius r = mv/(qB), period T = 2πm/(qB), crossed-field velocity selectors (v = E/B), and parabolic deflection in uniform E-fields.',
          'Calculate force per unit length between parallel current-carrying conductors.',
        ],
        qualitativeSkills: [
          'Apply right-hand/left-hand rules consistently for positive and negative charges in ⊙ (out-of-page) and ⊗ (into-page) magnetic fields.',
          'Explain why a static magnetic field changes a charged particle velocity direction without changing its kinetic energy.',
        ],
        visualFamilies: ['em-induction', 'fields'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-d4-induction',
        code: 'D.4',
        title: 'Induction (HL only)',
        syllabus: 'ib',
        level: 'HL',
        levelsCovered: ['HL'],
        canonicalConcepts: [
          'electromagnetic-induction-faraday-lenz',
          'ac-generators-transformers',
        ],
        equations: [
          {
            id: 'ib-d4-faraday-lenz',
            label: 'Magnetic flux, Faraday-Lenz law and motional emf',
            latex:
              '\\Phi = BA\\cos\\theta, \\quad \\varepsilon = -N\\frac{\\Delta\\Phi}{\\Delta t}, \\quad \\varepsilon = BvL',
            plainText: 'Φ = B * A * cos(θ); ε = -N * ΔΦ / Δt; ε = B * v * L',
            siUnitsSummary: 'Φ in Wb (T m^2), ε in V, B in T, A in m^2, v in m s^-1, L in m',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['Wb', 'T', 'V', 'A'],
        quantitativeSkills: [
          'Calculate magnetic flux linkage NΦ, average and instantaneous induced emf in moving rods and rotating coils (ε = BANω sin ωt), induced currents, and resistive power dissipation.',
        ],
        qualitativeSkills: [
          'Apply Lenz law and energy conservation to deduce induced current direction, magnetic braking forces, and phase relationship between Φ(t) and ε(t).',
        ],
        visualFamilies: ['em-induction', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        boardNotes:
          'IB 2025 D.4 focuses on flux, Faraday-Lenz law, motional emf, and AC generators; transformer turns-ratio/RMS rectification were streamlined compared to legacy 2016 Topic 11.2, whereas A-Level assesses transformers and RMS explicitly.',
      },
    ],
  },
  {
    id: 'ib-theme-e',
    code: 'Theme E',
    title: 'Nuclear and quantum physics',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    teachingHours: { sl: 23, hl: 39 },
    summary:
      'Atomic spectra & nuclear structure, HL quantum mechanics (photoelectric, de Broglie, Compton, uncertainty), radioactive decay, nuclear fission, and stellar fusion & cosmology.',
    boardOverlapNotes:
      'Crucial level divergence vs UK A-Level: Photoelectric effect and de Broglie wavelength sit in HL-only E.2 in IB 2025, whereas they sit in Year 12 / AS core (AQA 3.2.2) in UK A-Level. Subatomic quark/lepton classification (AQA 3.2.1) is NOT in IB 2025.',
    subtopics: [
      {
        id: 'ib-e1-structure-atom',
        code: 'E.1',
        title: 'Structure of the atom',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'atomic-spectra-energy-levels',
          'rutherford-scattering-nuclear-radius',
        ],
        equations: [
          {
            id: 'ib-e1-photon',
            label: 'Photon energy',
            latex: 'E = hf = \\frac{hc}{\\lambda}',
            plainText: 'E = h * f = h * c / λ',
            siUnitsSummary: 'E in J (or convert eV via 1 eV = 1.60 x 10^-19 J), f in Hz, λ in m',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-e1-hl-bohr-nuclear-radius',
            label: 'Nuclear radius and Bohr hydrogen atom quantization (HL only)',
            latex:
              'R = R_0 A^{1/3}, \\quad E_n = -\\frac{13.6}{n^2}\\text{ eV}, \\quad mvr = \\frac{nh}{2\\pi}',
            plainText: 'R = R_0 * A^(1/3); E_n = -13.6 / n^2 eV; m * v * r = n * h / (2π)',
            siUnitsSummary: 'R in m (R_0 = 1.20 x 10^-15 m), E_n in eV, n positive integer',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['J', 'eV', 'Hz', 'm', 'fm'],
        quantitativeSkills: [
          'Convert photon energies between eV and J and calculate emission/absorption wavelengths between discrete atomic energy levels.',
          'HL: Estimate nuclear radius via Rutherford alpha closest approach, apply R = R_0 A^(1/3) to show nuclear density is independent of A, and compute hydrogen spectral transitions.',
        ],
        qualitativeSkills: [
          'Interpret Geiger-Marsden-Rutherford alpha scattering observations as evidence for a small, dense, positively charged nucleus.',
        ],
        visualFamilies: ['quantum-nuclear', 'fields'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Distance of closest approach in Rutherford head-on scattering and deviations at very high alpha energy.',
          'Fermi radius R = R_0 A^(1/3), constant nuclear density, and Bohr quantized angular momentum.',
        ],
      },
      {
        id: 'ib-e2-quantum-physics',
        code: 'E.2',
        title: 'Quantum physics (HL only)',
        syllabus: 'ib',
        level: 'HL',
        levelsCovered: ['HL'],
        canonicalConcepts: [
          'photoelectric-effect',
          'wave-particle-duality-de-broglie',
          'compton-scattering-heisenberg-uncertainty',
        ],
        equations: [
          {
            id: 'ib-e2-photoelectric',
            label: 'Einstein photoelectric equation and stopping potential',
            latex: 'E_{\\max} = hf - \\Phi = eV_{\\text{s}}',
            plainText: 'E_max = h * f - Φ = e * V_s',
            siUnitsSummary: 'E_max, Φ in J (or eV), f in Hz, V_s in V',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-e2-de-broglie',
            label: 'de Broglie matter wavelength',
            latex: '\\lambda = \\frac{h}{p}',
            plainText: 'λ = h / p',
            siUnitsSummary: 'λ in m, p in kg m s^-1',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-e2-compton',
            label: 'Compton wavelength shift',
            latex: '\\Delta\\lambda = \\lambda_{\\text{f}} - \\lambda_{\\text{i}} = \\frac{h}{m_{\\text{e}}c}(1 - \\cos\\theta)',
            plainText: 'Δλ = (h / (m_e * c)) * (1 - cos(θ))',
            siUnitsSummary: 'Δλ in m, θ scattering angle',
            inDataBooklet: true,
            level: 'HL',
          },
          {
            id: 'ib-e2-heisenberg',
            label: 'Heisenberg uncertainty relations (optional/contextual extension)',
            latex:
              '\\Delta x\\,\\Delta p \\ge \\frac{h}{4\\pi}, \\quad \\Delta E\\,\\Delta t \\ge \\frac{h}{4\\pi}',
            plainText: 'Δx * Δp >= h / (4π); ΔE * Δt >= h / (4π)',
            siUnitsSummary: 'Δx in m, Δp in N s, ΔE in J, Δt in s',
            inDataBooklet: false,
            level: 'HL',
            notes:
              'Check exact question stem provision: IB 2025 E.2 Data Booklet prints E_max = hf - Φ, λ = h/p, and Compton shift Δλ = (h / m_e c)(1 - cos θ).',
          },
        ],
        siUnits: ['J', 'eV', 'V', 'Hz', 'm'],
        quantitativeSkills: [
          'Extract Planck constant h (gradient) and work function Φ / threshold frequency f_0 (intercepts) from E_max-f and stopping-potential V_s-f graphs.',
          'Compute de Broglie wavelengths of accelerated electrons (p = sqrt(2 m_e e V)) and photon wavelength shifts in Compton scattering.',
        ],
        qualitativeSkills: [
          'Explain why classical wave theory fails to account for instantaneous emission and intensity-independent threshold frequency in the photoelectric effect.',
          'Interpret electron diffraction rings as evidence for matter waves.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-e3-radioactive-decay',
        code: 'E.3',
        title: 'Radioactive decay',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'radioactive-decay-half-life',
          'mass-defect-binding-energy',
        ],
        equations: [
          {
            id: 'ib-e3-mass-energy',
            label: 'Einstein mass-energy equivalence',
            latex: 'E = mc^2, \\quad \\Delta E = \\Delta m\\,c^2',
            plainText: 'E = m * c^2; ΔE = Δm * c^2',
            siUnitsSummary: 'E in J (or MeV using 1 u = 931.5 MeV c^-2), m in kg (or u)',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-e3-hl-decay-law',
            label: 'Exponential radioactive decay law, activity and half-life (HL only)',
            latex:
              'N = N_0 e^{-\\lambda t}, \\quad A = \\lambda N = \\lambda N_0 e^{-\\lambda t}, \\quad T_{1/2} = \\frac{\\ln 2}{\\lambda}',
            plainText: 'N = N_0 * exp(-λt); A = λ * N = A_0 * exp(-λt); T_1/2 = ln(2) / λ',
            siUnitsSummary: 'A in Bq (s^-1), λ in s^-1, t and T_1/2 in s',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['Bq', 's^-1', 'u', 'MeV', 'J'],
        quantitativeSkills: [
          'Balance nuclear decay equations (α, β^-, β^+, γ), calculate discrete half-life fractions corrected for background count rate, and compute binding energy per nucleon from atomic/nuclear masses.',
          'HL: Solve continuous exponential decay and activity problems for arbitrary elapsed times and very long/short half-lives.',
        ],
        qualitativeSkills: [
          'Predict decay modes relative to the N-Z nuclear stability band and explain why continuous β energy spectra implied the existence of the neutrino/antineutrino.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Continuous exponential decay equations N = N_0 e^(-λt), A = λN, and T_1/2 = ln 2 / λ.',
        ],
      },
      {
        id: 'ib-e4-fission',
        code: 'E.4',
        title: 'Fission',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: ['nuclear-fission-fusion', 'mass-defect-binding-energy'],
        equations: [
          {
            id: 'ib-e4-q-value',
            label: 'Reaction Q-value from mass defect or binding energy per nucleon',
            latex: 'Q = (m_{\\text{reactants}} - m_{\\text{products}})c^2',
            plainText: 'Q = (m_reactants - m_products) * c^2',
            siUnitsSummary: 'Q in MeV or J, m in u or kg',
            inDataBooklet: false,
            level: 'SL',
            notes: 'Applied directly from E = mc^2 in E.3 and the binding-energy-per-nucleon curve.',
          },
        ],
        siUnits: ['MeV', 'J', 'W', 'kg'],
        quantitativeSkills: [
          'Calculate energy released per induced fission event from mass defects or binding energy per nucleon graphs, and relate reactor fuel consumption rate to thermal/electrical power output.',
        ],
        qualitativeSkills: [
          'Explain the distinct roles of moderator (slowing fast neutrons to thermal energies), control rods (neutron absorption for criticality), coolant, and shielding, plus radioactive waste management.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'ib-e5-fusion-stars',
        code: 'E.5',
        title: 'Fusion and stars',
        syllabus: 'ib',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        canonicalConcepts: [
          'nuclear-fission-fusion',
          'stellar-radiation-hr-diagram',
          'cosmology-hubble-law',
        ],
        equations: [
          {
            id: 'ib-e5-parallax-luminosity',
            label: 'Stellar parallax, luminosity, apparent brightness and Wien law',
            latex:
              'd\\,(\\text{pc}) = \\frac{1}{p\\,(\\text{arc-second})}, \\quad L = \\sigma A T^4 = 4\\pi R^2\\sigma T^4, \\quad b = \\frac{L}{4\\pi d^2}',
            plainText: 'd(pc) = 1 / p(arcsec); L = 4π R^2 σ T^4; b = L / (4π d^2)',
            siUnitsSummary: 'd in pc or m, p in arcsec, L in W, b in W m^-2, T in K',
            inDataBooklet: true,
            level: 'SL',
          },
          {
            id: 'ib-e5-hl-cosmology',
            label: 'Cosmological redshift and Hubble law (HL extension)',
            latex:
              'z = \\frac{\\Delta\\lambda}{\\lambda_0} \\approx \\frac{v}{c}, \\quad z = \\frac{R}{R_0} - 1, \\quad v = H_0 d',
            plainText: 'z = Δλ / λ_0 ≈ v / c; z = R / R_0 - 1; v = H_0 * d',
            siUnitsSummary: 'z dimensionless, v in km s^-1, d in Mpc, H_0 in km s^-1 Mpc^-1 (or s^-1)',
            inDataBooklet: true,
            level: 'HL',
          },
        ],
        siUnits: ['pc', 'ly', 'AU', 'W', 'W m^-2', 'K', 'km s^-1 Mpc^-1'],
        quantitativeSkills: [
          'Calculate stellar distances via parallax, stellar radii from luminosity and Wien peak wavelength, and apparent brightness ratios.',
          'HL: Relate cosmological scale factor R/R_0 to redshift z, apply Hubble law v = H_0 d, and estimate Hubble time 1/H_0.',
        ],
        qualitativeSkills: [
          'Locate main-sequence, red giant, supergiant, and white dwarf regions on Hertzsprung-Russell (HR) diagrams and trace evolutionary tracks by stellar mass.',
          'HL: Describe Jeans mass instability qualitatively, s-process vs r-process neutron capture nucleosynthesis, and Type Ia supernovae evidence for accelerating expansion.',
        ],
        visualFamilies: ['grav-astro', 'quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        hlExtensions: [
          'Qualitative Jeans mass criterion for star formation, s-process and r-process heavy-element nucleosynthesis, cosmological scale factor z = R/R_0 - 1, and Hubble law.',
        ],
      },
    ],
  },
];

export const IB_PHYSICS_SYLLABUS: SyllabusSpecificationCatalogue = {
  syllabus: 'ib',
  title: 'IB Diploma Programme Physics (SL & HL)',
  awardingBody: 'International Baccalaureate Organization (IBO)',
  specificationCode: 'IB-DP-PHYSICS-2025',
  specificationVersion: 'First Teaching August 2023 / First Assessment May 2025',
  levels: ['SL', 'HL'],
  papers: IB_PHYSICS_PAPERS,
  conventions: IB_PHYSICS_CONVENTIONS,
  topics: IB_PHYSICS_TOPICS,
};
