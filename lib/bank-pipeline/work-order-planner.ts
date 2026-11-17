import { listRegisteredDomains } from "./domain-registry";
import {
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  SyllabusId,
  WORK_ORDER_MANIFEST_SCHEMA_VERSION,
  WorkOrderManifest,
  WorkOrderSlice,
} from "./types";

export interface ConceptSliceSpec {
  conceptId: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  syllabi: Array<{
    syllabus: SyllabusId;
    level: string;
    topicId: string;
    subtopicId?: string;
  }>;
  formats?: readonly QuestionFormat[];
}

export const DEFAULT_SIXTHPHYSICS_CONCEPT_CATALOGUE: readonly ConceptSliceSpec[] =
  [
    // 1. GRAPHS (Cartesian kinematics & force/momentum calculus)
    {
      conceptId: "kinematics-motion-graphs",
      domain: "graphs",
      visualFamily: "cartesian_plot",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M1", subtopicId: "kinematics" },
      ],
    },
    {
      conceptId: "force-displacement-impulse-graphs",
      domain: "graphs",
      visualFamily: "cartesian_plot",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.2", subtopicId: "A.2.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.6" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M2", subtopicId: "momentum-work" },
      ],
    },
    // 2. MECHANICS
    {
      conceptId: "collisions-and-momentum-conservation",
      domain: "mechanics",
      visualFamily: "mechanics_scene",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.2", subtopicId: "A.2.4" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.6" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M2", subtopicId: "collisions" },
      ],
    },
    {
      conceptId: "inclined-planes-work-and-friction",
      domain: "mechanics",
      visualFamily: "mechanics_scene",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.3", subtopicId: "A.3.1" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.7" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M3", subtopicId: "work-energy" },
      ],
    },
    {
      conceptId: "projectile-motion-2d",
      domain: "mechanics",
      visualFamily: "mechanics_scene",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.4" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M1", subtopicId: "projectiles" },
      ],
    },
    // 3. CIRCUITS
    {
      conceptId: "dc-series-parallel-networks",
      domain: "circuits",
      visualFamily: "circuit_network",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "B.5", subtopicId: "B.5.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.5.1", subtopicId: "3.5.1.4" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E1", subtopicId: "dc-circuits" },
      ],
    },
    {
      conceptId: "emf-internal-resistance-and-dividers",
      domain: "circuits",
      visualFamily: "circuit_network",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "B.5", subtopicId: "B.5.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.5.1", subtopicId: "3.5.1.5" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E1", subtopicId: "potential-dividers" },
      ],
    },
    // 4. FIELDS
    {
      conceptId: "coulomb-superposition-and-null-points",
      domain: "fields",
      visualFamily: "field_map",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "D.2", subtopicId: "D.2.1" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.3", subtopicId: "3.7.3.1" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E2", subtopicId: "electric-fields" },
      ],
    },
    {
      conceptId: "electric-potential-and-equipotential-work",
      domain: "fields",
      visualFamily: "field_map",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "D.2", subtopicId: "D.2.3" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.3", subtopicId: "3.7.3.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E2", subtopicId: "electric-potential" },
      ],
    },
    // 5. WAVES
    {
      conceptId: "progressive-and-standing-waves",
      domain: "waves",
      visualFamily: "waves",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "C.2", subtopicId: "C.2.1" },
        { syllabus: "alevel", level: "Y12", topicId: "3.3.1", subtopicId: "3.3.1.3" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-W1", subtopicId: "standing-waves" },
      ],
    },
    {
      conceptId: "double-slit-and-diffraction-gratings",
      domain: "waves",
      visualFamily: "waves",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "C.3", subtopicId: "C.3.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.3.2", subtopicId: "3.3.2.1" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-W2", subtopicId: "interference" },
      ],
    },
    // 6. OPTICS & SHM
    {
      conceptId: "refraction-tir-and-thin-lenses",
      domain: "optics-shm",
      visualFamily: "optics-shm",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "C.3", subtopicId: "C.3.1" },
        { syllabus: "alevel", level: "Y12", topicId: "3.3.2", subtopicId: "3.3.2.3" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-W3", subtopicId: "geometrical-optics" },
      ],
    },
    {
      conceptId: "simple-harmonic-motion-kinematics-energy",
      domain: "optics-shm",
      visualFamily: "optics-shm",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "C.1", subtopicId: "C.1.2" },
        { syllabus: "alevel", level: "Y13", topicId: "3.6.1", subtopicId: "3.6.1.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M4", subtopicId: "oscillations" },
      ],
    },
    // 7. THERMAL
    {
      conceptId: "ideal-gas-pv-cycles-and-first-law",
      domain: "thermal",
      visualFamily: "thermal",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "B.4", subtopicId: "B.4.1" },
        { syllabus: "alevel", level: "Y13", topicId: "3.6.2", subtopicId: "3.6.2.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-T1", subtopicId: "ideal-gases" },
      ],
    },
    {
      conceptId: "calorimetry-phase-change-and-radiation",
      domain: "thermal",
      visualFamily: "thermal",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "B.1", subtopicId: "B.1.2" },
        { syllabus: "alevel", level: "Y13", topicId: "3.6.2", subtopicId: "3.6.2.1" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-T2", subtopicId: "thermal-transfers" },
      ],
    },
    // 8. GRAVITATION & ASTROPHYSICS
    {
      conceptId: "circular-motion-and-orbital-gravitation",
      domain: "grav-astro",
      visualFamily: "grav-astro",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "D.1", subtopicId: "D.1.2" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.2", subtopicId: "3.7.2.4" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-G1", subtopicId: "gravitation-orbits" },
      ],
    },
    // 9. EM INDUCTION & CAPACITANCE
    {
      conceptId: "capacitors-rc-decay-and-em-induction",
      domain: "em-induction",
      visualFamily: "em-induction",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "D.4", subtopicId: "D.4.1" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.4", subtopicId: "3.7.4.3" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E3", subtopicId: "capacitance-induction" },
      ],
    },
    // 10. QUANTUM & NUCLEAR
    {
      conceptId: "photoelectric-atomic-levels-and-nuclear-decay",
      domain: "quantum-nuclear",
      visualFamily: "quantum-nuclear",
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "E.2", subtopicId: "E.2.1" },
        { syllabus: "alevel", level: "Y12", topicId: "3.2.2", subtopicId: "3.2.2.1" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-Q1", subtopicId: "quantum-nuclear" },
      ],
    },
    // 11. PURE CALCULATION
    {
      conceptId: "uncertainties-suvat-and-efficiency",
      domain: "pure-calculation",
      visualFamily: "none",
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.1" },
        { syllabus: "alevel", level: "Y12", topicId: "3.1.2", subtopicId: "3.1.2.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-F1", subtopicId: "measurements-uncertainties" },
      ],
    },
  ];

