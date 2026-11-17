import {
  GeneratableSlice,
  getGeneratableSlices,
  getSubtopicById,
  getTopicById,
  SYLLABUS_CROSSWALK,
  VisualFamilyHint,
} from "@/lib/constants/syllabi";

import {
  getDomainAdapter,
  hasDomainAdapter,
  listRegisteredDomains,
} from "./domain-registry";
import {
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  SyllabusId,
  WORK_ORDER_MANIFEST_SCHEMA_VERSION,
  WorkOrderManifest,
  WorkOrderSlice,
} from "./types";

export interface ConceptSyllabusSliceEntry {
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId?: string;
  formats?: readonly QuestionFormat[];
  isOption?: boolean;
  assumptionNotes?: string;
}

export interface ConceptSliceSpec {
  conceptId: string;
  conceptTitle?: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  syllabi: ConceptSyllabusSliceEntry[];
  formats?: readonly QuestionFormat[];
}

const VISUAL_DOMAIN_DEFAULT_FAMILY_FALLBACK: Readonly<
  Record<VisualFamilyHint, string>
> = {
  graphs: "cartesian_plot",
  circuits: "circuit_network",
  fields: "field_map",
  mechanics: "mechanics_scene",
  waves: "waves",
  "optics-shm": "optics-shm",
  thermal: "thermal",
  "grav-astro": "grav-astro",
  "em-induction": "em-induction",
  "quantum-nuclear": "quantum-nuclear",
};

function resolveVisualFamilyForDomain(domain: PhysicsDomainId): string {
  if (hasDomainAdapter(domain)) {
    return getDomainAdapter(domain).defaultVisualFamily;
  }
  if (domain in VISUAL_DOMAIN_DEFAULT_FAMILY_FALLBACK) {
    return VISUAL_DOMAIN_DEFAULT_FAMILY_FALLBACK[domain as VisualFamilyHint];
  }
  return "none";
}

function groupGeneratableSlicesIntoConceptEntries(
  rawSlices: readonly GeneratableSlice[],
  overrideDomain?: PhysicsDomainId,
): ConceptSliceSpec[] {
  const byConcept = new Map<string, GeneratableSlice[]>();
  for (const slice of rawSlices) {
    const existing = byConcept.get(slice.conceptId);
    if (existing) {
      existing.push(slice);
    } else {
      byConcept.set(slice.conceptId, [slice]);
    }
  }

  const specs: ConceptSliceSpec[] = [];

  for (const entry of SYLLABUS_CROSSWALK) {
    const conceptSlices = byConcept.get(entry.conceptId);
    if (!conceptSlices || conceptSlices.length === 0) {
      continue;
    }

    const domain: PhysicsDomainId =
      overrideDomain ?? (entry.primaryVisualFamily as PhysicsDomainId);
    const visualFamily =
      overrideDomain === "pure-calculation"
        ? "none"
        : resolveVisualFamilyForDomain(domain);

    const groupedSyllabi = new Map<
      string,
      {
        syllabus: SyllabusId;
        level: string;
        topicId: string;
        subtopicId: string;
        formats: QuestionFormat[];
        isOption: boolean;
        assumptionNotes: string;
      }
    >();

    for (const s of conceptSlices) {
      const groupKey = `${s.syllabus}::${s.level}::${s.topicId}::${s.subtopicId}`;
      const existing = groupedSyllabi.get(groupKey);
      if (existing) {
        if (!existing.formats.includes(s.format)) {
          existing.formats.push(s.format);
        }
      } else {
        const topicSpec = getTopicById(s.topicId);
        const subtopicSpec = getSubtopicById(s.subtopicId);
        const isOption = Boolean(
          topicSpec?.isOption || subtopicSpec?.isOption,
        );
        groupedSyllabi.set(groupKey, {
          syllabus: s.syllabus,
          level: s.level,
          topicId: s.topicId,
          subtopicId: s.subtopicId,
          formats: [s.format],
          isOption,
          assumptionNotes: s.assumptionNotes,
        });
      }
    }

    specs.push({
      conceptId: entry.conceptId,
      conceptTitle: entry.title,
      domain,
      visualFamily,
      formats: [...entry.questionFormats],
      syllabi: [...groupedSyllabi.values()].map((g) => ({
        syllabus: g.syllabus,
        level: g.level,
        topicId: g.topicId,
        subtopicId: g.subtopicId,
        formats: g.formats,
        ...(g.isOption ? { isOption: true } : {}),
        ...(g.assumptionNotes ? { assumptionNotes: g.assumptionNotes } : {}),
      })),
    });
  }

  return specs;
}

