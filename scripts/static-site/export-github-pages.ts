import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compilePublicBank } from "./compile-public-bank";

export const DEFAULT_DIST_PAGES_DIR = "dist-pages";

const ROOT_CONFIG_FILES = [
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "postcss.config.mjs",
  "tailwind.config.js",
  "eslint.config.mjs",
  "components.json",
] as const;

const ROOT_SOURCE_DIRS = ["components", "lib", "types"] as const;

const EXCLUDED_APP_SEGMENTS = new Set(["api", "review"]);

function renderStaticExportNextConfig(): string {
  return [
    'import type { NextConfig } from "next";',
    "",
    'const rawBasePath = process.env.SIXTHPHYSICS_BASE_PATH?.trim() ?? "";',
    "const normalizedBasePath = rawBasePath",
    '  ? `/${rawBasePath.replace(/^\\/+|\\/+$/g, "")}`',
    '  : "";',
    "",
    "const nextConfig: NextConfig = {",
    '  output: "export",',
    "  ...(normalizedBasePath",
    "    ? { basePath: normalizedBasePath, assetPrefix: normalizedBasePath }",
    "    : {}),",
    "  images: {",
    "    unoptimized: true,",
    "  },",
    "  experimental: {",
    "    optimizePackageImports: [",
    '      "@radix-ui/react-select",',
    '      "@radix-ui/react-collapsible",',
    '      "lucide-react",',
    "    ],",
    "  },",
    "  poweredByHeader: false,",
    "  generateEtags: false,",
    "};",
    "",
    "export default nextConfig;",
    "",
  ].join("\n");
}

function isNonTestSourcePath(srcPath: string): boolean {
  const base = path.basename(srcPath);
  if (base === "__tests__") {
    return false;
  }
  if (
    base.endsWith(".test.ts") ||
    base.endsWith(".test.tsx") ||
    base.endsWith(".spec.ts") ||
    base.endsWith(".spec.tsx")
  ) {
    return false;
  }
  return true;
}

function copyAppMinusExcludedRoutes(srcAppDir: string, destAppDir: string): void {
  fs.mkdirSync(destAppDir, { recursive: true });
  const entries = fs.readdirSync(srcAppDir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_APP_SEGMENTS.has(entry.name) || entry.name === "__tests__") {
      continue;
    }
    const srcPath = path.join(srcAppDir, entry.name);
    const destPath = path.join(destAppDir, entry.name);
    fs.cpSync(srcPath, destPath, {
      recursive: true,
      filter: isNonTestSourcePath,
    });
  }
}

export interface ExportGithubPagesOptions {
  repoRoot?: string;
  outDir?: string;
  skipBankCompile?: boolean;
}

export interface ExportGithubPagesResult {
  distPagesDir: string;
  totalCompiledItems: number;
  hasIndexHtml: boolean;
  hasNoJekyll: boolean;
  hasManifestJson: boolean;
  exportedChunkFiles: number;
}

export async function exportGithubPagesBundle(
  options: ExportGithubPagesOptions = {},
): Promise<ExportGithubPagesResult> {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const distPagesDir = path.resolve(
    repoRoot,
    options.outDir ?? DEFAULT_DIST_PAGES_DIR,
  );

  let totalCompiledItems = 0;
  if (!options.skipBankCompile) {
    const compileResult = await compilePublicBank();
    totalCompiledItems = compileResult.totalItems;
  } else {
    const manifestPath = path.join(
      repoRoot,
      "public",
      "sixthphysics-data",
      "manifest.json",
    );
    if (fs.existsSync(manifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        totalItems?: number;
      };
      totalCompiledItems = parsed.totalItems ?? 0;
    }
  }

  const tmpBase = fs.existsSync("/tmp") ? "/tmp" : os.tmpdir();
  const stageDir = path.join(
    tmpBase,
    `sp-pages-export-${process.pid}-${Date.now()}`,
  );

  try {
    fs.mkdirSync(stageDir, { recursive: true });

    for (const fileName of ROOT_CONFIG_FILES) {
      const srcFile = path.join(repoRoot, fileName);
      if (fs.existsSync(srcFile)) {
        fs.cpSync(srcFile, path.join(stageDir, fileName));
      }
    }

    for (const dirName of ROOT_SOURCE_DIRS) {
      const srcDir = path.join(repoRoot, dirName);
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, path.join(stageDir, dirName), {
          recursive: true,
          filter: isNonTestSourcePath,
        });
      }
    }

    copyAppMinusExcludedRoutes(
      path.join(repoRoot, "app"),
      path.join(stageDir, "app"),
    );

    fs.symlinkSync(
      path.join(repoRoot, "node_modules"),
      path.join(stageDir, "node_modules"),
      "dir",
    );
    fs.symlinkSync(
      path.join(repoRoot, "public"),
      path.join(stageDir, "public"),
      "dir",
    );

    fs.writeFileSync(
      path.join(stageDir, "next.config.ts"),
      renderStaticExportNextConfig(),
      "utf8",
    );

    const nextBin = path.join(repoRoot, "node_modules", ".bin", "next");
    execFileSync(nextBin, ["build"], {
      cwd: stageDir,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });

    const stageOutDir = path.join(stageDir, "out");
    if (!fs.existsSync(path.join(stageOutDir, "index.html"))) {
      throw new Error(
        `Static export failed: missing ${path.join(stageOutDir, "index.html")}`,
      );
    }

    // Guarantee public/sixthphysics-data is present in exported bundle even if symlinked public was skipped
    const exportedDataDir = path.join(stageOutDir, "sixthphysics-data");
    const sourceDataDir = path.join(repoRoot, "public", "sixthphysics-data");
    if (
      fs.existsSync(sourceDataDir) &&
      !fs.existsSync(path.join(exportedDataDir, "manifest.json"))
    ) {
      fs.cpSync(sourceDataDir, exportedDataDir, { recursive: true });
    }

    fs.writeFileSync(path.join(stageOutDir, ".nojekyll"), "", "utf8");

    fs.rmSync(distPagesDir, { recursive: true, force: true });
    fs.cpSync(stageOutDir, distPagesDir, { recursive: true });

    const chunksDir = path.join(distPagesDir, "sixthphysics-data", "chunks");
    const exportedChunkFiles = fs.existsSync(chunksDir)
      ? fs.readdirSync(chunksDir).filter((name) => name.endsWith(".json"))
          .length
      : 0;

    return {
      distPagesDir,
      totalCompiledItems,
      hasIndexHtml: fs.existsSync(path.join(distPagesDir, "index.html")),
      hasNoJekyll: fs.existsSync(path.join(distPagesDir, ".nojekyll")),
      hasManifestJson: fs.existsSync(
        path.join(distPagesDir, "sixthphysics-data", "manifest.json"),
      ),
      exportedChunkFiles,
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

async function runCli(): Promise<void> {
  const result = await exportGithubPagesBundle();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
