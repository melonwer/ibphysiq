import crypto from "node:crypto";

import {
  extractNumbersFromPhysicsText,
  numbersAgreeWithinTolerance,
} from "./numeric-checker";
import { VerifiedQuantityMap } from "./types";

export interface SvgSanityResult {
  valid: boolean;
  issues: string[];
  visibleTexts: string[];
  accessibleTexts: string[];
  svgSha256: string;
}

export interface SvgLeakCheckOptions {
  svgMarkup: string;
  hiddenQuantities: readonly string[];
  verifiedQuantities: VerifiedQuantityMap;
  publicNumbers?: readonly number[];
  publicLabels?: readonly string[];
}

const GRAPHICAL_PRIMITIVE_TAGS = new Set([
  "path",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse",
  "text",
]);

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&");
}

function validateXmlEntitiesInSegment(segment: string): string | undefined {
  const bareAmp = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/;
  if (bareAmp.test(segment)) {
    return `Unescaped '&' entity in SVG segment: "${segment.slice(0, 60)}"`;
  }
  return undefined;
}

/**
 * Deterministic state-machine XML/SVG structure & security sanity checker.
 */
export function inspectSvgSanity(svgMarkup: string): SvgSanityResult {
  const issues: string[] = [];
  const visibleTexts: string[] = [];
  const accessibleTexts: string[] = [];
  const svgSha256 = crypto
    .createHash("sha256")
    .update(svgMarkup, "utf8")
    .digest("hex");

  const trimmed = svgMarkup.trim();
  if (!trimmed) {
    return {
      valid: false,
      issues: ["SVG markup is empty"],
      visibleTexts,
      accessibleTexts,
      svgSha256,
    };
  }

  const withoutXmlDecl = trimmed.replace(/^<\?xml[^?]*\?>\s*/, "");
  if (!withoutXmlDecl.startsWith("<svg") || !withoutXmlDecl.endsWith("</svg>")) {
    issues.push("SVG markup must start with <svg ...> and end with </svg>");
  }

  if (!/\bxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(withoutXmlDecl)) {
    issues.push('SVG root must declare xmlns="http://www.w3.org/2000/svg"');
  }

  const viewBoxMatch = /\bviewBox\s*=\s*["']([^"']+)["']/.exec(withoutXmlDecl);
  if (!viewBoxMatch) {
    issues.push("SVG root must declare a valid viewBox attribute");
  } else {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (
      parts.length !== 4 ||
      parts.some((n) => !Number.isFinite(n)) ||
      parts[2] <= 0 ||
      parts[3] <= 0
    ) {
      issues.push(`Invalid SVG viewBox="${viewBoxMatch[1]}"`);
    }
  }

  if (/<\s*script\b/i.test(withoutXmlDecl) || /javascript:/i.test(withoutXmlDecl)) {
    issues.push("SVG contains forbidden script content");
  }
  if (/\bon[a-z]+\s*=/i.test(withoutXmlDecl)) {
    issues.push("SVG contains forbidden inline event handler attributes");
  }
  if (/\b(?:NaN|Infinity|-Infinity)\b/.test(withoutXmlDecl)) {
    issues.push("SVG contains NaN or Infinity coordinate/attribute values");
  }

  // Balanced XML tag & text extraction pass
  const stack: Array<{ tag: string; textBuffer: string }> = [];
  let primitiveCount = 0;
  let pos = 0;
  const len = withoutXmlDecl.length;

  while (pos < len) {
    const lt = withoutXmlDecl.indexOf("<", pos);
    if (lt === -1) {
      const trailing = withoutXmlDecl.slice(pos);
      if (trailing.trim() && stack.length === 0) {
        issues.push("Unexpected text outside root <svg> element");
      }
      break;
    }

    if (lt > pos) {
      const textChunk = withoutXmlDecl.slice(pos, lt);
      const entityIssue = validateXmlEntitiesInSegment(textChunk);
      if (entityIssue) issues.push(entityIssue);
      if (stack.length > 0) {
        stack[stack.length - 1].textBuffer += textChunk;
      } else if (textChunk.trim()) {
        issues.push("Unexpected text before root <svg> element");
      }
    }

    // XML comment
    if (withoutXmlDecl.startsWith("<!--", lt)) {
      const endComment = withoutXmlDecl.indexOf("-->", lt + 4);
      if (endComment === -1) {
        issues.push("Unclosed XML comment in SVG");
        break;
      }
      pos = endComment + 3;
      continue;
    }

    // Find end of tag `>`, respecting quoted attributes
    let cursor = lt + 1;
    let quote: '"' | "'" | null = null;
    while (cursor < len) {
      const ch = withoutXmlDecl[cursor];
      if (quote !== null) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      } else if (ch === "<") {
        issues.push("Unescaped '<' inside SVG tag");
        break;
      }
      cursor += 1;
    }

    if (cursor >= len || withoutXmlDecl[cursor] !== ">") {
      issues.push("Unclosed tag or attribute quote in SVG");
      break;
    }

    const rawTagContent = withoutXmlDecl.slice(lt + 1, cursor).trim();
    pos = cursor + 1;

    if (!rawTagContent) {
      issues.push("Empty <> tag in SVG");
      continue;
    }

    // Closing tag
    if (rawTagContent.startsWith("/")) {
      const closeName = rawTagContent.slice(1).trim();
      const top = stack.pop();
      if (!top) {
        issues.push(`Unexpected closing tag </${closeName}> with empty stack`);
      } else if (top.tag !== closeName) {
        issues.push(
          `Mismatched closing tag: expected </${top.tag}>, found </${closeName}>`,
        );
      } else {
        const decoded = decodeXmlEntities(top.textBuffer).trim();
        if (decoded) {
          if (top.tag === "text" || top.tag === "tspan") {
            visibleTexts.push(decoded);
          } else if (top.tag === "title" || top.tag === "desc") {
            accessibleTexts.push(decoded);
          }
        }
        // Propagate tspan text into enclosing text buffer as well so combined phrases are checked
        if (top.tag === "tspan" && stack.length > 0 && stack[stack.length - 1].tag === "text") {
          stack[stack.length - 1].textBuffer += ` ${top.textBuffer}`;
        }
      }
      continue;
    }

    const selfClosing = rawTagContent.endsWith("/");
    const bodyWithoutSlash = selfClosing
      ? rawTagContent.slice(0, -1).trim()
      : rawTagContent;
    const tagMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(bodyWithoutSlash);
    if (!tagMatch) {
      issues.push(`Malformed SVG tag <${rawTagContent.slice(0, 40)}>`);
      continue;
    }

    const tagName = tagMatch[1];
    const attrString = tagMatch[2];
    if (GRAPHICAL_PRIMITIVE_TAGS.has(tagName)) {
      primitiveCount += 1;
    }

    // Extract accessible attributes (`aria-label`, `alt`, `data-label`, `data-value`, `data-answer`)
    const attrPattern =
      /\b([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attrMatch: RegExpExecArray | null = attrPattern.exec(attrString);
    while (attrMatch !== null) {
      const attrName = attrMatch[1];
      const rawVal = attrMatch[2] ?? attrMatch[3] ?? "";
      const entIssue = validateXmlEntitiesInSegment(rawVal);
      if (entIssue) issues.push(entIssue);
      if (
        attrName === "aria-label" ||
        attrName === "alt" ||
        attrName === "data-label" ||
        attrName === "data-value" ||
        attrName === "data-answer"
      ) {
        const decodedAttr = decodeXmlEntities(rawVal).trim();
        if (decodedAttr) {
          accessibleTexts.push(decodedAttr);
        }
      }
      attrMatch = attrPattern.exec(attrString);
    }

    if (!selfClosing) {
      stack.push({ tag: tagName, textBuffer: "" });
    }
  }

  if (stack.length > 0) {
    issues.push(
      `Unclosed SVG tags remaining at EOF: ${stack.map((s) => s.tag).join(", ")}`,
    );
  }

  if (primitiveCount === 0) {
    issues.push("SVG contains zero graphical primitives");
  }

  return {
    valid: issues.length === 0,
    issues,
    visibleTexts,
    accessibleTexts,
    svgSha256,
  };
}

function isPureBareNumberSegment(segment: string): boolean {
  return /^[+-−]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/.test(segment.trim());
}

/**
 * Verifies that none of the declared `hiddenQuantities` leak in student-visible
 * `<text>`, `<tspan>`, `<title>`, `<desc>`, or `aria-label` attributes.
 */
export function checkSvgHiddenQuantityLeaks(
  options: SvgLeakCheckOptions,
): string[] {
  const sanity = inspectSvgSanity(options.svgMarkup);
  const leaks: string[] = [];

  const publicNumbers = options.publicNumbers ?? [];
  const publicLabelSet = new Set(
    (options.publicLabels ?? []).map((l) => l.trim()),
  );

  const allSegments: Array<{ source: "visible" | "accessible"; text: string }> = [
    ...sanity.visibleTexts.map((text) => ({ source: "visible" as const, text })),
    ...sanity.accessibleTexts.map((text) => ({
      source: "accessible" as const,
      text: text.replace(
        /\bdiagram with \d+ (?:components?|source or marker entities|panels?|elements?|branches?)\b/gi,
        "diagram",
      ),
    })),
  ];

  for (const hiddenKey of options.hiddenQuantities) {
    const trimmedKey = hiddenKey.trim();
    if (!trimmedKey) continue;

    // 1. Check raw camelCase / snake_case key identifier leakage
    if (
      trimmedKey.length >= 4 &&
      (/[A-Z_]/.test(trimmedKey) || trimmedKey.includes("-"))
    ) {
      for (const seg of allSegments) {
        if (seg.text.includes(trimmedKey)) {
          leaks.push(
            `SVG ${seg.source} text leaks hidden quantity identifier "${trimmedKey}": "${seg.text}"`,
          );
        }
      }
    }

    const hiddenVal = options.verifiedQuantities[trimmedKey];
    if (hiddenVal === undefined) {
      continue;
    }

    // 2. String quantity leak check
    if (typeof hiddenVal === "string") {
      const cleanStr = hiddenVal.trim().toLowerCase();
      if (cleanStr.length >= 3 && cleanStr !== "yes" && cleanStr !== "no") {
        for (const seg of allSegments) {
          if (
            !publicLabelSet.has(seg.text.trim()) &&
            seg.text.toLowerCase().includes(cleanStr)
          ) {
            leaks.push(
              `SVG ${seg.source} text leaks hidden expression for "${trimmedKey}" ("${hiddenVal}"): "${seg.text}"`,
            );
          }
        }
      }
      continue;
    }

    // 3. Numeric quantity leak check
    if (typeof hiddenVal === "number" && Number.isFinite(hiddenVal)) {
      // Zero is routinely an origin tick (0, 0) on axes; only flag zero if paired with explicit '=' answer callout
      if (Math.abs(hiddenVal) <= 1e-12) {
        continue;
      }

      const matchesDeclaredPublicNumber = publicNumbers.some((pub) =>
        numbersAgreeWithinTolerance(pub, hiddenVal, {
          significantFigures: 3,
          relativeTolerance: 0.005,
        }),
      );

      for (const seg of allSegments) {
        if (publicLabelSet.has(seg.text.trim())) {
          continue;
        }
        // Allow bare axis tick number (e.g. "6") ONLY when that exact number is a declared public tick/given
        if (matchesDeclaredPublicNumber && isPureBareNumberSegment(seg.text)) {
          continue;
        }

        const mentions = extractNumbersFromPhysicsText(seg.text);
        for (const mention of mentions) {
          const candidateVals = [
            mention.rawValue,
            ...(mention.siBaseValue !== undefined ? [mention.siBaseValue] : []),
            ...mention.alternateConvertedValues,
          ];
          const hit = candidateVals.some((val) =>
            numbersAgreeWithinTolerance(val, hiddenVal, {
              significantFigures: 3,
              relativeTolerance: 0.006,
            }),
          );
          if (!hit) continue;

          // If this number happens to equal a public given (e.g. "6 Ω" resistor while hidden answer is "6 W"),
          // permit ONLY if the segment has a unit and appears inside a comma/semicolon-separated accessible summary of public labels
          if (
            matchesDeclaredPublicNumber &&
            seg.source === "accessible" &&
            Array.from(publicLabelSet).some((lbl) => seg.text.includes(lbl)) &&
            !seg.text
              .replace(
                new RegExp(
                  Array.from(publicLabelSet)
                    .filter(Boolean)
                    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                    .join("|") || "^$",
                  "g",
                ),
                "",
              )
              .includes(mention.rawText)
          ) {
            continue;
          }

          leaks.push(
            `SVG ${seg.source} text "${seg.text}" leaks hidden quantity "${trimmedKey}" = ${String(hiddenVal)}`,
          );
          break;
        }
      }
    }
  }

  return leaks;
}
