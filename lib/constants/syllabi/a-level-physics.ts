/**
 * UK GCE AS & A-Level Physics Syllabus Catalogue
 * Baseline: UK Department for Education (DfE) GCE AS and A-Level Physics Subject Content
 * Primary Reference Specification: AQA GCE Physics (7407 AS / 7408 A-Level)
 * Cross-Board Overlap Annotated: OCR Physics A (H156 / H556) & Cambridge International (CIE 9702)
 *
 * Key structural facts verified against official specifications:
 * - Sections 1-5 (3.1-3.5) form the AS / Year 12 core ('Y12', also assessed across full A-Level 'Y13').
 * - Sections 6-8 (3.6-3.8) form the Year 13 / full A-Level core ('Y13' only).
 * - Sections 9-13 (3.9-3.13) are Year 13 AQA optional modules (students sit one in Paper 3 Section B);
 *   note that Astrophysics (3.9) and Medical Physics (3.10) are compulsory core in OCR Physics A (H556).
 */

import {
  AssessmentPaperSpec,
  SyllabusConventionsSpec,
  SyllabusSpecificationCatalogue,
  SyllabusTopicSpec,
} from '@/lib/constants/syllabi/types';

export const ALEVEL_PHYSICS_PAPERS: AssessmentPaperSpec[] = [
  {
    paperId: 'alevel-as-paper-1',
    title: 'AS Paper 1 (7407/1): Core Year 12 Structured Questions',
    levels: ['Y12'],
    formats: ['structured'],
    durationMinutes: 90,
    maxMarks: 70,
    weightingPercent: 50,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Assesses Sections 1-5 (3.1-3.5) via short and long structured questions (70 marks). Standalone AS qualification.',
  },
  {
    paperId: 'alevel-as-paper-2',
    title: 'AS Paper 2 (7407/2): Practical Skills, Data Analysis & Year 12 MCQs',
    levels: ['Y12'],
    formats: ['structured', 'mcq'],
    durationMinutes: 90,
    maxMarks: 70,
    weightingPercent: 50,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Section A: 20 marks practical/data analysis; Section B: 20 marks synoptic structured; Section C: 30 multiple-choice questions (1 mark each) across Sections 1-5.',
  },
  {
    paperId: 'alevel-a2-paper-1',
    title: 'A-Level Paper 1 (7408/1): Sections 1-5 and 6.1 (Periodic Motion)',
    levels: ['Y13'],
    formats: ['structured', 'mcq'],
    durationMinutes: 120,
    maxMarks: 85,
    weightingPercent: 34,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      '60 marks of short and long structured questions plus 25 multiple-choice questions (1 mark each, 4 options A-D) covering Year 12 core + Circular Motion & SHM.',
  },
  {
    paperId: 'alevel-a2-paper-2',
    title: 'A-Level Paper 2 (7408/2): Sections 6.2 (Thermal), 7 (Fields) and 8 (Nuclear)',
    levels: ['Y13'],
    formats: ['structured', 'mcq'],
    durationMinutes: 120,
    maxMarks: 85,
    weightingPercent: 34,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      '60 marks of short and long structured questions plus 25 multiple-choice questions (1 mark each); assumes synoptic knowledge of Sections 1-6.1.',
  },
  {
    paperId: 'alevel-a2-paper-3',
    title: 'A-Level Paper 3 (7408/3): Practical Skills, Data Analysis & Option Topic',
    levels: ['Y13'],
    formats: ['structured'],
    durationMinutes: 120,
    maxMarks: 80,
    weightingPercent: 32,
    calculatorAllowed: true,
    dataBookletProvided: true,
    notes:
      'Section A (45 marks): compulsory practical experiments, uncertainty analysis, and graph linearization; Section B (35 marks): one chosen option from Sections 9-13.',
  },
];

export const ALEVEL_PHYSICS_CONVENTIONS: SyllabusConventionsSpec = {
  gravitationalAccelerationStandard:
    'g = 9.81 m s^-2 (printed in AQA 7408, OCR H556, and CIE 9702 Data and Formulae Booklets to 3 significant figures)',
  unitFormattingStyle:
    'SI negative-index notation (e.g. m s^-1, kg m^-3, N kg^-1, J K^-1, Ω m); eV, MeV, u, kW h, ly, and pc permitted where specified.',
  significantFiguresRule:
    'Minimum 40% mathematical demand (DfE Level 2+ maths including logarithms, exponentials, trigonometry, and vector geometry). Final answers quoted to the minimum significant figures of supplied data (typically 2 or 3 s.f.).',
  uncertaintyAndGraphConventions: [
    'Single reading absolute uncertainty typically ± half the smallest scale division (±1 least significant digit on digital meters); repeated readings uncertainty = ± half the range.',
    'Percentage uncertainties added for products/quotients and multiplied by the power index for exponents.',
    'Logarithmic graphs (ln y vs t or lg y vs lg x) explicitly required in Year 13 for capacitor discharge, radioactive decay, and power laws (carefully distinguishing natural log ln from base-10 log).',
  ],
  signConventions: [
    'Gravitational potential V = -GM/r is always negative (zero at infinity); field strength g = -ΔV/Δr.',
    'SHM displacement in AQA 7408 Data Booklet uses cosine phase convention x = A cos(ωt) and v = ±ω sqrt(A^2 - x^2).',
    'AQA Option 11 Engineering Physics writes First Law as Q = ΔU + W where W is work done BY the system; lens equation 1/f = 1/u + 1/v uses real-is-positive convention.',
  ],
};

