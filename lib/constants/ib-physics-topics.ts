/**
 * IB Physics topic constants and mappings
 */

import { IBPhysicsSubtopic } from '../types/question-generation';

// Topic display names for UI - All 28 official IB Physics subtopics
export const TOPIC_DISPLAY_NAMES: Record<IBPhysicsSubtopic, string> = {
    // Theme A: Space, time and motion
    [IBPhysicsSubtopic.KINEMATICS]: 'Kinematics',
    [IBPhysicsSubtopic.FORCES_MOMENTUM]: 'Forces and Momentum',
    [IBPhysicsSubtopic.WORK_ENERGY_POWER]: 'Work, Energy and Power',
    [IBPhysicsSubtopic.RIGID_BODY_MECHANICS]: 'Rigid Body Mechanics (HL)',
    [IBPhysicsSubtopic.GALILEAN_SPECIAL_RELATIVITY]: 'Galilean and Special Relativity (HL)',

    // Theme B: The particulate nature of matter
    [IBPhysicsSubtopic.THERMAL_ENERGY_TRANSFERS]: 'Thermal Energy Transfers',
    [IBPhysicsSubtopic.GREENHOUSE_EFFECT]: 'Greenhouse Effect',
    [IBPhysicsSubtopic.GAS_LAWS]: 'Gas Laws',
    [IBPhysicsSubtopic.CURRENT_CIRCUITS]: 'Current and Circuits',
    [IBPhysicsSubtopic.THERMODYNAMICS]: 'Thermodynamics (HL)',

    // Theme C: Wave behaviour
    [IBPhysicsSubtopic.SIMPLE_HARMONIC_MOTION]: 'Simple Harmonic Motion',
    [IBPhysicsSubtopic.WAVE_MODEL]: 'Wave Model',
    [IBPhysicsSubtopic.WAVE_PHENOMENA]: 'Wave Phenomena',
    [IBPhysicsSubtopic.STANDING_WAVES_RESONANCE]: 'Standing Waves and Resonance',
    [IBPhysicsSubtopic.DOPPLER_EFFECT]: 'Doppler Effect',

    // Theme D: Fields
    [IBPhysicsSubtopic.GRAVITATIONAL_FIELDS]: 'Gravitational Fields',
    [IBPhysicsSubtopic.ELECTRIC_MAGNETIC_FIELDS]: 'Electric and Magnetic Fields',
    [IBPhysicsSubtopic.MOTION_ELECTROMAGNETIC_FIELDS]: 'Motion in Electromagnetic Fields',
    [IBPhysicsSubtopic.INDUCTION]: 'Induction (HL)',

    // Theme E: Nuclear and quantum physics
    [IBPhysicsSubtopic.STRUCTURE_ATOM]: 'Structure of the Atom',
    [IBPhysicsSubtopic.RADIOACTIVE_DECAY]: 'Radioactive Decay',
    [IBPhysicsSubtopic.FISSION]: 'Fission',
    [IBPhysicsSubtopic.FUSION_STARS]: 'Fusion and Stars',
    [IBPhysicsSubtopic.QUANTUM_PHYSICS]: 'Quantum Physics (HL)',

    // Additional Option Topics (to reach 28 total)
    [IBPhysicsSubtopic.RELATIVITY]: 'Relativity (Option A)',
    [IBPhysicsSubtopic.ENGINEERING_PHYSICS]: 'Engineering Physics (Option B)',
    [IBPhysicsSubtopic.IMAGING]: 'Imaging (Option C)',
    [IBPhysicsSubtopic.ASTROPHYSICS]: 'Astrophysics (Option D)',
    [IBPhysicsSubtopic.PARTICLE_PHYSICS]: 'Particle Physics (Option E)'
};

