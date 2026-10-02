from __future__ import annotations

import csv
import html
import json
from pathlib import Path
import shutil


def escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def image_link(src: str, alt: str) -> str:
    return f'<a class="figure-link" href="{escape(src)}" target="_blank" rel="noopener" aria-label="Open full-size {escape(alt)}"><img loading="lazy" src="{escape(src)}" alt="{escape(alt)}"></a>'


def coverage_markdown(report: dict) -> str:
    lines = [
        "# Pilot dataset coverage", "",
        f"Selected {report['pilotQuestions']} source questions from {report['corpusQuestions']} extracted records, representing {report['pilotIndependentSourceGroups']} independent source groups.", "",
        f"There are {report['checkedCompletePackages']} existing physics-checked packages and {report['sourceOnlyQuestions']} sources still needing complete package construction. No selected package is marked training-ready by this sampler.", "",
        "## Paper and level", "", "| Stratum | Corpus | Pilot | Train | Validation | Test |", "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["byPaperLevel"]:
        lines.append("| " + " | ".join(str(row[k]) for k in ("label", "corpus", "pilot", "train", "validation", "test")) + " |")
    lines.extend(["", "## Representations", "", "Known package renderers override their mined source labels. Remaining labels are extraction hypotheses, not proof that the renderer supports the question.", "", "| Representation | Corpus | Pilot | Train | Validation | Test |", "| --- | ---: | ---: | ---: | ---: | ---: |"])
    for row in report["byRepresentation"]:
        lines.append("| " + " | ".join(str(row[k]) for k in ("label", "corpus", "pilot", "train", "validation", "test")) + " |")
    lines.extend(["", "## Provisional theme coverage", "", report["metadataStatus"], "", "| Theme | Corpus matches | Pilot matches |", "| --- | ---: | ---: |"])
    for row in report["provisionalThemes"]:
        lines.append(f"| {row['label']} | {row['corpus']} | {row['pilot']} |")
    lines.extend(["", "## Source groups and evaluation", "", report["splitPolicy"]["policy"], "", report["leakageAudit"]["scope"], "", "Synthetic descendants inherit the split of every source parent. Combining parents across splits is rejected.", "", f"Protected developed sources: {report['splitPolicy']['protectedDevelopmentSources']}. Groups crossing splits: 0. Developed sources outside train: 0.", "", "This is a frozen source-group split for the present corpus. It is not a held-out-family benchmark. Review lexical grouping evidence before making semantic leakage claims.", "", "## Remaining work", ""])
    lines.extend("- " + work for work in report["remainingWork"])
    return "\n".join(lines) + "\n"


def build_browser_report(output: Path, source_root: Path, sample: dict, splits: dict, report: dict, candidates: list, inventory: dict, assets: dict, page_previews: bool) -> None:
    by_id = {c.id: c for c in candidates}
    packages = {p["questionId"]: p for p in inventory["packages"]}
    mining = source_root / "dataset/_derived/paper-mining-v0.1"
    crops_dir, pages_dir, packages_dir = output / "assets/crops", output / "assets/pages", output / "packages"
    for directory in (crops_dir, pages_dir, packages_dir):
        directory.mkdir(parents=True, exist_ok=True)
    pages = {}
    documents = {}
    sections = []
    sources = {c.source["source_id"]: c.source for c in candidates}
    source_records = {q["source_id"]: q for q in map(json.loads, (mining / "sources.jsonl").read_text().splitlines())}
    rendered_page_count = 0
    try:
        if page_previews:
            import pymupdf
        for row in sample["questions"]:
            candidate = by_id[row["questionId"]]
            source_pdf = source_root / row["sourcePdf"]
            page_images = []
            if page_previews:
                if row["sourceId"] not in documents:
                    documents[row["sourceId"]] = pymupdf.open(source_pdf)
                document = documents[row["sourceId"]]
                for page in row["sourcePages"]:
                    key = row["sourceId"], page
                    filename = f"{row['sourceId']}-p{page:03}.jpg"
                    if key not in pages:
                        document[page - 1].get_pixmap(matrix=pymupdf.Matrix(1.35, 1.35), alpha=False).save(pages_dir / filename, jpg_quality=85)
                        pages[key] = "assets/pages/" + filename
                        rendered_page_count += 1
                    page_images.append(f'<figure><figcaption>Original PDF page {page}</figcaption>{image_link(pages[key], row["questionLabel"] + f" original PDF page {page}")}</figure>')
            crop_images = []
            asset_ids = candidate.question["visual_asset_ids"]
            for asset_id in asset_ids:
                asset = assets[asset_id]
                original = (mining / asset["path"]).resolve()
                original.relative_to(mining.resolve())
                target = crops_dir / (asset_id + original.suffix)
                if not target.exists():
                    shutil.copy2(original, target)
                crop_images.append(image_link("assets/crops/" + target.name, f'Source figure crop on page {asset["page"]}'))
            scheme = source_records[row["markschemeSourceId"]]
            scheme_link = (source_root / "dataset" / scheme["relative_path"]).as_uri()
            checked = packages.get(row["questionId"])
            reconstructed = []
            solution = ""
            if checked:
                item = checked["package"]
                (packages_dir / (checked["packageId"] + ".json")).write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n")
                for index, visual in enumerate(checked["studentVisuals"]):
                    filename = checked["packageId"] + f"-{index + 1}.svg"
                    (packages_dir / filename).write_text(visual["svg"])
                    reconstructed.append(image_link("packages/" + filename, f'Checked student {visual["family"]} reconstruction'))
                question = item["question"]
                if question["kind"] == "multiple-choice":
                    parts = "<ol type=\"A\">" + "".join(f'<li>{escape(option["text"])}</li>' for option in question["options"]) + "</ol>"
                else:
                    parts = "<ol>" + "".join(f'<li><strong>{escape(part["id"])}</strong> {escape(part["prompt"])} [{part["marks"]}]</li>' for part in question["parts"]) + "</ol>"
                authored = f'<h4>Checked derivative question</h4><p>{escape(question["stem"])}</p>{parts}'
                solution_parts = []
                for part in item["solution"]["parts"]:
                    working = "".join(f'<li>{escape(line)}</li>' for line in part["working"])
                    marking = "".join(f'<li>{escape(line)}</li>' for line in part["markingPoints"])
                    solution_parts.append(f'<h4>{escape(part["partId"])} [{part["marks"]}]</h4><ol>{working}</ol><p>{escape(part.get("finalAnswer", ""))}</p><ul>{marking}</ul>')
                solution = '<details class="solution"><summary>Checked solution and marking points</summary>' + "".join(solution_parts) + "</details>"
            else:
                authored = '<p class="draft">This source still needs a complete checked question package.</p>'
            issues = "".join(f'<li>{escape(reason)}</li>' for reason in row["extractionReviewReasons"])
            issues = '<details class="issues"><summary>Extraction review notes</summary><ul>' + issues + "</ul></details>" if issues else ""
            badges = f'<span class="badge">Paper {row["paper"]} · {row["level"]}</span><span class="badge split-{row["split"]}">{row["split"].title()}</span><span class="badge">{escape(row["representation"])}</span>'
            label_origin = "Checked renderer" if checked else "Mined family, awaiting review"
            status = "Existing physics-checked package" if checked else "Source awaiting package construction"
            figure_content = "".join(crop_images) or '<p>No isolated figure crops. Check the original pages.</p>'
            if reconstructed:
                figure_content = '<div class="comparison"><div><h4>Source figures</h4>' + figure_content + '</div><div><h4>Student reconstruction</h4>' + "".join(reconstructed) + "</div></div>"
            data = {"paper": row["paper"], "level": row["level"], "split": row["split"], "family": row["representation"], "status": "checked" if checked else "source"}
            attributes = " ".join(f'data-{key}="{escape(value)}"' for key, value in data.items())
            search = " ".join([row["questionLabel"], row["representation"], " ".join(row["provisionalThemes"]), candidate.question["text"]["normalized"]]).lower()
            original = escape(candidate.question["text"]["normalized"])
            sections.append(f'<article id="{row["questionId"]}" {attributes} data-search="{escape(search)}"><header><h3>{escape(row["questionLabel"])}</h3><p class="badges">{badges}</p><p>{escape(status)}. {escape(label_origin)}.</p></header><p class="metadata">Provisional themes: {escape(", ".join(row["provisionalThemes"]))} · Inferred skills: {escape(", ".join(row["provisionalSkills"]))}</p><p><a href="{escape(source_pdf.as_uri())}#page={row["sourcePages"][0]}">Question PDF</a> · <a href="{escape(scheme_link)}">Mark scheme PDF</a></p>{figure_content}{authored}{solution}<details class="original"><summary>Extracted source question</summary><pre>{original}</pre></details><details class="pages"><summary>Original pages [{len(row["sourcePages"])}]</summary>{"".join(page_images) or "<p>Open the source PDF to inspect the pages.</p>"}</details>{issues}<details class="lineage"><summary>Source group and lineage</summary><p>{escape(row["groupId"])}. Synthetic descendants inherit the {escape(row["split"])} split.</p><code>{escape(row["questionId"])}</code></details></article>')
    finally:
        for document in documents.values():
            document.close()
    (output / "COVERAGE.md").write_text(coverage_markdown(report))
    with (output / "coverage.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["dimension", "label", "corpus", "pilot", "train", "validation", "test"])
        writer.writeheader()
        for dimension, key in (("paper_level", "byPaperLevel"), ("representation", "byRepresentation"), ("session", "bySession")):
            writer.writerows({"dimension": dimension, **row} for row in report[key])

    def table(rows: list[dict], columns: tuple[str, ...]) -> str:
        heading = "".join(f'<th scope="col">{escape(column.title())}</th>' for column in columns)
        body = "".join("<tr>" + "".join(f'<td>{escape(row.get(column, ""))}</td>' for column in columns) + "</tr>" for row in rows)
        return '<div class="table-scroll"><table><thead><tr>' + heading + "</tr></thead><tbody>" + body + "</tbody></table></div>"

    def select(name: str, values: list[str]) -> str:
        options = '<option value="">All</option>' + "".join(f'<option value="{escape(value)}">{escape(value.replace("_", " ").title())}</option>' for value in values)
        return f'<label>{escape(name.title())}<select id="{name}">{options}</select></label>'

    controls = "".join([select("paper", ["1A", "2"]), select("level", ["SL", "HL"]), select("split", ["train", "validation", "test"]), select("family", sorted({q["representation"] for q in sample["questions"]})), select("status", ["checked", "source"])])
    stats = [(report["pilotQuestions"], "Source questions"), (report["pilotIndependentSourceGroups"], "Source groups"), (report["checkedCompletePackages"], "Checked packages"), (report["sourceOnlyQuestions"], "Packages to build")]
    cards = "".join(f'<div class="stat"><strong>{count}</strong><span>{escape(label)}</span></div>' for count, label in stats)
    split_summary = " · ".join(f'{split.title()} {count}' for split, count in report["pilotSplits"].items())
    body = f'<header class="intro"><p class="eyebrow">IBPhysiq · Pilot dataset</p><h1>100-question source pilot</h1><p>A balanced draft sample for building and reviewing complete question packages.</p><div class="stats">{cards}</div><p class="split-summary">{escape(split_summary)}</p><p>Existing development sources stay in train. Related sources and every synthetic descendant stay in one split.</p><p class="draft">Source sampling and split assignment are complete. Full question review and training readiness remain open.</p><nav><a href="pilot-manifest.json">Pilot manifest</a><a href="split-manifest.json">Split manifest</a><a href="COVERAGE.md">Coverage report</a><a href="coverage.csv">Coverage CSV</a></nav></header><section class="coverage"><h2>Coverage</h2><h3>Paper and level</h3>{table(report["byPaperLevel"], ("label", "corpus", "pilot", "train", "validation", "test"))}<details><summary>Representations and remaining renderer gaps</summary>{table(report["byRepresentation"], ("label", "corpus", "pilot", "train", "validation", "test"))}<p>{report["rendererGapQuestions"]} selected sources use families without a completed renderer. Available renderers still support only their tested scenarios.</p></details><details><summary>Provisional theme and skill coverage</summary><p>{escape(report["metadataStatus"])}</p>{table(report["provisionalThemes"], ("label", "corpus", "pilot"))}{table(report["provisionalSkills"], ("label", "pilot"))}</details></section><section class="browser"><h2>Browse the pilot</h2><div class="filters">{controls}<label class="search">Search questions<input type="search" id="search" placeholder="Search source, topic or wording"></label></div><p id="result-count" role="status">Showing {len(sections)} questions</p><p id="empty" hidden>No questions match these filters.</p>{"".join(sections)}</section>'
    stylesheet = """
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#17212d;font:16px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:32px 24px 80px}h1,h2,h3,h4{line-height:1.25;color:#102135}h1{font-size:clamp(28px,4vw,44px);margin:8px 0 16px}h2{font-size:26px}h3{font-size:20px}h4{font-size:17px}.eyebrow{font-size:14px;color:#546779}.intro,.coverage,article{background:white;border:1px solid #d8e0e9;border-radius:12px;padding:24px;margin:0 0 24px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}.stat{padding:16px;background:#edf3f9;border-radius:8px}.stat strong{display:block;font-size:30px;line-height:1.2}.stat span{font-size:14px}nav{display:flex;gap:16px;flex-wrap:wrap}a{color:#12548a;text-underline-offset:3px}table{border-collapse:collapse;width:100%;font-size:15px}th,td{padding:10px 12px;border-bottom:1px solid #e3e9f0;text-align:left;white-space:nowrap}th{background:#edf3f9}.table-scroll{overflow:auto}.filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;background:white;border:1px solid #d8e0e9;border-radius:10px;padding:20px}label{display:flex;flex-direction:column;font-size:14px;font-weight:600;gap:6px}select,input{width:100%;font:inherit;padding:10px;border:1px solid #aebdcd;border-radius:6px;background:white;color:#17212d}.badges{display:flex;gap:8px;flex-wrap:wrap}.badge{background:#edf1f6;padding:3px 10px;border-radius:5px;font-size:13px;overflow-wrap:anywhere}.split-train{background:#e7f1ff}.split-validation{background:#f0eafd}.split-test{background:#e6f3ed}.metadata{color:#526070;font-size:14px}.draft{color:#65501d;background:#fff9e8;border-left:3px solid #b38a22;padding:12px 16px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px}.comparison>div{min-width:0}img{display:block;max-width:100%;height:auto;margin:12px auto}details{border-top:1px solid #d8e0e9;margin-top:18px;padding-top:12px}summary{cursor:pointer;font-weight:600;padding:4px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.7 system-ui,sans-serif}code{overflow-wrap:anywhere}.pages img{max-width:860px;width:100%}figure{margin:16px 0}figcaption{color:#546779}.solution{background:#f3f6fa;padding:16px;border-radius:6px}article[hidden]{display:none}li{margin:8px 0}@media(max-width:700px){main{padding:16px 12px 48px}.intro,.coverage,article{padding:18px}.stats{grid-template-columns:repeat(2,1fr);gap:10px}.filters{grid-template-columns:repeat(2,minmax(0,1fr));padding:14px}.comparison{grid-template-columns:1fr}h3{font-size:18px}.search{grid-column:1/-1}}:focus-visible{outline:3px solid #2374bc;outline-offset:3px}
    """
    javascript = """
    const filters=['paper','level','split','family','status'];
    const articles=Array.from(document.querySelectorAll('article[data-paper]'));
    function filter(){
      const values=Object.fromEntries(filters.map(key=>[key,document.getElementById(key).value]));
      const search=document.getElementById('search').value.toLowerCase().trim();
      let count=0;
      for(const article of articles){
        const visible=filters.every(key=>!values[key]||article.dataset[key]===values[key])&&(!search||article.dataset.search.includes(search));
        article.hidden=!visible;if(visible)count++;
      }
      document.getElementById('result-count').textContent='Showing '+count+' of '+articles.length+' questions';
      document.getElementById('empty').hidden=count>0;
    }
    for(const key of filters)document.getElementById(key).addEventListener('change',filter);
    document.getElementById('search').addEventListener('input',filter);
    filter();
    """
    title = str(report["pilotQuestions"]) + "-question source pilot"
    body = body.replace("100-question source pilot", title)
    body = body.replace('<h2>Browse the pilot</h2>', '<h2>Browse the pilot</h2><p>Select any figure or original page to open it at full size.</p>')
    (output / "index.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)} · IBPhysiq</title><style>{stylesheet}</style></head><body><main>{body}</main><script>{javascript}</script></body></html>')
    (output / "preview-manifest.json").write_text(json.dumps({"renderedSourcePages": rendered_page_count, "questionIds": [q["questionId"] for q in sample["questions"]], "sourcePageFiles": sorted(pages.values()), "copiedCrops": len(list(crops_dir.iterdir())), "checkedPackageCount": len(list(packages_dir.glob("*.json")))}, indent=2) + "\n")