/**
 * Canonical 3-syllabus work-order catalogue derived directly from
 * `lib/constants/syllabi` (`SYLLABUS_CROSSWALK` + `getGeneratableSlices`),
 * spanning all 56 physics concepts across all 10 visual domains (`graphs`,
 * `circuits`, `fields`, `mechanics`, `waves`, `optics-shm`, `thermal`,
 * `grav-astro`, `em-induction`, `quantum-nuclear`) and strictly respecting
 * syllabus/level/format exclusions (e.g., never assigning thin lenses or
 * capacitors to IB 2025).
 */
export const DEFAULT_SIXTHPHYSICS_CONCEPT_CATALOGUE: readonly ConceptSliceSpec[] =
  Object.freeze(
    groupGeneratableSlicesIntoConceptEntries(
      getGeneratableSlices({ includeOptionTopics: true }),
    ),
  );

const PURE_CALCULATION_SOURCE_CONCEPT_IDS = [
  "error-propagation-uncertainties",
  "uniform-acceleration-suvat",
  "work-energy-power-efficiency",
] as const;

export const PURE_CALCULATION_CONCEPT_CATALOGUE: readonly ConceptSliceSpec[] =
  Object.freeze(
    groupGeneratableSlicesIntoConceptEntries(
      getGeneratableSlices({
        conceptId: PURE_CALCULATION_SOURCE_CONCEPT_IDS,
        includeOptionTopics: false,
      }),
      "pure-calculation",
    ),
  );

export interface PlanWorkOrdersOptions {
  catalogue?: readonly ConceptSliceSpec[];
  syllabi?: readonly SyllabusId[];
  levels?: readonly string[];
  domains?: readonly PhysicsDomainId[];
  formats?: readonly QuestionFormat[];
  concepts?: readonly string[];
  includeOptionTopics?: boolean;
  includePureCalculation?: boolean;
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
 * intervals for parallel swarm generator sharding across IB (SL/HL),
 * UK A-Level (Y12/Y13), and NCUK IFY (IFY/IFY-S1/IFY-S2).
 */
export function planWorkOrders(
  options: PlanWorkOrdersOptions = {},
): WorkOrderManifest {
  const includePureCalculation =
    options.includePureCalculation ??
    Boolean(
      !options.catalogue && options.domains?.includes("pure-calculation"),
    );

  const catalogue: readonly ConceptSliceSpec[] =
    options.catalogue ??
    (includePureCalculation
      ? [
          ...DEFAULT_SIXTHPHYSICS_CONCEPT_CATALOGUE,
          ...PURE_CALCULATION_CONCEPT_CATALOGUE,
        ]
      : DEFAULT_SIXTHPHYSICS_CONCEPT_CATALOGUE);

  const allowedSyllabi = new Set<SyllabusId>(
    options.syllabi ?? ["ib", "alevel", "ncuk"],
  );
  const allowedLevels = options.levels ? new Set<string>(options.levels) : null;
  const allowedConcepts = options.concepts
    ? new Set<string>(options.concepts)
    : null;
  const includeOptionTopics = options.includeOptionTopics ?? true;

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
    if (allowedConcepts && !allowedConcepts.has(concept.conceptId)) continue;
    if (!allowedDomains.has(concept.domain)) continue;
    if (options.registeredDomainsOnly && !registeredSet.has(concept.domain)) {
      continue;
    }

    const conceptFormats = concept.formats ?? formats;

    for (const sylEntry of concept.syllabi) {
      if (!allowedSyllabi.has(sylEntry.syllabus)) continue;
      if (allowedLevels && !allowedLevels.has(sylEntry.level)) continue;
      if (!includeOptionTopics && sylEntry.isOption) continue;

      const entryFormats = sylEntry.formats ?? conceptFormats;

      for (const fmt of entryFormats) {
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
            ...(concept.conceptTitle
              ? { conceptTitle: concept.conceptTitle }
              : {}),
            domain: concept.domain,
            visualFamily: concept.visualFamily,
            format: fmt,
            difficultyCounts: allocateDifficultyCounts(chunkCount),
            targetCount: chunkCount,
            seedRange: [seedStart, seedEnd],
            ...(sylEntry.assumptionNotes
              ? { assumptionNotes: sylEntry.assumptionNotes }
              : {}),
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