// Topic categories organized by themes - All 28 official IB Physics subtopics
export const TOPIC_CATEGORIES = {
    THEME_A_SPACE_TIME_MOTION: [
        IBPhysicsSubtopic.KINEMATICS,
        IBPhysicsSubtopic.FORCES_MOMENTUM,
        IBPhysicsSubtopic.WORK_ENERGY_POWER,
        IBPhysicsSubtopic.RIGID_BODY_MECHANICS, // HL only
        IBPhysicsSubtopic.GALILEAN_SPECIAL_RELATIVITY // HL only
    ],
    THEME_B_PARTICULATE_MATTER: [
        IBPhysicsSubtopic.THERMAL_ENERGY_TRANSFERS,
        IBPhysicsSubtopic.GREENHOUSE_EFFECT,
        IBPhysicsSubtopic.GAS_LAWS,
        IBPhysicsSubtopic.CURRENT_CIRCUITS,
        IBPhysicsSubtopic.THERMODYNAMICS // HL only
    ],
    THEME_C_WAVE_BEHAVIOUR: [
        IBPhysicsSubtopic.SIMPLE_HARMONIC_MOTION,
        IBPhysicsSubtopic.WAVE_MODEL,
        IBPhysicsSubtopic.WAVE_PHENOMENA,
        IBPhysicsSubtopic.STANDING_WAVES_RESONANCE,
        IBPhysicsSubtopic.DOPPLER_EFFECT
    ],
    THEME_D_FIELDS: [
        IBPhysicsSubtopic.GRAVITATIONAL_FIELDS,
        IBPhysicsSubtopic.ELECTRIC_MAGNETIC_FIELDS,
        IBPhysicsSubtopic.MOTION_ELECTROMAGNETIC_FIELDS,
        IBPhysicsSubtopic.INDUCTION // HL only
    ],
    THEME_E_NUCLEAR_QUANTUM: [
        IBPhysicsSubtopic.STRUCTURE_ATOM,
        IBPhysicsSubtopic.RADIOACTIVE_DECAY,
        IBPhysicsSubtopic.FISSION,
        IBPhysicsSubtopic.FUSION_STARS,
        IBPhysicsSubtopic.QUANTUM_PHYSICS // HL only
    ],
    OPTION_TOPICS: [
        IBPhysicsSubtopic.RELATIVITY, // Option A
        IBPhysicsSubtopic.ENGINEERING_PHYSICS, // Option B
        IBPhysicsSubtopic.IMAGING, // Option C
        IBPhysicsSubtopic.ASTROPHYSICS, // Option D
        IBPhysicsSubtopic.PARTICLE_PHYSICS // Option E
    ]
} as const;

// Helper to get theme name
export const THEME_NAMES = {
    THEME_A_SPACE_TIME_MOTION: 'Theme A: Space, time and motion',
    THEME_B_PARTICULATE_MATTER: 'Theme B: The particulate nature of matter',
    THEME_C_WAVE_BEHAVIOUR: 'Theme C: Wave behaviour',
    THEME_D_FIELDS: 'Theme D: Fields',
    THEME_E_NUCLEAR_QUANTUM: 'Theme E: Nuclear and quantum physics',
    OPTION_TOPICS: 'Option Topics'
} as const;

