const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const output = path.resolve(
  process.argv[2] ?? "dataset/_derived/qwen-author-baseline-v0.1",
);
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const viewports = [];
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto("file://" + path.join(output, "index.html"));
      await page.waitForFunction(
        () => document.querySelectorAll(".katex").length > 0,
      );
      const initial = await page.evaluate(() => ({
        cards: document.querySelectorAll("article").length,
        solutionsClosed: [
          ...document.querySelectorAll("details.solution"),
        ].every((el) => !el.open),
        brokenImages: [...document.images].filter(
          (el) => !el.complete || el.naturalWidth === 0,
        ).length,
        findings: document.querySelectorAll("aside").length,
        rawReplies: document.querySelectorAll("article details pre").length,
        mathErrors: document.querySelectorAll(".katex-error").length,
        mathExpressions: document.querySelectorAll(".katex").length,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert(
        initial.cards === 20 &&
          initial.solutionsClosed &&
          !initial.brokenImages &&
          initial.findings === 15 &&
          !initial.mathErrors &&
          initial.width === width,
        "Initial report display failed",
      );
      await page.screenshot({
        path: path.join(output, `verification-browser-${width}.png`),
      });
      const filters = [];
      for (const [field, values] of [
        [
          "family",
          [
            ["cartesian_plot", 5],
            ["circuit_network", 5],
            ["field_map", 5],
            ["mechanics_scene", 5],
          ],
        ],
        [
          "paper",
          [
            ["1A", 11],
            ["2", 9],
          ],
        ],
        [
          "status",
          [
            ["awaiting-human-review", 15],
            ["rejected", 5],
          ],
        ],
      ]) {
        for (const [value, expected] of values) {
          await page.select(`#${field}`, value);
          const count = await page.evaluate(
            () => document.querySelectorAll("article:not([hidden])").length,
          );
          assert(
            count === expected,
            `${field} ${value} displayed ${count} records instead of ${expected}`,
          );
          filters.push({ field, value, count });
        }
        await page.select(`#${field}`, "");
      }
      await page.evaluate(() =>
        document.querySelectorAll("details").forEach((el) => (el.open = true)),
      );
      const opened = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        fullSizeLinks: [
          ...document.querySelectorAll("article a:has(img)"),
        ].every(
          (el) =>
            el.getAttribute("href") ===
              el.querySelector("img").getAttribute("src") &&
            el.target === "_blank" &&
            el.rel === "noopener",
        ),
        diagnosticVisible: [...document.querySelectorAll("aside")].every(
          (el) => el.getBoundingClientRect().height > 0,
        ),
      }));
      assert(
        opened.width === width &&
          opened.fullSizeLinks &&
          opened.diagnosticVisible,
        "Expanded report display failed",
      );
      viewports.push({ width, initial, filters, opened });
      if (width === 390) {
        const card = await page.$("article:last-of-type details.solution");
        await card.screenshot({
          path: path.join(output, "verification-browser-equations.png"),
        });
      }
    }
    await page.select("#family", "mechanics_scene");
    await page.select("#paper", "2");
    await page.select("#status", "awaiting-human-review");
    assert(
      (await page.evaluate(
        () => document.querySelectorAll("article:not([hidden])").length,
      )) === 2,
      "Combined filter failed",
    );
    const key = JSON.parse(
      fs.readFileSync(path.join(output, "experiment-contract.json"), "utf8"),
    ).experimentId;
    await page.evaluate((key) => localStorage.removeItem(key), key);
    await page.reload();
    await page.select("[data-review]", "repair");
    await page.type(
      "[data-note]",
      "QA only: browser persistence check, no human acceptance.",
    );
    await page.reload();
    const stored = await page.evaluate(() => ({
      outcome: document.querySelector("[data-review]").value,
      note: document.querySelector("[data-note]").value,
    }));
    assert(
      stored.outcome === "repair" && stored.note.startsWith("QA only"),
      "Review-note persistence failed",
    );
    const exportData = await page.evaluate(async () => {
      const original = URL.createObjectURL;
      let captured;
      URL.createObjectURL = (blob) => {
        captured = blob;
        return original(blob);
      };
      document.querySelector("#download").click();
      return JSON.parse(await captured.text());
    });
    assert(
      exportData.experimentId === key &&
        exportData.reviewType === "informal-notes" &&
        Object.values(exportData.notes)[0].outcome === "repair",
      "Review-note download failed",
    );
    await page.evaluate((key) => localStorage.removeItem(key), key);
    assert(pageErrors.length === 0, "Browser reported runtime errors");
    const receipt = {
      checkedAt: new Date().toISOString(),
      passed: true,
      viewports,
      combinedFiltersPassed: true,
      informalNotesPersistAndDownload: true,
      testNotesIsolatedAndCleared: true,
      pageErrors,
    };
    fs.writeFileSync(
      path.join(output, "verification-browser.json"),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        passed: true,
        viewports: [1440, 390],
        requests: 20,
        mathExpressions: viewports[0].initial.mathExpressions,
        mathErrors: 0,
        filters: 17,
        notesPersistenceAndDownload: true,
      }),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
