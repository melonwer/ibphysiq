"""Add diagnostic findings and offline maths rendering without changing run evidence."""
import argparse
import hashlib
import html
import json
import re
import tarfile
from datetime import datetime, timezone
from pathlib import Path


def block(name, content):
    return f"<!-- {name}-begin -->{content}<!-- {name}-end -->"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("dataset/_derived/qwen-author-baseline-v0.1"))
    parser.add_argument("--findings", type=Path, required=True)
    parser.add_argument("--katex-tar", type=Path)
    args = parser.parse_args()
    contract = json.loads((args.output / "experiment-contract.json").read_text())
    findings = json.loads(args.findings.read_text())
    if findings["experimentId"] != contract["experimentId"] or findings["reviewedRequests"] != 20:
        raise ValueError("Diagnostic review must cover all 20 requests in this experiment")
    page = args.output / "index.html"
    document = page.read_text()
    for name in ["diagnostic-summary", "diagnostic-findings", "diagnostic-badge", "offline-math"]:
        document = re.sub(rf"<!-- {name}-begin -->.*?<!-- {name}-end -->", "", document, flags=re.S)
    records = findings["records"]
    if len(records) != 20 or len({row["candidateId"] for row in records}) != 20:
        raise ValueError("Review record identities are incomplete or repeated")
    flagged = sum(bool(row["findings"]) for row in records)
    if findings["allQuestionContentVerbatimReference"]:
        document = document.replace(
            "Qwen writes the question wording, working and marking points.",
            "Qwen returned the supplied question wording unchanged and wrote the working and marking points.",
        )
    summary = block("diagnostic-summary", f'<p role="note">Content review found issues in {flagged} of 20 outputs. Open the model solution panels for the findings and proposed repairs. These observations do not record your acceptance.</p>')
    document = document.replace('<div class="filters">', summary + '<div class="filters">', 1)
    for record in records:
        candidate_id = html.escape(record["candidateId"], quote=True)
        pattern = rf'(<article id="{re.escape(candidate_id)}".*?</article>)'
        match = re.search(pattern, document, flags=re.S)
        if not match:
            raise ValueError(f"Missing candidate card: {candidate_id}")
        card = match.group(1)
        if record["findings"]:
            items = "".join(f'<li><b>{html.escape(str(item["partId"]))}</b> {html.escape(item["issue"])}<br><em>Proposed repair:</em> {html.escape(item["suggestedRepair"])}</li>' for item in record["findings"])
            note = block("diagnostic-findings", '<aside style="border:1px solid #d29a5b;background:#fff7ec;padding:14px;border-radius:6px;margin:14px 0"><b>Content review findings</b><ul>' + items + '</ul></aside>')
            card = card.replace('<summary>Model solution and marking points</summary>', '<summary>Model solution and marking points</summary>' + note, 1)
            card = card.replace('</header>', block("diagnostic-badge", '<p style="color:#8a4a14">Content review found issues. See the solution panel.</p>') + '</header>', 1)
        document = document[:match.start()] + card + document[match.end():]
    assets = args.output / "assets/katex"
    if args.katex_tar:
        with tarfile.open(args.katex_tar) as archive:
            for member in archive.getmembers():
                if member.isfile() and member.name.startswith("package/dist/"):
                    relative = Path(member.name.removeprefix("package/dist/"))
                    if ".." in relative.parts:
                        raise ValueError("Unsafe asset path")
                    target = assets / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.extractfile(member).read())
            (assets / "LICENSE").write_bytes(archive.extractfile("package/LICENSE").read())
            package = json.loads(archive.extractfile("package/package.json").read())
        (assets / "asset-receipt.json").write_text(json.dumps({"package": "katex", "version": package["version"], "archiveSha256": hashlib.sha256(args.katex_tar.read_bytes()).hexdigest()}, indent=2) + "\n")
    if assets.exists():
        delimiters = json.dumps([
            {"left": "$$", "right": "$$", "display": True},
            {"left": "$", "right": "$", "display": False},
            {"left": r"\(", "right": r"\)", "display": False},
            {"left": r"\[", "right": r"\]", "display": True},
        ])
        preprocess = r'''function(math){return math.replace(/\u000crac/g,"\\frac").replace(/\u0009ext/g,"\\text").replace(/\u0009imes/g,"\\times")}'''
        math = '<link rel="stylesheet" href="assets/katex/katex.min.css"><style>.katex-display{max-width:100%;overflow-x:auto;padding:6px 0}.katex{font-size:1.05em;display:inline-block;max-width:100%;overflow-x:auto;overflow-y:hidden;vertical-align:middle;padding:3px 0}.solution{overflow-wrap:anywhere}.solution li{min-width:0}</style><script defer src="assets/katex/katex.min.js"></script><script defer src="assets/katex/contrib/auto-render.min.js"></script>'
        math += '<script>document.addEventListener("DOMContentLoaded",function(){renderMathInElement(document.querySelector("main"),{delimiters:' + delimiters + ',preProcess:' + preprocess + ',throwOnError:false,trust:false,maxExpand:1000,maxSize:50})})</script>'
        document = document.replace('</head>', block("offline-math", math) + '</head>', 1)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    backup = page.with_name(f"index.before-diagnostic-{stamp}.html")
    backup.write_bytes(page.read_bytes())
    page.write_text(document)
    (args.output / "educational-review.json").write_text(json.dumps(findings, indent=2, ensure_ascii=False) + "\n")
    (args.output / "report-presentation.json").write_text(json.dumps({
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "rawModelEvidenceUnchanged": True,
        "mathDisplayNormalizations": ["form-feed followed by rac displays as \\frac", "tab followed by ext displays as \\text", "tab followed by imes displays as \\times"],
        "purpose": "Reverse model JSON control-character escapes only in derived math presentation. Raw replies and candidates stay unchanged.",
    }, indent=2) + "\n")
    print(json.dumps({"reviewed": 20, "withFindings": flagged, "mathAssets": assets.exists(), "page": str(page)}))


if __name__ == "__main__":
    main()
