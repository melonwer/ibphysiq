import {
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  CandidateQuestionInput,
} from "../types";
import {
  CIRCUITS_GENERATOR_ARCHETYPES,
  CircuitsArchetypeSpec,
  formatPhysicsQuantity as formatCircuitsPhysicsQuantity,
  generateCircuitsCandidates,
  GenerateCircuitsOptions,
} from "./circuits";
import {
  EM_INDUCTION_ARCHETYPE_CATALOGUE,
  EmInductionArchetypeDescriptor,
  generateEmInductionCandidates,
  GenerateEmInductionCandidatesOptions,
} from "./em-induction";
import {
  buildFieldsSyllabusTags,
  DEFAULT_FIELDS_BASE_SEED,
  DEFAULT_FIELDS_GENERATOR_MODEL,
  DEFAULT_FIELDS_TARGET_COUNT,
  FIELDS_GENERATOR_ARCHETYPES,
  FieldsArchetypeSpec,
  formatPhysics3sf,
  generateFieldsCandidates,
  GenerateFieldsCandidatesOptions,
} from "./fields";
import {
  generateGraphsCandidates,
  GRAPHS_ARCHETYPE_CATALOGUE,
  GraphsArchetypeDescriptor,
  GraphsGeneratorOptions,
} from "./graphs";
import {
  DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT,
  DEFAULT_GRAV_ASTRO_SEED,
  fmt3sf,
  generateGravAstroCandidates,
  GenerateGravAstroCandidatesOptions,
  GRAV_ASTRO_ARCHETYPES,
  GravAstroArchetypeDescriptor,
} from "./grav-astro";
import {
  BUILTIN_MECHANICS_SCENARIO_KINDS_USED,
  BuiltinMechanicsScenarioKind,
  formatPhysicsNumber,
  formatPhysicsQuantity as formatMechanicsPhysicsQuantity,
  generateMechanicsCandidates,
  GenerateMechanicsOptions,
  MECHANICS_ARCHETYPE_CATALOGUE,
  MECHANICS_GENERATOR_ARCHETYPES,
  MechanicsArchetypeDescriptor,
  MechanicsGeneratorArchetype,
  resolveMechanicsSyllabusTags,
} from "./mechanics";
import {
  generateOpticsShmCandidates,
  GenerateOpticsShmCandidatesOptions,
  OPTICS_SHM_FAMILY_SPECS,
  OpticsShmFamilySpec,
} from "./optics-shm";
import {
  formatPhysicsValue,
  generatePureCalculationCandidates,
  GeneratePureCalculationOptions,
  PURE_CALCULATION_ARCHETYPE_IDS,
  PURE_CALCULATION_ARCHETYPE_REGISTRY,
  PureCalculationArchetypeId,
} from "./pure-calculation";
import {
  generateQuantumNuclearCandidates,
  GenerateQuantumNuclearCandidatesOptions,
  QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST,
  QuantumNuclearArchetypeDescriptor,
} from "./quantum-nuclear";
import {
  formatThermalValue,
  generateThermalCandidates,
  THERMAL_ARCHETYPE_CATALOGUE,
  THERMAL_GENERATOR_VERSION,
  ThermalArchetypeSlug,
  ThermalGeneratorOptions,
} from "./thermal";
import {
  generateWavesCandidates,
  resolveWavesSyllabiTags,
  WAVES_ARCHETYPE_CATALOGUE,
  WAVES_TEMPLATE_ARCHETYPES,
  WavesArchetypeDescriptor,
  WavesConceptId,
  WavesGeneratorOptions,
  WavesSyllabusScopePolicy,
  WavesTemplateArchetype,
} from "./waves";

export {
  BUILTIN_MECHANICS_SCENARIO_KINDS_USED,
  buildFieldsSyllabusTags,
  CIRCUITS_GENERATOR_ARCHETYPES,
  DEFAULT_FIELDS_BASE_SEED,
  DEFAULT_FIELDS_GENERATOR_MODEL,
  DEFAULT_FIELDS_TARGET_COUNT,
  DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT,
  DEFAULT_GRAV_ASTRO_SEED,
  EM_INDUCTION_ARCHETYPE_CATALOGUE,
  FIELDS_GENERATOR_ARCHETYPES,
  fmt3sf,
  formatCircuitsPhysicsQuantity,
  formatMechanicsPhysicsQuantity,
  formatPhysics3sf,
  formatPhysicsNumber,
  formatPhysicsValue,
  formatThermalValue,
  generateCircuitsCandidates,
  generateEmInductionCandidates,
  generateFieldsCandidates,
  generateGraphsCandidates,
  generateGravAstroCandidates,
  generateMechanicsCandidates,
  generateOpticsShmCandidates,
  generatePureCalculationCandidates,
  generateQuantumNuclearCandidates,
  generateThermalCandidates,
  generateWavesCandidates,
  GRAPHS_ARCHETYPE_CATALOGUE,
  GRAV_ASTRO_ARCHETYPES,
  MECHANICS_ARCHETYPE_CATALOGUE,
  MECHANICS_GENERATOR_ARCHETYPES,
  OPTICS_SHM_FAMILY_SPECS,
  PURE_CALCULATION_ARCHETYPE_IDS,
  PURE_CALCULATION_ARCHETYPE_REGISTRY,
  QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST,
  resolveMechanicsSyllabusTags,
  resolveWavesSyllabiTags,
  THERMAL_ARCHETYPE_CATALOGUE,
  THERMAL_GENERATOR_VERSION,
  WAVES_ARCHETYPE_CATALOGUE,
  WAVES_TEMPLATE_ARCHETYPES,
};

