/**
 * Workspace package discovery for npm workspaces
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

export interface PackageExports {
  [key: string]: string | PackageExportsConditions | PackageExportsArray;
}

export interface PackageExportsConditions {
  types?: string | PackageExportsConditions | PackageExportsArray;
  import?: string | PackageExportsConditions | PackageExportsArray;
  require?: string | PackageExportsConditions | PackageExportsArray;
  default?: string | PackageExportsConditions | PackageExportsArray;
  [condition: string]: string | PackageExportsConditions | PackageExportsArray | undefined;
}

export type PackageExportsArray = Array<string | PackageExportsConditions>;

export interface PackageJson {
  name?: string;
  private?: boolean;
  type?: "module" | "commonjs";
  exports?: string | PackageExports | PackageExportsConditions | PackageExportsArray;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  workspaces?: string[] | { packages: string[] };
}

export interface WorkspacePackage {
  /** Package name from package.json */
  name: string;
  /** Absolute path to package directory */
  dir: string;
  /** Whether package is private */
  private: boolean;
  /** Module type: 'module' or 'commonjs' */
  type: "module" | "commonjs";
  /** Raw exports field */
  exports?: PackageJson["exports"];
  /** Main field */
  main?: string;
  /** Module field */
  module?: string;
  /** Types/typings field */
  types?: string;
  /** Raw package.json contents */
  packageJson: PackageJson;
}

/**
 * Read and parse a package.json file
 */
export function readPackageJson(pkgPath: string): PackageJson | null {
  try {
    const content = fs.readFileSync(pkgPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Get workspace patterns from root package.json
 */
export function getWorkspacePatterns(rootPkg: PackageJson): string[] {
  if (!rootPkg.workspaces) {
    return [];
  }

  if (Array.isArray(rootPkg.workspaces)) {
    return rootPkg.workspaces;
  }

  if (rootPkg.workspaces.packages) {
    return rootPkg.workspaces.packages;
  }

  return [];
}

/**
 * Discover all workspace packages in a monorepo
 */
export async function discoverWorkspacePackages(
  rootDir: string
): Promise<WorkspacePackage[]> {
  const rootPkgPath = path.join(rootDir, "package.json");
  const rootPkg = readPackageJson(rootPkgPath);

  if (!rootPkg) {
    throw new Error(`Could not read root package.json at ${rootPkgPath}`);
  }

  const patterns = getWorkspacePatterns(rootPkg);

  if (patterns.length === 0) {
    // No workspaces defined - treat root as single package if it has a name
    if (rootPkg.name) {
      return [packageFromJson(rootPkg, rootDir)];
    }
    return [];
  }

  const packages: WorkspacePackage[] = [];

  for (const pattern of patterns) {
    // Expand glob pattern - ensure pattern ends with / for directories
    const dirPattern = pattern.endsWith("/") ? pattern : `${pattern}/`;
    const matches = await glob(dirPattern, {
      cwd: rootDir,
      absolute: true,
    });
    
    // Remove trailing slashes from matches
    const dirs = matches.map(m => m.replace(/\/$/, ""));

    for (const pkgDir of dirs) {
      const pkgJsonPath = path.join(pkgDir, "package.json");
      const pkgJson = readPackageJson(pkgJsonPath);

      if (pkgJson && pkgJson.name) {
        packages.push(packageFromJson(pkgJson, pkgDir));
      }
    }
  }

  // Sort by package name for deterministic output
  packages.sort((a, b) => a.name.localeCompare(b.name));

  return packages;
}

/**
 * Create a WorkspacePackage from package.json data
 */
function packageFromJson(pkgJson: PackageJson, dir: string): WorkspacePackage {
  return {
    name: pkgJson.name!,
    dir,
    private: pkgJson.private ?? false,
    type: pkgJson.type ?? "commonjs",
    exports: pkgJson.exports,
    main: pkgJson.main,
    module: pkgJson.module,
    types: pkgJson.types ?? pkgJson.typings,
    packageJson: pkgJson,
  };
}

/**
 * Filter packages by glob pattern
 */
export function filterPackages(
  packages: WorkspacePackage[],
  pattern?: string
): WorkspacePackage[] {
  if (!pattern) {
    return packages;
  }

  // Simple glob matching for package names
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );

  return packages.filter((pkg) => regex.test(pkg.name));
}
