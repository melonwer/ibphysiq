import {
  FIELD_INTENT_SCHEMA_VERSION,
  FieldIntent,
  compileFieldIntent,
} from "./field-intent";
import { VisualSpec } from "./types";

export interface FieldSourceFixture {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  paper: "1A" | "2";
  sourceCrops: string[];
  sourceEvidence: "mined-crop";
  sourceFamilyCorrection?: "geometry_scene→field_map";
  capabilities: string[];
  sourceNote: string;
  sourceVisualKind: "field-map" | "plot-only";
  trainingEligibility: "blocked";
  intent?: FieldIntent;
  spec?: VisualSpec<"field_map">;
}

type Definition = Omit<
  FieldSourceFixture,
  "sourceEvidence" | "sourceVisualKind" | "trainingEligibility" | "spec"
>;

const MINED = "dataset/_derived/paper-mining-v0.1/assets/";
const crop = (sourceId: string, filename: string): string =>
  `${MINED}${sourceId}/${filename}`;

function fixture(definition: Definition): FieldSourceFixture {
  return {
    ...definition,
    sourceEvidence: "mined-crop",
    sourceVisualKind: definition.intent ? "field-map" : "plot-only",
    trainingEligibility: "blocked",
    spec: definition.intent ? compileFieldIntent(definition.intent) : undefined,
  };
}

