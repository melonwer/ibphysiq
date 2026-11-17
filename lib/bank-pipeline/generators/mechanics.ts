import { getDomainAdapter } from "@/lib/bank-pipeline/domain-registry";
import {
  buildOptionEquivalenceKey,
  formatSignificantFigures,
  numbersAgreeWithinTolerance,
} from "@/lib/bank-pipeline/numeric-checker";
import {
  ExistingStemEntry,
  verifyCandidateWithGate,
} from "@/lib/bank-pipeline/package-gate";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusTag,
  VerifiedQuantityMap,
} from "@/lib/bank-pipeline/types";
import { getCompatibleSyllabiForConcept } from "@/lib/constants/syllabi/crosswalk";

export const MECHANICS_GENERATOR_ARCHETYPES = [
  "incline-dynamic-friction-coefficient",
  "rough-incline-resistive-force-and-half-slope",
  "constant-speed-incline-equilibrium-drag",
  "incline-frictional-dissipation-power",
  "level-ground-oblique-flight-and-range",
  "oblique-projectile-apex-speed-and-height",
  "inelastic-cart-collision-energy-loss",
  "coalescing-and-rebound-collision-energetics",
  "head-on-signed-momentum-conservation",
  "ballistic-pendulum-momentum-and-rise",
  "pendulum-swing-tension-and-impact",
  "vertical-circle-bottom-tension",
  "vertical-circle-breaking-speed-limit",
  "elastic-cord-drop-stiffness-and-tension",
  "bungee-arrest-impulse-mean-force",
  "accelerometer-plumb-line-and-curve-skid",
] as const;

export type MechanicsGeneratorArchetype =
  (typeof MECHANICS_GENERATOR_ARCHETYPES)[number];

export const BUILTIN_MECHANICS_SCENARIO_KINDS_USED = [
  "incline-friction",
  "short-ramp",
  "ramp-resistance",
  "ramp-heating",
  "projectile-kinematics",
  "collision-loss",
  "cart-collision",
  "pendulum-loss",
  "pendulum-collision",
  "circle-bottom",
  "circle-limit",
  "elastic-rope",
  "truck",
] as const;

export type BuiltinMechanicsScenarioKind =
  (typeof BUILTIN_MECHANICS_SCENARIO_KINDS_USED)[number];

export interface MechanicsArchetypeDescriptor {
  readonly archetype: MechanicsGeneratorArchetype;
  readonly conceptId: string;
  readonly scenarioKind: BuiltinMechanicsScenarioKind;
  readonly usesGravity: boolean;
  readonly alevelY13Only: boolean;
}

export const MECHANICS_ARCHETYPE_CATALOGUE: readonly MechanicsArchetypeDescriptor[] =
  [
    {
      archetype: "incline-dynamic-friction-coefficient",
      conceptId: "newtonian-dynamics-friction",
      scenarioKind: "incline-friction",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "rough-incline-resistive-force-and-half-slope",
      conceptId: "newtonian-dynamics-friction",
      scenarioKind: "short-ramp",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "constant-speed-incline-equilibrium-drag",
      conceptId: "newtonian-dynamics-friction",
      scenarioKind: "ramp-resistance",
      usesGravity: false,
      alevelY13Only: false,
    },
    {
      archetype: "incline-frictional-dissipation-power",
      conceptId: "work-energy-power",
      scenarioKind: "ramp-heating",
      usesGravity: false,
      alevelY13Only: false,
    },
    {
      archetype: "level-ground-oblique-flight-and-range",
      conceptId: "projectile-motion",
      scenarioKind: "projectile-kinematics",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "oblique-projectile-apex-speed-and-height",
      conceptId: "projectile-motion",
      scenarioKind: "projectile-kinematics",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "inelastic-cart-collision-energy-loss",
      conceptId: "linear-momentum-impulse",
      scenarioKind: "collision-loss",
      usesGravity: false,
      alevelY13Only: false,
    },
    {
      archetype: "coalescing-and-rebound-collision-energetics",
      conceptId: "linear-momentum-impulse",
      scenarioKind: "collision-loss",
      usesGravity: false,
      alevelY13Only: false,
    },
    {
      archetype: "head-on-signed-momentum-conservation",
      conceptId: "linear-momentum-impulse",
      scenarioKind: "cart-collision",
      usesGravity: false,
      alevelY13Only: false,
    },
    {
      archetype: "ballistic-pendulum-momentum-and-rise",
      conceptId: "linear-momentum-impulse",
      scenarioKind: "pendulum-loss",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "pendulum-swing-tension-and-impact",
      conceptId: "uniform-circular-motion",
      scenarioKind: "pendulum-collision",
      usesGravity: true,
      alevelY13Only: true,
    },
    {
      archetype: "vertical-circle-bottom-tension",
      conceptId: "uniform-circular-motion",
      scenarioKind: "circle-bottom",
      usesGravity: true,
      alevelY13Only: true,
    },
    {
      archetype: "vertical-circle-breaking-speed-limit",
      conceptId: "uniform-circular-motion",
      scenarioKind: "circle-limit",
      usesGravity: true,
      alevelY13Only: true,
    },
    {
      archetype: "elastic-cord-drop-stiffness-and-tension",
      conceptId: "elasticity-young-modulus",
      scenarioKind: "elastic-rope",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "bungee-arrest-impulse-mean-force",
      conceptId: "linear-momentum-impulse",
      scenarioKind: "elastic-rope",
      usesGravity: true,
      alevelY13Only: false,
    },
    {
      archetype: "accelerometer-plumb-line-and-curve-skid",
      conceptId: "vectors-equilibrium-moments",
      scenarioKind: "truck",
      usesGravity: true,
      alevelY13Only: true,
    },
  ] as const;

export interface GenerateMechanicsOptions {
  count?: number;
  baseSeed?: number;
  mcqFraction?: number;
  syllabiFilter?: readonly SyllabusId[];
  archetypesFilter?: readonly MechanicsGeneratorArchetype[];
  nearDuplicateSimilarityThreshold?: number;
}

interface SeededRng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  step: (min: number, max: number, increment: number, decimals?: number) => number;
}

function createMechanicsRng(seed: number): SeededRng {
  let state = Math.trunc(seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    step(min: number, max: number, increment: number, decimals = 2): number {
      const steps = Math.max(0, Math.round((max - min) / increment));
      const idx = Math.floor(next() * (steps + 1));
      return Number((min + idx * increment).toFixed(decimals));
    },
  };
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

export function formatPhysicsNumber(value: number, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite value in formatPhysicsNumber: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-12) {
    return "0";
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 0.01 && abs < 1000) {
    const prec = abs.toPrecision(sigFigs);
    if (!prec.includes("e")) {
      return `${sign}${prec}`;
    }
    return `${sign}${Number(prec).toString()}`;
  }
  const rawSci = abs.toExponential(sigFigs - 1);
  const [mantissa, expPart] = rawSci.split("e");
  const expFormatted = [...expPart]
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join("");
  return `${sign}${mantissa} × 10${expFormatted}`;
}

export function formatPhysicsQuantity(value: number, unit: string): string {
  const numText = formatPhysicsNumber(value, 3);
  if (!unit) {
    return numText;
  }
  if (unit === "°") {
    return `${numText}°`;
  }
  return `${numText} ${unit}`;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ============================================================================
// 3-SYLLABUS PROFILE RESOLUTION VIA `getCompatibleSyllabiForConcept`
// ============================================================================

interface MechanicsSyllabusProfile {
  readonly profileId: "ib-sl" | "ib-hl" | "alevel-y12" | "alevel-y13" | "ncuk-s1";
  readonly primarySyllabus: SyllabusId;
  readonly level: "SL" | "HL" | "Y12" | "Y13" | "IFY-S1";
  readonly gravityMs2: 9.8 | 9.81;
}

const MECHANICS_SYLLABUS_PROFILES: readonly MechanicsSyllabusProfile[] = [
  { profileId: "ib-sl", primarySyllabus: "ib", level: "SL", gravityMs2: 9.8 },
  { profileId: "ib-hl", primarySyllabus: "ib", level: "HL", gravityMs2: 9.8 },
  {
    profileId: "alevel-y12",
    primarySyllabus: "alevel",
    level: "Y12",
    gravityMs2: 9.81,
  },
  {
    profileId: "alevel-y13",
    primarySyllabus: "alevel",
    level: "Y13",
    gravityMs2: 9.81,
  },
  {
    profileId: "ncuk-s1",
    primarySyllabus: "ncuk",
    level: "IFY-S1",
    gravityMs2: 9.81,
  },
];

export function resolveMechanicsSyllabusTags(
  descriptor: MechanicsArchetypeDescriptor,
  requestedProfile: MechanicsSyllabusProfile,
  format: QuestionFormat,
): {
  tags: SyllabusTag[];
  effectiveGravityMs2: 9.8 | 9.81;
  isNonIbFriction: boolean;
} {
  // Redirect Y12 -> Y13 on circular-motion-containing archetypes (Section 3.6.1 is Y13 in UK A-Level)
  const effectiveProfile: MechanicsSyllabusProfile =
    descriptor.alevelY13Only &&
    requestedProfile.primarySyllabus === "alevel" &&
    requestedProfile.level === "Y12"
      ? {
          profileId: "alevel-y13",
          primarySyllabus: "alevel",
          level: "Y13",
          gravityMs2: 9.81,
        }
      : requestedProfile;

  const compatible = getCompatibleSyllabiForConcept(descriptor.conceptId, {
    format,
    excludeOptionTopics: true,
  });

  const pickSubtopic = (
    syllabus: SyllabusId,
    level: string,
    topicIds: readonly string[],
    subtopicIds: readonly string[],
  ): { topicId: string; subtopicId: string } => {
    if (descriptor.conceptId === "vectors-equilibrium-moments") {
      if (syllabus === "ib") {
        // Translational plumb-bob vector equilibrium belongs to IB A.2 (SL & HL)
        return { topicId: "ib-theme-a", subtopicId: "ib-a2-forces-momentum" };
      }
      if (syllabus === "ncuk") {
        return { topicId: "ncuk-ac1", subtopicId: "ncuk-ac1-3" };
      }
    }
    if (descriptor.conceptId === "linear-momentum-impulse" && syllabus === "ib") {
      return { topicId: "ib-theme-a", subtopicId: "ib-a2-forces-momentum" };
    }
    if (descriptor.conceptId === "elasticity-young-modulus" && syllabus === "ib") {
      // Spring Hooke's law F = -kx and E_H = ½kx² (no Young modulus on IB 2025!)
      return { topicId: "ib-theme-a", subtopicId: "ib-a2-forces-momentum" };
    }
    return {
      topicId: topicIds[0] ?? level,
      subtopicId: subtopicIds[0] ?? topicIds[0] ?? level,
    };
  };

  if (!descriptor.usesGravity) {
    // Gravity-free scenarios (weights in N or horizontal track collisions) tag all 3 compatible syllabi
    const tags: SyllabusTag[] = [];
    for (const map of compatible) {
      const preferredLevel =
        map.syllabus === effectiveProfile.primarySyllabus
          ? effectiveProfile.level
          : map.syllabus === "ib"
            ? "SL"
            : map.syllabus === "alevel"
              ? descriptor.alevelY13Only
                ? "Y13"
                : "Y12"
              : "IFY-S1";
      const chosenLevel = map.levels.includes(preferredLevel)
        ? preferredLevel
        : map.levels[0];
      const ids = pickSubtopic(
        map.syllabus,
        chosenLevel,
        map.topicIds,
        map.subtopicIds,
      );
      tags.push({
        syllabus: map.syllabus,
        level: chosenLevel,
        topicId: ids.topicId,
        subtopicId: ids.subtopicId,
      });
    }
    return {
      tags,
      effectiveGravityMs2: effectiveProfile.gravityMs2,
      isNonIbFriction: false,
    };
  }

  if (effectiveProfile.primarySyllabus === "ib") {
    // g = 9.8 m s^-2 -> strictly IB only (never cross-tag A-Level or NCUK on g = 9.8!)
    const ibMap = compatible.find((m) => m.syllabus === "ib");
    const chosenLevel = ibMap?.levels.includes(effectiveProfile.level)
      ? effectiveProfile.level
      : "HL";
    const ids = pickSubtopic(
      "ib",
      chosenLevel,
      ibMap?.topicIds ?? ["ib-theme-a"],
      ibMap?.subtopicIds ?? ["ib-a2-forces-momentum"],
    );
    return {
      tags: [
        {
          syllabus: "ib",
          level: chosenLevel,
          topicId: ids.topicId,
          subtopicId: ids.subtopicId,
        },
      ],
      effectiveGravityMs2: 9.8,
      isNonIbFriction: false,
    };
  }

  // g = 9.81 m s^-2 -> compatible A-Level + NCUK tags (never cross-tag IB on g = 9.81!)
  const tags: SyllabusTag[] = [];
  const alevelMap = compatible.find((m) => m.syllabus === "alevel");
  const ncukMap = compatible.find((m) => m.syllabus === "ncuk");

  if (effectiveProfile.primarySyllabus === "alevel" && alevelMap) {
    const reqLvl = descriptor.alevelY13Only ? "Y13" : effectiveProfile.level;
    const chosenLvl = alevelMap.levels.includes(reqLvl)
      ? reqLvl
      : alevelMap.levels[0];
    const aIds = pickSubtopic(
      "alevel",
      chosenLvl,
      alevelMap.topicIds,
      alevelMap.subtopicIds,
    );
    tags.push({
      syllabus: "alevel",
      level: chosenLvl,
      topicId: aIds.topicId,
      subtopicId: aIds.subtopicId,
    });
    if (ncukMap) {
      const nLvl = ncukMap.levels.includes("IFY-S1")
        ? "IFY-S1"
        : ncukMap.levels[0];
      const nIds = pickSubtopic(
        "ncuk",
        nLvl,
        ncukMap.topicIds,
        ncukMap.subtopicIds,
      );
      tags.push({
        syllabus: "ncuk",
        level: nLvl,
        topicId: nIds.topicId,
        subtopicId: nIds.subtopicId,
      });
    }
  } else if (ncukMap) {
    const nLvl = ncukMap.levels.includes("IFY-S1")
      ? "IFY-S1"
      : ncukMap.levels[0];
    const nIds = pickSubtopic(
      "ncuk",
      nLvl,
      ncukMap.topicIds,
      ncukMap.subtopicIds,
    );
    tags.push({
      syllabus: "ncuk",
      level: nLvl,
      topicId: nIds.topicId,
      subtopicId: nIds.subtopicId,
    });
    if (alevelMap) {
      const aLvl = descriptor.alevelY13Only
        ? "Y13"
        : alevelMap.levels.includes("Y12")
          ? "Y12"
          : alevelMap.levels[0];
      const aIds = pickSubtopic(
        "alevel",
        aLvl,
        alevelMap.topicIds,
        alevelMap.subtopicIds,
      );
      tags.push({
        syllabus: "alevel",
        level: aLvl,
        topicId: aIds.topicId,
        subtopicId: aIds.subtopicId,
      });
    }
  }

  return {
    tags,
    effectiveGravityMs2: 9.81,
    isNonIbFriction: true,
  };
}

// ============================================================================
// CONTEXT BANKS FOR HIGH LEXICAL & STRUCTURAL STEM DIVERSITY
// ============================================================================

const INCLINE_COEFF_CONTEXTS = [
  { body: "an instrumented cargo crate", ramp: "a straight steel loading chute" },
  { body: "an alpine supply sled", ramp: "a compacted snow test slope" },
  { body: "a quarry basalt block", ramp: "a planar timber skidway" },
  { body: "a polymer storage tote", ramp: "an unpowered warehouse ramp" },
  { body: "a marine slipway cradle", ramp: "an inclined launchway" },
  { body: "an avionics shock canister", ramp: "an anodized calibration incline" },
  { body: "a forestry sled carriage", ramp: "a hillside guide track" },
  { body: "a cast-iron foundry billet", ramp: "a tilted discharge chute" },
  { body: "a glaciology sensor box", ramp: "a uniform ice ramp" },
  { body: "a baggage transfer container", ramp: "a planar terminal slide" },
] as const;

const SHORT_RAMP_CONTEXTS = [
  { body: "a courier parcel", ramp: "a rough sorting chute" },
  { body: "a ceramic kiln brick", ramp: "a refractory unloading ramp" },
  { body: "a vulcanized rubber block", ramp: "a brushed concrete incline" },
  { body: "a timber tool chest", ramp: "a pitched workshop plank" },
  { body: "a battery transport case", ramp: "a textured service ramp" },
  { body: "a brass counterweight slider", ramp: "a roughened hardwood slope" },
  { body: "a geological core box", ramp: "a field-station ramp" },
  { body: "a stage ballast crate", ramp: "an angled loading board" },
  { body: "a cleanroom shipping pod", ramp: "a coated transfer incline" },
  { body: "a shipyard keel block", ramp: "a dry-dock slip plank" },
] as const;

const RAMP_RESISTANCE_CONTEXTS = [
  { body: "a mining equipment skid", ramp: "a straight haulage incline" },
  { body: "a freight container sled", ramp: "a dockyard unloading ramp" },
  { body: "a transformer housing", ramp: "a substation access slope" },
  { body: "a marble quarry slab", ramp: "a planar earthen slipway" },
  { body: "a precast concrete culvert", ramp: "a graded site ramp" },
  { body: "a steel cable drum cradle", ramp: "a warehouse ramp" },
  { body: "a snowcat maintenance sled", ramp: "a planar ski run" },
  { body: "a turbine casing pallet", ramp: "a powerhouse access incline" },
  { body: "a salvage winch block", ramp: "a beaching slipway" },
  { body: "a modular shelter unit", ramp: "a straight unloading track" },
] as const;

const RAMP_HEATING_CONTEXTS = [
  { body: "a heavy logistics crate", ramp: "a rough warehouse ramp" },
  { body: "a foundry ingot sled", ramp: "a refractory cooling chute" },
  { body: "a logging timber bundle", ramp: "a mountainside flume slide" },
  { body: "a steel ballast box", ramp: "a braking test slope" },
  { body: "anexpedition supply sled".replace("anexpedition", "an expedition"), ramp: "a crusty glacier slope" },
  { body: "a quarry stone skip", ramp: "a planar service incline" },
  { body: "a shipyard launch block", ramp: "a greased timber way" },
  { body: "a railway sleeper pack", ramp: "an embankment chute" },
  { body: "a warehouse pallet box", ramp: "a gravity-brake ramp" },
  { body: "a civil-engineering gabion", ramp: "a planar test embankment" },
] as const;

const PROJECTILE_CONTEXTS = [
  { obj: "a sports-science test ball", launcher: "a pneumatic pitching machine", ground: "a level turf pitch" },
  { obj: "an irrigation water packet", launcher: "a ground-level nozzle", ground: "horizontal farmland" },
  { obj: "a volcanic ballistic clast", launcher: "a ground-level vent", ground: "a flat ash plain" },
  { obj: "a robotics arena sphere", launcher: "a spring-loaded catapult", ground: "a level arena floor" },
  { obj: "an acoustic ranging dart", launcher: "a calibrated ground launcher", ground: "a flat proving ground" },
  { obj: "a hail-impact test sphere", launcher: "an angled gas gun", ground: "a horizontal test hall" },
  { obj: "a rescue line-throwing bob", launcher: "a deck-level launcher", ground: "calm water at launch level" },
  { obj: "a lecture-hall steel ball", launcher: "a floor-mounted spring cannon", ground: "a level demonstration track" },
  { obj: "a golf launch-monitor ball", launcher: "a tee on flat ground", ground: "a level driving range" },
  { obj: "a tracer polymer pellet", launcher: "a ground discharge tube", ground: "a horizontal test paddock" },
] as const;

const COLLISION_TRACK_CONTEXTS = [
  { track: "a horizontal frictionless air track", xName: "glider X", yName: "glider Y" },
  { track: "a level low-friction dynamics rail", xName: "cart X", yName: "cart Y" },
  { track: "a smooth marshalling test track", xName: "wagon X", yName: "wagon Y" },
  { track: "a horizontal magnetic-bearing guideway", xName: "shuttle X", yName: "shuttle Y" },
  { track: "a polished ice test channel", xName: "sled X", yName: "sled Y" },
  { track: "a precision gas-bearing trough", xName: "rider X", yName: "rider Y" },
  { track: "a level cleanroom linear rail", xName: "carrier X", yName: "carrier Y" },
  { track: "a smooth glass collision groove", xName: "trolley X", yName: "trolley Y" },
  { track: "a frictionless optical-bench track", xName: "carriage X", yName: "carriage Y" },
  { track: "a level docking-simulator rail", xName: "module X", yName: "module Y" },
] as const;

const PENDULUM_CONTEXTS = [
  { bob: "a steel pendulum bob", target: "a lump of modelling clay", rig: "a ballistic pendulum rig" },
  { bob: "a brass impact sphere", target: "a wax capture block", rig: "a laboratory swing frame" },
  { bob: "a lead-filled test bob", target: "a Velcro-lined receiver", rig: "a momentum demonstration stand" },
  { bob: "a hardened striker ball", target: "a soft polymer target", rig: "a fracture-toughness pendulum" },
  { bob: "an instrumented pendulum mass", target: "a magnetic-latch block", rig: "a suspension test gantry" },
  { bob: "a cast-iron hammer bob", target: "a deformable putty mass", rig: "a Charpy-style swing rig" },
  { bob: "a tungsten alloy sphere", target: "a stationary capture cup", rig: "a pivot suspension rig" },
  { bob: "a chrome-steel bob", target: "a resin absorber block", rig: "a ceiling-mounted swing test" },
  { bob: "a calibration swing mass", target: "a coupling receiver ball", rig: "a frictionless pivot stand" },
  { bob: "a physics lecture bob", target: "a stationary putty sphere", rig: "a light-string pendulum" },
] as const;

const CIRCLE_CONTEXTS = [
  { obj: "a steel sensor sphere", cord: "a light inextensible wire", rig: "a vertical circular test rig" },
  { obj: "a brass pendulum mass", cord: "a taut nylon cord", rig: "a vertical whirl apparatus" },
  { obj: "an accelerometer test pod", cord: "a light kevlar tether", rig: "a centrifuge arm model" },
  { obj: "acompact lead bob".replace("acompact", "a compact"), cord: "a light steel cable", rig: "a vertical loop frame" },
  { obj: "a calibration ball", cord: "a thin braided string", rig: "a lecture-hall whirl rig" },
  { obj: "a telemetry capsule", cord: "a high-tensile cord", rig: "a vertical rotation stand" },
  { obj: "a polished alloy bob", cord: "a light suspension line", rig: "a vertical swing circle" },
  { obj: "a forged test weight", cord: "a taut braided wire", rig: "a dynamic tension rig" },
  { obj: "apolymer-coated mass".replace("apolymer", "a polymer"), cord: "a light inextensible string", rig: "a circular motion demonstrator" },
  { obj: "a gyroscope test mass", cord: "a light radial tether", rig: "a vertical-plane spinner" },
] as const;

const ELASTIC_ROPE_CONTEXTS = [
  { obj: "an instrumented drop sphere", cord: "an elastic bungee tether", rig: "a drop-test tower" },
  { obj: "a rescue arrest dummy", cord: "a braided dynamic lanyard", rig: "a fall-arrest gantry" },
  { obj: "a bridge-jump test sandbag", cord: "an elastic shock cord", rig: "a high-platform test rig" },
  { obj: "a payload shock capsule", cord: "a compliant elastomer rope", rig: "a vertical deceleration shaft" },
  { obj: "a mountaineering test mass", cord: "a dynamic climbing rope", rig: "a cliff-sim drop frame" },
  { obj: "a crane overload test block", cord: "an elastic snubber line", rig: "an overhead hoist beam" },
  { obj: "a marine mooring weight", cord: "a stretchable nylon hawser", rig: "a dry-test tower" },
  { obj: "an aerospace drop canister", cord: "an elastic recovery cord", rig: "a vertical test bay" },
  { obj: "a calibration steel ball", cord: "a Hookean rubber cord", rig: "a laboratory ceiling mount" },
  { obj: "a stunt-rig counterweight", cord: "an elastic arrest cable", rig: "a stage gridiron support" },
] as const;

const TRUCK_CONTEXTS = [
  { vehicle: "an instrumented test truck", bob: "a ceiling-suspended plumb bob", station: "the terminal bay" },
  { vehicle: "an autonomous freight van", bob: "a cabin pendulum accelerometer", station: "the inspection pad" },
  { vehicle: "a rail-yard test locomotive", bob: "a roof-hung indicator sphere", station: "the buffer platform" },
  { vehicle: "an electric quarry haulage rig", bob: "a suspended brass bob", station: "the weighbridge" },
  { vehicle: "a proving-ground chassis mule", bob: "a light-string plumb mass", station: "the recovery marker" },
  { vehicle: "an airport baggage tractor", bob: "a cab-mounted pendulum bob", station: "the concourse stop" },
  { vehicle: "a harbour container carrier", bob: "a suspended mass indicator", station: "the berth checkpoint" },
  { vehicle: "a mine-tunnel shuttle vehicle", bob: "a ceiling pendulum sensor", station: "the shaft station" },
  { vehicle: "aheavy-duty rescue tender".replace("aheavy", "a heavy"), bob: "a suspended steel bob", station: "the depot line" },
  { vehicle: "an articulated test coach", bob: "a roof-mounted plumb sphere", station: "the timing gate" },
] as const;

interface RawDistractorCandidate {
  readonly value: number;
  readonly textOverride?: string;
  readonly rationale: string;
}

function buildDistinctMcqOptions(
  correctValue: number,
  unit: string,
  distractors: readonly RawDistractorCandidate[],
  correctIndex: 0 | 1 | 2 | 3,
  correctTextOverride?: string,
): McqOptionItem[] | null {
  const correctText =
    correctTextOverride ?? formatPhysicsQuantity(correctValue, unit);
  const correctKey = buildOptionEquivalenceKey(correctText);

  const selectedDistractors: Array<{ text: string; rationale: string }> = [];
  const usedKeys = new Set<string>([correctKey]);
  const chosenNums: number[] = [correctValue];

  for (const d of distractors) {
    if (!Number.isFinite(d.value)) {
      continue;
    }
    if (!d.textOverride && d.value < 0) {
      continue;
    }
    const text = d.textOverride ?? formatPhysicsQuantity(d.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) {
      continue;
    }

    if (!d.textOverride && !correctTextOverride) {
      const tooClose = chosenNums.some((existing) => {
        if (Math.abs(existing) < 1e-12 && Math.abs(d.value) < 1e-12) return true;
        if (Math.abs(existing) < 1e-12 || Math.abs(d.value) < 1e-12) {
          return Math.abs(existing - d.value) < 0.04;
        }
        return (
          Math.abs(d.value - existing) / Math.max(Math.abs(existing), 1e-12) <
          0.025
        );
      });
      if (tooClose) {
        continue;
      }
    }

    usedKeys.add(key);
    chosenNums.push(d.value);
    selectedDistractors.push({ text, rationale: d.rationale });
    if (selectedDistractors.length === 3) {
      break;
    }
  }

  if (selectedDistractors.length < 3) {
    return null;
  }

  const ordered: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = selectedDistractors.map((d) => ({
    text: d.text,
    isCorrect: false,
    distractorRationale: d.rationale,
  }));

  ordered.splice(correctIndex, 0, {
    text: correctText,
    isCorrect: true,
  });

  return ordered.map((item, i) => ({
    label: MCQ_OPTION_LABELS[i],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.distractorRationale
      ? { distractorRationale: item.distractorRationale }
      : {}),
  }));
}