export type {
  BuiltinMechanicsScenarioKind,
  CircuitsArchetypeSpec,
  EmInductionArchetypeDescriptor,
  FieldsArchetypeSpec,
  GenerateCircuitsOptions,
  GenerateEmInductionCandidatesOptions,
  GenerateFieldsCandidatesOptions,
  GenerateGravAstroCandidatesOptions,
  GenerateMechanicsOptions,
  GenerateOpticsShmCandidatesOptions,
  GeneratePureCalculationOptions,
  GenerateQuantumNuclearCandidatesOptions,
  GraphsArchetypeDescriptor,
  GraphsGeneratorOptions,
  GravAstroArchetypeDescriptor,
  MechanicsArchetypeDescriptor,
  MechanicsGeneratorArchetype,
  OpticsShmFamilySpec,
  PureCalculationArchetypeId,
  QuantumNuclearArchetypeDescriptor,
  ThermalArchetypeSlug,
  ThermalGeneratorOptions,
  WavesArchetypeDescriptor,
  WavesConceptId,
  WavesGeneratorOptions,
  WavesSyllabusScopePolicy,
  WavesTemplateArchetype,
};

/**
 * Canonical shard identifiers for each of the 11 Wave 2 physics domains.
 */
export const DOMAIN_SHARD_ID_MAP: Readonly<Record<PhysicsDomainId, string>> = {
  graphs: "gen-graphs",
  circuits: "gen-circuits",
  fields: "gen-fields",
  mechanics: "gen-mechanics",
  waves: "gen-waves",
  "optics-shm": "gen-optics-shm",
  thermal: "gen-thermal",
  "grav-astro": "gen-grav-astro",
  "em-induction": "gen-em-induction",
  "quantum-nuclear": "gen-quantum-nuclear",
  "pure-calculation": "gen-pure-calc",
};

const DOMAIN_DEFAULT_SEEDS: Readonly<Record<PhysicsDomainId, number>> = {
  graphs: 20261117,
  circuits: 220_000,
  fields: DEFAULT_FIELDS_BASE_SEED,
  mechanics: 410_000,
  waves: 20260601,
  "optics-shm": 620_000,
  thermal: 700_000,
  "grav-astro": DEFAULT_GRAV_ASTRO_SEED,
  "em-induction": 810_000,
  "quantum-nuclear": 820_000,
  "pure-calculation": 820_000,
};

export interface GenerateDomainCandidatesUniformOptions {
  readonly count?: number;
  readonly seedOffset?: number;
  readonly mcqRatio?: number;
  readonly generatorModel?: string;
}

export interface GenerateAllDomainCandidatesOptions {
  readonly domains?: readonly PhysicsDomainId[];
  readonly countPerDomain?: number;
  readonly seedOffset?: number;
  readonly mcqRatio?: number;
  readonly generatorModel?: string;
}

export interface DomainShardCandidateBatch {
  readonly domain: PhysicsDomainId;
  readonly shardId: string;
  readonly candidates: CandidateQuestionInput[];
}

/**
 * Generates deterministic, solver-verified candidates for a single domain.
 * When invoked with no overrides, reproduces the exact Wave 2 domain shard batch.
 */
export function generateDomainCandidates(
  domain: PhysicsDomainId,
  options: GenerateDomainCandidatesUniformOptions = {},
): CandidateQuestionInput[] {
  const hasSeedOffset =
    options.seedOffset !== undefined && options.seedOffset !== 0;
  const effectiveSeed = hasSeedOffset
    ? DOMAIN_DEFAULT_SEEDS[domain] + Math.trunc(options.seedOffset!)
    : undefined;

  switch (domain) {
    case "graphs":
      return generateGraphsCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { seed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqRatio: options.mcqRatio }
          : {}),
      });
    case "circuits":
      return generateCircuitsCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { seed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqRatio: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "fields":
      return generateFieldsCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqRatio: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "mechanics":
      return generateMechanicsCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
      });
    case "waves":
      return generateWavesCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { seed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "optics-shm":
      return generateOpticsShmCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "thermal":
      return generateThermalCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "grav-astro":
      return generateGravAstroCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { seed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "em-induction":
      return generateEmInductionCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqFraction: options.mcqRatio }
          : {}),
      });
    case "quantum-nuclear":
      return generateQuantumNuclearCandidates({
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqRatio: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    case "pure-calculation":
      return generatePureCalculationCandidates({
        ...(options.count !== undefined ? { totalCount: options.count } : {}),
        ...(effectiveSeed !== undefined ? { baseSeed: effectiveSeed } : {}),
        ...(options.mcqRatio !== undefined
          ? { mcqRatio: options.mcqRatio }
          : {}),
        ...(options.generatorModel !== undefined
          ? { generatorModel: options.generatorModel }
          : {}),
      });
    default: {
      const exhaustiveCheck: never = domain;
      throw new Error(`Unsupported generator domain: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Generates per-domain shard batches across all requested domains (default: all 11 domains).
 */
export function generateDomainShardBatches(
  options: GenerateAllDomainCandidatesOptions = {},
): DomainShardCandidateBatch[] {
  const domains = options.domains ?? PHYSICS_DOMAIN_IDS;
  return domains.map((domain) => ({
    domain,
    shardId: DOMAIN_SHARD_ID_MAP[domain],
    candidates: generateDomainCandidates(domain, {
      count: options.countPerDomain,
      seedOffset: options.seedOffset,
      mcqRatio: options.mcqRatio,
      generatorModel: options.generatorModel,
    }),
  }));
}

/**
 * Unified helper that deterministically generates candidates across all 11 SixthPhysics
 * domains (3,644 verified items across 175 family groups when called with default options).
 */
export function generateAllDomainCandidates(
  options: GenerateAllDomainCandidatesOptions = {},
): CandidateQuestionInput[] {
  return generateDomainShardBatches(options).flatMap(
    (batch) => batch.candidates,
  );
}
