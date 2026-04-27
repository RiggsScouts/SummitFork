import * as fs from "fs";
import * as path from "path";

type Phase1Contracts = {
  syncfusionImportInventory: Record<string, string[]>;
};

const CONTRACTS_PATH = path.resolve(__dirname, "../../../plans/remove-syncfusion-phase-1-contracts.json");
const PAGES_ROOT = path.resolve(__dirname, "../../../src/pages");

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const collectFiles = (dir: string, predicate: (fileName: string) => boolean): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, predicate));
      continue;
    }

    if (predicate(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
};

const extractSyncfusionImports = (sourceCode: string): string[] => {
  const importRegex = /^\s*import[\s\S]*?\sfrom\s+["'](@syncfusion\/[^"']+)["']/gm;
  const modules: string[] = [];
  let match: RegExpExecArray | null = importRegex.exec(sourceCode);

  while (match) {
    modules.push(match[1]);
    match = importRegex.exec(sourceCode);
  }

  return Array.from(new Set(modules)).sort();
};

describe("syncfusion import inventory detection", () => {
  it("matches the Phase 1 import inventory contract for src/pages", () => {
    expect(fs.existsSync(CONTRACTS_PATH)).toBe(true);

    const contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8")) as Phase1Contracts;
    const tsxFiles = collectFiles(PAGES_ROOT, (fileName) => fileName.endsWith(".tsx"));
    const actualInventory: Record<string, string[]> = {};

    for (const filePath of tsxFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const imports = extractSyncfusionImports(content);
      if (imports.length === 0) {
        continue;
      }

      const repoRelativePath = normalizePath(path.relative(path.resolve(__dirname, "../../.."), filePath));
      actualInventory[repoRelativePath] = imports;
    }

    expect(Object.keys(actualInventory).length).toBeGreaterThan(0);
    expect(actualInventory).toEqual(contracts.syncfusionImportInventory);
  });
});