function composeGravityClause(g: number, styleIndex: number): string {
  const variants = [
    `Take g = ${g} m s⁻².`,
    `Use g = ${g} m s⁻² and neglect air resistance.`,
    `Assume gravitational field strength g = ${g} m s⁻².`,
    `Take the acceleration of free fall to be g = ${g} m s⁻².`,
  ];
  return variants[styleIndex % variants.length];
}

function hasCoincidentGivenAndHidden(
  scenarioSpec: Record<string, unknown>,
  quantities: VerifiedQuantityMap,
  hiddenKeys: readonly string[],
): boolean {
  const givenNums: number[] = [];
  for (const [k, v] of Object.entries(scenarioSpec)) {
    if (!hiddenKeys.includes(k) && typeof v === "number" && Number.isFinite(v)) {
      givenNums.push(Math.abs(v), v);
    }
  }
  for (const hk of hiddenKeys) {
    const hv = quantities[hk];
    if (typeof hv === "number" && Number.isFinite(hv) && Math.abs(hv) > 1e-12) {
      for (const gv of givenNums) {
        if (
          numbersAgreeWithinTolerance(Math.abs(gv), Math.abs(hv), {
            significantFigures: 3,
            relativeTolerance: 0.018,
          })
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

interface ArchetypeBuildContext {
  readonly id: string;
  readonly seed: number;
  readonly descriptor: MechanicsArchetypeDescriptor;
  readonly format: QuestionFormat;
  readonly difficulty: QuestionDifficulty;
  readonly syllabi: SyllabusTag[];
  readonly g: 9.8 | 9.81;
  readonly isNonIbFriction: boolean;
  readonly variantIndex: number;
  readonly rng: SeededRng;
}

function buildStructuredFromParts(
  ctx: ArchetypeBuildContext,
  scenarioSpec: Record<string, unknown>,
  hiddenQuantities: string[],
  stem: string,
  questionPlan: CandidateQuestionPlan,
  partsSpec: Array<{
    partId: string;
    prompt: string;
    marks: number;
    dependsOnPartIds?: string[];
    targetQuantityKey: string;
    unit: string;
    expectedAnswerOverride?: string;
    methodCriterion: string;
    workingSteps: string[];
  }>,
  quantities: VerifiedQuantityMap,
): CandidateQuestionInput {
  const parts: StructuredQuestionPart[] = [];
  const markScheme: MarkSchemePoint[] = [];
  const workedSegments: string[] = [];
  let totalMarks = 0;

  for (const p of partsSpec) {
    const val = Number(quantities[p.targetQuantityKey]);
    const formatted =
      p.expectedAnswerOverride ?? formatPhysicsQuantity(val, p.unit);
    parts.push({
      partId: p.partId,
      prompt: p.prompt,
      marks: p.marks,
      ...(p.dependsOnPartIds ? { dependsOnPartIds: p.dependsOnPartIds } : {}),
      targetQuantityKey: p.targetQuantityKey,
      expectedAnswer: formatted,
      workingSteps: [...p.workingSteps, `Result = ${formatted}.`],
    });
    totalMarks += p.marks;

    if (p.marks === 3) {
      markScheme.push(
        {
          code: "M1",
          partId: p.partId,
          criterion: p.methodCriterion,
          marks: 1,
        },
        {
          code: "M1",
          partId: p.partId,
          criterion:
            p.workingSteps[0] ??
            "Substitutes supplied physical data into the governing relation.",
          marks: 1,
        },
        {
          code: "A1",
          partId: p.partId,
          criterion: `Obtains ${formatted}.`,
          marks: 1,
        },
      );
    } else {
      markScheme.push(
        {
          code: "M1",
          partId: p.partId,
          criterion: p.methodCriterion,
          marks: 1,
        },
        {
          code: "A1",
          partId: p.partId,
          criterion: `Obtains ${formatted}.`,
          marks: 1,
        },
      );
    }

    workedSegments.push(
      `(${p.partId}) ${p.workingSteps.join(" ")} Answer: ${formatted}.`,
    );
  }

  return {
    id: ctx.id,
    conceptId: ctx.descriptor.conceptId,
    templateArchetype: ctx.descriptor.archetype,
    seed: ctx.seed,
    syllabi: ctx.syllabi,
    format: "structured",
    difficulty: ctx.difficulty,
    domain: "mechanics",
    scenarioSpec,
    hiddenQuantities,
    questionPlan,
    stem,
    parts,
    workedSolution: workedSegments.join(" "),
    markScheme,
    totalMarks,
  };
}

// ============================================================================
// 16 NATIVE `9caae20` ARCHETYPE CANDIDATE CONSTRUCTORS
// ============================================================================

function buildSingleArchetypeCandidate(
  ctx: ArchetypeBuildContext,
): CandidateQuestionInput | null {
  const { rng, g, variantIndex } = ctx;
  const adapter = getDomainAdapter("mechanics");
  const correctIdx = rng.int(0, 3) as 0 | 1 | 2 | 3;
  const gClause = composeGravityClause(g, variantIndex);

  switch (ctx.descriptor.archetype) {
    // ------------------------------------------------------------------------
    // 1. INCLINE DYNAMIC FRICTION COEFFICIENT (`kind: "incline-friction"`)
    // ------------------------------------------------------------------------
    case "incline-dynamic-friction-coefficient": {
      const massKg = rng.step(1.5, 18.0, 0.5, 1);
      const lengthM = rng.step(2.5, 12.0, 0.5, 1);
      const angleDegrees = rng.pick([24, 28, 32, 36, 40, 44]);
      const theta = degToRad(angleDegrees);
      const freeFallSpeed = Math.sqrt(2 * g * lengthM * Math.sin(theta));
      const speedFrac = rng.step(0.52, 0.82, 0.03, 2);
      const finalSpeedMs = Number((freeFallSpeed * speedFrac).toFixed(2));

      const scenarioSpec = {
        kind: "incline-friction",
        massKg,
        lengthM,
        angleDegrees,
        finalSpeedMs,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "potentialJ",
        "kineticJ",
        "frictionLossJ",
        "frictionCoefficient",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = INCLINE_COEFF_CONTEXTS[variantIndex % INCLINE_COEFF_CONTEXTS.length];
      const muDef = ctx.isNonIbFriction
        ? "the coefficient of kinetic friction μ (defined by F_f = μ R)"
        : "the coefficient of dynamic friction μ_d";

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "frictionCoefficient" : "frictionLossJ";
        const unit = targetKey === "frictionCoefficient" ? "" : "J";
        const pot = Number(q.potentialJ);
        const kin = Number(q.kineticJ);
        const loss = Number(q.frictionLossJ);

        const distractors: RawDistractorCandidate[] =
          targetKey === "frictionCoefficient"
            ? [
                {
                  value: Math.tan(theta),
                  rationale:
                    "Sets μ = tan θ as if the block descended at constant speed, ignoring the kinetic energy gained.",
                },
                {
                  value: loss / (massKg * g * Math.sin(theta) * lengthM),
                  rationale:
                    "Swaps sin θ and cos θ in the normal reaction force R = mg cos θ.",
                },
                {
                  value: loss / (massKg * g * lengthM),
                  rationale:
                    "Uses R = mg instead of mg cos θ when relating frictional work to normal contact force.",
                },
                {
                  value: (pot + kin) / (massKg * g * Math.cos(theta) * lengthM),
                  rationale:
                    "Adds final kinetic energy to lost potential energy instead of subtracting.",
                },
              ]
            : [
                {
                  value: massKg * g * lengthM * Math.cos(theta) - kin,
                  rationale:
                    "Uses L cos θ instead of vertical drop L sin θ when calculating gravitational potential energy lost.",
                },
                {
                  value: pot,
                  rationale:
                    "Calculates total gravitational potential energy lost without subtracting final kinetic energy.",
                },
                {
                  value: kin,
                  rationale:
                    "Calculates only the final kinetic energy ½mv² rather than energy dissipated against friction.",
                },
                {
                  value: Math.abs(massKg * g * lengthM - kin),
                  rationale:
                    "Uses full ramp length L as vertical height h instead of L sin θ.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "frictionCoefficient"
            ? `What is ${muDef} between ${c.body} and ${c.ramp}?`
            : "How much mechanical energy is dissipated against friction during the descent?";

        const frames = [
          `Released from rest at the top of ${c.ramp} of length ${lengthM} m inclined at ${angleDegrees}° to the horizontal, ${c.body} of mass ${massKg} kg reaches the bottom with speed ${finalSpeedMs} m s⁻¹. ${gClause} ${ask}`,
          `Along ${c.ramp} inclined at ${angleDegrees}° to the horizontal, ${c.body} (mass ${massKg} kg) slides ${lengthM} m from rest and arrives at the base travelling at ${finalSpeedMs} m s⁻¹. ${gClause} ${ask}`,
          `The diagram shows ${c.body} of mass ${massKg} kg starting from rest and descending ${lengthM} m down ${c.ramp} angled at ${angleDegrees}°, attaining ${finalSpeedMs} m s⁻¹ at the bottom. ${gClause} ${ask}`,
          `During a surface-wear test on ${c.ramp} (${lengthM} m long, ${angleDegrees}° above the horizontal), ${c.body} of mass ${massKg} kg slides from rest to a bottom speed of ${finalSpeedMs} m s⁻¹. ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Combine inclined-plane energy loss with normal contact reaction to determine frictional dissipation or friction coefficient",
            distractorStrategy: [
              "assume-constant-speed-tan-theta",
              "swap-sine-and-cosine-on-incline",
              "omit-cosine-factor-in-normal-force",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Gravitational potential energy lost ΔE_p = mgL sin ${angleDegrees}° = ${formatPhysicsQuantity(pot, "J")}. Final kinetic energy E_k = ½(${massKg})(${finalSpeedMs})² = ${formatPhysicsQuantity(kin, "J")}. Frictional energy loss W_f = ΔE_p − E_k = ${formatPhysicsQuantity(loss, "J")}. Since W_f = μ(mg cos ${angleDegrees}°)L, μ = ${formatPhysicsNumber(Number(q.frictionCoefficient))}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates ΔE_p − E_k and normal reaction mg cos ${angleDegrees}° accurately to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Starting from rest at the top of ${c.ramp} of length ${lengthM} m inclined at ${angleDegrees}° to the horizontal, ${c.body} of mass ${massKg} kg slides to the bottom where its speed is ${finalSpeedMs} m s⁻¹. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Evaluate gravitational potential energy loss, kinetic energy gain, and kinetic friction coefficient on an inclined ramp",
          subpartStrategy: [
            "compute gravitational potential energy lost from vertical height L sin theta",
            "compute kinetic energy at base and deduce frictional work",
            "divide frictional work by normal reaction times ramp length for friction coefficient",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the gravitational potential energy lost during the slide.",
            marks: 2,
            targetQuantityKey: "potentialJ",
            unit: "J",
            methodCriterion: "Uses ΔE_p = mgL sin θ.",
            workingSteps: [
              `ΔE_p = ${massKg} × ${g} × ${lengthM} × sin ${angleDegrees}°.`,
            ],
          },
          {
            partId: "b",
            prompt:
              "Calculate the thermal energy dissipated by friction along the ramp.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "frictionLossJ",
            unit: "J",
            methodCriterion: "Subtracts ½mv² from ΔE_p.",
            workingSteps: [
              `E_k = 0.5 × ${massKg} × ${finalSpeedMs}² = ${formatPhysicsQuantity(Number(q.kineticJ), "J")}.`,
              `W_f = ${formatPhysicsNumber(Number(q.potentialJ))} − E_k.`,
            ],
          },
          {
            partId: "c",
            prompt: `Determine ${muDef} between ${c.body} and ${c.ramp}.`,
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "frictionCoefficient",
            unit: "",
            methodCriterion: "Applies W_f = μ(mg cos θ)L.",
            workingSteps: [
              `μ = ${formatPhysicsNumber(Number(q.frictionLossJ))} / (${massKg} × ${g} × cos ${angleDegrees}° × ${lengthM}).`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 2. ROUGH INCLINE RESISTIVE FORCE & HALF-SLOPE SCALING (`kind: "short-ramp"`)
    // ------------------------------------------------------------------------
    case "rough-incline-resistive-force-and-half-slope": {
      const massKg = rng.step(1.5, 16.0, 0.5, 1);
      const lengthM = rng.step(3.0, 11.0, 0.5, 1);
      const angleDegrees = rng.pick([22, 26, 30, 34, 38, 42]);
      const theta = degToRad(angleDegrees);
      const vFree = Math.sqrt(2 * g * lengthM * Math.sin(theta));
      const finalSpeedMs = Number((vFree * rng.step(0.5, 0.8, 0.05, 2)).toFixed(2));

      const scenarioSpec = {
        kind: "short-ramp",
        massKg,
        lengthM,
        angleDegrees,
        finalSpeedMs,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["frictionLossJ", "frictionN", "shortRampSpeedMs"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = SHORT_RAMP_CONTEXTS[variantIndex % SHORT_RAMP_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "frictionN" : "shortRampSpeedMs";
        const unit = targetKey === "frictionN" ? "N" : "m s⁻¹";

        const distractors: RawDistractorCandidate[] =
          targetKey === "frictionN"
            ? [
                {
                  value: massKg * g * Math.sin(theta),
                  rationale:
                    "Equates friction to the full downslope weight component mg sin θ, ignoring the downward acceleration.",
                },
                {
                  value: Number(q.frictionLossJ),
                  rationale:
                    "Stops at frictional work dissipated without dividing by ramp length L.",
                },
                {
                  value:
                    massKg * g * Math.cos(theta) -
                    (0.5 * massKg * finalSpeedMs ** 2) / lengthM,
                  rationale:
                    "Uses mg cos θ instead of mg sin θ for the component of weight along the ramp.",
                },
                {
                  value: (0.5 * massKg * finalSpeedMs ** 2) / lengthM,
                  rationale:
                    "Calculates the net accelerating force ma = ½mv²/L rather than the opposing friction force.",
                },
              ]
            : [
                {
                  value: 0.5 * finalSpeedMs,
                  rationale:
                    "Assumes final speed scales linearly with distance (v/2) instead of with √s (v/√2) under constant acceleration.",
                },
                {
                  value: finalSpeedMs / 4,
                  rationale:
                    "Divides speed by four instead of √2 when halving the release distance.",
                },
                {
                  value: Math.sqrt(g * lengthM * Math.sin(theta)),
                  rationale:
                    "Computes frictionless half-ramp speed and ignores the constant friction force.",
                },
                {
                  value: finalSpeedMs,
                  rationale:
                    "Assumes bottom speed is independent of release distance along the rough incline.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "frictionN"
            ? "What is the magnitude of the constant friction force opposing its motion?"
            : `If the same object is instead released from rest halfway down ${c.ramp}, what speed does it reach at the bottom?`;

        const frames = [
          `Released from rest at the top of ${c.ramp} of length ${lengthM} m inclined at ${angleDegrees}° to the horizontal, ${c.body} of mass ${massKg} kg reaches the bottom with speed ${finalSpeedMs} m s⁻¹ against a constant friction force. ${gClause} ${ask}`,
          `On ${c.ramp} (${lengthM} m long, angled at ${angleDegrees}° to the horizontal), ${c.body} of mass ${massKg} kg slides from rest and attains ${finalSpeedMs} m s⁻¹ at the base against constant kinetic friction. ${gClause} ${ask}`,
          `The diagram illustrates ${c.body} (${massKg} kg) released from rest at the top of ${c.ramp} of length ${lengthM} m and angle ${angleDegrees}°, arriving at the bottom at ${finalSpeedMs} m s⁻¹. ${gClause} ${ask}`,
          `In a chute calibration, ${c.body} of mass ${massKg} kg descends ${lengthM} m from rest down ${c.ramp} inclined at ${angleDegrees}° and exits the base at ${finalSpeedMs} m s⁻¹ under constant friction. ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Relate inclined-plane work-energy dissipation to constant resistive force and constant-acceleration distance scaling",
            distractorStrategy: [
              "equate-friction-to-parallel-weight-ignoring-acceleration",
              "linear-distance-scaling-instead-of-root-two",
              "confuse-net-force-with-friction-force",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Energy dissipated W_f = mgL sin ${angleDegrees}° − ½mv² = ${formatPhysicsQuantity(Number(q.frictionLossJ), "J")}. Constant friction force F_f = W_f / ${lengthM} = ${formatPhysicsQuantity(Number(q.frictionN), "N")}. Released halfway down at unchanged acceleration a, v_half = v / √2 = ${formatPhysicsQuantity(Number(q.shortRampSpeedMs), "m s⁻¹")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Applies work-energy / constant-acceleration scaling on the incline to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Released from rest at the top of ${c.ramp} of length ${lengthM} m inclined at ${angleDegrees}° to the horizontal, ${c.body} of mass ${massKg} kg slides against a constant friction force and reaches the bottom at ${finalSpeedMs} m s⁻¹. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine thermal energy loss, constant friction force, and half-length release bottom speed on a rough ramp",
          subpartStrategy: [
            "compute thermal energy dissipated from difference between potential energy lost and kinetic energy gained",
            "divide dissipated work by ramp length for friction force",
            "scale bottom speed using constant acceleration over half the ramp length",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the energy transferred to thermal energy during the slide.",
            marks: 2,
            targetQuantityKey: "frictionLossJ",
            unit: "J",
            methodCriterion: "Evaluates mgL sin θ − ½mv².",
            workingSteps: [
              `W_f = ${massKg} × ${g} × ${lengthM} × sin ${angleDegrees}° − 0.5 × ${massKg} × ${finalSpeedMs}².`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the magnitude of the friction force.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "frictionN",
            unit: "N",
            methodCriterion: "Divides dissipated energy from (a) by ramp length L.",
            workingSteps: [
              `F_f = ${formatPhysicsNumber(Number(q.frictionLossJ))} / ${lengthM}.`,
            ],
          },
          {
            partId: "c",
            prompt: `The object is now released from rest halfway down ${c.ramp}. Calculate its speed at the bottom.`,
            marks: 2,
            targetQuantityKey: "shortRampSpeedMs",
            unit: "m s⁻¹",
            methodCriterion:
              "Recognizes unchanged acceleration and applies v² ∝ s => v_new = v / √2.",
            workingSteps: [`v_new = ${finalSpeedMs} / √2.`],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 3. CONSTANT-SPEED INCLINE EQUILIBRIUM DRAG (`kind: "ramp-resistance"`)
    // ------------------------------------------------------------------------
    case "constant-speed-incline-equilibrium-drag": {
      const weightN = rng.step(120, 1800, 40, 0);
      const lengthM = rng.step(8, 35, 1, 0);
      const sinRatio = rng.step(0.24, 0.64, 0.04, 2);
      const heightM = Number((lengthM * sinRatio).toFixed(1));
      if (heightM <= 0 || heightM >= lengthM - 1) return null;

      const scenarioSpec = {
        kind: "ramp-resistance",
        weightN,
        lengthM,
        heightM,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["resistanceN", "lostPotentialEnergyJ"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        RAMP_RESISTANCE_CONTEXTS[variantIndex % RAMP_RESISTANCE_CONTEXTS.length];
      const cosFactor = Math.sqrt(1 - (heightM / lengthM) ** 2);

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "resistanceN" : "lostPotentialEnergyJ";
        const unit = targetKey === "resistanceN" ? "N" : "J";

        const distractors: RawDistractorCandidate[] =
          targetKey === "resistanceN"
            ? [
                {
                  value: weightN * cosFactor,
                  rationale:
                    "Resolves perpendicular normal reaction W cos θ instead of parallel equilibrium force W sin θ = Wh/L.",
                },
                {
                  value: (weightN * heightM) / Math.sqrt(lengthM ** 2 - heightM ** 2),
                  rationale:
                    "Uses W tan θ (dividing by horizontal base instead of slope length L).",
                },
                {
                  value: weightN,
                  rationale:
                    "Equates resistive force along the slope to the full vertical weight W.",
                },
                {
                  value: Number(q.lostPotentialEnergyJ),
                  rationale:
                    "Computes gravitational work Wh without dividing by slope distance L.",
                },
              ]
            : [
                {
                  value: weightN * lengthM,
                  rationale:
                    "Multiplies vertical weight W by slope distance L instead of vertical drop h.",
                },
                {
                  value: weightN * Math.sqrt(lengthM ** 2 - heightM ** 2),
                  rationale:
                    "Multiplies weight W by the horizontal base √(L² − h²) rather than vertical drop h.",
                },
                {
                  value: Number(q.resistanceN),
                  rationale:
                    "Calculates the resistive force Wh/L rather than the energy lost Wh.",
                },
                {
                  value: 0.5 * weightN * heightM,
                  rationale:
                    "Inserts an erroneous factor of ½ into gravitational potential energy change Wh.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "resistanceN"
            ? "What is the magnitude of the resistive force opposing motion along the slope?"
            : "How much gravitational potential energy is lost over the full length of the slope?";

        const frames = [
          `Sliding at constant velocity down ${c.ramp} of slope length ${lengthM} m and vertical drop ${heightM} m, ${c.body} has weight ${weightN} N. ${ask}`,
          `Of weight ${weightN} N, ${c.body} descends ${c.ramp} at steady speed over a slope distance of ${lengthM} m through a vertical height change of ${heightM} m. ${ask}`,
          `The diagram depicts ${c.body} weighing ${weightN} N moving at constant speed down ${c.ramp} of length ${lengthM} m and vertical height ${heightM} m. ${ask}`,
          `In translational equilibrium at constant speed, ${c.body} (weight ${weightN} N) travels ${lengthM} m down ${c.ramp}, dropping ${heightM} m vertically. ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Apply translational force equilibrium and work conservation to constant-velocity descent on an inclined ramp",
            distractorStrategy: [
              "use-cosine-normal-component-instead-of-sine",
              "multiply-weight-by-slope-length-instead-of-vertical-height",
              "confuse-work-with-force",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `At constant speed ΔE_k = 0. Potential energy lost = W h = ${weightN} × ${heightM} = ${formatPhysicsQuantity(Number(q.lostPotentialEnergyJ), "J")}. Parallel equilibrium gives F_res = W sin θ = W h / L = ${formatPhysicsQuantity(Number(q.resistanceN), "N")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses sin θ = ${heightM}/${lengthM} and zero net force to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Weighing ${weightN} N, ${c.body} slides at constant velocity down ${c.ramp}, covering a distance of ${lengthM} m along the slope for a vertical drop of ${heightM} m.`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine gravitational potential energy loss and opposing equilibrium drag force on a constant-speed ramp",
          subpartStrategy: [
            "evaluate gravitational potential energy lost from weight and vertical drop",
            "equate resistive work along slope to potential energy lost for constant speed",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the loss of gravitational potential energy over the full descent.",
            marks: 2,
            targetQuantityKey: "lostPotentialEnergyJ",
            unit: "J",
            methodCriterion: "Evaluates ΔE_p = W h (not W L).",
            workingSteps: [`ΔE_p = ${weightN} × ${heightM}.`],
          },
          {
            partId: "b",
            prompt:
              "Hence determine the mean resistive force acting up the slope.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "resistanceN",
            unit: "N",
            methodCriterion:
              "Uses constant speed (ΔE_k = 0) so F_res L = ΔE_p.",
            workingSteps: [
              `F_res = ${formatPhysicsNumber(Number(q.lostPotentialEnergyJ))} / ${lengthM}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 4. INCLINE FRICTIONAL DISSIPATION POWER (`kind: "ramp-heating"`)
    // ------------------------------------------------------------------------
    case "incline-frictional-dissipation-power": {
      const weightN = rng.step(150, 1600, 50, 0);
      const lengthM = rng.step(10, 32, 2, 0);
      const heightM = Number((lengthM * rng.step(0.25, 0.6, 0.05, 2)).toFixed(1));
      const speedMs = rng.step(1.5, 6.5, 0.5, 1);
      if (heightM <= 0 || heightM >= lengthM - 1) return null;

      const scenarioSpec = {
        kind: "ramp-heating",
        weightN,
        lengthM,
        heightM,
        speedMs,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["resistanceN", "thermalPowerW"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = RAMP_HEATING_CONTEXTS[variantIndex % RAMP_HEATING_CONTEXTS.length];
      const cosTheta = Math.sqrt(1 - (heightM / lengthM) ** 2);

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 3 === 0 ? "resistanceN" : "thermalPowerW";
        const unit = targetKey === "resistanceN" ? "N" : "W";

        const distractors: RawDistractorCandidate[] =
          targetKey === "thermalPowerW"
            ? [
                {
                  value: weightN * speedMs,
                  rationale:
                    "Multiplies full vertical weight W by speed v, omitting sin θ = h/L.",
                },
                {
                  value: weightN * heightM,
                  rationale:
                    "Calculates total gravitational energy Wh in joules instead of rate of thermal dissipation in watts.",
                },
                {
                  value: weightN * cosTheta * speedMs,
                  rationale:
                    "Multiplies normal reaction W cos θ by speed v despite normal force being perpendicular to velocity.",
                },
                {
                  value: Number(q.resistanceN) / speedMs,
                  rationale:
                    "Divides resistive force by speed instead of multiplying in P = Fv.",
                },
              ]
            : [
                {
                  value: weightN * cosTheta,
                  rationale:
                    "Computes perpendicular normal contact force W cos θ instead of parallel friction force W h / L.",
                },
                {
                  value: Number(q.thermalPowerW),
                  rationale:
                    "Multiplies by speed to obtain thermal power rather than friction force.",
                },
                {
                  value: weightN,
                  rationale:
                    "Equates friction along the incline directly to full weight W.",
                },
                {
                  value: (weightN * lengthM) / heightM,
                  rationale:
                    "Inverts the sine ratio to L/h instead of h/L.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "thermalPowerW"
            ? "At what rate is mechanical energy converted into thermal energy?"
            : "What is the magnitude of the friction force acting up the ramp?";

        const frames = [
          `Descending ${c.ramp} of length ${lengthM} m and vertical drop ${heightM} m at a steady speed of ${speedMs} m s⁻¹, ${c.body} has weight ${weightN} N. ${ask}`,
          `${c.body[0].toUpperCase()}${c.body.slice(1)} (weight ${weightN} N) slides at constant speed ${speedMs} m s⁻¹ down ${c.ramp}, which is ${lengthM} m long and drops ${heightM} m vertically. ${ask}`,
          `The diagram shows ${c.body} of weight ${weightN} N moving at constant speed ${speedMs} m s⁻¹ down ${c.ramp} of slope length ${lengthM} m and height ${heightM} m. ${ask}`,
          `While sliding down ${c.ramp} (${lengthM} m long, ${heightM} m vertical height) at constant speed ${speedMs} m s⁻¹, ${c.body} of weight ${weightN} N converts lost potential energy into heat. ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Combine constant-velocity inclined-plane force balance with instantaneous mechanical power P = Fv",
            distractorStrategy: [
              "multiply-full-weight-by-speed-ignoring-incline-angle",
              "compute-total-energy-instead-of-power",
              "use-normal-force-in-power-product",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `At constant speed, friction balances downslope weight: F_f = W(h/L) = ${weightN} × (${heightM}/${lengthM}) = ${formatPhysicsQuantity(Number(q.resistanceN), "N")}. Rate of thermal energy generation P = F_f v = ${formatPhysicsQuantity(Number(q.thermalPowerW), "W")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates F_f = Wh/L and P = F_f v to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Of weight ${weightN} N, ${c.body} slides down ${c.ramp} at a constant speed of ${speedMs} m s⁻¹. The ramp has length ${lengthM} m along the slope and a vertical drop of ${heightM} m.`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Calculate constant-speed ramp friction force and thermal dissipation power",
          subpartStrategy: [
            "resolve parallel component of weight in equilibrium for friction force",
            "multiply friction force by steady descent speed for thermal power",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the friction force opposing the motion down the ramp.",
            marks: 2,
            targetQuantityKey: "resistanceN",
            unit: "N",
            methodCriterion: "Uses F_f = W sin θ = W h / L at constant velocity.",
            workingSteps: [`F_f = ${weightN} × (${heightM} / ${lengthM}).`],
          },
          {
            partId: "b",
            prompt:
              "Determine the rate at which thermal energy is dissipated.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "thermalPowerW",
            unit: "W",
            methodCriterion: "Applies P = F_f v.",
            workingSteps: [
              `P = ${formatPhysicsNumber(Number(q.resistanceN))} × ${speedMs}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 5. LEVEL-GROUND OBLIQUE FLIGHT & RANGE (`kind: "projectile-kinematics"`)
    // ------------------------------------------------------------------------
    case "level-ground-oblique-flight-and-range": {
      const launchSpeedMs = rng.step(14.0, 44.0, 2.0, 1);
      const launchAngleDegrees = rng.pick([22, 26, 30, 34, 38, 52, 56, 60, 64, 68]);

      const scenarioSpec = {
        kind: "projectile-kinematics",
        launchSpeedMs,
        launchAngleDegrees,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "flightTimeS",
        "horizontalSpeedMs",
        "initialVerticalSpeedMs",
        "maxHeightM",
        "horizontalRangeM",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = PROJECTILE_CONTEXTS[variantIndex % PROJECTILE_CONTEXTS.length];
      const theta = degToRad(launchAngleDegrees);

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "horizontalRangeM" : "flightTimeS";
        const unit = targetKey === "horizontalRangeM" ? "m" : "s";

        const distractors: RawDistractorCandidate[] =
          targetKey === "horizontalRangeM"
            ? [
                {
                  value: 0.5 * Number(q.horizontalRangeM),
                  rationale:
                    "Multiplies horizontal speed by ascent time u sin θ / g instead of full flight time 2u sin θ / g.",
                },
                {
                  value: (launchSpeedMs ** 2 * Math.cos(theta) ** 2) / g,
                  rationale:
                    "Substitutes cos θ for sin θ in the flight-time expression.",
                },
                {
                  value: launchSpeedMs ** 2 / g,
                  rationale:
                    "Uses the 45° maximum-range formula u²/g without the angle factor sin(2θ).",
                },
                {
                  value: Number(q.maxHeightM),
                  rationale:
                    "Calculates maximum vertical height instead of horizontal range.",
                },
              ]
            : [
                {
                  value: (launchSpeedMs * Math.sin(theta)) / g,
                  rationale:
                    "Computes time to reach the apex u sin θ / g rather than full time of flight.",
                },
                {
                  value: (2 * launchSpeedMs * Math.cos(theta)) / g,
                  rationale:
                    "Swaps sin θ and cos θ when resolving vertical launch speed.",
                },
                {
                  value: (2 * launchSpeedMs) / g,
                  rationale:
                    "Uses total speed u instead of vertical component u sin θ.",
                },
                {
                  value: Math.sqrt((2 * launchSpeedMs * Math.sin(theta)) / g),
                  rationale:
                    "Takes an erroneous square root of 2u sin θ / g.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "horizontalRangeM"
            ? `What horizontal range does it cover before landing on ${c.ground}?`
            : `What is the total time of flight before returning to ${c.ground}?`;

        const frames = [
          `Across ${c.ground}, ${c.launcher} projects ${c.obj} with initial speed ${launchSpeedMs} m s⁻¹ at ${launchAngleDegrees}° above the horizontal. ${gClause} ${ask}`,
          `Fired from ${c.launcher} at ${launchSpeedMs} m s⁻¹ and ${launchAngleDegrees}° above the horizontal, ${c.obj} lands back on ${c.ground}. ${gClause} ${ask}`,
          `The diagram shows ${c.obj} launched at ${launchSpeedMs} m s⁻¹ inclined at ${launchAngleDegrees}° to ${c.ground}. ${gClause} ${ask}`,
          `During a range trial on ${c.ground}, ${c.obj} leaves ${c.launcher} at ${launchSpeedMs} m s⁻¹ and ${launchAngleDegrees}° above the horizontal. ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Resolve oblique launch velocity into horizontal and vertical components to find flight time or horizontal range",
            distractorStrategy: [
              "use-ascent-time-instead-of-total-flight-time",
              "swap-sine-and-cosine-launch-components",
              "omit-launch-angle-factor",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `u_y = ${launchSpeedMs} sin ${launchAngleDegrees}° = ${formatPhysicsQuantity(Number(q.initialVerticalSpeedMs), "m s⁻¹")} and u_x = ${launchSpeedMs} cos ${launchAngleDegrees}° = ${formatPhysicsQuantity(Number(q.horizontalSpeedMs), "m s⁻¹")}. Flight time T = 2u_y / ${g} = ${formatPhysicsQuantity(Number(q.flightTimeS), "s")}; horizontal range R = u_x T = ${formatPhysicsQuantity(Number(q.horizontalRangeM), "m")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Resolves orthogonal components accurately to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `On ${c.ground}, ${c.launcher} launches ${c.obj} from ground level at speed ${launchSpeedMs} m s⁻¹ and angle ${launchAngleDegrees}° above the horizontal. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Calculate initial vertical component, total flight time, and horizontal range for level-ground oblique launch",
          subpartStrategy: [
            "resolve vertical launch velocity component",
            "evaluate symmetric total flight time",
            "multiply horizontal velocity component by flight time for range",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the initial vertical component of velocity.",
            marks: 2,
            targetQuantityKey: "initialVerticalSpeedMs",
            unit: "m s⁻¹",
            methodCriterion: "Evaluates u_y = u sin θ.",
            workingSteps: [`u_y = ${launchSpeedMs} × sin ${launchAngleDegrees}°.`],
          },
          {
            partId: "b",
            prompt: `Determine the total time of flight before returning to ${c.ground}.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "flightTimeS",
            unit: "s",
            methodCriterion: "Applies T = 2u_y / g.",
            workingSteps: [
              `T = (2 × ${formatPhysicsNumber(Number(q.initialVerticalSpeedMs))}) / ${g}.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the horizontal range of the trajectory.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "horizontalRangeM",
            unit: "m",
            methodCriterion: "Multiplies u cos θ by flight time T.",
            workingSteps: [
              `R = (${launchSpeedMs} × cos ${launchAngleDegrees}°) × ${formatPhysicsNumber(Number(q.flightTimeS))}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 6. OBLIQUE PROJECTILE APEX SPEED & MAX HEIGHT (`kind: "projectile-kinematics"`)
    // ------------------------------------------------------------------------
    case "oblique-projectile-apex-speed-and-height": {
      const launchSpeedMs = rng.step(15.0, 45.0, 3.0, 1);
      const launchAngleDegrees = rng.pick([24, 28, 33, 37, 51, 55, 62, 66]);

      const scenarioSpec = {
        kind: "projectile-kinematics",
        launchSpeedMs,
        launchAngleDegrees,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "flightTimeS",
        "horizontalSpeedMs",
        "initialVerticalSpeedMs",
        "maxHeightM",
        "horizontalRangeM",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        PROJECTILE_CONTEXTS[(variantIndex + 4) % PROJECTILE_CONTEXTS.length];
      const theta = degToRad(launchAngleDegrees);

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "horizontalSpeedMs" : "maxHeightM";
        const unit = targetKey === "horizontalSpeedMs" ? "m s⁻¹" : "m";

        const distractors: RawDistractorCandidate[] =
          targetKey === "horizontalSpeedMs"
            ? [
                {
                  value: 0,
                  rationale:
                    "Assumes the projectile is momentarily stationary at its highest point, forgetting its constant horizontal velocity u cos θ.",
                },
                {
                  value: Number(q.initialVerticalSpeedMs),
                  rationale:
                    "Uses u sin θ instead of u cos θ for the speed at the apex.",
                },
                {
                  value: launchSpeedMs,
                  rationale:
                    "Assumes speed remains equal to launch speed u throughout the flight.",
                },
                {
                  value: launchSpeedMs * Math.tan(theta),
                  rationale:
                    "Multiplies launch speed by tan θ instead of cos θ.",
                },
              ]
            : [
                {
                  value: launchSpeedMs ** 2 / (2 * g),
                  rationale:
                    "Converts all initial kinetic energy into gravitational potential energy, forgetting non-zero horizontal speed u cos θ at the apex.",
                },
                {
                  value: (launchSpeedMs * Math.cos(theta)) ** 2 / (2 * g),
                  rationale:
                    "Uses horizontal component u cos θ instead of vertical component u sin θ in h = u_y² / (2g).",
                },
                {
                  value: (launchSpeedMs * Math.sin(theta)) ** 2 / g,
                  rationale:
                    "Omits the factor of two in the denominator of h_max = u_y² / (2g).",
                },
                {
                  value: Number(q.horizontalRangeM),
                  rationale:
                    "Calculates horizontal range rather than maximum vertical height.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "horizontalSpeedMs"
            ? "What is the speed of the projectile at the highest point of its trajectory?"
            : `What maximum vertical height above ${c.ground} does it reach?`;

        const frames = [
          `Projected from ${c.launcher} at ${launchSpeedMs} m s⁻¹ at an angle of ${launchAngleDegrees}° above ${c.ground}, ${c.obj} follows a parabolic arc. ${gClause} ${ask}`,
          `${c.obj[0].toUpperCase()}${c.obj.slice(1)} leaves ${c.launcher} at ${launchSpeedMs} m s⁻¹ inclined at ${launchAngleDegrees}° above the horizontal over ${c.ground}. ${gClause} ${ask}`,
          `In a kinematics experiment over ${c.ground}, ${c.obj} is launched at ${launchSpeedMs} m s⁻¹ and ${launchAngleDegrees}° above the horizontal. ${gClause} ${ask}`,
          `Referring to the launch of ${c.obj} from ${c.launcher} at ${launchSpeedMs} m s⁻¹ and ${launchAngleDegrees}° above ${c.ground}: ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Evaluate non-zero horizontal speed at projectile apex and maximum vertical ascent height",
            distractorStrategy: [
              "zero-speed-at-projectile-apex-misconception",
              "swap-sine-and-cosine-velocity-components",
              "convert-total-kinetic-energy-to-height",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `At the apex v_y = 0 while horizontal velocity remains constant at v_apex = u cos ${launchAngleDegrees}° = ${formatPhysicsQuantity(Number(q.horizontalSpeedMs), "m s⁻¹")}. Maximum height h_max = (u sin ${launchAngleDegrees}°)² / (2g) = ${formatPhysicsQuantity(Number(q.maxHeightM), "m")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses v_y = 0 and constant v_x = u cos ${launchAngleDegrees}° at apex to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Launched from ${c.launcher} across ${c.ground}, ${c.obj} has an initial speed of ${launchSpeedMs} m s⁻¹ at ${launchAngleDegrees}° above the horizontal. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine apex speed, maximum vertical height, and total flight time for an oblique projectile",
          subpartStrategy: [
            "identify speed at apex with conserved horizontal velocity component",
            "compute maximum height from vertical velocity component",
            "compute total flight time over level ground",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Determine the speed of the projectile at the highest point of its path.",
            marks: 2,
            targetQuantityKey: "horizontalSpeedMs",
            unit: "m s⁻¹",
            methodCriterion:
              "Recognizes v_y = 0 at apex so v_apex = u cos θ.",
            workingSteps: [`v_apex = ${launchSpeedMs} × cos ${launchAngleDegrees}°.`],
          },
          {
            partId: "b",
            prompt: `Calculate the maximum vertical height reached above ${c.ground}.`,
            marks: 2,
            targetQuantityKey: "maxHeightM",
            unit: "m",
            methodCriterion: "Applies h_max = (u sin θ)² / (2g).",
            workingSteps: [
              `u_y = ${launchSpeedMs} × sin ${launchAngleDegrees}° = ${formatPhysicsQuantity(Number(q.initialVerticalSpeedMs), "m s⁻¹")}.`,
              `h_max = u_y² / (2 × ${g}).`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the horizontal range of the projectile.",
            marks: 2,
            dependsOnPartIds: ["a", "b"],
            targetQuantityKey: "horizontalRangeM",
            unit: "m",
            methodCriterion: "Evaluates R = u_x × (2u_y / g).",
            workingSteps: [
              `T = 2u_y / ${g} = ${formatPhysicsQuantity(Number(q.flightTimeS), "s")}.`,
              `R = ${formatPhysicsNumber(Number(q.horizontalSpeedMs))} × T.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 7. INELASTIC CART COLLISION ENERGY LOSS (`kind: "collision-loss"`, forward X)
    // ------------------------------------------------------------------------
    case "inelastic-cart-collision-energy-loss": {
      const massXKg = rng.step(1.2, 5.2, 0.4, 1);
      const massYKg = rng.step(0.8, 3.6, 0.4, 1);
      const initialXMs = rng.step(4.0, 14.0, 1.0, 1);
      // Partially inelastic with v_X > 0: v_coalesce < finalYMs < min(v_elastic, mX*uX/mY)
      const vCoalesce = (massXKg * initialXMs) / (massXKg + massYKg);
      const vElastic = (2 * massXKg * initialXMs) / (massXKg + massYKg);
      const vStopX = (massXKg * initialXMs) / massYKg;
      const upper = Math.min(vElastic * 0.88, vStopX * 0.85);
      if (upper <= vCoalesce * 1.08) return null;
      const finalYMs = Number(
        (vCoalesce + (upper - vCoalesce) * rng.step(0.25, 0.75, 0.1, 2)).toFixed(2),
      );

      const scenarioSpec = {
        kind: "collision-loss",
        massXKg,
        massYKg,
        initialXMs,
        finalYMs,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      if (Number(q.lostEnergyJ) <= 0.4 || Number(q.finalXMs) <= 0.25) return null;
      const hidden = ["finalXMs", "initialEnergyJ", "finalEnergyJ", "lostEnergyJ"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        COLLISION_TRACK_CONTEXTS[variantIndex % COLLISION_TRACK_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 3 === 0 ? "finalXMs" : "lostEnergyJ";
        const unit = targetKey === "finalXMs" ? "m s⁻¹" : "J";
        const kyOnly = 0.5 * massYKg * finalYMs ** 2;

        const distractors: RawDistractorCandidate[] =
          targetKey === "lostEnergyJ"
            ? [
                {
                  value: Number(q.finalEnergyJ),
                  rationale:
                    "Computes the total final kinetic energy rather than subtracting it from initial kinetic energy.",
                },
                {
                  value: Math.abs(Number(q.initialEnergyJ) - kyOnly),
                  rationale:
                    "Assumes incident body X stops on impact without checking momentum conservation.",
                },
                {
                  value: kyOnly,
                  rationale:
                    "Calculates only the final kinetic energy of target body Y.",
                },
                {
                  value: Number(q.initialEnergyJ),
                  rationale:
                    "Computes the initial kinetic energy before collision.",
                },
              ]
            : [
                {
                  value: vCoalesce,
                  rationale:
                    "Assumes both bodies stick together instead of using the measured post-collision speed of Y.",
                },
                {
                  value:
                    (massXKg * initialXMs + massYKg * finalYMs) / massXKg,
                  rationale:
                    "Adds m_Y v_Y instead of subtracting m_Y v_Y when solving momentum conservation.",
                },
                {
                  value: Math.sqrt(
                    Math.max(
                      0.1,
                      initialXMs ** 2 - (massYKg / massXKg) * finalYMs ** 2,
                    ),
                  ),
                  rationale:
                    "Assumes kinetic energy is conserved in an inelastic collision.",
                },
                {
                  value: Math.abs(initialXMs - finalYMs),
                  rationale:
                    "Subtracts speeds directly without weighting by unequal masses.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "lostEnergyJ"
            ? "How much kinetic energy is lost in the collision?"
            : `What is the speed of ${c.xName} immediately after the collision?`;

        const frames = [
          `On ${c.track}, ${c.xName} of mass ${massXKg} kg moves right at ${initialXMs} m s⁻¹ and collides with stationary ${c.yName} of mass ${massYKg} kg. Immediately after impact, ${c.yName} moves right at ${finalYMs} m s⁻¹. ${ask}`,
          `Travelling at ${initialXMs} m s⁻¹ to the right along ${c.track}, ${c.xName} (${massXKg} kg) strikes stationary ${c.yName} (${massYKg} kg), sending ${c.yName} rightward at ${finalYMs} m s⁻¹. ${ask}`,
          `The diagram shows ${c.xName} of mass ${massXKg} kg moving right at ${initialXMs} m s⁻¹ toward stationary ${c.yName} of mass ${massYKg} kg on ${c.track}; after collision, ${c.yName} travels right at ${finalYMs} m s⁻¹. ${ask}`,
          `During an inelastic collision trial on ${c.track}, ${c.xName} (mass ${massXKg} kg, initial rightward speed ${initialXMs} m s⁻¹) hits stationary ${c.yName} (mass ${massYKg} kg), which moves off to the right at ${finalYMs} m s⁻¹. ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Conserve linear momentum to determine post-impact velocity and evaluate kinetic energy lost",
            distractorStrategy: [
              "report-final-kinetic-energy-instead-of-energy-lost",
              "assume-incident-cart-stops-without-momentum-check",
              "conserve-kinetic-energy-across-inelastic-impact",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Momentum conservation: (${massXKg})(${initialXMs}) = (${massXKg})v_X + (${massYKg})(${finalYMs}), giving v_X = ${formatPhysicsQuantity(Number(q.finalXMs), "m s⁻¹")}. K_i = ${formatPhysicsQuantity(Number(q.initialEnergyJ), "J")} and K_f = ${formatPhysicsQuantity(Number(q.finalEnergyJ), "J")}, so ΔK_lost = K_i − K_f = ${formatPhysicsQuantity(Number(q.lostEnergyJ), "J")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Conserves linear momentum and evaluates kinetic energy budget to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Along ${c.track}, ${c.xName} of mass ${massXKg} kg travels to the right at ${initialXMs} m s⁻¹ and collides with stationary ${c.yName} of mass ${massYKg} kg. Immediately after impact, ${c.yName} moves to the right at ${finalYMs} m s⁻¹.`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine post-collision speed of X, total post-collision kinetic energy, and kinetic energy lost",
          subpartStrategy: [
            "apply linear momentum conservation for velocity of X",
            "sum post-collision kinetic energies of both carts",
            "subtract final kinetic energy from initial kinetic energy",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the velocity of ${c.xName} immediately after the collision.`,
            marks: 2,
            targetQuantityKey: "finalXMs",
            unit: "m s⁻¹",
            methodCriterion: "Applies m_X u_X = m_X v_X + m_Y v_Y.",
            workingSteps: [
              `v_X = (${massXKg} × ${initialXMs} − ${massYKg} × ${finalYMs}) / ${massXKg}.`,
            ],
          },
          {
            partId: "b",
            prompt:
              "Calculate the total kinetic energy of the two bodies immediately after impact.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "finalEnergyJ",
            unit: "J",
            methodCriterion: "Sums ½m_X v_X² + ½m_Y v_Y².",
            workingSteps: [
              `K_f = 0.5(${massXKg})(${formatPhysicsNumber(Number(q.finalXMs))})² + 0.5(${massYKg})(${finalYMs})².`,
            ],
          },
          {
            partId: "c",
            prompt: "Determine the kinetic energy lost during the collision.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "lostEnergyJ",
            unit: "J",
            methodCriterion: "Subtracts K_f from K_i = ½m_X u_X².",
            workingSteps: [
              `K_i = 0.5 × ${massXKg} × ${initialXMs}² = ${formatPhysicsQuantity(Number(q.initialEnergyJ), "J")}.`,
              `ΔK_lost = K_i − ${formatPhysicsNumber(Number(q.finalEnergyJ))}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 8. COALESCING & REBOUND COLLISION ENERGETICS (`kind: "collision-loss"`, rebound X < 0!)
    // ------------------------------------------------------------------------
    case "coalescing-and-rebound-collision-energetics": {
      const massXKg = rng.step(0.6, 2.0, 0.2, 1);
      const massYKg = Number((massXKg * rng.step(2.2, 3.6, 0.2, 1)).toFixed(1));
      const initialXMs = rng.step(6.0, 16.0, 1.0, 1);
      // For m_Y > m_X, v_stop = m_X u_X / m_Y < v_elastic = 2 m_X u_X / (m_X + m_Y): X rebounds (finalXMs < 0)!
      const vStop = (massXKg * initialXMs) / massYKg;
      const vElastic = (2 * massXKg * initialXMs) / (massXKg + massYKg);
      const finalYMs = Number(
        (vStop + (vElastic - vStop) * rng.step(0.35, 0.85, 0.1, 2)).toFixed(2),
      );

      const scenarioSpec = {
        kind: "collision-loss",
        massXKg,
        massYKg,
        initialXMs,
        finalYMs,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const vx = Number(q.finalXMs);
      if (vx >= -0.25 || Number(q.lostEnergyJ) <= 0.2) return null;
      const hidden = ["finalXMs", "initialEnergyJ", "finalEnergyJ", "lostEnergyJ"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        COLLISION_TRACK_CONTEXTS[(variantIndex + 5) % COLLISION_TRACK_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "lostEnergyJ" : "finalEnergyJ";
        const kx = 0.5 * massXKg * vx * vx;
        const ky = 0.5 * massYKg * finalYMs * finalYMs;
        const wrongVxNoRebound =
          (massXKg * initialXMs + massYKg * finalYMs) / massXKg;

        const distractors: RawDistractorCandidate[] =
          targetKey === "lostEnergyJ"
            ? [
                {
                  value: Number(q.initialEnergyJ) - Math.abs(ky - kx),
                  rationale:
                    "Treats the rebounding kinetic energy of X as negative because v_X < 0, subtracting ½m_X v_X² instead of adding scalar kinetic energies.",
                },
                {
                  value: Math.abs(Number(q.initialEnergyJ) - ky),
                  rationale:
                    "Ignores the rebound kinetic energy of X completely after impact.",
                },
                {
                  value: Number(q.finalEnergyJ),
                  rationale:
                    "Reports total post-collision kinetic energy instead of kinetic energy lost.",
                },
                {
                  value: Math.abs(
                    0.5 * massXKg * wrongVxNoRebound ** 2 +
                      ky -
                      Number(q.initialEnergyJ),
                  ),
                  rationale:
                    "Commits a sign error when solving momentum conservation for rebounding X.",
                },
              ]
            : [
                {
                  value: Math.abs(ky - kx),
                  rationale:
                    "Subtracts the kinetic energy of rebounding X from Y as if kinetic energy were a signed vector.",
                },
                {
                  value: ky,
                  rationale:
                    "Includes only the kinetic energy of Y and forgets the kinetic energy of rebounding X.",
                },
                {
                  value: Number(q.lostEnergyJ),
                  rationale:
                    "Computes the kinetic energy dissipated rather than the total final kinetic energy.",
                },
                {
                  value: Number(q.initialEnergyJ),
                  rationale:
                    "Assumes the collision is perfectly elastic and equates K_f to K_i.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          "J",
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "lostEnergyJ"
            ? "How much kinetic energy is dissipated in this rebound collision?"
            : "What is the total kinetic energy of the two bodies immediately after impact?";

        const frames = [
          `On ${c.track}, lighter ${c.xName} of mass ${massXKg} kg moving right at ${initialXMs} m s⁻¹ strikes stationary heavier ${c.yName} of mass ${massYKg} kg, causing ${c.yName} to move right at ${finalYMs} m s⁻¹ while ${c.xName} rebounds to the left. ${ask}`,
          `Moving rightward at ${initialXMs} m s⁻¹ on ${c.track}, ${c.xName} (${massXKg} kg) collides head-on with stationary ${c.yName} (${massYKg} kg); immediately afterward ${c.yName} travels right at ${finalYMs} m s⁻¹ and ${c.xName} rebounds backward. ${ask}`,
          `The diagram shows ${c.xName} of mass ${massXKg} kg approaching stationary ${c.yName} of mass ${massYKg} kg at ${initialXMs} m s⁻¹ on ${c.track}. After impact, ${c.yName} moves right at ${finalYMs} m s⁻¹. ${ask}`,
          `In a rebound impact on ${c.track}, ${c.xName} (mass ${massXKg} kg, initial speed ${initialXMs} m s⁻¹ right) hits stationary ${c.yName} (mass ${massYKg} kg), which moves right at ${finalYMs} m s⁻¹. ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), "J");
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Solve rebound collision momentum conservation with signed recoil velocity and sum strictly positive scalar kinetic energies",
            distractorStrategy: [
              "treat-rebound-kinetic-energy-as-negative-vector",
              "omit-recoil-kinetic-energy-of-lighter-body",
              "swap-final-energy-and-lost-energy",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Taking rightward positive, (${massXKg})(${initialXMs}) = (${massXKg})v_X + (${massYKg})(${finalYMs}) gives v_X = ${formatPhysicsQuantity(vx, "m s⁻¹")} (${formatPhysicsQuantity(Math.abs(vx), "m s⁻¹")} to the left). Scalar final kinetic energies add: K_f = ½(${massXKg})(${formatPhysicsNumber(Math.abs(vx))})² + ½(${massYKg})(${finalYMs})² = ${formatPhysicsQuantity(Number(q.finalEnergyJ), "J")}. Energy lost = ${formatPhysicsQuantity(Number(q.initialEnergyJ), "J")} − K_f = ${formatPhysicsQuantity(Number(q.lostEnergyJ), "J")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Finds rebound speed ${formatPhysicsQuantity(Math.abs(vx), "m s⁻¹")} and sums scalar kinetic energies to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Along ${c.track}, ${c.xName} of mass ${massXKg} kg moves to the right at ${initialXMs} m s⁻¹ and strikes stationary ${c.yName} of mass ${massYKg} kg. Immediately after the collision, ${c.yName} moves to the right at ${finalYMs} m s⁻¹. Take rightward as positive.`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine signed rebound velocity, total scalar post-impact kinetic energy, and dissipated energy",
          subpartStrategy: [
            "solve momentum conservation for signed velocity of X",
            "sum positive scalar kinetic energies of both moving bodies",
            "compute kinetic energy lost from initial minus final kinetic energy",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the velocity (magnitude and direction) of ${c.xName} immediately after the collision.`,
            marks: 2,
            targetQuantityKey: "finalXMs",
            unit: "m s⁻¹",
            expectedAnswerOverride: `${formatPhysicsQuantity(Math.abs(vx), "m s⁻¹")} to the left`,
            methodCriterion:
              "Applies signed momentum conservation m_X u_X = m_X v_X + m_Y v_Y.",
            workingSteps: [
              `v_X = (${massXKg} × ${initialXMs} − ${massYKg} × ${finalYMs}) / ${massXKg} = ${formatPhysicsNumber(vx)} m s⁻¹.`,
            ],
          },
          {
            partId: "b",
            prompt:
              "Calculate the total kinetic energy of both bodies immediately after the collision.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "finalEnergyJ",
            unit: "J",
            methodCriterion: "Adds positive scalar kinetic energies ½m_X v_X² + ½m_Y v_Y².",
            workingSteps: [
              `K_f = 0.5(${massXKg})(${formatPhysicsNumber(Math.abs(vx))})² + 0.5(${massYKg})(${finalYMs})².`,
            ],
          },
          {
            partId: "c",
            prompt: "Determine the kinetic energy lost in the collision.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "lostEnergyJ",
            unit: "J",
            methodCriterion: "Evaluates K_i − K_f.",
            workingSteps: [
              `ΔK_lost = ${formatPhysicsNumber(Number(q.initialEnergyJ))} − ${formatPhysicsNumber(Number(q.finalEnergyJ))}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 9. HEAD-ON SIGNED MOMENTUM CONSERVATION (`kind: "cart-collision"`)
    // ------------------------------------------------------------------------
    case "head-on-signed-momentum-conservation": {
      const massXKg = rng.step(1.0, 4.0, 0.5, 1);
      const massYKg = rng.step(1.2, 4.2, 0.6, 1);
      const initialXMs = rng.step(5.0, 13.0, 1.0, 1);
      const uYMag = rng.step(2.0, 6.0, 0.5, 1);
      const initialYMs = -uYMag; // head-on leftward!
      const finalYMs = rng.step(1.5, 5.5, 0.5, 1);

      const scenarioSpec = {
        kind: "cart-collision",
        massXKg,
        massYKg,
        initialXMs,
        initialYMs,
        finalYMs,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const pBefore = Number(q.momentumBeforeKgMs);
      const vx = Number(q.finalXMs);
      if (Math.abs(pBefore) < 0.8 || Math.abs(vx) < 0.5) return null;
      // Check passive collision energy bound K_f <= K_i
      const ki = 0.5 * massXKg * initialXMs ** 2 + 0.5 * massYKg * uYMag ** 2;
      const kf = 0.5 * massXKg * vx ** 2 + 0.5 * massYKg * finalYMs ** 2;
      if (kf > ki - 0.1) return null;

      const hidden = ["finalXMs", "momentumBeforeKgMs"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        COLLISION_TRACK_CONTEXTS[(variantIndex + 2) % COLLISION_TRACK_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const dirRight = vx > 0;
        const magVx = Math.abs(vx);
        const wrongUnsignedInitVx =
          (massXKg * initialXMs + massYKg * uYMag - massYKg * finalYMs) / massXKg;
        if (Math.abs(Math.abs(wrongUnsignedInitVx) - magVx) / magVx < 0.05) {
          return null;
        }

        const correctText = `${formatPhysicsQuantity(magVx, "m s⁻¹")} to the ${dirRight ? "right" : "left"}`;
        const distractors: RawDistractorCandidate[] = [
          {
            value: magVx,
            textOverride: `${formatPhysicsQuantity(magVx, "m s⁻¹")} to the ${dirRight ? "left" : "right"}`,
            rationale:
              "Computes the correct post-collision speed magnitude for X but reverses its direction.",
          },
          {
            value: Math.abs(wrongUnsignedInitVx),
            textOverride: `${formatPhysicsQuantity(Math.abs(wrongUnsignedInitVx), "m s⁻¹")} to the ${wrongUnsignedInitVx >= 0 ? "right" : "left"}`,
            rationale:
              "Adds initial momentum magnitudes m_X |u_X| + m_Y |u_Y| instead of assigning a negative sign to Y's leftward approach velocity.",
          },
          {
            value: Math.abs(
              (pBefore + massYKg * finalYMs) / massXKg,
            ),
            textOverride: `${formatPhysicsQuantity(Math.abs((pBefore + massYKg * finalYMs) / massXKg), "m s⁻¹")} to the right`,
            rationale:
              "Commits a sign error on Y's post-collision rightward momentum when rearranging for v_X.",
          },
        ];

        const opts = buildDistinctMcqOptions(
          vx,
          "m s⁻¹",
          distractors,
          correctIdx,
          correctText,
        );
        if (!opts) return null;

        const frames = [
          `On ${c.track}, ${c.xName} of mass ${massXKg} kg moves right at ${initialXMs} m s⁻¹ toward ${c.yName} of mass ${massYKg} kg approaching head-on to the left at ${uYMag} m s⁻¹ (initial arrow on Y omitted). Immediately after collision, ${c.yName} moves right at ${finalYMs} m s⁻¹. What is the velocity of ${c.xName} immediately after impact?`,
          `Approaching each other along ${c.track}, ${c.xName} (${massXKg} kg, ${initialXMs} m s⁻¹ to the right) collides head-on with ${c.yName} (${massYKg} kg, ${uYMag} m s⁻¹ to the left, arrow not shown); afterward ${c.yName} travels to the right at ${finalYMs} m s⁻¹. Determine the final velocity of ${c.xName}.`,
          `Along ${c.track}, ${c.xName} of mass ${massXKg} kg travelling right at ${initialXMs} m s⁻¹ meets ${c.yName} of mass ${massYKg} kg travelling left at ${uYMag} m s⁻¹ (not drawn). After impact ${c.yName} rebounds right at ${finalYMs} m s⁻¹. What is the post-collision velocity of ${c.xName}?`,
          `During a head-on collision test on ${c.track}, ${c.xName} (${massXKg} kg) moves right at ${initialXMs} m s⁻¹ while ${c.yName} (${massYKg} kg) moves left at ${uYMag} m s⁻¹ (arrow omitted), and ${c.yName} exits right at ${finalYMs} m s⁻¹. Find the velocity of ${c.xName} right after collision.`,
        ];
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: "finalXMs",
          questionPlan: {
            targetSummary:
              "Apply signed collinear conservation of linear momentum to a head-on two-body collision",
            distractorStrategy: [
              "reverse-post-collision-velocity-sign",
              "omit-negative-sign-on-opposing-initial-momentum",
              "sign-error-when-isolating-recoil-momentum",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Taking rightward as positive: p_before = (${massXKg})(${initialXMs}) + (${massYKg})(−${uYMag}) = ${formatPhysicsQuantity(pBefore, "kg m s⁻¹")}. From p_before = (${massXKg})v_X + (${massYKg})(${finalYMs}), v_X = ${formatPhysicsNumber(vx)} m s⁻¹, which is ${correctText}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses signed head-on momentum p_before = ${formatPhysicsQuantity(pBefore, "kg m s⁻¹")} to obtain ${correctText} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `On ${c.track}, ${c.xName} of mass ${massXKg} kg moves to the right at ${initialXMs} m s⁻¹ and collides head-on with ${c.yName} of mass ${massYKg} kg moving to the left at ${uYMag} m s⁻¹ (arrow on Y not shown). Immediately after impact, ${c.yName} moves to the right at ${finalYMs} m s⁻¹. Take motion to the right as positive.`;
      const pText =
        pBefore >= 0
          ? `${formatPhysicsQuantity(pBefore, "kg m s⁻¹")} to the right`
          : `${formatPhysicsQuantity(Math.abs(pBefore), "kg m s⁻¹")} to the left`;
      const vText =
        vx >= 0
          ? `${formatPhysicsQuantity(vx, "m s⁻¹")} to the right`
          : `${formatPhysicsQuantity(Math.abs(vx), "m s⁻¹")} to the left`;

      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Compute signed total initial momentum and signed post-collision velocity in a head-on collision",
          subpartStrategy: [
            "sum signed initial momenta taking rightward as positive",
            "apply momentum conservation to determine magnitude and direction of post-impact velocity",
          ],
        },
        [
          {
            partId: "a",
            prompt:
              "Calculate the total momentum of the two-body system before the collision.",
            marks: 2,
            targetQuantityKey: "momentumBeforeKgMs",
            unit: "kg m s⁻¹",
            expectedAnswerOverride: pText,
            methodCriterion: "Evaluates m_X u_X − m_Y |u_Y| with correct signs.",
            workingSteps: [
              `p_before = ${massXKg} × ${initialXMs} + ${massYKg} × (−${uYMag}) = ${formatPhysicsNumber(pBefore)} kg m s⁻¹.`,
            ],
          },
          {
            partId: "b",
            prompt: `Hence determine the velocity (magnitude and direction) of ${c.xName} immediately after the collision.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "finalXMs",
            unit: "m s⁻¹",
            expectedAnswerOverride: vText,
            methodCriterion: "Solves p_before = m_X v_X + m_Y v_Y for v_X.",
            workingSteps: [
              `v_X = (${formatPhysicsNumber(pBefore)} − ${massYKg} × ${finalYMs}) / ${massXKg} = ${formatPhysicsNumber(vx)} m s⁻¹.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 10. BALLISTIC PENDULUM MOMENTUM & RISE (`kind: "pendulum-loss"`)
    // ------------------------------------------------------------------------
    case "ballistic-pendulum-momentum-and-rise": {
      const massKg = rng.step(0.4, 2.8, 0.2, 1);
      const targetMassKg = Number(
        (massKg * rng.pick([0.8, 1.2, 1.5, 2.0, 2.5])).toFixed(2),
      );
      const lengthM = rng.step(0.7, 2.4, 0.1, 1);

      const scenarioSpec = {
        kind: "pendulum-loss",
        massKg,
        targetMassKg,
        lengthM,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "bottomSpeedMs",
        "combinedSpeedMs",
        "lostEnergyJ",
        "riseM",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = PENDULUM_CONTEXTS[variantIndex % PENDULUM_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey = variantIndex % 2 === 0 ? "riseM" : "lostEnergyJ";
        const unit = targetKey === "riseM" ? "m" : "J";
        const initE = massKg * g * lengthM;

        const distractors: RawDistractorCandidate[] =
          targetKey === "riseM"
            ? [
                {
                  value: (massKg / (massKg + targetMassKg)) * lengthM,
                  rationale:
                    "Conserves mechanical energy across the sticking collision (mgL = (m+M)gh), omitting energy lost during impact.",
                },
                {
                  value: lengthM,
                  rationale:
                    "Assumes the coupled bodies swing back up to the full initial release height L.",
                },
                {
                  value: ((massKg / targetMassKg) ** 2) * lengthM,
                  rationale:
                    "Divides momentum by target mass M alone instead of combined mass (m + M).",
                },
                {
                  value: Number(q.combinedSpeedMs) / (2 * g),
                  rationale:
                    "Forgets to square the post-collision speed v in h = v² / (2g).",
                },
              ]
            : [
                {
                  value: initE - Number(q.lostEnergyJ),
                  rationale:
                    "Calculates the kinetic energy remaining after coalescence rather than the kinetic energy lost.",
                },
                {
                  value: initE,
                  rationale:
                    "Computes the entire pre-collision kinetic energy mgL instead of the energy lost.",
                },
                {
                  value:
                    initE *
                    (1 - (massKg / (massKg + targetMassKg)) ** 2),
                  rationale:
                    "Squares the mass fraction m/(m+M) directly on energy without multiplying by m+M (confusing ½(m+M)v² with ½m v²).",
                },
                {
                  value: 0.5 * targetMassKg * Number(q.combinedSpeedMs) ** 2,
                  rationale:
                    "Evaluates only the kinetic energy acquired by the target mass.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "riseM"
            ? "What maximum vertical height above the lowest point do the joined bodies reach?"
            : "How much mechanical energy is dissipated during the sticking collision?";

        const frames = [
          `In ${c.rig}, ${c.bob} of mass ${massKg} kg on a light string of length ${lengthM} m is released from rest with the string horizontal and coalesces at the lowest point with stationary ${c.target} of mass ${targetMassKg} kg. ${gClause} ${ask}`,
          `Released from rest from a horizontal string position of length ${lengthM} m in ${c.rig}, ${c.bob} (${massKg} kg) strikes and sticks to stationary ${c.target} (${targetMassKg} kg) at the bottom of its arc. ${gClause} ${ask}`,
          `The diagram shows ${c.bob} of mass ${massKg} kg swinging from a horizontal ${lengthM} m string in ${c.rig} to couple with stationary ${c.target} of mass ${targetMassKg} kg at the lowest point. ${gClause} ${ask}`,
          `Swinging down from rest with its ${lengthM} m string initially horizontal in ${c.rig}, ${c.bob} (mass ${massKg} kg) embeds into stationary ${c.target} (mass ${targetMassKg} kg) at the bottom. ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Separate conservative swing phases from perfectly inelastic impact momentum conservation in a ballistic pendulum",
            distractorStrategy: [
              "conserve-mechanical-energy-through-inelastic-collision",
              "report-remaining-energy-instead-of-dissipated-energy",
              "divide-by-target-mass-only",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Pre-impact speed u = √(2gL) = ${formatPhysicsQuantity(Number(q.bottomSpeedMs), "m s⁻¹")}. Tangential momentum conservation gives v = mu / (m + M) = ${formatPhysicsQuantity(Number(q.combinedSpeedMs), "m s⁻¹")}. Post-impact rise h = v² / (2g) = (m/(m+M))² L = ${formatPhysicsQuantity(Number(q.riseM), "m")}; energy lost = mgL − (m+M)gh = ${formatPhysicsQuantity(Number(q.lostEnergyJ), "J")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Conserves energy during swings and momentum during impact to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `In ${c.rig}, ${c.bob} of mass ${massKg} kg attached to a light inextensible string of length ${lengthM} m is released from rest with the string horizontal. At the lowest point of its swing it collides with and sticks to stationary ${c.target} of mass ${targetMassKg} kg. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Analyze ballistic pendulum pre-impact speed, kinetic energy loss during coupling, and subsequent vertical rise",
          subpartStrategy: [
            "equate potential energy lost to kinetic energy before impact",
            "conserve tangential momentum for coupled speed and compute dissipated energy",
            "convert post-impact kinetic energy to gravitational potential energy for rise",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the speed of ${c.bob} immediately before impact.`,
            marks: 2,
            targetQuantityKey: "bottomSpeedMs",
            unit: "m s⁻¹",
            methodCriterion: "Uses mgL = ½mu² => u = √(2gL).",
            workingSteps: [`u = √(2 × ${g} × ${lengthM}).`],
          },
          {
            partId: "b",
            prompt:
              "Calculate the kinetic energy lost during the coalescing collision.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "lostEnergyJ",
            unit: "J",
            methodCriterion:
              "Finds v = mu/(m+M) from momentum conservation and evaluates ½mu² − ½(m+M)v².",
            workingSteps: [
              `v = (${massKg} × ${formatPhysicsNumber(Number(q.bottomSpeedMs))}) / (${massKg} + ${targetMassKg}) = ${formatPhysicsQuantity(Number(q.combinedSpeedMs), "m s⁻¹")}.`,
              `ΔK_lost = 0.5(${massKg})u² − 0.5(${massKg} + ${targetMassKg})v².`,
            ],
          },
          {
            partId: "c",
            prompt:
              "Determine the maximum vertical rise of the joined bodies above the lowest point.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "riseM",
            unit: "m",
            methodCriterion: "Applies h = v² / (2g).",
            workingSteps: [
              `h = (${formatPhysicsNumber(Number(q.combinedSpeedMs))})² / (2 × ${g}).`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 11. PENDULUM SWING TENSION & IMPACT (`kind: "pendulum-collision"`, A-Level Y13!)
    // ------------------------------------------------------------------------
    case "pendulum-swing-tension-and-impact": {
      const massKg = rng.step(0.3, 2.5, 0.2, 1);
      const targetMassKg = Number(
        (massKg * rng.pick([1.0, 1.4, 1.8, 2.2])).toFixed(2),
      );
      const lengthM = rng.step(0.6, 2.2, 0.2, 1);

      const scenarioSpec = {
        kind: "pendulum-collision",
        massKg,
        targetMassKg,
        lengthM,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["bottomSpeedMs", "tensionN", "combinedSpeedMs", "riseM"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        PENDULUM_CONTEXTS[(variantIndex + 3) % PENDULUM_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "tensionN" : "combinedSpeedMs";
        const unit = targetKey === "tensionN" ? "N" : "m s⁻¹";

        const distractors: RawDistractorCandidate[] =
          targetKey === "tensionN"
            ? [
                {
                  value: massKg * g,
                  rationale:
                    "Equates string tension at the bottom to static weight mg, forgetting upward centripetal force mv²/L = 2mg.",
                },
                {
                  value: 2 * massKg * g,
                  rationale:
                    "Computes only the centripetal resultant mv²/L = 2mg and forgets to add mg for total string tension.",
                },
                {
                  value: (massKg + targetMassKg) * g,
                  rationale:
                    "Evaluates combined static weight (m + M)g rather than pre-collision string tension.",
                },
                {
                  value: 4 * massKg * g,
                  rationale:
                    "Uses v² = 3gL instead of 2gL at the bottom of a 90° swing.",
                },
              ]
            : [
                {
                  value: Number(q.bottomSpeedMs),
                  rationale:
                    "Gives the pre-collision speed √(2gL) without applying momentum conservation.",
                },
                {
                  value: Math.sqrt(
                    (massKg / (massKg + targetMassKg)) * 2 * g * lengthM,
                  ),
                  rationale:
                    "Conserves kinetic energy ½mu² = ½(m+M)v² across a sticking collision instead of conserving momentum.",
                },
                {
                  value: (massKg / targetMassKg) * Number(q.bottomSpeedMs),
                  rationale:
                    "Divides initial momentum mu by target mass M instead of combined mass (m + M).",
                },
                {
                  value: 0.5 * Number(q.bottomSpeedMs),
                  rationale:
                    "Halves the speed without accounting for the unequal masses m and M.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "tensionN"
            ? `What is the tension in the string immediately before ${c.bob} strikes ${c.target}?`
            : "What is the speed of the coupled bodies immediately after impact?";

        const frames = [
          `In ${c.rig}, ${c.bob} of mass ${massKg} kg hangs on a ${lengthM} m string, is released from rest with the string horizontal, and collides inelastically at the bottom with stationary ${c.target} of mass ${targetMassKg} kg. ${gClause} ${ask}`,
          `Held with its ${lengthM} m light string horizontal in ${c.rig}, ${c.bob} (${massKg} kg) swings down from rest and sticks to stationary ${c.target} (${targetMassKg} kg) at the lowest point. ${gClause} ${ask}`,
          `The diagram shows ${c.bob} of mass ${massKg} kg released from a horizontal ${lengthM} m string in ${c.rig} toward stationary ${c.target} of mass ${targetMassKg} kg at the bottom. ${gClause} ${ask}`,
          `Swinging from rest through a quarter-circle of radius ${lengthM} m in ${c.rig}, ${c.bob} (mass ${massKg} kg) couples on impact with stationary ${c.target} (mass ${targetMassKg} kg). ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Combine quarter-circle swing energy conservation with radial centripetal tension and sticking-impact momentum",
            distractorStrategy: [
              "equate-lowest-point-tension-to-weight-only",
              "omit-weight-from-centripetal-tension-sum",
              "conserve-kinetic-energy-instead-of-momentum-on-coupling",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Just before collision u² = 2gL => u = ${formatPhysicsQuantity(Number(q.bottomSpeedMs), "m s⁻¹")}. Radial Newton second law T − mg = mu²/L = 2mg gives T = 3mg = ${formatPhysicsQuantity(Number(q.tensionN), "N")}. Momentum conservation gives v = mu/(m+M) = ${formatPhysicsQuantity(Number(q.combinedSpeedMs), "m s⁻¹")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates quarter-swing dynamics and radial/tangential laws to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `In ${c.rig}, ${c.bob} of mass ${massKg} kg on a light string of length ${lengthM} m is released from rest with the string horizontal. At the lowest point it collides with and sticks to stationary ${c.target} of mass ${targetMassKg} kg. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Calculate pre-impact speed, lowest-point string tension, and post-coupling vertical rise",
          subpartStrategy: [
            "find lowest-point speed from gravitational potential energy loss",
            "apply radial Newton second law including centripetal acceleration for string tension",
            "conserve momentum during coupling and energy during subsequent rise",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the speed of ${c.bob} just before the collision.`,
            marks: 2,
            targetQuantityKey: "bottomSpeedMs",
            unit: "m s⁻¹",
            methodCriterion: "Uses mgL = ½mu².",
            workingSteps: [`u = √(2 × ${g} × ${lengthM}).`],
          },
          {
            partId: "b",
            prompt:
              "Calculate the tension in the string immediately before the collision.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "tensionN",
            unit: "N",
            methodCriterion: "Applies T = mg + mu²/L.",
            workingSteps: [
              `T = ${massKg} × (${g} + (${formatPhysicsNumber(Number(q.bottomSpeedMs))})² / ${lengthM}).`,
            ],
          },
          {
            partId: "c",
            prompt:
              "Determine the maximum vertical height reached by the joined bodies after collision.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "riseM",
            unit: "m",
            methodCriterion: "Conserves momentum v = mu/(m+M) then uses h = v²/(2g).",
            workingSteps: [
              `v = (${massKg} × ${formatPhysicsNumber(Number(q.bottomSpeedMs))}) / (${massKg} + ${targetMassKg}) = ${formatPhysicsQuantity(Number(q.combinedSpeedMs), "m s⁻¹")}.`,
              `h = v² / (2 × ${g}).`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 12. VERTICAL CIRCLE BOTTOM TENSION (`kind: "circle-bottom"`, A-Level Y13!)
    // ------------------------------------------------------------------------
    case "vertical-circle-bottom-tension": {
      const massKg = rng.step(0.3, 3.2, 0.2, 1);
      const radiusM = rng.step(0.5, 2.0, 0.1, 1);
      const minSpeed = Math.sqrt(g * radiusM * 1.6);
      const speedMs = Number(
        rng.step(Math.ceil(minSpeed * 2) / 2, minSpeed + 5.5, 0.5, 1).toFixed(1),
      );

      const scenarioSpec = {
        kind: "circle-bottom",
        massKg,
        radiusM,
        speedMs,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["tensionN", "centripetalForceN"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = CIRCLE_CONTEXTS[variantIndex % CIRCLE_CONTEXTS.length];
      const fc = Number(q.centripetalForceN);
      const mg = massKg * g;

      if (ctx.format === "mcq") {
        const distractors: RawDistractorCandidate[] = [
          {
            value: Math.abs(fc - mg),
            rationale:
              "Subtracts weight mg instead of adding mg, confusing the bottom of a vertical circle with the top.",
          },
          {
            value: fc,
            rationale:
              "Equates tension directly to centripetal force mv²/r and forgets the downward weight mg.",
          },
          {
            value: mg,
            rationale:
              "Sets tension equal to static weight mg, ignoring centripetal acceleration.",
          },
          {
            value: (massKg * speedMs) / radiusM + mg,
            rationale:
              "Uses mv/r instead of mv²/r for centripetal force.",
          },
        ];

        const opts = buildDistinctMcqOptions(
          Number(q.tensionN),
          "N",
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const frames = [
          `In ${c.rig}, ${c.obj} of mass ${massKg} kg whirls in a vertical circle of radius ${radiusM} m on ${c.cord} and passes through the lowest point at speed ${speedMs} m s⁻¹. ${gClause} What is the tension in ${c.cord} at the lowest point?`,
          `Whirled on ${c.cord} of length ${radiusM} m in ${c.rig}, ${c.obj} (${massKg} kg) has speed ${speedMs} m s⁻¹ at the bottom of its vertical circular path. ${gClause} Determine the tension in ${c.cord} at this instant.`,
          `The diagram shows ${c.obj} of mass ${massKg} kg moving at ${speedMs} m s⁻¹ through the bottom of a vertical circle of radius ${radiusM} m on ${c.cord} in ${c.rig}. ${gClause} What tension acts in ${c.cord}?`,
          `At the bottom of a vertical circle of radius ${radiusM} m in ${c.rig}, ${c.obj} of mass ${massKg} kg travels at ${speedMs} m s⁻¹ while attached to ${c.cord}. ${gClause} Calculate the tension in ${c.cord}.`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q.tensionN), "N");
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: "tensionN",
          questionPlan: {
            targetSummary:
              "Apply radial Newton second law with upward centripetal resultant at the bottom of a vertical circle",
            distractorStrategy: [
              "subtract-weight-as-if-at-top-of-circle",
              "omit-weight-term-from-tension",
              "forget-to-square-speed-in-centripetal-force",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `At the bottom, upward resultant force T − mg = mv²/r. Centripetal force mv²/r = ${massKg} × ${speedMs}² / ${radiusM} = ${formatPhysicsQuantity(fc, "N")}, so T = ${formatPhysicsNumber(fc)} + ${massKg} × ${g} = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Applies T = m(v²/r + g) at the bottom of the circle to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `In ${c.rig}, ${c.obj} of mass ${massKg} kg is attached to ${c.cord} of length ${radiusM} m and moves in a vertical circle, passing through the lowest point with speed ${speedMs} m s⁻¹. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine net centripetal force and cord tension at the lowest point of a vertical circle",
          subpartStrategy: [
            "compute upward resultant centripetal force from speed and radius",
            "add weight mg to resultant force for lowest-point cord tension",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the magnitude of the resultant centripetal force on ${c.obj} at the lowest point.`,
            marks: 2,
            targetQuantityKey: "centripetalForceN",
            unit: "N",
            methodCriterion: "Evaluates F_c = mv² / r.",
            workingSteps: [`F_c = (${massKg} × ${speedMs}²) / ${radiusM}.`],
          },
          {
            partId: "b",
            prompt: `Hence calculate the tension in ${c.cord} at the lowest point.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "tensionN",
            unit: "N",
            methodCriterion: "Applies T − mg = F_c => T = F_c + mg.",
            workingSteps: [
              `T = ${formatPhysicsNumber(fc)} + ${massKg} × ${g}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 13. VERTICAL CIRCLE BREAKING SPEED LIMIT (`kind: "circle-limit"`, A-Level Y13!)
    // ------------------------------------------------------------------------
    case "vertical-circle-breaking-speed-limit": {
      const massKg = rng.step(0.4, 3.0, 0.2, 1);
      const radiusM = rng.step(0.6, 2.2, 0.2, 1);
      const mult = rng.step(2.4, 5.8, 0.4, 1);
      const maxTensionN = Math.ceil(massKg * g * mult);

      const scenarioSpec = {
        kind: "circle-limit",
        massKg,
        radiusM,
        maxTensionN,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = ["safeSpeedMs"];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = CIRCLE_CONTEXTS[(variantIndex + 5) % CIRCLE_CONTEXTS.length];

      const distractors: RawDistractorCandidate[] = [
        {
          value: Math.sqrt(((maxTensionN / massKg + g) * radiusM)),
          rationale:
            "Adds g instead of subtracting g when rearranging T_max − mg = mv²/r.",
        },
        {
          value: Math.sqrt((maxTensionN * radiusM) / massKg),
          rationale:
            "Treats vertical circular motion as horizontal, omitting weight mg at the lowest point.",
        },
        {
          value: Math.sqrt(g * radiusM),
          rationale:
            "Computes minimum top-of-loop critical speed √(gr) instead of maximum safe bottom speed.",
        },
        {
          value: (maxTensionN / massKg - g) * radiusM,
          rationale:
            "Evaluates v² = (T_max/m − g)r without taking the square root.",
        },
      ];

      if (ctx.format === "mcq") {
        const opts = buildDistinctMcqOptions(
          Number(q.safeSpeedMs),
          "m s⁻¹",
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const frames = [
          `In ${c.rig}, ${c.obj} of mass ${massKg} kg moves in a vertical circle of radius ${radiusM} m on ${c.cord}, which snaps if tension exceeds ${maxTensionN} N. ${gClause} What is the maximum speed ${c.obj} can have at the bottom without breaking ${c.cord}?`,
          `Whirled in a vertical circle of radius ${radiusM} m on ${c.cord} (breaking tension ${maxTensionN} N) in ${c.rig}, ${c.obj} has mass ${massKg} kg. ${gClause} Determine the greatest safe speed at the lowest point.`,
          `The diagram shows ${c.obj} (${massKg} kg) at the bottom of a vertical circle of radius ${radiusM} m in ${c.rig}; ${c.cord} has a maximum safe tension of ${maxTensionN} N. ${gClause} What is the maximum allowed speed at this point?`,
          `During a tensile limit test in ${c.rig}, ${c.obj} of mass ${massKg} kg swings on ${c.cord} of length ${radiusM} m rated to ${maxTensionN} N maximum tension. ${gClause} Calculate the maximum speed at the bottom of the path.`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q.safeSpeedMs), "m s⁻¹");
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: "safeSpeedMs",
          questionPlan: {
            targetSummary:
              "Solve radial breaking-tension balance at the bottom of a vertical circle for maximum safe speed",
            distractorStrategy: [
              "add-gravity-instead-of-subtracting-from-max-tension",
              "ignore-weight-at-bottom-of-vertical-loop",
              "omit-square-root-on-speed-squared",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Tension is greatest at the bottom where T_max − mg = m v_max² / r. Thus v_max = √[((${maxTensionN}/${massKg}) − ${g}) × ${radiusM}] = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Solves T_max − mg = mv²/r to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `In ${c.rig}, ${c.obj} of mass ${massKg} kg moves in a vertical circle of radius ${radiusM} m attached to ${c.cord}. The maximum tension ${c.cord} can withstand without breaking is ${maxTensionN} N. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine maximum safe bottom speed from vertical-circle radial force limit",
          subpartStrategy: [
            "write radial force balance at lowest point and solve for maximum safe speed",
          ],
        },
        [
          {
            partId: "a",
            prompt: `By considering the forces acting on ${c.obj} at the lowest point, calculate the maximum speed at the bottom so ${c.cord} does not break.`,
            marks: 3,
            targetQuantityKey: "safeSpeedMs",
            unit: "m s⁻¹",
            methodCriterion:
              "Writes T_max − mg = m v_max² / r at the lowest point.",
            workingSteps: [
              `m v_max² / ${radiusM} = ${maxTensionN} − ${massKg} × ${g}.`,
              `v_max = √[((${maxTensionN} / ${massKg}) − ${g}) × ${radiusM}].`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 14. ELASTIC CORD DROP STIFFNESS & TENSION (`kind: "elastic-rope"`, Hooke's law!)
    // ------------------------------------------------------------------------
    case "elastic-cord-drop-stiffness-and-tension": {
      const massKg = rng.step(1.5, 12.0, 0.5, 1);
      const lengthM = rng.step(1.6, 4.4, 0.2, 1);
      const extensionM = rng.step(0.45, 1.35, 0.1, 2);
      const intervalS = rng.step(0.14, 0.38, 0.02, 2);

      const scenarioSpec = {
        kind: "elastic-rope",
        massKg,
        lengthM,
        extensionM,
        intervalS,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "speedAtAMs",
        "springConstantNm",
        "tensionAtBN",
        "upwardAccelerationAtBMs2",
        "meanRopeForceN",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        ELASTIC_ROPE_CONTEXTS[variantIndex % ELASTIC_ROPE_CONTEXTS.length];

      if (ctx.format === "mcq") {
        const targetKey =
          variantIndex % 2 === 0 ? "springConstantNm" : "tensionAtBN";
        const unit = targetKey === "springConstantNm" ? "N m⁻¹" : "N";

        const distractors: RawDistractorCandidate[] =
          targetKey === "springConstantNm"
            ? [
                {
                  value: (2 * massKg * g * lengthM) / extensionM ** 2,
                  rationale:
                    "Equates ½kx² to mgL instead of mg(L + x), forgetting the extra vertical drop x while the cord stretches.",
                },
                {
                  value: (massKg * g * (lengthM + extensionM)) / extensionM ** 2,
                  rationale:
                    "Omits the factor of ½ in elastic potential energy E_e = ½kx².",
                },
                {
                  value: (massKg * g) / extensionM,
                  rationale:
                    "Sets kx = mg as if the lowest turning point B were a static equilibrium position.",
                },
                {
                  value: (2 * massKg * g * (lengthM + extensionM)) / extensionM,
                  rationale:
                    "Divides by x instead of x² when solving ½kx² = mg(L + x).",
                },
              ]
            : [
                {
                  value: massKg * g,
                  rationale:
                    "Assumes tension equals mg at the lowest point B because instantaneous speed is zero, confusing v = 0 with a = 0.",
                },
                {
                  value: (2 * massKg * g * lengthM) / extensionM,
                  rationale:
                    "Uses gravitational drop L instead of total drop (L + x) when finding elastic energy.",
                },
                {
                  value: (massKg * g * (lengthM + extensionM)) / extensionM,
                  rationale:
                    "Omits the factor of two from ½kx² = mg(L + x) when solving for kx.",
                },
                {
                  value: Number(q.meanRopeForceN),
                  rationale:
                    "Computes the time-averaged arrest force between A and B rather than peak Hookean tension at B.",
                },
              ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "springConstantNm"
            ? `What is the spring constant of ${c.cord}?`
            : `What is the peak tension in ${c.cord} at the lowest point B?`;

        const frames = [
          `In ${c.rig}, ${c.obj} of mass ${massKg} kg is released from rest at the anchor of ${c.cord} of unstretched length ${lengthM} m. The cord becomes taut at A and stretches obeying Hooke's law by a maximum extension of ${extensionM} m over ${intervalS} s before ${c.obj} comes momentarily to rest at B. ${gClause} ${ask}`,
          `Released from rest at the support in ${c.rig}, ${c.obj} (${massKg} kg) falls freely through the ${lengthM} m natural length of ${c.cord} to point A and then extends the Hookean cord by ${extensionM} m during ${intervalS} s to instantaneous rest at B. ${gClause} ${ask}`,
          `The three-stage diagram shows ${c.obj} of mass ${massKg} kg dropped from rest at the support of ${c.cord} (natural length ${lengthM} m), reaching A taut and extending a further ${extensionM} m over ${intervalS} s to rest at lowest point B. ${gClause} ${ask}`,
          `Attached to ${c.cord} of unstretched length ${lengthM} m in ${c.rig}, ${c.obj} of mass ${massKg} kg falls from rest at the anchor, passes taut point A, and stretches the cord by ${extensionM} m in ${intervalS} s to rest at B. ${gClause} ${ask}`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Conserve gravitational and elastic strain energy over full drop (L + x) for a Hookean arrest cord",
            distractorStrategy: [
              "omit-extension-x-from-total-gravitational-drop",
              "confuse-instantaneous-rest-with-static-equilibrium",
              "omit-half-factor-in-elastic-potential-energy",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Total vertical drop from release S to lowest point B is L + x = ${lengthM} + ${extensionM} = ${Number((lengthM + extensionM).toFixed(2))} m. By energy conservation mg(L + x) = ½kx², giving k = 2mg(L + x)/x² = ${formatPhysicsQuantity(Number(q.springConstantNm), "N m⁻¹")} and peak tension T_B = kx = ${formatPhysicsQuantity(Number(q.tensionAtBN), "N")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Uses full vertical drop (${lengthM} + ${extensionM}) m in mg(L + x) = ½kx² to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `In ${c.rig}, ${c.obj} of mass ${massKg} kg is released from rest at the upper support of ${c.cord}, which has natural unstretched length ${lengthM} m and obeys Hooke's law when taut. The cord first becomes taut at A and reaches maximum extension ${extensionM} m at lowest point B after an arrest interval of ${intervalS} s. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Determine speed when cord becomes taut, Hookean spring constant, and upward acceleration at lowest point",
          subpartStrategy: [
            "compute free-fall speed at point A over natural length L",
            "conserve mechanical energy over total drop L + x for spring constant",
            "apply Newton second law at lowest point B for upward acceleration",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the speed of ${c.obj} as it passes point A where the cord first becomes taut.`,
            marks: 2,
            targetQuantityKey: "speedAtAMs",
            unit: "m s⁻¹",
            methodCriterion: "Uses free-fall relation v_A = √(2gL).",
            workingSteps: [`v_A = √(2 × ${g} × ${lengthM}).`],
          },
          {
            partId: "b",
            prompt: `Determine the spring constant of ${c.cord}.`,
            marks: 2,
            targetQuantityKey: "springConstantNm",
            unit: "N m⁻¹",
            methodCriterion:
              "Equates mg(L + x) = ½kx² over the complete vertical drop.",
            workingSteps: [
              `k = 2 × ${massKg} × ${g} × (${lengthM} + ${extensionM}) / ${extensionM}².`,
            ],
          },
          {
            partId: "c",
            prompt: `Calculate the upward acceleration of ${c.obj} at the lowest point B.`,
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "upwardAccelerationAtBMs2",
            unit: "m s⁻²",
            methodCriterion: "Evaluates a_B = (kx − mg) / m.",
            workingSteps: [
              `T_B = ${formatPhysicsNumber(Number(q.springConstantNm))} × ${extensionM} = ${formatPhysicsQuantity(Number(q.tensionAtBN), "N")}.`,
              `a_B = T_B / ${massKg} − ${g}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 15. BUNGEE ARREST IMPULSE & MEAN FORCE (`kind: "elastic-rope"`, J = F_net Δt!)
    // ------------------------------------------------------------------------
    case "bungee-arrest-impulse-mean-force": {
      const massKg = rng.step(2.0, 14.0, 1.0, 1);
      const lengthM = rng.step(1.8, 4.6, 0.2, 1);
      const extensionM = rng.step(0.5, 1.4, 0.1, 1);
      const intervalS = rng.step(0.12, 0.36, 0.03, 2);

      const scenarioSpec = {
        kind: "elastic-rope",
        massKg,
        lengthM,
        extensionM,
        intervalS,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      const hidden = [
        "speedAtAMs",
        "springConstantNm",
        "tensionAtBN",
        "upwardAccelerationAtBMs2",
        "meanRopeForceN",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c =
        ELASTIC_ROPE_CONTEXTS[(variantIndex + 4) % ELASTIC_ROPE_CONTEXTS.length];
      const va = Number(q.speedAtAMs);
      const netImpulseRate = (massKg * va) / intervalS;

      if (ctx.format === "mcq") {
        const distractors: RawDistractorCandidate[] = [
          {
            value: netImpulseRate,
            rationale:
              "Calculates mean resultant upward force mv_A/Δt and forgets to add downward weight mg to find mean cord tension.",
          },
          {
            value: Math.abs(netImpulseRate - massKg * g),
            rationale:
              "Subtracts mg from mv_A/Δt instead of adding mg in F_mean − mg = Δp/Δt.",
          },
          {
            value: massKg * va * intervalS + massKg * g,
            rationale:
              "Multiplies momentum change mv_A by Δt instead of dividing by Δt.",
          },
          {
            value: Number(q.tensionAtBN),
            rationale:
              "Calculates peak Hookean tension kx at B instead of the time-averaged force over Δt.",
          },
        ];

        const opts = buildDistinctMcqOptions(
          Number(q.meanRopeForceN),
          "N",
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const frames = [
          `Dropped from rest at the anchor in ${c.rig}, ${c.obj} of mass ${massKg} kg falls freely ${lengthM} m until ${c.cord} becomes taut at A, then stretches the cord by ${extensionM} m over ${intervalS} s to come momentarily to rest at B. ${gClause} What is the mean upward force exerted by ${c.cord} between A and B?`,
          `In ${c.rig}, ${c.obj} (${massKg} kg) falls from rest at the support through the ${lengthM} m slack length of ${c.cord} to point A and is brought momentarily to rest after stretching ${extensionM} m in a time of ${intervalS} s to B. ${gClause} Determine the time-averaged tension in ${c.cord} during this ${intervalS} s interval.`,
          `The diagram illustrates ${c.obj} of mass ${massKg} kg released at the support of ${c.cord} (natural length ${lengthM} m), becoming taut at A and decelerating to rest at B (extension ${extensionM} m) over ${intervalS} s. ${gClause} What mean force does ${c.cord} exert between A and B?`,
          `During an impulse-arrest test in ${c.rig}, ${c.obj} of mass ${massKg} kg drops freely ${lengthM} m to taut point A and extends ${c.cord} by ${extensionM} m over ${intervalS} s until instantaneous rest at B. ${gClause} Calculate the mean upward cord force during deceleration.`,
        ];
        const ansFmt = formatPhysicsQuantity(Number(q.meanRopeForceN), "N");
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: "meanRopeForceN",
          questionPlan: {
            targetSummary:
              "Apply impulse-momentum theorem (F_mean - mg) Δt = m v_A during vertical cord arrest",
            distractorStrategy: [
              "omit-weight-from-mean-upward-cord-force",
              "subtract-weight-instead-of-adding-weight",
              "confuse-peak-hookean-tension-with-mean-force",
            ],
          },
          stem: frames[variantIndex % frames.length],
          options: opts,
          workedSolution: `Speed when taut at A: v_A = √(2 × ${g} × ${lengthM}) = ${formatPhysicsQuantity(va, "m s⁻¹")} downward. Taking upward positive, (F_mean − mg)Δt = 0 − (−mv_A), so F_mean = mv_A / ${intervalS} + ${massKg}(${g}) = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Applies (F_mean − mg)Δt = mv_A with v_A = √(2gL) to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `Released from rest at the anchor of ${c.cord} (natural length ${lengthM} m) in ${c.rig}, ${c.obj} of mass ${massKg} kg falls freely to point A where the cord becomes taut, then stretches the cord by ${extensionM} m over ${intervalS} s before reaching instantaneous rest at B. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Combine free-fall kinematics with impulse-momentum arrest force and Hookean peak tension",
          subpartStrategy: [
            "evaluate speed at taut transition point A",
            "apply impulse-momentum theorem including gravity for mean upward cord force",
            "compare with peak Hookean tension at lowest point B",
          ],
        },
        [
          {
            partId: "a",
            prompt: `Calculate the speed of ${c.obj} at point A.`,
            marks: 2,
            targetQuantityKey: "speedAtAMs",
            unit: "m s⁻¹",
            methodCriterion: "Evaluates v_A = √(2gL).",
            workingSteps: [`v_A = √(2 × ${g} × ${lengthM}).`],
          },
          {
            partId: "b",
            prompt: `Calculate the mean upward force exerted by ${c.cord} during the ${intervalS} s arrest from A to B.`,
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "meanRopeForceN",
            unit: "N",
            methodCriterion:
              "Applies (F_mean − mg)Δt = m v_A, including weight mg.",
            workingSteps: [
              `Mean resultant upward force = (${massKg} × ${formatPhysicsNumber(va)}) / ${intervalS} = ${formatPhysicsQuantity(netImpulseRate, "N")}.`,
              `F_mean = ${formatPhysicsNumber(netImpulseRate)} + ${massKg} × ${g}.`,
            ],
          },
          {
            partId: "c",
            prompt: `Calculate the peak tension in ${c.cord} at point B.`,
            marks: 2,
            targetQuantityKey: "tensionAtBN",
            unit: "N",
            methodCriterion: "Uses mg(L + x) = ½kx² and T_B = kx.",
            workingSteps: [
              `T_B = 2 × ${massKg} × ${g} × (${lengthM} + ${extensionM}) / ${extensionM}.`,
            ],
          },
        ],
        q,
      );
    }

    // ------------------------------------------------------------------------
    // 16. ACCELEROMETER PLUMB LINE & CURVE SKID (`kind: "truck"`, A-Level Y13!)
    // ------------------------------------------------------------------------
    case "accelerometer-plumb-line-and-curve-skid": {
      const deflectionDegrees = rng.pick([18, 22, 26, 30, 34, 38]);
      const inclineDegrees = rng.pick([8, 10, 12, 14]);
      const radiusM = rng.step(40, 95, 5, 0);
      const frictionCoefficient = rng.step(0.45, 0.85, 0.05, 2);
      const massKg = rng.step(900, 1800, 100, 0);
      const initialSpeedMs = rng.step(14, 22, 1, 0);
      const resistanceN = rng.step(350, 620, 30, 0);

      const scenarioSpec = {
        kind: "truck",
        deflectionDegrees,
        inclineDegrees,
        radiusM,
        frictionCoefficient,
        massKg,
        initialSpeedMs,
        resistanceN,
        gravityMs2: g,
      };
      if (!adapter.validateScenario(scenarioSpec).valid) return null;
      const q = adapter.solveScenario(scenarioSpec).quantities;
      if (Number(q.arrivalSpeedMs) <= 1.5) return null;
      const hidden = [
        "accelerationMs2",
        "maximumCornerSpeedMs",
        "arcLengthM",
        "stoppingDistanceM",
        "initialEnergyJ",
        "resistingWorkJ",
        "arrivalSpeedMs",
      ];
      if (hasCoincidentGivenAndHidden(scenarioSpec, q, hidden)) return null;

      const c = TRUCK_CONTEXTS[variantIndex % TRUCK_CONTEXTS.length];
      const defRad = degToRad(deflectionDegrees);

      if (ctx.format === "mcq") {
        const modeIdx = variantIndex % 3;
        const targetKey =
          modeIdx === 0
            ? "accelerationMs2"
            : modeIdx === 1
              ? "maximumCornerSpeedMs"
              : "stoppingDistanceM";
        const unit =
          targetKey === "stoppingDistanceM"
            ? "m"
            : targetKey === "maximumCornerSpeedMs"
              ? "m s⁻¹"
              : "m s⁻²";

        const distractors: RawDistractorCandidate[] =
          targetKey === "accelerationMs2"
            ? [
                {
                  value: g * Math.sin(defRad),
                  rationale:
                    "Uses g sin θ as if on an inclined plane rather than resolving T sin θ = ma and T cos θ = mg to obtain g tan θ.",
                },
                {
                  value: g / Math.tan(defRad),
                  rationale:
                    "Inverts the ratio of horizontal to vertical components, evaluating g / tan θ instead of g tan θ.",
                },
                {
                  value: g * Math.cos(defRad),
                  rationale:
                    "Multiplies g by cos θ instead of tan θ.",
                },
                {
                  value: g * Math.sin(degToRad(inclineDegrees)),
                  rationale:
                    "Uses the later grade angle instead of the plumb-bob deflection angle.",
                },
              ]
            : targetKey === "maximumCornerSpeedMs"
              ? [
                  {
                    value: Math.sqrt(g * radiusM),
                    rationale:
                      "Omits the static friction coefficient μ_s in μ_s mg = mv²/R.",
                  },
                  {
                    value: Math.sqrt((g * radiusM) / frictionCoefficient),
                    rationale:
                      "Divides by μ_s instead of multiplying by μ_s.",
                  },
                  {
                    value: frictionCoefficient * g * radiusM,
                    rationale:
                      "Computes v² = μ_s g R without taking the square root.",
                  },
                  {
                    value: initialSpeedMs,
                    rationale:
                      "Confuses the coasting test entry speed with the maximum non-skidding speed.",
                  },
                ]
              : [
                  {
                    value: (massKg * initialSpeedMs) / resistanceN,
                    rationale:
                      "Divides momentum mv by resistance force (giving stopping time) instead of kinetic energy ½mv².",
                  },
                  {
                    value: (massKg * initialSpeedMs ** 2) / resistanceN,
                    rationale:
                      "Omits the factor of ½ in initial kinetic energy ½mv².",
                  },
                  {
                    value: Number(q.arcLengthM),
                    rationale:
                      "Calculates the semicircular road length πR rather than the coasting stopping distance.",
                  },
                  {
                    value: Number(q.initialEnergyJ),
                    rationale:
                      "Stops at initial kinetic energy without dividing by the resistive force.",
                  },
                ];

        const opts = buildDistinctMcqOptions(
          Number(q[targetKey]),
          unit,
          distractors,
          correctIdx,
        );
        if (!opts) return null;

        const ask =
          targetKey === "accelerationMs2"
            ? `What is the horizontal acceleration during the initial straight-line phase when ${c.bob} deflects by ${deflectionDegrees}°?`
            : targetKey === "maximumCornerSpeedMs"
              ? `What is the maximum speed on the flat semicircular curve of radius ${radiusM} m without skidding?`
              : `During the coasting test from ${initialSpeedMs} m s⁻¹ against ${resistanceN} N resistance, what total distance would it travel before coming to rest?`;

        const stem = `During multi-stage proving trials, ${c.vehicle} of mass ${massKg} kg accelerates horizontally so ${c.bob} hangs at ${deflectionDegrees}° to the vertical, later climbs a ${inclineDegrees}° grade at steady speed, traverses a flat semicircular bend of radius ${radiusM} m (static friction coefficient ${frictionCoefficient}), and coasts from ${initialSpeedMs} m s⁻¹ against a ${resistanceN} N resistive force toward ${c.station}. ${gClause} ${ask}`;
        const ansFmt = formatPhysicsQuantity(Number(q[targetKey]), unit);
        return {
          id: ctx.id,
          conceptId: ctx.descriptor.conceptId,
          templateArchetype: ctx.descriptor.archetype,
          seed: ctx.seed,
          syllabi: ctx.syllabi,
          format: "mcq",
          difficulty: ctx.difficulty,
          domain: "mechanics",
          scenarioSpec,
          hiddenQuantities: hidden,
          targetQuantityKey: targetKey,
          questionPlan: {
            targetSummary:
              "Apply planar plumb-line force equilibrium in an accelerating frame, flat-curve static friction limit, or coasting work-energy",
            distractorStrategy: [
              "use-g-sin-theta-instead-of-g-tan-theta-for-plumb-bob",
              "omit-friction-coefficient-or-square-root-on-curve",
              "divide-momentum-instead-of-kinetic-energy-by-drag",
            ],
          },
          stem,
          options: opts,
          workedSolution: `Plumb-bob equilibrium: T sin ${deflectionDegrees}° = ma and T cos ${deflectionDegrees}° = mg => a = g tan ${deflectionDegrees}° = ${formatPhysicsQuantity(Number(q.accelerationMs2), "m s⁻²")}. Flat curve limit: v_max = √(${frictionCoefficient} × ${g} × ${radiusM}) = ${formatPhysicsQuantity(Number(q.maximumCornerSpeedMs), "m s⁻¹")}. Coasting stop distance: s = ½(${massKg})(${initialSpeedMs})² / ${resistanceN} = ${formatPhysicsQuantity(Number(q.stoppingDistanceM), "m")}. Target = ${ansFmt}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates target vehicle mechanics relation cleanly to obtain ${ansFmt} (${MCQ_OPTION_LABELS[correctIdx]}).`,
              marks: 1,
            },
          ],
          totalMarks: 1,
        };
      }

      const stem = `During proving-ground tests, ${c.vehicle} of mass ${massKg} kg accelerates along a level straight so ${c.bob} deflects by ${deflectionDegrees}° from the vertical, climbs a straight ${inclineDegrees}° incline at constant speed, negotiates a flat semicircular curve of radius ${radiusM} m (coefficient of static friction ${frictionCoefficient}), and finally coasts along the semicircle from ${initialSpeedMs} m s⁻¹ against a constant ${resistanceN} N resistance toward ${c.station}. ${gClause}`;
      return buildStructuredFromParts(
        ctx,
        scenarioSpec,
        hidden,
        stem,
        {
          targetSummary:
            "Analyze plumb-bob horizontal acceleration, flat-curve non-skidding speed limit, and coasting arrival speed",
          subpartStrategy: [
            "resolve plumb-line tension components for horizontal acceleration",
            "equate limiting static friction to centripetal force on semicircular curve",
            "apply work-energy theorem along semicircular arc for arrival speed",
          ],
        },
        [
          {
            partId: "a",
            prompt: `By resolving forces on ${c.bob}, calculate the horizontal acceleration when the string deflects by ${deflectionDegrees}°.`,
            marks: 2,
            targetQuantityKey: "accelerationMs2",
            unit: "m s⁻²",
            methodCriterion:
              "Uses T sin θ = ma and T cos θ = mg => a = g tan θ.",
            workingSteps: [`a = ${g} × tan ${deflectionDegrees}°.`],
          },
          {
            partId: "b",
            prompt:
              "Calculate the maximum speed on the flat semicircular road without sliding.",
            marks: 2,
            targetQuantityKey: "maximumCornerSpeedMs",
            unit: "m s⁻¹",
            methodCriterion: "Applies μ_s mg = m v_max² / R.",
            workingSteps: [
              `v_max = √(${frictionCoefficient} × ${g} × ${radiusM}).`,
            ],
          },
          {
            partId: "c",
            prompt: `Calculate the speed with which ${c.vehicle} reaches ${c.station} at the end of the semicircular coast.`,
            marks: 3,
            targetQuantityKey: "arrivalSpeedMs",
            unit: "m s⁻¹",
            methodCriterion:
              "Subtracts resistive work F_res(πR) from initial kinetic energy ½mu².",
            workingSteps: [
              `K_i = 0.5 × ${massKg} × ${initialSpeedMs}² = ${formatPhysicsQuantity(Number(q.initialEnergyJ), "J")}; W_res = ${resistanceN} × π × ${radiusM} = ${formatPhysicsQuantity(Number(q.resistingWorkJ), "J")}.`,
              `v_f = √(2 × (K_i − W_res) / ${massKg}).`,
            ],
          },
        ],
        q,
      );
    }
  }
}

// ============================================================================
// BATCH GENERATOR (`generateMechanicsCandidates`)
// ============================================================================

const DIFFICULTY_ROTATION: readonly QuestionDifficulty[] = [
  "foundation",
  "standard",
  "standard",
  "higher",
];

/**
 * Deterministically synthesizes 300–350 solver- and gate-verified `mechanics`
 * question packages (~65% `mcq`, ~35% `structured`) across 16 distinct
 * `(conceptId, templateArchetype)` family groups using strictly `9caae20`'s
 * built-in `mechanics` scenario kinds (zero custom registry preloads required).
 */
export function generateMechanicsCandidates(
  options: GenerateMechanicsOptions = {},
): CandidateQuestionInput[] {
  const targetCount = options.count ?? 336;
  const baseSeed = options.baseSeed ?? 410_000;
  const mcqFraction = options.mcqFraction ?? 0.65;
  const similarityThreshold = options.nearDuplicateSimilarityThreshold ?? 0.78;

  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new Error("count must be a non-negative integer");
  }
  if (targetCount === 0) {
    return [];
  }

  const activeCatalogue = options.archetypesFilter?.length
    ? MECHANICS_ARCHETYPE_CATALOGUE.filter((d) =>
        options.archetypesFilter!.includes(d.archetype),
      )
    : MECHANICS_ARCHETYPE_CATALOGUE;

  if (activeCatalogue.length === 0) {
    throw new Error("archetypesFilter matched zero mechanics archetypes");
  }

  const activeProfiles = options.syllabiFilter?.length
    ? MECHANICS_SYLLABUS_PROFILES.filter((p) =>
        options.syllabiFilter!.includes(p.primarySyllabus),
      )
    : MECHANICS_SYLLABUS_PROFILES;

  if (activeProfiles.length === 0) {
    throw new Error("syllabiFilter matched zero syllabus profiles");
  }

  const targetMcqCount = Math.round(targetCount * mcqFraction);
  const candidates: CandidateQuestionInput[] = [];
  const acceptedStemPool: ExistingStemEntry[] = [];

  let mcqEmitted = 0;
  let structuredEmitted = 0;

  for (let idx = 0; idx < targetCount; idx += 1) {
    const remainingTotal = targetCount - idx;
    const remainingMcq = targetMcqCount - mcqEmitted;
    const wantMcq =
      remainingMcq >= remainingTotal
        ? true
        : remainingMcq <= 0
          ? false
          : ((idx * 13 + 5) % 20) / 20 < mcqFraction;

    const format: QuestionFormat = wantMcq ? "mcq" : "structured";
    if (format === "mcq") {
      mcqEmitted += 1;
    } else {
      structuredEmitted += 1;
    }

    const descriptor = activeCatalogue[idx % activeCatalogue.length];
    const archetypeOccurrence = Math.floor(idx / activeCatalogue.length);
    const requestedProfile =
      activeProfiles[(idx + archetypeOccurrence) % activeProfiles.length];
    const difficulty =
      DIFFICULTY_ROTATION[
        (archetypeOccurrence + (format === "structured" ? 1 : 0)) %
          DIFFICULTY_ROTATION.length
      ];

    const resolvedSyl = resolveMechanicsSyllabusTags(
      descriptor,
      requestedProfile,
      format,
    );

    const filteredTags = options.syllabiFilter?.length
      ? resolvedSyl.tags.filter((t) =>
          options.syllabiFilter!.includes(t.syllabus),
        )
      : resolvedSyl.tags;

    const effectiveTags =
      filteredTags.length > 0 ? filteredTags : resolvedSyl.tags;

    const seqNum = String(idx + 1).padStart(4, "0");
    const itemId = `sp-mech-${format}-${seqNum}`;

    let accepted: CandidateQuestionInput | null = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const attemptSeed = baseSeed + idx * 97 + attempt * 7_919;
      const rng = createMechanicsRng(attemptSeed);
      const variantIndex =
        archetypeOccurrence * 3 + attempt + (format === "mcq" ? 0 : 5);

      const built = buildSingleArchetypeCandidate({
        id: itemId,
        seed: attemptSeed,
        descriptor,
        format,
        difficulty,
        syllabi: effectiveTags,
        g: resolvedSyl.effectiveGravityMs2,
        isNonIbFriction: resolvedSyl.isNonIbFriction,
        variantIndex,
        rng,
      });
      if (!built) {
        continue;
      }

      const gate = verifyCandidateWithGate(built, {
        existingShardItems: acceptedStemPool,
        nearDuplicateSimilarityThreshold: similarityThreshold,
      });
      if (gate.evaluation.valid) {
        accepted = built;
        acceptedStemPool.push({
          id: built.id,
          stem: built.stem,
          stemFingerprint: gate.evaluation.stemFingerprint,
        });
        break;
      }
    }

    if (!accepted) {
      for (let attempt = 80; attempt < 180; attempt += 1) {
        const attemptSeed = baseSeed + idx * 97 + attempt * 7_919;
        const rng = createMechanicsRng(attemptSeed);
        const variantIndex = archetypeOccurrence + attempt;
        const built = buildSingleArchetypeCandidate({
          id: itemId,
          seed: attemptSeed,
          descriptor,
          format,
          difficulty,
          syllabi: effectiveTags,
          g: resolvedSyl.effectiveGravityMs2,
          isNonIbFriction: resolvedSyl.isNonIbFriction,
          variantIndex,
          rng,
        });
        if (!built) continue;
        const gate = verifyCandidateWithGate(built, {
          existingShardItems: acceptedStemPool,
          nearDuplicateSimilarityThreshold: 0.88,
        });
        if (gate.evaluation.valid) {
          accepted = built;
          acceptedStemPool.push({
            id: built.id,
            stem: built.stem,
            stemFingerprint: gate.evaluation.stemFingerprint,
          });
          break;
        }
      }
    }

    if (!accepted) {
      throw new Error(
        `Failed to synthesize gate-valid mechanics candidate at index ${idx} (${descriptor.archetype}, ${format}, structuredSoFar=${structuredEmitted})`,
      );
    }

    candidates.push(accepted);
  }

  void formatSignificantFigures(structuredEmitted, 3);

  return candidates;
}
