import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModelAuthoredPackage } from "../generation-harness/ollama-author";
import { findReviewablePackage, ReviewablePackage } from "./review-service";

export function authoredPackageResolver(
  directory: string,
): (packageId: string | undefined) => ReviewablePackage | undefined {
  return (packageId) => {
    const checked = findReviewablePackage(packageId);
    if (checked || !packageId || !/^qwen-author-[a-z0-9-]+$/.test(packageId))
      return checked;
    try {
      const raw: unknown = JSON.parse(
        readFileSync(join(directory, `${packageId}.json`), "utf8"),
      );
      const candidate = parseModelAuthoredPackage(raw);
      return candidate.id === packageId ? candidate : undefined;
    } catch {
      return undefined;
    }
  };
}