// Topic-specific prompt contexts for better question generation
export const TOPIC_CONTEXTS: Record<IBPhysicsSubtopic, string> = {
    // Theme A: Space, time and motion
    [IBPhysicsSubtopic.KINEMATICS]: 'Focus on displacement, velocity, acceleration, equations of motion, and graphical analysis of motion.',
    [IBPhysicsSubtopic.FORCES_MOMENTUM]: 'Include Newton\'s laws, force analysis, momentum conservation, impulse, and collision problems.',
    [IBPhysicsSubtopic.WORK_ENERGY_POWER]: 'Cover work done by forces, kinetic and potential energy, conservation of energy, and power calculations.',
    [IBPhysicsSubtopic.RIGID_BODY_MECHANICS]: 'Advanced mechanics including rotational motion, torque, angular momentum, and moment of inertia.',
    [IBPhysicsSubtopic.GALILEAN_SPECIAL_RELATIVITY]: 'Galilean transformations, special relativity principles, time dilation, and length contraction.',

    // Theme B: The particulate nature of matter
    [IBPhysicsSubtopic.THERMAL_ENERGY_TRANSFERS]: 'Heat transfer mechanisms, thermal conductivity, specific heat capacity, and phase changes.',
    [IBPhysicsSubtopic.GREENHOUSE_EFFECT]: 'Radiation balance, greenhouse gases, albedo, and climate change physics.',
    [IBPhysicsSubtopic.GAS_LAWS]: 'Ideal gas law, kinetic theory, pressure-volume relationships, and gas behavior.',
    [IBPhysicsSubtopic.CURRENT_CIRCUITS]: 'Electric current, resistance, Ohm\'s law, circuit analysis, and electrical power.',
    [IBPhysicsSubtopic.THERMODYNAMICS]: 'Laws of thermodynamics, heat engines, entropy, and thermodynamic cycles.',

    // Theme C: Wave behaviour
    [IBPhysicsSubtopic.SIMPLE_HARMONIC_MOTION]: 'Oscillatory motion, period, frequency, amplitude, and energy in SHM.',
    [IBPhysicsSubtopic.WAVE_MODEL]: 'Wave properties, wave equation, wavelength, frequency, and wave speed.',
    [IBPhysicsSubtopic.WAVE_PHENOMENA]: 'Reflection, refraction, diffraction, interference, and polarization of waves.',
    [IBPhysicsSubtopic.STANDING_WAVES_RESONANCE]: 'Stationary waves, nodes, antinodes, resonance, and wave superposition.',
    [IBPhysicsSubtopic.DOPPLER_EFFECT]: 'Frequency shifts due to relative motion between source and observer.',

    // Theme D: Fields
    [IBPhysicsSubtopic.GRAVITATIONAL_FIELDS]: 'Gravitational field strength, potential, orbital motion, and Kepler\'s laws.',
    [IBPhysicsSubtopic.ELECTRIC_MAGNETIC_FIELDS]: 'Electric field strength, potential, magnetic field effects, and field interactions.',
    [IBPhysicsSubtopic.MOTION_ELECTROMAGNETIC_FIELDS]: 'Charged particle motion in electric and magnetic fields, and electromagnetic forces.',
    [IBPhysicsSubtopic.INDUCTION]: 'Electromagnetic induction, Faraday\'s law, Lenz\'s law, and induced EMF.',

    // Theme E: Nuclear and quantum physics
    [IBPhysicsSubtopic.STRUCTURE_ATOM]: 'Atomic models, electron energy levels, emission and absorption spectra.',
    [IBPhysicsSubtopic.RADIOACTIVE_DECAY]: 'Radioactive decay processes, half-life, decay constants, and nuclear stability.',
    [IBPhysicsSubtopic.FISSION]: 'Nuclear fission process, chain reactions, and fission energy calculations.',
    [IBPhysicsSubtopic.FUSION_STARS]: 'Nuclear fusion, stellar nucleosynthesis, and energy production in stars.',
    [IBPhysicsSubtopic.QUANTUM_PHYSICS]: 'Quantum mechanics principles, wave-particle duality, and quantum phenomena.',

    // Option Topics
    [IBPhysicsSubtopic.RELATIVITY]: 'Special and general relativity, spacetime, relativistic effects, and cosmological applications.',
    [IBPhysicsSubtopic.ENGINEERING_PHYSICS]: 'Applied physics in engineering contexts, materials science, and technological applications.',
    [IBPhysicsSubtopic.IMAGING]: 'Medical and scientific imaging techniques, optics, and image formation principles.',
    [IBPhysicsSubtopic.ASTROPHYSICS]: 'Stellar physics, cosmology, galactic structures, and astronomical phenomena.',
    [IBPhysicsSubtopic.PARTICLE_PHYSICS]: 'Fundamental particles, particle interactions, accelerators, and the Standard Model.'
};

// Default configuration values
export const GENERATION_CONFIG = {
    DEFAULT_DIFFICULTY: 'standard' as const,
    DEFAULT_TYPE: 'multiple-choice' as const,
    MAX_RETRY_ATTEMPTS: 3,
    GENERATION_TIMEOUT_MS: 30000,
    REFINEMENT_TIMEOUT_MS: 15000
} as const;