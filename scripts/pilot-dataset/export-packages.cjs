const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const visuals = "../../lib/visuals/";
const { renderCartesianPlot } = require(visuals + "render-cartesian.ts");
const { renderCircuitNetwork } = require(visuals + "render-circuit.ts");
const { renderFieldMap } = require(visuals + "render-field-map.ts");
const { renderMechanicsScene } = require(visuals + "render-mechanics.ts");
const { CARTESIAN_PILOT_FIXTURES } = require(visuals + "pilot-fixtures.ts");
const { CARTESIAN_EXPANSION_FIXTURES } = require(
  visuals + "cartesian-expansion-fixtures.ts",
);
const { CIRCUIT_SOURCE_FIXTURES } = require(
  visuals + "circuit-source-fixtures.ts",
);
const { CIRCUIT_INTENT_SOURCE_FIXTURES } = require(
  visuals + "circuit-intent-fixtures.ts",
);
const { FIELD_SOURCE_FIXTURES } = require(visuals + "field-source-fixtures.ts");
const { MECHANICS_SOURCE_FIXTURES } = require(
  visuals + "mechanics-source-fixtures.ts",
);

const families = [
  {
    family: "circuit_network",
    theme: "B",
    ...require(visuals + "circuit-question-packages.ts"),
  },
  {
    family: "field_map",
    theme: "D",
    ...require(visuals + "field-question-packages.ts"),
  },
  {
    family: "mechanics_scene",
    theme: "A",
    ...require(visuals + "mechanics-question-packages.ts"),
  },
];

const packages = [];
for (const group of families) {
  const items =
    group.CIRCUIT_QUESTION_PACKAGES ??
    group.FIELD_QUESTION_PACKAGES ??
    group.MECHANICS_QUESTION_PACKAGES;
  const validate =
    group.validateCircuitQuestionPackage ??
    group.validateFieldQuestionPackage ??
    group.validateMechanicsQuestionPackage;
  for (const item of items) {
    const validation = validate(item);
    if (!validation.valid)
      throw new Error(`${item.id}: ${validation.issues.join("; ")}`);
    const studentVisuals = [];
    if (item.visualSpec) {
      const render = {
        circuit_network: renderCircuitNetwork,
        field_map: renderFieldMap,
        mechanics_scene: renderMechanicsScene,
      }[group.family];
      studentVisuals.push({
        family: group.family,
        svg: render(item.visualSpec),
      });
    }
    if (item.plot)
      studentVisuals.push({
        family: "cartesian_plot",
        svg: renderCartesianPlot(
          item.plot.student.spec,
          item.plot.student.data,
        ),
      });
    packages.push({
      questionId: item.source.questionId,
      packageId: item.id,
      packageFamily: group.family,
      theme: group.theme,
      validation,
      studentVisuals,
      package: item,
    });
  }
}
if (
  packages.length !== 24 ||
  new Set(packages.map((p) => p.questionId)).size !== 24
)
  throw new Error("Expected 24 distinct checked source-backed packages");

const developmentQuestions = new Set(packages.map((item) => item.questionId));
for (const fixture of [
  ...CARTESIAN_PILOT_FIXTURES,
  ...CARTESIAN_EXPANSION_FIXTURES,
  ...CIRCUIT_SOURCE_FIXTURES,
  ...CIRCUIT_INTENT_SOURCE_FIXTURES,
  ...FIELD_SOURCE_FIXTURES,
])
  developmentQuestions.add(fixture.sourceQuestionId);
for (const fixture of MECHANICS_SOURCE_FIXTURES)
  developmentQuestions.add(fixture.questionId);

process.stdout.write(
  JSON.stringify({
    schemaVersion: "pilot-package-inventory/0.1.0",
    packages,
    developmentQuestionIds: [...developmentQuestions].sort(),
  }) + "\n",
);
