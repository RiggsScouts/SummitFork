import * as fs from "fs";
import * as path from "path";

type CiLicenseGuardContracts = {
  workflowPath: string;
  requiredWorkflowMarkers: string[];
  packageScriptName: string;
  packageScriptContains: string;
};

type Phase1Contracts = {
  ciLicenseGuard: CiLicenseGuardContracts;
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTRACTS_PATH = path.resolve(REPO_ROOT, "plans/remove-syncfusion-phase-1-contracts.json");

describe("syncfusion license CI guard expectations", () => {
  it("locks current license activation hooks for migration safety", () => {
    expect(fs.existsSync(CONTRACTS_PATH)).toBe(true);

    const contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8")) as Phase1Contracts;
    const licenseGuard = contracts.ciLicenseGuard;

    const workflowPath = path.resolve(REPO_ROOT, licenseGuard.workflowPath);
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, "utf8");
    for (const marker of licenseGuard.requiredWorkflowMarkers) {
      expect(workflow).toContain(marker);
    }

    const packageJsonPath = path.resolve(REPO_ROOT, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};

    expect(scripts[licenseGuard.packageScriptName]).toContain(licenseGuard.packageScriptContains);
  });
});