export const ALEVEL_PHYSICS_TOPICS: SyllabusTopicSpec[] = [
  {
    id: 'alevel-sec1-measurements-errors',
    code: 'Section 1 (3.1)',
    title: 'Measurements and their errors',
    syllabus: 'alevel',
    levelsCovered: ['Y12', 'Y13'],
    summary:
      'SI base and derived units, metric prefixes, random and systematic measurement errors, uncertainty combination, error bars, and order-of-magnitude Fermi estimation.',
    boardOverlapNotes:
      'Near-100% overlap across DfE UK boards (OCR H556 Module 1 & Module 2, Edexcel Topic 1) and CIE 9702 Topic 1.',
    subtopics: [
      {
        id: 'alevel-3-1-si-uncertainties-estimation',
        code: '3.1.1-3.1.3',
        title: 'SI Units, Uncertainties and Order-of-Magnitude Estimation',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: [
          'si-units-dimensional-analysis',
          'uncertainties-error-propagation',
          'graphical-linearization-gradients',
        ],
        equations: [
          {
            id: 'alevel-3-1-pct-uncertainty',
            label: 'Percentage uncertainty combination for products, quotients and powers',
            latex:
              'y = \\frac{a^n b}{c^m} \\Rightarrow \\%\\Delta y = |n|\\%\\Delta a + \\%\\Delta b + |m|\\%\\Delta c',
            plainText: '%Δy = |n|*%Δa + %Δb + |m|*%Δc',
            siUnitsSummary: 'Dimensionless percentage (%)',
            inDataBooklet: false,
            level: 'Y12',
          },
        ],
        siUnits: ['m', 'kg', 's', 'A', 'K', 'mol', 'V', 'N', 'J', 'W', 'Pa'],
        quantitativeSkills: [
          'Convert between SI prefixes (femto 10^-15 to tera 10^12), eV and J, and kW h and J.',
          'Combine absolute and percentage uncertainties for Vernier calipers, micrometers, oscilloscopes, and multi-variable formulas.',
          'Determine gradient and y-intercept uncertainties using worst-acceptable lines through error bars.',
        ],
        qualitativeSkills: [
          'Distinguish precision, repeatability, reproducibility, resolution, and accuracy.',
          'Make reasoned order-of-magnitude estimates of everyday and atomic physical quantities.',
        ],
        visualFamilies: ['graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec2-particles-radiation',
    code: 'Section 2 (3.2)',
    title: 'Particles and radiation',
    syllabus: 'alevel',
    levelsCovered: ['Y12', 'Y13'],
    summary:
      'Nuclide notation, specific charge, fundamental forces, antiparticles, pair production/annihilation, hadron/lepton/quark classification, photoelectric effect, atomic excitation, and wave-particle duality.',
    boardOverlapNotes:
      'Introduced in Year 12 (AS) in AQA 7408; OCR H556 splits Quantum into Module 4 (Y12) and Quarks/Particle Physics into Module 6 (Y13); CIE 9702 places Particle Physics in AS (Topic 11) and Quantum in A2 (Topic 22). Unlike IB 2025, quark/lepton conservation laws are core in all UK A-Levels.',
    subtopics: [
      {
        id: 'alevel-3-2-1-particles-quarks',
        code: '3.2.1',
        title: 'Constituents of the Atom, Antiparticles, Hadrons, Leptons and Quarks',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: ['fundamental-particles-quarks-leptons'],
        equations: [
          {
            id: 'alevel-3-2-1-specific-charge',
            label: 'Specific charge of a particle or ion',
            latex: '\\text{specific charge} = \\frac{Q}{m}',
            plainText: 'specific charge = Q / m',
            siUnitsSummary: 'C kg^-1',
            inDataBooklet: false,
            level: 'Y12',
          },
          {
            id: 'alevel-3-2-1-photon-pair',
            label: 'Photon energy, annihilation and pair production thresholds',
            latex:
              'E = hf = \\frac{hc}{\\lambda}, \\quad E_{\\gamma,\\text{pair}} \\ge 2E_0, \\quad E_{\\gamma,\\text{annih}} = E_0',
            plainText: 'E = h*f = h*c/λ; pair threshold = 2*E_0; each annihilation photon = E_0',
            siUnitsSummary: 'E and E_0 in J or MeV',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['C kg^-1', 'J', 'eV', 'MeV', 'Hz', 'm'],
        quantitativeSkills: [
          'Calculate specific charge Q/m of nuclei and ions and photon minimum frequencies/maximum wavelengths for electron-positron pair production and annihilation.',
          'Test particle interaction equations for conservation of charge Q, baryon number B, electron/muon lepton numbers L_e, L_μ, and strangeness S (conserved in strong, ΔS = 0, ±1 in weak).',
        ],
        qualitativeSkills: [
          'Compare range and exchange bosons (gluon/pion, W+/W-, virtual photon) of strong nuclear, weak nuclear, electromagnetic, and gravitational interactions.',
          'Classify baryons (qqq, proton only stable baryon), mesons (q q-bar: pions, kaons), and leptons (e, μ, ν) using u, d, s quark compositions.',
        ],
        visualFamilies: ['quantum-nuclear'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-2-2-quantum-phenomena',
        code: '3.2.2',
        title: 'Photoelectric Effect, Atomic Energy Levels and Wave-Particle Duality',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: [
          'photoelectric-effect',
          'atomic-spectra-energy-levels',
          'wave-particle-duality-de-broglie',
        ],
        equations: [
          {
            id: 'alevel-3-2-2-photoelectric',
            label: 'Einstein photoelectric equation and stopping potential',
            latex: 'hf = \\phi + E_{\\text{k(max)}}, \\quad E_{\\text{k(max)}} = eV_{\\text{s}}',
            plainText: 'h * f = φ + E_k_max; E_k_max = e * V_s',
            siUnitsSummary: 'h*f, φ, E_k_max in J (or eV), f in Hz, V_s in V',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-2-2-levels-debroglie',
            label: 'Line spectrum transition energy and de Broglie wavelength',
            latex: 'hf = E_1 - E_2, \\quad \\lambda = \\frac{h}{p} = \\frac{h}{mv}',
            plainText: 'h * f = E_1 - E_2; λ = h / p = h / (m * v)',
            siUnitsSummary: 'E_1, E_2 in J (or eV), λ in m, m in kg, v in m s^-1',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['J', 'eV', 'V', 'Hz', 'm', 'kg m s^-1'],
        quantitativeSkills: [
          'Calculate threshold frequency f_0 = φ/h, maximum photoelectron speed, and stopping potential from photoelectric graphs.',
          'Compute all possible photon emission wavelengths from atomic excitation/de-excitation cascades and fluorescent tubes.',
          'Calculate de Broglie wavelengths for electrons/protons accelerated through potential V (mv = sqrt(2meV)).',
        ],
        qualitativeSkills: [
          'Contrast collisional electron excitation (excess kinetic energy carried away by incident electron) with resonant photon absorption (exact ΔE match required).',
          'Explain how electron diffraction ring radii change when accelerating voltage increases.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec3-waves',
    code: 'Section 3 (3.3)',
    title: 'Waves',
    syllabus: 'alevel',
    levelsCovered: ['Y12', 'Y13'],
    summary:
      'Progressive wave properties, polarisation, stationary waves on strings and pipes, two-source and double-slit interference, single-slit and grating diffraction, refraction, critical angle, and optical fibres.',
    boardOverlapNotes:
      'Full AS/Year 12 coverage in AQA 7408 (including diffraction gratings and single-slit diffraction at Y12, whereas IB places those in HL C.3). OCR H556 and CIE 9702 explicitly include Malus law I = I_0 cos^2 θ.',
    subtopics: [
      {
        id: 'alevel-3-3-1-progressive-stationary-waves',
        code: '3.3.1',
        title: 'Progressive Waves, Polarisation and Stationary Waves',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: [
          'progressive-waves-polarization',
          'standing-waves-harmonics',
        ],
        equations: [
          {
            id: 'alevel-3-3-1-wave-speed',
            label: 'Wave speed and period',
            latex: 'c = f\\lambda, \\quad T = \\frac{1}{f}',
            plainText: 'c = f * λ; T = 1 / f',
            siUnitsSummary: 'c in m s^-1, f in Hz, λ in m, T in s',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-3-1-string-first-harmonic',
            label: 'First harmonic frequency on a stretched string',
            latex: 'f = \\frac{1}{2l}\\sqrt{\\frac{T}{\\mu}}',
            plainText: 'f = (1 / (2 * l)) * sqrt(T / μ)',
            siUnitsSummary: 'f in Hz, l in m, tension T in N, mass per unit length μ in kg m^-1',
            inDataBooklet: true,
            level: 'Y12',
            notes: 'AQA 7408 Data Booklet prints this tension-mass-density string formula; IB 2025 does not.',
          },
        ],
        siUnits: ['Hz', 's', 'm', 'm s^-1', 'rad', 'kg m^-1'],
        quantitativeSkills: [
          'Compute phase difference Δφ = 2π Δd / λ (or 2π Δt / T) in radians and degrees.',
          'Solve stretched-string harmonics using f_1 = (1/2l) sqrt(T/μ) as well as open and closed pipe resonance tubes.',
        ],
        qualitativeSkills: [
          'Explain plane polarisation of transverse waves and practical applications (glare-reducing Polaroid filters, alignment of TV/microwave aerials).',
          'Compare phase and amplitude variation of particles within and across adjacent nodes of a stationary wave.',
        ],
        visualFamilies: ['waves', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-3-2-refraction-diffraction-interference',
        code: '3.3.2',
        title: 'Interference, Diffraction Gratings, Refraction and Optical Fibres',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: [
          'double-slit-interference',
          'single-slit-diffraction-gratings',
          'refraction-snell-tir',
        ],
        equations: [
          {
            id: 'alevel-3-3-2-interference-grating',
            label: 'Young double-slit fringe spacing and diffraction grating equation',
            latex: 'w = \\frac{\\lambda D}{s}, \\quad d\\sin\\theta = n\\lambda',
            plainText: 'w = λ * D / s; d * sin(θ) = n * λ',
            siUnitsSummary: 'w, λ, D, s, d in m; θ in deg/rad; n integer <= floor(d/λ)',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-3-2-snell-tir',
            label: 'Refractive index, Snell law and critical angle',
            latex:
              'n = \\frac{c}{c_{\\text{s}}}, \\quad n_1\\sin\\theta_1 = n_2\\sin\\theta_2, \\quad \\sin\\theta_{\\text{c}} = \\frac{n_2}{n_1}\\;(n_1 > n_2)',
            plainText: 'n = c / c_s; n_1 sin(θ_1) = n_2 sin(θ_2); sin(θ_c) = n_2 / n_1',
            siUnitsSummary: 'n >= 1 dimensionless, c in m s^-1, θ measured from the normal',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['m', 'rad'],
        quantitativeSkills: [
          'Calculate Young fringe spacing w = λD/s (valid for D >> s), grating line spacing d = 1/N, angular spread of spectra, and maximum observable order floor(d/λ).',
          'Compute multi-layer refraction angles and core-cladding critical angles in step-index optical fibres.',
        ],
        qualitativeSkills: [
          'Contrast monochromatic vs white-light single-slit and double-slit intensity profiles.',
          'Explain modal (multipath) and material (spectral) pulse broadening in optical fibres and how narrow cores and monochromatic lasers mitigate dispersion.',
        ],
        visualFamilies: ['waves', 'optics-shm', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec4-mechanics-materials',
    code: 'Section 4 (3.4)',
    title: 'Mechanics and materials',
    syllabus: 'alevel',
    levelsCovered: ['Y12', 'Y13'],
    summary:
      'Vectors, coplanar equilibrium, moments and couples, 1D SUVAT and projectile kinematics, Newton laws, linear momentum and impulse, mechanical energy/power, Hooke law, and Young modulus materials physics.',
    boardOverlapNotes:
      'High (~90%) overlap across AQA 7408, OCR H556 Module 3, and CIE 9702 Topics 2-6. Materials (Young modulus, tensile stress/strain, brittle/ductile/polymeric curves) is a signature UK A-Level core topic absent from IB 2025.',
    subtopics: [
      {
        id: 'alevel-3-4-1-force-energy-momentum',
        code: '3.4.1',
        title: 'Force, Moments, Kinematics, Projectile Motion, Momentum and Energy',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: [
          'vectors-equilibrium-moments',
          'kinematics-suvat',
          'motion-graphs',
          'projectile-motion',
          'newtonian-dynamics-friction',
          'linear-momentum-impulse',
          'work-energy-power',
        ],
        equations: [
          {
            id: 'alevel-3-4-1-moments',
            label: 'Moment of a force and torque of a couple',
            latex: '\\text{moment} = Fd, \\quad \\text{couple torque} = Fd_{\\perp}',
            plainText: 'moment = F * d; torque of couple = F * s',
            siUnitsSummary: 'moment in N m, F in N, perpendicular distance d in m',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-4-1-suvat',
            label: 'Equations of uniform linear acceleration (SUVAT)',
            latex:
              'v = u + at, \\quad s = \\left(\\frac{u + v}{2}\\right)t, \\quad s = ut + \\frac{1}{2}at^2, \\quad v^2 = u^2 + 2as',
            plainText:
              'v = u + at; s = 0.5*(u + v)*t; s = ut + 0.5*a*t^2; v^2 = u^2 + 2as',
            siUnitsSummary: 's in m, u and v in m s^-1, a in m s^-2, t in s',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-4-1-newton-impulse',
            label: 'Newton second law and impulse-momentum theorem',
            latex: 'F = ma = \\frac{\\Delta(mv)}{\\Delta t}, \\quad F\\Delta t = \\Delta(mv)',
            plainText: 'F = m * a = Δ(mv) / Δt; F * Δt = Δ(mv)',
            siUnitsSummary: 'F in N, m in kg, v in m s^-1, FΔt in N s',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-4-1-work-energy-power',
            label: 'Work, kinetic energy, gravitational PE, power and efficiency',
            latex:
              'W = Fs\\cos\\theta, \\; E_{\\text{k}} = \\frac{1}{2}mv^2, \\; \\Delta E_{\\text{p}} = mg\\Delta h, \\; P = \\frac{\\Delta W}{\\Delta t} = Fv',
            plainText:
              'W = F*s*cos(θ); E_k = 0.5*m*v^2; ΔE_p = m*g*Δh; P = ΔW/Δt = F*v',
            siUnitsSummary: 'W, E in J; P in W; g = 9.81 m s^-2',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['N', 'N m', 'm', 'm s^-1', 'm s^-2', 'N s', 'J', 'W'],
        quantitativeSkills: [
          'Resolve coplanar forces, close vector triangles, and apply the principle of moments to multi-support beams and tipping bodies.',
          'Solve 1D SUVAT, non-uniform motion graphs (tangent gradients & area integration), and 2D projectiles launched horizontally or at an angle.',
          'Analyse connected bodies, lifts, water-jet/conveyor-belt mass-flow forces (F = v Δm/Δt), and elastic/inelastic collisions.',
        ],
        qualitativeSkills: [
          'Explain terminal speed evolution on v-t and a-t graphs for skydivers and falling spheres, and vehicle crumple-zone safety via F = Δp/Δt.',
        ],
        visualFamilies: ['mechanics', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-4-2-materials-young-modulus',
        code: '3.4.2',
        title: 'Bulk Properties of Solids, Hooke Law and the Young Modulus',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
        canonicalConcepts: ['elasticity-young-modulus'],
        equations: [
          {
            id: 'alevel-3-4-2-hooke-strain-energy',
            label: 'Density, Hooke law and elastic strain energy',
            latex:
              '\\rho = \\frac{m}{V}, \\quad F = k\\Delta L, \\quad E_{\\text{strain}} = \\frac{1}{2}F\\Delta L = \\frac{1}{2}k(\\Delta L)^2',
            plainText: 'ρ = m / V; F = k * ΔL; E_strain = 0.5 * F * ΔL = 0.5 * k * (ΔL)^2',
            siUnitsSummary: 'ρ in kg m^-3, F in N, k in N m^-1, ΔL in m, E_strain in J',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-4-2-young-modulus',
            label: 'Tensile stress, tensile strain and Young modulus',
            latex:
              '\\sigma = \\frac{F}{A}, \\quad \\varepsilon = \\frac{\\Delta L}{L}, \\quad E = \\frac{\\sigma}{\\varepsilon} = \\frac{FL}{A\\Delta L}',
            plainText: 'σ = F / A; ε = ΔL / L; E = σ / ε = (F * L) / (A * ΔL)',
            siUnitsSummary: 'σ and E in Pa (N m^-2); ε dimensionless',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['kg m^-3', 'N m^-1', 'Pa', 'N m^-2', 'J', 'J m^-3'],
        quantitativeSkills: [
          'Calculate composite series/parallel spring constants, wire Young modulus, elastic strain energy (area under F-ΔL graph), and strain energy per unit volume (area under σ-ε graph = 0.5 σ ε).',
        ],
        qualitativeSkills: [
          'Identify limit of proportionality, elastic limit, yield point, ultimate tensile stress, and breaking stress on σ-ε graphs for brittle (glass), ductile (copper/steel), and polymeric (rubber hysteresis) materials.',
        ],
        visualFamilies: ['graphs', 'mechanics'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec5-electricity',
    code: 'Section 5 (3.5)',
    title: 'Electricity',
    syllabus: 'alevel',
    levelsCovered: ['Y12', 'Y13'],
    summary:
      'Charge, current, potential difference, non-ohmic I-V characteristics, resistivity and superconductivity, DC circuits and Kirchhoff laws, potential dividers, and cell emf with internal resistance.',
    boardOverlapNotes:
      'Very high (~95%) overlap across AQA 7408, OCR H556 Module 4, CIE 9702 Topics 9-10, IB B.5, and NCUK IFY Electricity. OCR H556 also includes drift speed I = nAvq.',
    subtopics: [
      {
        id: 'alevel-3-5-1-current-electricity',
        code: '3.5.1',
        title: 'Current Electricity, Resistivity, DC Networks, Potential Dividers & Internal Resistance',
        syllabus: 'alevel',
        level: 'Y12',
        levelsCovered: ['Y12', 'Y13'],
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
            id: 'alevel-3-5-1-vi-resistivity',
            label: 'Current, p.d., resistance, resistivity and electrical power',
            latex:
              'I = \\frac{\\Delta Q}{\\Delta t}, \\; V = \\frac{W}{Q}, \\; R = \\frac{V}{I}, \\; \\rho = \\frac{RA}{L}, \\; P = VI = I^2R = \\frac{V^2}{R}',
            plainText: 'I = ΔQ/Δt; V = W/Q; R = V/I; ρ = R*A/L; P = V*I = I^2*R = V^2/R',
            siUnitsSummary: 'I in A, Q in C, V in V, R in Ω, ρ in Ω m, P in W',
            inDataBooklet: true,
            level: 'Y12',
          },
          {
            id: 'alevel-3-5-1-networks-emf',
            label: 'Series/parallel resistors, cell internal resistance and potential divider',
            latex:
              'R_{\\text{T}} = \\sum R_i, \\; \\frac{1}{R_{\\text{T}}} = \\sum \\frac{1}{R_i}, \\; \\varepsilon = I(R + r), \\; V_{\\text{out}} = \\frac{R_2}{R_1 + R_2}V_{\\text{in}}',
            plainText:
              'R_T = ΣR_i; 1/R_T = Σ(1/R_i); ε = I*(R + r); V_out = R_2/(R_1 + R_2) * V_in',
            siUnitsSummary: 'ε, V in V; R, r in Ω; I in A',
            inDataBooklet: true,
            level: 'Y12',
          },
        ],
        siUnits: ['A', 'C', 'V', 'Ω', 'Ω m', 'W', 'J'],
        quantitativeSkills: [
          'Solve multi-branch DC resistor networks using Kirchhoff conservation of charge and energy.',
          'Design potential-divider circuits incorporating NTC thermistors and LDRs to trigger voltage thresholds.',
          'Determine emf ε, internal resistance r, short-circuit current ε/r, and lost volts Ir from experimental data.',
        ],
        qualitativeSkills: [
          'Sketch and explain ohmic resistor, filament lamp, and forward/reverse-biased semiconductor diode I-V curves.',
          'Define critical temperature T_c of a superconductor and state applications (MRI high-field magnets, lossless power cables).',
        ],
        visualFamilies: ['circuits', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec6-further-mechanics-thermal',
    code: 'Section 6 (3.6)',
    title: 'Further mechanics and thermal physics (A-Level / Year 13 only)',
    syllabus: 'alevel',
    levelsCovered: ['Y13'],
    summary:
      'Uniform circular motion, simple harmonic motion (kinematics, energy, mass-spring, pendulum), damped/forced oscillations and resonance, calorimetry, ideal gas equation of state, and molecular kinetic theory.',
    boardOverlapNotes:
      'Assessed across Paper 1 (3.6.1 Periodic motion) and Paper 2 (3.6.2 Thermal physics) in AQA 7408; matches OCR H556 Module 5 and CIE 9702 A2 Topics 12, 15, 16, 17.',
    subtopics: [
      {
        id: 'alevel-3-6-1-periodic-motion-shm',
        code: '3.6.1',
        title: 'Circular Motion, Simple Harmonic Motion, Resonance and Damping',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'uniform-circular-motion',
          'simple-harmonic-motion',
          'forced-oscillations-resonance',
        ],
        equations: [
          {
            id: 'alevel-3-6-1-circular',
            label: 'Circular motion speed, centripetal acceleration and force',
            latex:
              'v = \\omega r, \\quad a = \\frac{v^2}{r} = \\omega^2 r, \\quad F = \\frac{mv^2}{r} = m\\omega^2 r',
            plainText: 'v = ω * r; a = v^2 / r = ω^2 * r; F = m * v^2 / r = m * ω^2 * r',
            siUnitsSummary: 'v in m s^-1, ω in rad s^-1, r in m, a in m s^-2, F in N',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-6-1-shm',
            label: 'SHM equations, maximum speed/acceleration and oscillator periods',
            latex:
              'a = -\\omega^2 x, \\; x = A\\cos(\\omega t), \\; v = \\pm\\omega\\sqrt{A^2 - x^2}, \\; T = 2\\pi\\sqrt{\\frac{m}{k}}, \\; T = 2\\pi\\sqrt{\\frac{l}{g}}',
            plainText:
              'a = -ω^2 x; x = A cos(ωt); v = ±ω sqrt(A^2 - x^2); T = 2π sqrt(m/k); T = 2π sqrt(l/g)',
            siUnitsSummary: 'x, A, l in m; ω in rad s^-1; T in s; m in kg; k in N m^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['rad', 'rad s^-1', 'Hz', 's', 'm', 'J'],
        quantitativeSkills: [
          'Solve vertical circular motion (bridges, loops, conical pendulums), banked tracks, and SHM displacement/velocity/acceleration/energy calculations.',
          'Extract k or g by linearizing T^2 against m or l.',
        ],
        qualitativeSkills: [
          'Sketch free damped oscillation envelopes (light, critical, heavy damping) and driven resonance amplitude-frequency curves as damping increases.',
        ],
        visualFamilies: ['optics-shm', 'mechanics', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-6-2-thermal-physics',
        code: '3.6.2',
        title: 'Thermal Energy Transfer, Ideal Gases and Kinetic Theory',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'specific-heat-latent-heat',
          'ideal-gas-kinetic-theory',
          'ideal-gas-pv-cycles',
        ],
        equations: [
          {
            id: 'alevel-3-6-2-calorimetry',
            label: 'Specific heat capacity and specific latent heat',
            latex: 'Q = mc\\Delta\\theta, \\quad Q = ml',
            plainText: 'Q = m * c * Δθ; Q = m * l',
            siUnitsSummary: 'Q in J, m in kg, c in J kg^-1 K^-1, l in J kg^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-6-2-ideal-gas-kinetic',
            label: 'Ideal gas equation, kinetic theory pressure and molecular kinetic energy',
            latex:
              'pV = nRT = NkT, \\quad pV = \\frac{1}{3}Nm(c_{\\text{rms}})^2, \\quad E_{\\text{k,mean}} = \\frac{3}{2}kT = \\frac{3RT}{2N_{\\text{A}}}',
            plainText:
              'pV = nRT = NkT; pV = (1/3) N m (c_rms)^2; E_k_mean = (3/2) k T = 3RT / (2 N_A)',
            siUnitsSummary: 'p in Pa, V in m^3, n in mol, T in K, c_rms in m s^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['K', 'J', 'J kg^-1 K^-1', 'J kg^-1', 'Pa', 'm^3', 'mol'],
        quantitativeSkills: [
          'Solve continuous-flow electrical calorimetry (eliminating heat loss to surroundings) and mixing/phase-change problems.',
          'Derive pV = (1/3)Nm(c_rms)^2 from elastic wall momentum change and calculate rms molecular speeds and internal energy.',
        ],
        qualitativeSkills: [
          'Explain Brownian motion as direct evidence for random molecular motion and list the assumptions of the kinetic theory of ideal gases.',
        ],
        visualFamilies: ['thermal', 'graphs'],
        questionFormats: ['mcq', 'structured'],
        boardNotes:
          'Core AQA 3.6.2 covers ideal gas state equations, work W = pΔV at constant pressure, and kinetic theory; full adiabatic/engine cycles and entropy sit in Option 11 (Engineering Physics), unlike IB HL B.4 where they are compulsory HL.',
      },
    ],
  },
  {
    id: 'alevel-sec7-fields-consequences',
    code: 'Section 7 (3.7)',
    title: 'Fields and their consequences (A-Level / Year 13 only)',
    syllabus: 'alevel',
    levelsCovered: ['Y13'],
    summary:
      'Gravitational fields and orbits, radial and uniform electric fields, capacitance and RC exponential circuits, magnetic forces on currents/charges, electromagnetic induction, AC RMS, and transformers.',
    boardOverlapNotes:
      'Compulsory across all UK/international A-Levels (AQA 7408 Section 7, OCR H556 Module 6, CIE 9702 A2 Topics 13, 18, 19, 20, 21). Capacitance & RC decay (3.7.4) is core A-Level and NCUK IFY, whereas IB 2025 removed capacitors.',
    subtopics: [
      {
        id: 'alevel-3-7-2-gravitational-fields',
        code: '3.7.1-3.7.2',
        title: 'Gravitational Fields, Potential and Satellite Orbits',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'gravitational-force-field',
          'gravitational-potential-orbits',
        ],
        equations: [
          {
            id: 'alevel-3-7-2-grav',
            label: 'Newton gravitation, field strength, potential and potential gradient',
            latex:
              'F = \\frac{Gm_1 m_2}{r^2}, \\quad g = \\frac{F}{m} = \\frac{GM}{r^2}, \\quad V = -\\frac{GM}{r}, \\quad \\Delta W = m\\Delta V, \\quad g = -\\frac{\\Delta V}{\\Delta r}',
            plainText:
              'F = G m_1 m_2 / r^2; g = GM / r^2; V = -GM / r; ΔW = m ΔV; g = -ΔV / Δr',
            siUnitsSummary: 'F in N, g in N kg^-1, V in J kg^-1, r in m',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['N', 'N kg^-1', 'J kg^-1', 'J', 'm', 's'],
        quantitativeSkills: [
          'Derive Kepler third law T^2 = (4π^2 / GM) r^3, geostationary orbit altitude, escape speed sqrt(2GM/R), and kinetic/potential/total orbital energy.',
          'Compute work done from gravitational potential differences and area under g-r graphs.',
        ],
        qualitativeSkills: [
          'Compare geostationary vs low-Earth polar orbits (period, altitude, coverage, applications) and compare inverse-square gravitational vs electrostatic fields.',
        ],
        visualFamilies: ['grav-astro', 'fields', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-7-3-electric-fields',
        code: '3.7.3',
        title: 'Electric Fields, Coulomb Law and Electric Potential',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'electrostatic-coulomb-uniform-fields',
          'electric-potential-equipotentials',
        ],
        equations: [
          {
            id: 'alevel-3-7-3-electric',
            label: 'Coulomb law, radial and uniform electric field, and electric potential',
            latex:
              'F = \\frac{1}{4\\pi\\varepsilon_0}\\frac{Q_1 Q_2}{r^2}, \\quad E = \\frac{F}{Q} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{Q}{r^2}, \\quad E = \\frac{V}{d}, \\quad V = \\frac{1}{4\\pi\\varepsilon_0}\\frac{Q}{r}',
            plainText:
              'F = Q_1 Q_2 / (4π ε_0 r^2); E = Q / (4π ε_0 r^2); E = V / d; V = Q / (4π ε_0 r)',
            siUnitsSummary: 'F in N, E in N C^-1 or V m^-1, V in V (J C^-1)',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['N C^-1', 'V m^-1', 'V', 'C', 'F m^-1'],
        quantitativeSkills: [
          'Calculate zero-field and zero-potential points between collinear charges, vector field resultants, and parabolic trajectory deflection of charged particles between parallel plates.',
        ],
        qualitativeSkills: [
          'Sketch equipotential surfaces orthogonal to electric field lines and explain why zero work is done moving a charge along an equipotential.',
        ],
        visualFamilies: ['fields', 'graphs', 'mechanics'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-7-4-capacitance',
        code: '3.7.4',
        title: 'Capacitance, Dielectrics, Stored Energy and RC Exponential Circuits',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: ['capacitor-networks-energy', 'capacitor-rc-decay'],
        equations: [
          {
            id: 'alevel-3-7-4-cap-energy',
            label: 'Capacitance, dielectric parallel-plate geometry and stored energy',
            latex:
              'C = \\frac{Q}{V}, \\quad C = \\frac{A\\varepsilon_0\\varepsilon_{\\text{r}}}{d}, \\quad E = \\frac{1}{2}QV = \\frac{1}{2}CV^2 = \\frac{1}{2}\\frac{Q^2}{C}',
            plainText:
              'C = Q / V; C = A * ε_0 * ε_r / d; E = 0.5 Q V = 0.5 C V^2 = 0.5 Q^2 / C',
            siUnitsSummary: 'C in F, Q in C, V in V, E in J, ε_r dimensionless',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-7-4-rc-transients',
            label: 'RC time constant, charging and discharging equations',
            latex:
              '\\tau = RC, \\; T_{1/2} = 0.693\\,RC, \\; Q = Q_0 e^{-t/RC}\\;(\\text{discharge}), \\; Q = Q_0(1 - e^{-t/RC})\\;(\\text{charge})',
            plainText:
              'τ = R*C; T_1/2 = ln(2)*R*C; Q = Q_0 exp(-t/RC); Q_charge = Q_0 (1 - exp(-t/RC))',
            siUnitsSummary: 'τ, t in s; R in Ω; C in F',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['F', 'μF', 'C', 'V', 'J', 's'],
        quantitativeSkills: [
          'Calculate capacitor energy changes (including constant-Q isolated plate separation vs constant-V battery-connected dielectric insertion; OCR/CIE capacitor series/parallel networks).',
          'Solve exponential RC charging and discharging for Q(t), V(t), and I(t) and extract τ = RC from ln V vs t gradients.',
        ],
        qualitativeSkills: [
          'Explain polar dielectric molecule alignment opposing the applied electric field to increase capacitance by factor ε_r.',
          'Explain why charging a capacitor from a constant-emf source stores 50% of source energy QV while dissipating 50% in circuit resistance.',
        ],
        visualFamilies: ['em-induction', 'circuits', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
      {
        id: 'alevel-3-7-5-magnetic-fields-induction-ac',
        code: '3.7.5',
        title: 'Magnetic Fields, Electromagnetic Induction, AC RMS and Transformers',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'magnetic-force-charges-currents',
          'electromagnetic-induction-faraday-lenz',
          'ac-generators-transformers',
        ],
        equations: [
          {
            id: 'alevel-3-7-5-mag-force',
            label: 'Motor force, Lorentz force and cyclotron radius',
            latex: 'F = BIl, \\quad F = BQv, \\quad r = \\frac{mv}{BQ}',
            plainText: 'F = B * I * l; F = B * Q * v; r = m * v / (B * Q)',
            siUnitsSummary: 'F in N, B in T, I in A, l and r in m, Q in C, v in m s^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-7-5-induction',
            label: 'Magnetic flux linkage, Faraday-Lenz law and rotating-coil emf',
            latex:
              '\\Phi = BA, \\; N\\Phi = BAN\\cos\\theta, \\; \\varepsilon = N\\frac{\\Delta\\Phi}{\\Delta t}, \\; \\varepsilon = BAN\\omega\\sin(\\omega t)',
            plainText:
              'Φ = B*A; NΦ = B*A*N*cos(θ); ε = N * ΔΦ / Δt; ε = B*A*N*ω*sin(ωt)',
            siUnitsSummary: 'Φ in Wb, NΦ in Wb turns, ε in V, ω in rad s^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-7-5-ac-transformers',
            label: 'Sinusoidal RMS relations, transformer turns ratio and efficiency',
            latex:
              'I_{\\text{rms}} = \\frac{I_0}{\\sqrt{2}}, \\; V_{\\text{rms}} = \\frac{V_0}{\\sqrt{2}}, \\; \\frac{N_{\\text{s}}}{N_{\\text{p}}} = \\frac{V_{\\text{s}}}{V_{\\text{p}}}, \\; \\eta = \\frac{I_{\\text{s}}V_{\\text{s}}}{I_{\\text{p}}V_{\\text{p}}}',
            plainText:
              'I_rms = I_0 / sqrt(2); V_rms = V_0 / sqrt(2); N_s / N_p = V_s / V_p; η = (I_s V_s) / (I_p V_p)',
            siUnitsSummary: 'I in A, V in V, N turns dimensionless, η dimensionless',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['T', 'Wb', 'V', 'A', 'W'],
        quantitativeSkills: [
          'Analyse particle cyclotrons, mass spectrometers, search coils, rotating AC dynamos, oscilloscope time-base/y-gain traces, and high-voltage grid I^2R transmission losses.',
        ],
        qualitativeSkills: [
          'Explain eddy-current, hysteresis, flux-leakage, and copper I^2R losses in transformers and how laminated soft-iron cores and thick low-resistivity windings minimize them.',
        ],
        visualFamilies: ['em-induction', 'fields', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-sec8-nuclear-physics',
    code: 'Section 8 (3.8)',
    title: 'Nuclear physics (A-Level / Year 13 only)',
    syllabus: 'alevel',
    levelsCovered: ['Y13'],
    summary:
      'Rutherford scattering and nuclear radius (electron diffraction vs closest approach), α/β/γ radiation and inverse-square γ intensity, exponential decay laws, N-Z stability, binding energy, fission reactors, and fusion.',
    boardOverlapNotes:
      'Compulsory Year 13 core across AQA 7408, OCR H556 Module 6, and CIE 9702 Topic 23; matches IB E.1/E.3/E.4 HL depth.',
    subtopics: [
      {
        id: 'alevel-3-8-nuclear-decay-energy',
        code: '3.8.1-3.8.6',
        title: 'Nuclear Radius, Exponential Radioactive Decay, Mass Defect, Fission & Fusion',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        canonicalConcepts: [
          'rutherford-scattering-nuclear-radius',
          'radioactive-decay-half-life',
          'mass-defect-binding-energy',
          'nuclear-fission-fusion',
        ],
        equations: [
          {
            id: 'alevel-3-8-gamma-radius',
            label: 'Inverse-square gamma intensity and Fermi nuclear radius',
            latex: 'I = \\frac{k}{x^2}, \\quad R = R_0 A^{1/3}, \\quad \\sin\\theta \\approx \\frac{0.61\\lambda}{R}',
            plainText: 'I = k / x^2; R = R_0 * A^(1/3); sin(θ) ≈ 0.61 * λ / R',
            siUnitsSummary: 'I in W m^-2 or counts s^-1, R in m (R_0 ≈ 1.05-1.20 fm)',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-8-decay-binding',
            label: 'Exponential radioactive decay law, activity, half-life and mass-energy',
            latex:
              '\\frac{\\Delta N}{\\Delta t} = -\\lambda N, \\; N = N_0 e^{-\\lambda t}, \\; A = \\lambda N, \\; T_{1/2} = \\frac{\\ln 2}{\\lambda}, \\; \\Delta E = \\Delta m\\,c^2',
            plainText:
              'ΔN/Δt = -λN; N = N_0 exp(-λt); A = λN; T_1/2 = ln(2)/λ; ΔE = Δm c^2',
            siUnitsSummary: 'A in Bq, λ in s^-1, 1 u = 931.5 MeV c^-2',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['Bq', 's^-1', 'fm', 'u', 'MeV', 'J'],
        quantitativeSkills: [
          'Verify inverse-square γ attenuation corrected for background via x vs 1/sqrt(C) linear graphs.',
          'Compare upper-bound closest-approach nuclear radius (E_k = Q_1 Q_2 / 4πε_0 d) with high-energy electron diffraction first minimum.',
          'Calculate activity, molar radioactive sample mass, Q-values from mass defects and binding energy per nucleon curves, and thermal fission reactor fuel rates.',
        ],
        qualitativeSkills: [
          'Explain why high-energy electrons are superior to α particles for measuring nuclear radius (no strong-force interaction, de Broglie λ ~ fm).',
          'Interpret N-Z decay trajectories (α, β^-, β^+, electron capture) and explain moderator, control-rod, coolant, and high/intermediate/low-level waste handling.',
        ],
        visualFamilies: ['quantum-nuclear', 'graphs'],
        questionFormats: ['mcq', 'structured'],
      },
    ],
  },
  {
    id: 'alevel-options-9-13',
    code: 'Sections 9-13 (Options)',
    title: 'Year 13 Optional Modules (Astrophysics, Medical, Engineering, Turning Points, Electronics)',
    syllabus: 'alevel',
    levelsCovered: ['Y13'],
    isOption: true,
    summary:
      'Optional Paper 3 Section B specialisms in AQA 7408; several subtopics (Astrophysics, Medical Imaging, Rotational Dynamics, Special Relativity) overlap directly with OCR H556 core, CIE 9702 core, or IB HL core.',
    boardOverlapNotes:
      'Flagged with isOption: true so bank generators can target AQA Paper 3 options specifically or cross-map shared concepts (e.g. lenses, rotational mechanics, thermodynamic P-V engines, special relativity, Hubble cosmology) with IB HL and OCR/CIE core.',
    subtopics: [
      {
        id: 'alevel-3-9-astrophysics',
        code: '3.9',
        title: 'Option: Astrophysics (Telescopes, Thin Lenses, Stars & Cosmology)',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        isOption: true,
        canonicalConcepts: [
          'thin-lenses-geometric-optics',
          'stellar-radiation-hr-diagram',
          'doppler-effect',
          'cosmology-hubble-law',
        ],
        equations: [
          {
            id: 'alevel-3-9-lenses-telescopes',
            label: 'Thin-lens equation, normal-adjustment angular magnification and Rayleigh criterion',
            latex:
              '\\frac{1}{f} = \\frac{1}{u} + \\frac{1}{v}, \\quad M = \\frac{\\alpha}{\\beta} = \\frac{f_{\\text{o}}}{f_{\\text{e}}}, \\quad \\theta \\approx \\frac{\\lambda}{D}',
            plainText: '1/f = 1/u + 1/v; M = f_o / f_e; θ ≈ λ / D',
            siUnitsSummary: 'f, u, v, λ, D in m; θ in rad; M dimensionless',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-9-stars-cosmology',
            label: 'Stefan/Wien laws, distance modulus and Hubble law',
            latex:
              'P = \\sigma A T^4, \\; \\lambda_{\\max}T = 2.9 \\times 10^{-3}\\text{ m K}, \\; m - M = 5\\log_{10}\\left(\\frac{d}{10}\\right), \\; v = H_0 d',
            plainText:
              'P = σ A T^4; λ_max T = 2.9e-3 m K; m - M = 5 log10(d / 10); v = H_0 d',
            siUnitsSummary: 'd in pc (distance modulus) or Mpc (Hubble law), v in km s^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['m', 'rad', 'pc', 'Mpc', 'W', 'K', 'km s^-1 Mpc^-1'],
        quantitativeSkills: [
          'Trace rays and compute image positions/magnifications for converging lenses and refracting/Cassegrain telescopes.',
          'Compute absolute/apparent magnitudes, binary/exoplanet Doppler shifts, and Hubble age estimates.',
        ],
        qualitativeSkills: [
          'Compare chromatic and spherical aberrations in refracting vs reflecting telescopes, OBAFGKM spectral classes, HR evolution, and Big Bang CMB/helium-abundance evidence.',
        ],
        visualFamilies: ['optics-shm', 'grav-astro', 'graphs'],
        questionFormats: ['structured'],
        boardNotes:
          'Astrophysics & cosmology are compulsory core in OCR H556 Module 5, CIE 9702 Topic 25, and IB E.5; thin lenses are compulsory in Edexcel Topic 5.',
      },
      {
        id: 'alevel-3-10-medical-physics',
        code: '3.10',
        title: 'Option: Medical Physics (Eye Optics, Ultrasound & X-Ray Attenuation)',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        isOption: true,
        canonicalConcepts: ['thin-lenses-geometric-optics'],
        equations: [
          {
            id: 'alevel-3-10-eye-ultrasound-xray',
            label: 'Lens power, acoustic impedance reflection and X-ray exponential attenuation',
            latex:
              'P = \\frac{1}{f}, \\; Z = \\rho c, \\; \\frac{I_{\\text{r}}}{I_{\\text{i}}} = \\left(\\frac{Z_2 - Z_1}{Z_2 + Z_1}\\right)^2, \\; I = I_0 e^{-\\mu x}',
            plainText:
              'P = 1/f; Z = ρ*c; I_r / I_i = ((Z_2 - Z_1)/(Z_2 + Z_1))^2; I = I_0 exp(-μx)',
            siUnitsSummary: 'P in D (m^-1), Z in kg m^-2 s^-1, μ in m^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['D', 'm^-1', 'kg m^-2 s^-1', 'dB', 'W m^-2'],
        quantitativeSkills: [
          'Calculate corrective converging/diverging spectacle powers for hypermetropia/myopia, ultrasound gel impedance matching, and X-ray half-value thickness.',
        ],
        qualitativeSkills: [
          'Compare A-scan vs B-scan ultrasound, CT, gamma-camera technetium-99m, PET annihilation coincidence, and MRI non-ionising imaging.',
        ],
        visualFamilies: ['optics-shm', 'waves', 'graphs'],
        questionFormats: ['structured'],
        boardNotes: 'Medical imaging is compulsory core in OCR Physics A (H556 Module 6.5) and CIE 9702 Topic 24.',
      },
      {
        id: 'alevel-3-11-engineering-physics',
        code: '3.11',
        title: 'Option: Engineering Physics (Rotational Dynamics & Thermodynamic Cycles)',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        isOption: true,
        canonicalConcepts: [
          'rigid-body-rotational-dynamics',
          'ideal-gas-pv-cycles',
          'thermodynamics-entropy-engines',
        ],
        equations: [
          {
            id: 'alevel-3-11-rotation',
            label: 'Rotational inertia, torque, angular momentum and rotational kinetic energy',
            latex:
              'I = \\sum mr^2, \\quad T = I\\alpha, \\quad L = I\\omega, \\quad E_{\\text{k}} = \\frac{1}{2}I\\omega^2',
            plainText: 'I = Σ(m*r^2); T = I*α; L = I*ω; E_k = 0.5*I*ω^2',
            siUnitsSummary: 'I in kg m^2, T in N m, L in N m s, ω in rad s^-1',
            inDataBooklet: true,
            level: 'Y13',
          },
          {
            id: 'alevel-3-11-thermo',
            label: 'First law of thermodynamics, adiabatic process and Carnot efficiency',
            latex:
              'Q = \\Delta U + W, \\quad pV^\\gamma = \\text{constant}, \\quad \\eta_{\\max} = \\frac{T_{\\text{H}} - T_{\\text{C}}}{T_{\\text{H}}}',
            plainText: 'Q = ΔU + W; p * V^γ = constant; η_max = (T_H - T_C) / T_H',
            siUnitsSummary: 'Q, ΔU, W in J; T_H, T_C in K',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['kg m^2', 'N m', 'rad s^-1', 'rad s^-2', 'J', 'W', 'Pa', 'm^3'],
        quantitativeSkills: [
          'Solve flywheel energy storage, rolling dynamics, angular momentum conservation, and indicator P-V loops (isothermal, adiabatic, Otto/Diesel engines, heat pumps/refrigerators COP).',
        ],
        qualitativeSkills: [
          'Compare ideal vs real indicator P-V diagrams and explain why real heat engines fall below Carnot efficiency.',
        ],
        visualFamilies: ['mechanics', 'thermal', 'graphs'],
        questionFormats: ['structured'],
        boardNotes: 'Directly overlaps compulsory IB HL A.4 (Rigid body mechanics) and IB HL B.4 (Thermodynamics).',
      },
      {
        id: 'alevel-3-12-turning-points',
        code: '3.12',
        title: 'Option: Turning Points in Physics (Electron Discovery & Special Relativity)',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        isOption: true,
        canonicalConcepts: ['special-relativity-spacetime'],
        equations: [
          {
            id: 'alevel-3-12-relativity',
            label: 'Time dilation, length contraction and relativistic total energy',
            latex:
              't = \\frac{t_0}{\\sqrt{1 - v^2/c^2}}, \\quad l = l_0\\sqrt{1 - \\frac{v^2}{c^2}}, \\quad E = \\frac{m_0 c^2}{\\sqrt{1 - v^2/c^2}}',
            plainText:
              't = t_0 / sqrt(1 - v^2/c^2); l = l_0 sqrt(1 - v^2/c^2); E = m_0 c^2 / sqrt(1 - v^2/c^2)',
            siUnitsSummary: 't in s, l in m, E in J or MeV',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['C kg^-1', 's', 'm', 'J', 'MeV'],
        quantitativeSkills: [
          'Calculate Thomson crossed-field e/m, Millikan oil-drop quantized charge (6π η r v = mg), and relativistic time dilation, length contraction, and Bertozzi relativistic kinetic energy.',
        ],
        qualitativeSkills: [
          'Explain the null result of the Michelson-Morley interferometer experiment and scanning tunnelling microscope (STM) quantum tunnelling.',
        ],
        visualFamilies: ['quantum-nuclear', 'em-induction', 'graphs'],
        questionFormats: ['structured'],
        boardNotes:
          'Overlaps IB HL A.5 (Special relativity), adding relativistic mass-energy E = γ m_0 c^2 while omitting Minkowski coordinate axes.',
      },
      {
        id: 'alevel-3-13-electronics',
        code: '3.13',
        title: 'Option: Electronics (Operational Amplifiers, Timing & Digital Logic)',
        syllabus: 'alevel',
        level: 'Y13',
        levelsCovered: ['Y13'],
        isOption: true,
        canonicalConcepts: ['kirchhoff-dc-circuits', 'capacitor-rc-decay'],
        equations: [
          {
            id: 'alevel-3-13-opamp',
            label: 'Inverting and non-inverting operational amplifier closed-loop voltage gains',
            latex:
              '\\frac{V_{\\text{out}}}{V_{\\text{in}}} = -\\frac{R_{\\text{f}}}{R_{\\text{in}}}\\;(\\text{inverting}), \\quad \\frac{V_{\\text{out}}}{V_{\\text{in}}} = 1 + \\frac{R_{\\text{f}}}{R_1}\\;(\\text{non-inverting})',
            plainText:
              'V_out / V_in = -R_f / R_in (inverting); V_out / V_in = 1 + R_f / R_1 (non-inverting)',
            siUnitsSummary: 'V in V, R in Ω',
            inDataBooklet: true,
            level: 'Y13',
          },
        ],
        siUnits: ['V', 'Ω', 'Hz', 'bit s^-1'],
        quantitativeSkills: [
          'Analyse virtual-earth inverting, non-inverting, summing, and difference op-amp circuits, saturation clipping, and gain-bandwidth product.',
        ],
        qualitativeSkills: [
          'Describe MOSFET switching, combinational/sequential logic gates, and PCM analogue-to-digital sampling.',
        ],
        visualFamilies: ['circuits', 'graphs'],
        questionFormats: ['structured'],
      },
    ],
  },
];

export const ALEVEL_PHYSICS_SYLLABUS: SyllabusSpecificationCatalogue = {
  syllabus: 'alevel',
  title: 'UK GCE AS & A-Level Physics (DfE Core + AQA 7407/7408)',
  awardingBody: 'AQA (with DfE Core, OCR Physics A H556 & Cambridge CIE 9702 overlap notes)',
  specificationCode: 'AQA-7407-7408',
  specificationVersion: 'GCE Reformed Linear Specification (Current / 7408)',
  levels: ['Y12', 'Y13'],
  papers: ALEVEL_PHYSICS_PAPERS,
  conventions: ALEVEL_PHYSICS_CONVENTIONS,
  topics: ALEVEL_PHYSICS_TOPICS,
};
