const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");
const output = path.resolve(process.argv[2] ?? "dataset/_derived/new-question-pilot-v0.1");
const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
const qa = path.join(output, "qa");
fs.mkdirSync(qa, { recursive: true });

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const errors = [];
  const checks = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(error.message));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto("file://" + path.join(output, "index.html"));
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      const initial = await page.evaluate(() => ({ count: document.querySelectorAll("article").length, images: document.images.length, solutionsClosed: [...document.querySelectorAll(".solution")].every(el => !el.open), reviewsPending: [...document.querySelectorAll("[data-review]")].every(el => el.value === "pending"), documentWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.equal(initial.count, 20); assert.equal(initial.images, 20); assert.ok(initial.solutionsClosed); assert.ok(initial.reviewsPending); assert.equal(initial.documentWidth, width);
      await page.screenshot({ path: path.join(qa, `page-${width}.png`) });
      for (const [field, entries] of [["family", Object.entries(manifest.familyCounts)], ["paper", Object.entries(manifest.paperCounts)], ["level", [["SL", 15], ["HL", 5]]]]) {
        for (const [value, expected] of entries) {
          await page.select("#" + field, value);
          const actual = await page.evaluate(() => document.querySelectorAll("article:not([hidden])").length);
          assert.equal(actual, expected, `${width}: ${field}=${value}`);
        }
        await page.select("#" + field, "");
      }
      await page.evaluate(() => document.querySelectorAll("details").forEach(el => el.open = true));
      const opened = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, fullSizeLinks: [...document.querySelectorAll("a.figure")].every(a => a.href === a.querySelector("img").src && a.target === "_blank" && a.rel === "noopener") }));
      assert.equal(opened.documentWidth, width); assert.ok(opened.fullSizeLinks);
      if (width === 1440) for (const item of manifest.packages) {
        const card = await page.$("#" + item.id);
        await card.screenshot({ path: path.join(qa, item.id + ".png") });
      }
      if (width === 390) {
        const card = await page.$("article:last-of-type");
        await card.screenshot({ path: path.join(qa, "mobile-expanded-question.png") });
      }
      checks.push({ width, initial, opened, filtersPassed: 8 });
    }
    await page.select("#family", "mechanics_scene"); await page.select("#paper", "2");
    assert.equal(await page.evaluate(() => document.querySelectorAll("article:not([hidden])").length), 2);
    await page.select("#family", ""); await page.select("#paper", "");
    await page.select("[data-review]", "repair");
    await page.type("[data-note]", "Browser QA only; not a human review decision.");
    await page.reload();
    const saved = await page.evaluate(() => ({ decision: document.querySelector("[data-review]").value, note: document.querySelector("[data-note]").value }));
    assert.equal(saved.decision, "repair"); assert.ok(saved.note.startsWith("Browser QA only"));
    const downloads = path.join(qa, "downloads"); fs.mkdirSync(downloads, { recursive: true });
    const session = await page.createCDPSession();
    await session.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await page.click("#download");
    const download = path.join(downloads, manifest.batchId + "-review.json");
    for (let i = 0; i < 100 && !fs.existsSync(download); i++) await new Promise(resolve => setTimeout(resolve, 50));
    const notes = JSON.parse(fs.readFileSync(download, "utf8"));
    assert.equal(notes.batchId, manifest.batchId); assert.equal(notes.packages.length, 20); assert.equal(notes.packages[0].decision, "repair");
    fs.unlinkSync(download);
    await page.evaluate(key => localStorage.removeItem(key), manifest.batchId + "-review");
    await page.reload();
    assert.ok(await page.evaluate(() => [...document.querySelectorAll("[data-review]")].every(el => el.value === "pending")));
    for (const family of Object.keys(manifest.familyCounts)) {
      const items = manifest.packages.filter(p => p.family === family);
      const sheet = path.join(qa, "figures-" + family + ".html");
      fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:20px;font:15px system-ui;color:#173446;background:#edf3f6}h1{font-size:22px}main{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0;background:white;border:1px solid #cfdae1;border-radius:8px;padding:14px}figcaption{font-weight:600;margin-bottom:8px}img{width:100%;height:320px;object-fit:contain}</style><h1>${family}: all five student figures</h1><main>${items.map(p => `<figure><figcaption>${p.id.split("-")[2]} · ${p.title}</figcaption><img src="../${p.figure}"></figure>`).join("")}</main>`);
      await page.setViewport({ width: 1400, height: 1200 });
      await page.goto("file://" + sheet);
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      await page.screenshot({ path: path.join(qa, "figures-" + family + ".png"), fullPage: true });
    }
    const figurePage = await browser.newPage();
    const labelBounds = [];
    for (const item of manifest.packages) {
      await figurePage.goto("file://" + path.join(output, item.figure));
      const bounds = await figurePage.evaluate(() => {
        const svg = document.querySelector("svg"), view = svg.viewBox.baseVal;
        return [...svg.querySelectorAll("text")].filter(text => {
          const box = text.getBBox();
          if (!box.width || !box.height) return false;
          const transform = svg.getScreenCTM().inverse().multiply(text.getScreenCTM());
          const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
          return points.some(point => point.x < view.x - 1 || point.y < view.y - 1 || point.x > view.x + view.width + 1 || point.y > view.y + view.height + 1);
        }).map(text => text.textContent);
      });
      labelBounds.push({ id: item.id, clippedLabels: bounds });
      assert.equal(bounds.length, 0, `${item.id}: student labels clipped`);
    }
    assert.deepEqual(errors, []);
    const roverManifest = manifest.packages.find(item => item.id === "synthetic-v1-01-rover-distance");
    await figurePage.goto("file://" + path.join(output, roverManifest.figure));
    const roverScale = await figurePage.evaluate(() => ({
      fiveSecondLabel: [...document.querySelectorAll("svg text")].some(el => el.textContent === "5" && el.getAttribute("x") === "442"),
      halfSecondGrid: [...document.querySelectorAll("svg path")].some(el => el.getAttribute("d") === "M475 38V416" && el.getAttribute("stroke-width") === "0.7"),
    }));
    assert.ok(roverScale.fiveSecondLabel && roverScale.halfSecondGrid);
    const result = { batchId: manifest.batchId, viewports: checks, combinedFilters: "passed", notesPersistenceAndDownload: "passed", qaNotesCleared: true, fullSizeStudentFigures: 20, labelBounds, roverScale, pageErrors: errors, humanDecisionsRecorded: 0 };
    fs.writeFileSync(path.join(output, "verification-browser.json"), JSON.stringify(result, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ batchId: manifest.batchId, cards: 20, desktopAndMobile: "passed", filters: "passed", reviewNotes: "passed", clippedLabels: 0, qa }) + "\n");
  } finally { await browser.close(); }
}
main().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