export interface PlanWorkOrdersOptions {
  catalogue?: readonly ConceptSliceSpec[];
  syllabi?: readonly SyllabusId[];
  domains?: readonly PhysicsDomainId[];
  formats?: readonly QuestionFormat[];
  registeredDomainsOnly?: boolean;
  itemsPerSlice?: number;
  maxItemsPerShard?: number;
  baseSeed?: number;
  seedMultiplier?: number;
  generatedAt?: string;
}

function allocateDifficultyCounts(
  targetCount: number,
): Record<QuestionDifficulty, number> {
  const foundation = Math.round(targetCount * 0.25);
  const higher = Math.round(targetCount * 0.3);
  const standard = Math.max(0, targetCount - foundation - higher);
  return { foundation, standard, higher };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates deterministic, non-overlapping slice manifests with disjoint seed
 * intervals for parallel swarm generator sharding.
 */
export function planWorkOrders(
  options: PlanWorkOrdersOptions = {},
): WorkOrderManifest {
  const catalogue =
    options.catalogue ?? DEFAULT_SIXTHPHYSICS_CONCEPT_CATALOGUE;
  const allowedSyllabi = new Set<SyllabusId>(
    options.syllabi ?? ["ib", "alevel", "ncuk"],
  );
  const registeredSet = new Set(listRegisteredDomains());
  const allowedDomains = new Set<PhysicsDomainId>(
    options.domains ??
      (options.registeredDomainsOnly
        ? [...registeredSet]
        : catalogue.map((c) => c.domain)),
  );
  const formats: readonly QuestionFormat[] = options.formats ?? [
    "mcq",
    "structured",
  ];

  const itemsPerSlice = options.itemsPerSlice ?? 10;
  const maxItemsPerShard = options.maxItemsPerShard ?? 25;
  const baseSeed = options.baseSeed ?? 100_000;
  const seedMultiplier = options.seedMultiplier ?? 25;

  if (!Number.isInteger(itemsPerSlice) || itemsPerSlice < 1) {
    throw new Error("itemsPerSlice must be a positive integer");
  }
  if (!Number.isInteger(maxItemsPerShard) || maxItemsPerShard < 1) {
    throw new Error("maxItemsPerShard must be a positive integer");
  }
  if (!Number.isInteger(baseSeed) || baseSeed < 0) {
    throw new Error("baseSeed must be a non-negative integer");
  }

  const slices: WorkOrderSlice[] = [];
  let nextSeedStart = baseSeed;
  let sequence = 1;

  for (const concept of catalogue) {
    if (!allowedDomains.has(concept.domain)) continue;
    if (options.registeredDomainsOnly && !registeredSet.has(concept.domain)) {
      continue;
    }

    const conceptFormats = concept.formats ?? formats;

    for (const sylEntry of concept.syllabi) {
      if (!allowedSyllabi.has(sylEntry.syllabus)) continue;

      for (const fmt of conceptFormats) {
        if (!formats.includes(fmt)) continue;

        let remaining = itemsPerSlice;
        let partIndex = 1;
        const numParts = Math.ceil(itemsPerSlice / maxItemsPerShard);

        while (remaining > 0) {
          const chunkCount = Math.min(remaining, maxItemsPerShard);
          remaining -= chunkCount;

          const span = Math.max(chunkCount * seedMultiplier, 100);
          const seedStart = nextSeedStart;
          const seedEnd = seedStart + span - 1;
          nextSeedStart = seedEnd + 1;

          const seqTag = String(sequence).padStart(4, "0");
          const partSuffix = numParts > 1 ? `-p${partIndex}` : "";
          const shardId = `wo-${seqTag}-${sylEntry.syllabus}-${slugify(sylEntry.level)}-${slugify(concept.domain)}-${slugify(concept.conceptId)}-${fmt}${partSuffix}`;

          slices.push({
            shardId,
            syllabus: sylEntry.syllabus,
            level: sylEntry.level,
            topicId: sylEntry.topicId,
            ...(sylEntry.subtopicId ? { subtopicId: sylEntry.subtopicId } : {}),
            conceptId: concept.conceptId,
            domain: concept.domain,
            visualFamily: concept.visualFamily,
            format: fmt,
            difficultyCounts: allocateDifficultyCounts(chunkCount),
            targetCount: chunkCount,
            seedRange: [seedStart, seedEnd],
          });

          sequence += 1;
          partIndex += 1;
        }
      }
    }
  }

  const totalTargetQuestions = slices.reduce(
    (sum, s) => sum + s.targetCount,
    0,
  );

  return {
    schemaVersion: WORK_ORDER_MANIFEST_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    baseSeed,
    seedStridePerSlice: seedMultiplier,
    totalSlices: slices.length,
    totalTargetQuestions,
    slices,
  };
}