export const FIELD_SOURCE_FIXTURES: readonly FieldSourceFixture[] = [
  fixture({
    id: "may25-tz2-hl-1a-q22-field-superposition",
    sourceQuestionId: "q_edf0d4c93f40da3dbb95",
    sourceQuestion: "May 2025 TZ2 HL Paper 1A Q22",
    paper: "1A",
    sourceCrops: [crop("src_1a8e1d9cb248f5fddbda", "p011_v01.png")],
    sourceFamilyCorrection: "geometry_scene→field_map",
    capabilities: ["linear-sources", "signed-superposition", "dimensions"],
    sourceNote:
      "Two unequal positive charges with P between them; scheme answer B.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "may25-tz2-hl-1a-q22-field-superposition-visual",
      scenarioRef: "may25-tz2-hl-1a-q22-field-superposition",
      templateId: "linear-sources.v1",
      sources: [
        {
          id: "charge-q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 1,
          label: "+Q",
          appearance: "dot",
          labelPlacement: "above",
        },
        {
          id: "charge-2q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 2,
          label: "+2Q",
          appearance: "dot",
          labelPlacement: "above",
        },
      ],
      marker: {
        id: "point-p",
        label: "P",
        appearance: "cross",
        labelPlacement: "above",
        placement: { kind: "between", fractionFromLeft: 1 / 3 },
      },
      dimensions: { leftToMarker: "x", markerToRight: "2x" },
      baselineStyle: "solid",
      dimensionExtensionStyle: "dashed",
      provenance: { sourceQuestionId: "q_edf0d4c93f40da3dbb95" },
    },
  }),
  fixture({
    id: "nov25-tz3-hl-1a-q27-zero-field-mass-ratio",
    sourceQuestionId: "q_70902f47f8aafec99d68",
    sourceQuestion: "November 2025 TZ3 HL Paper 1A Q27",
    paper: "1A",
    sourceCrops: [crop("src_cc6825c9bc4a3c008f1a", "p014_v01.png")],
    sourceFamilyCorrection: "geometry_scene→field_map",
    capabilities: ["linear-sources", "gravitational-field", "zero-field-point"],
    sourceNote:
      "Planetary masses X and Y with zero gravitational field at P; scheme answer C.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "nov25-tz3-hl-1a-q27-zero-field-mass-ratio-visual",
      scenarioRef: "nov25-tz3-hl-1a-q27-zero-field-mass-ratio",
      templateId: "linear-sources.v1",
      sources: [
        {
          id: "planet-x",
          kind: "point-mass",
          relativeMagnitude: 1,
          label: "X",
          labelPlacement: "above",
        },
        {
          id: "planet-y",
          kind: "point-mass",
          relativeMagnitude: 4,
          label: "Y",
          labelPlacement: "above",
        },
      ],
      marker: {
        id: "point-p",
        label: "P",
        appearance: "dot",
        labelPlacement: "above",
        placement: { kind: "between", fractionFromLeft: 1 / 3 },
      },
      dimensions: { total: "R", leftToMarker: "R/3" },
      dimensionExtensionStyle: "solid",
      provenance: { sourceQuestionId: "q_70902f47f8aafec99d68" },
    },
  }),
  fixture({
    id: "nov25-tz3-hl-1a-q28-equipotential-gradient",
    sourceQuestionId: "q_71541fc5f652f66a7338",
    sourceQuestion: "November 2025 TZ3 HL Paper 1A Q28",
    paper: "1A",
    sourceCrops: [crop("src_cc6825c9bc4a3c008f1a", "p014_v02.png")],
    capabilities: ["equipotentials", "potential-gradient", "direction"],
    sourceNote:
      "Three equally spaced gravitational equipotentials with P on the middle line; scheme answer C.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "nov25-tz3-hl-1a-q28-equipotential-gradient-visual",
      scenarioRef: "nov25-tz3-hl-1a-q28-equipotential-gradient",
      templateId: "parallel-equipotentials.v1",
      labels: ["−5 MJ kg⁻¹", "−3 MJ kg⁻¹", "−1 MJ kg⁻¹"],
      marker: { id: "mass-p", label: "P", lineIndex: 1 },
      spacingLabel: "100 km",
      provenance: { sourceQuestionId: "q_71541fc5f652f66a7338" },
    },
  }),
  fixture({
    id: "may26-tz2-hl-1a-q27-field-line-options",
    sourceQuestionId: "q_9a14d2c4c3cda7562cec",
    sourceQuestion: "May 2026 TZ2 HL Paper 1A Q27",
    paper: "1A",
    sourceCrops: [
      crop("src_35c32668e012ab7e7601", "p016_v01.png"),
      crop("src_35c32668e012ab7e7601", "p016_v02.png"),
    ],
    capabilities: ["field-lines", "panel-grid", "qualitative-distractors"],
    sourceNote:
      "A genuine 2×2 option grid for positive charges q and 3q; scheme answer D.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "may26-tz2-hl-1a-q27-field-line-options-visual",
      scenarioRef: "may26-tz2-hl-1a-q27-field-line-options",
      templateId: "two-charge-field-lines.v1",
      sources: [
        {
          id: "charge-q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 1,
          label: "q",
          labelPlacement: "center",
        },
        {
          id: "charge-3q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 3,
          label: "3q",
          labelPlacement: "center",
        },
      ],
      panels: [
        { id: "A", label: "A", variant: "equal-density" },
        { id: "B", label: "B", variant: "flat-separatrix" },
        { id: "C", label: "C", variant: "inverted-null" },
        { id: "D", label: "D", variant: "strength-weighted" },
      ],
      columns: 2,
      provenance: { sourceQuestionId: "q_9a14d2c4c3cda7562cec" },
    },
  }),
  fixture({
    id: "may25-tz3-sl-2-q5-zero-field-stability",
    sourceQuestionId: "q_52220c80f303d2bb3c59",
    sourceQuestion: "May 2025 TZ3 SL Paper 2 Q5",
    paper: "2",
    sourceCrops: [crop("src_dcc2eaf32f00f66421d8", "p009_v01.png")],
    sourceFamilyCorrection: "geometry_scene→field_map",
    capabilities: ["linear-sources", "zero-field-point", "stability"],
    sourceNote:
      "Unequal positive charges, zero-field location, and axial/perpendicular stability.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "may25-tz3-sl-2-q5-zero-field-stability-visual",
      scenarioRef: "may25-tz3-sl-2-q5-zero-field-stability",
      templateId: "linear-sources.v1",
      sources: [
        {
          id: "charge-4q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 4,
          label: "+4q",
        },
        {
          id: "charge-q",
          kind: "point-charge",
          sign: 1,
          relativeMagnitude: 1,
          label: "+q",
        },
      ],
      marker: { id: "point-x", label: "X", placement: { kind: "between" } },
      dimensions: { total: "d" },
      baselineLabel: "L",
      provenance: { sourceQuestionId: "q_52220c80f303d2bb3c59" },
    },
  }),
  fixture({
    id: "may26-tz2-hl-2-q4-two-charge-field",
    sourceQuestionId: "q_b91a7e28973778135de4",
    sourceQuestion: "May 2026 TZ2 HL Paper 2 Q4",
    paper: "2",
    sourceCrops: [
      crop("src_80fe56b5f53f2eac4a8c", "p008_v01.png"),
      crop("src_80fe56b5f53f2eac4a8c", "p008_v02.png"),
    ],
    capabilities: [
      "linear-sources",
      "signed-superposition",
      "derived-cartesian-plot",
    ],
    sourceNote:
      "Two source spheres R and S plus a resultant electric-field graph derived from one scenario.",
    intent: {
      schemaVersion: FIELD_INTENT_SCHEMA_VERSION,
      id: "may26-tz2-hl-2-q4-two-charge-field-visual",
      scenarioRef: "may26-tz2-hl-2-q4-two-charge-field",
      templateId: "linear-sources.v1",
      sources: [
        {
          id: "charge-r",
          kind: "point-charge",
          sign: -1,
          relativeMagnitude: 1,
          label: "R",
          appearance: "dot",
          labelPlacement: "below",
        },
        {
          id: "charge-s",
          kind: "point-charge",
          sign: -1,
          relativeMagnitude: 2.25,
          label: "S",
          appearance: "dot",
          labelPlacement: "below",
        },
      ],
      dimensions: { total: "5.0 cm" },
      coordinateFrame: "left-source-origin",
      dimensionExtensionStyle: "dashed",
      provenance: { sourceQuestionId: "q_b91a7e28973778135de4" },
    },
  }),
  fixture({
    id: "may26-tz1-hl-2-q9-nuclear-potential",
    sourceQuestionId: "q_73bbdbfeb32226d6e68a",
    sourceQuestion: "May 2026 TZ1 HL Paper 2 Q9 b(ii–iv)",
    paper: "2",
    sourceCrops: [crop("src_0386c1ec35efa9b6cda6", "p029_v01.png")],
    capabilities: ["source-cartesian-plot", "coulomb-barrier"],
    sourceNote:
      "The source contains blank Vₑ–r axes only; no spatial nucleus/alpha diagram is reconstructed.",
  }),
  fixture({
    id: "nov25-tz1-hl-2-q5-gravitational-potential",
    sourceQuestionId: "q_985d3d2b599acad62622",
    sourceQuestion: "November 2025 TZ1 HL Paper 2 Q5",
    paper: "2",
    sourceCrops: [crop("src_934551dd63d06ab53bc0", "p010_v01.png")],
    capabilities: ["source-cartesian-plot", "gravitational-potential"],
    sourceNote:
      "The source contains the Vg–r graph only; no spatial moon/planet diagram is reconstructed.",
  }),
];
