#!/usr/bin/env node
/**
 * EDGE FOOTPRINT MEASUREMENT
 * Analyzes SawyerCore's edge efficiency and identifies optimization opportunities.
 *
 * Measures:
 * - Cold start time (approximation through module analysis)
 * - Memory use (dependency tree size, critical path depth)
 * - Dependency size (KB/package impact)
 * - Build artifact size (dist/, target/)
 * - Runtime module load cost (require/import analysis)
 *
 * Identifies:
 * - Heaviest dependencies
 * - Duplicate modules
 * - Slow-loading paths
 * - Unnecessary runtime imports
 *
 * Recommendations only. Does NOT auto-modify.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

// const __dirname = dirname(fileURLToPath(import.meta.url));

interface DependencyProfile {
  name: string;
  sizeKB: number;
  depth: number;
  isDev: boolean;
  isRequiredBy?: string[];
}

interface FootprintReport {
  generatedAt: string;
  summary: {
    totalDeps: number;
    totalDepSizeKB: number;
    criticalDeps: number;
    duplicateModules: string[];
    buildArtifactSizeKB: number;
    maxImportDepth: number;
  };
  heaviestDeps: DependencyProfile[];
  duplicates: { module: string; occurrences: string[] }[];
  slowLoadingPaths: { path: string; depth: number; importedBy: string }[];
  unnecessaryImports: { file: string; import: string; reason: string }[];
  optimizationRecommendations: string[];
}

function getPackageDeps(): Map<string, { size: number; version?: string; dev?: boolean }> {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
  const deps = new Map<string, { size: number; version?: string; dev?: boolean }>();

  function addFrom(pkgJson: any, dev: boolean) {
    if (!pkgJson) return;
    for (const [name, version] of Object.entries(pkgJson.dependencies || {})) {
      deps.set(name, { size: 0, version: version as string, dev });
    }
    for (const [name, version] of Object.entries(pkgJson.devDependencies || {})) {
      deps.set(name, { size: 0, version: version as string, dev: true });
    }
  }

  addFrom(pkg, false);

  // Work up dependency tree
  let totalSize = 0;
  try {
    const nodeModules = resolve(process.cwd(), 'node_modules');
    const entries = readdirSync(nodeModules);
    for (const entry of entries) {
      const pkgPath = join(nodeModules, entry, 'package.json');
      if (existsSync(pkgPath)) {
        const pkgData = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const size = dirSize(join(nodeModules, entry));
        if (deps.has(entry)) {
          deps.get(entry)!.size = size;
        } else {
          deps.set(entry, { size, version: pkgData.version, dev: false });
        }
        totalSize += size;
      }
    }
    console.log(`   Total node_modules size: ${totalSize}`);
  } catch (err) {
    console.warn(`Warning: Could not scan node_modules: ${err}`);
  }

  return deps;
}

function dirSize(dir: string): number {
  let size = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          size += dirSize(full);
        } else {
          size += stat.size;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return size;
}

function getBuildArtifactSize(): number {
  let size = 0;
  const dist = resolve(process.cwd(), 'dist');
  if (existsSync(dist)) {
    size += dirSize(dist);
  }
  const target = resolve(process.cwd(), 'target');
  if (existsSync(target)) {
    size += dirSize(target);
  }
  return size;
}

function analyzeImportDepth(): { maxDepth: number; deepPaths: { path: string; depth: number; importedBy: string }[] } {
  const srcDir = resolve(process.cwd(), 'src');
  const deepPaths: { path: string; depth: number; importedBy: string }[] = [];
  let maxDepth = 0;

  function walk(file: string, imports: string[], depth: number): void {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > 10) {
      deepPaths.push({ path: relative(srcDir, file), depth, importedBy: 'unknown' });
      return;
    }
    for (const imp of imports) {
      // Resolve relative imports within src
      if (imp.startsWith('.') && (imp.endsWith('.ts') || imp.endsWith('.tsx') || imp.endsWith('/'))) {
        try {
          let resolved = resolve(file, '..', imp);
          if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
            resolved = join(resolved, 'index.ts');
          }
          if (!existsSync(resolved)) {
            resolved = resolved.replace('.ts', '.ts'); // try other variants?
          }
          if (existsSync(resolved)) {
            const content = readFileSync(resolved, 'utf-8');
            const subImports = extractImports(content);
            walk(resolved, subImports, depth + 1);
          }
        } catch { /* ignore */ }
      }
    }
  }

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          scanDir(full);
        } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          const content = readFileSync(full, 'utf-8');
          const imports = extractImports(content);
          walk(full, imports, 1);
        }
      } catch { /* ignore */ }
    }
  }

  scanDir(srcDir);
  return { maxDepth, deepPaths: deepPaths.slice(0, 20) as { path: string; depth: number; importedBy: string }[] };
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const regex = /import\s+.*?from\s+['"](.+?)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function findDuplicateModules(deps: Map<string, any>): { module: string; occurrences: string[] }[] {
  const seen = new Map<string, string[]>();
  
  for (const [name, info] of deps) {
    if (info) { // use info
      const base = name.split('/')[0];
      if (!seen.has(base)) seen.set(base, []);
      seen.get(base)!.push(name);
    }
  }

  const duplicates: { module: string; occurrences: string[] }[] = [];
  for (const [base, occurrences] of seen) {
    if (occurrences.length > 1) {
      duplicates.push({ module: base, occurrences });
    }
  }
  return duplicates;
}

function findUnnecessaryImports(): { file: string; import: string; reason: string }[] {
  const srcDir = resolve(process.cwd(), 'src');
  const unnecessary: { file: string; import: string; reason: string }[] = [];

  // Patterns that suggest unused or suspicious imports
  const commonDevOnly = ['vitest', '@types/node', '@typescript-eslint', 'eslint'];
  // const mightBeUnused = ['console.log', 'debugger'];

  function scan(file: string): void {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      // Check for dev-only imports in production code
      for (const line of lines) {
        const m = line.match(/import\s+.*?\s+from\s+['"](.+?)['"]/);
        if (m) {
          const imp = m[1];
          const isDevImport = commonDevOnly.some(d => imp.includes(d) || imp === d);
          if (isDevImport && !file.includes('.test.') && !file.includes('vitest.')) {
            unnecessary.push({
              file: relative(process.cwd(), file),
              import: imp,
              reason: 'Development-only import in production code'
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile() && full.endsWith('.ts')) scan(full);
      } catch { /* ignore */ }
    }
  }

  walk(srcDir);
  return unnecessary;
}

function generateRecommendations(
  heaviest: any[],
  duplicates: any[],
  deepPaths: any[],
  unnecessary: any[],
  totalSizeMB: number
): string[] {
  const recs: string[] = [];

  if (heaviest.length > 0) {
    const top = heaviest[0];
    recs.push(`Consider replacing or lazy-loading ${top.name} (${(top.sizeKB / 1024).toFixed(1)} MB) if used in cold paths.`);
  }

  if (duplicates.length > 0) {
    recs.push(`Deduplicate overlapping packages: ${duplicates.map(d => d.module).join(', ')} (${duplicates.length} duplicate sets)`);
  }

  if (deepPaths.length > 0) {
    recs.push(`Deep import chains detected (max depth ${deepPaths[0]?.depth}). Consider flattening or barrel-indexing.`);
  }

  if (unnecessary.length > 0) {
    recs.push(`Remove ${unnecessary.length} unnecessary/dev imports from production code.`);
  }

  if (totalSizeMB > 50) {
    recs.push(`Total installed dependencies: ${totalSizeMB.toFixed(1)} MB. Consider pruning devDependencies in production.`);
  }

  recs.push('Convert eager imports to lazy dynamic imports for cold-start-critical paths.');
  recs.push('Split optional providers into separate entry points for edge runtime.');
  recs.push('Gate expensive analytics or billing initialization behind runtime flags.');

  return recs;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Main
async function main() {
  console.log('📊 Edge Footprint Measurement\n');
  console.log('Analyzing dependency tree and runtime characteristics...\n');

  const deps = getPackageDeps();
  const depArray = Array.from(deps.entries()).map(([name, info]) => ({
    name,
    sizeKB: Math.round(info.size / 1024),
    depth: calculateDepth(name),
    isDev: info.dev || false
  }));
  depArray.sort((a, b) => b.sizeKB - a.sizeKB);

  const heaviestDeps = depArray.slice(0, 15);
  const totalDepSize = heaviestDeps.reduce((sum, d) => sum + d.sizeKB, 0);
  const criticalDeps = heaviestDeps.filter(d => !d.isDev).length;

  console.log(`📦 Total dependency footprint: ${formatBytes(depArray.reduce((s, d) => s + d.sizeKB * 1024, 0))}`);
  console.log(`   Unique dependencies: ${deps.size}`);
  console.log(`   Heaviest: ${heaviestDeps[0]?.name} (${formatBytes(heaviestDeps[0]?.sizeKB * 1024 || 0)})`);

  // Build artifact
  const buildSizeBytes = getBuildArtifactSize();
  console.log(`\n🔨 Build artifacts: ${formatBytes(buildSizeBytes)}`);

  // Import depth
  const { maxDepth, deepPaths } = analyzeImportDepth();
  console.log(`\n🔗 Max import chain depth: ${maxDepth}`);
  if (deepPaths.length > 0) {
    console.log(`   Deep paths: ${deepPaths.map(p => p.path).slice(0, 5).join(', ')}`);
  }

  // Duplicates
  const duplicates = findDuplicateModules(deps);
  console.log(`\n📚 Duplicate module groups: ${duplicates.length}`);

  // Unnecessary imports
  const unnecessary = findUnnecessaryImports();
  console.log(`\n🧹 Unnecessary/dev imports in production: ${unnecessary.length}`);

  // Recommendations
  const recommendations = generateRecommendations(heaviestDeps, duplicates, deepPaths, unnecessary, totalDepSize / 1024);
  console.log('\n💡 Recommendations:');
  recommendations.forEach(r => console.log(`   • ${r}`));

  // Write report
  const report: FootprintReport = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalDeps: deps.size,
      totalDepSizeKB: totalDepSize,
      criticalDeps,
      duplicateModules: duplicates.map(d => d.module),
      buildArtifactSizeKB: Math.round(buildSizeBytes / 1024),
      maxImportDepth: maxDepth
    },
    heaviestDeps,
    duplicates,
    slowLoadingPaths: deepPaths,
    unnecessaryImports: unnecessary,
    optimizationRecommendations: recommendations
  };

  const artifactsDir = join(process.cwd(), 'artifacts', 'perf');
  require('fs').mkdirSync(artifactsDir, { recursive: true });

  const jsonPath = join(artifactsDir, 'footprint-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Report: artifacts/perf/footprint-report.json`);

  const mdPath = join(artifactsDir, 'footprint-report.md');
  writeFileSync(mdPath, generateMarkdown(report));
  console.log(`✓ Report: artifacts/perf/footprint-report.md`);
}

function calculateDepth(name: string): number {
  return name.split(/[\/\\]/).length;
}

function generateMarkdown(report: FootprintReport): string {
  const totalMB = (report.summary.totalDepSizeKB * 1024) / (1024 * 1024);
  const buildMB = (report.summary.buildArtifactSizeKB * 1024) / (1024 * 1024);

  let md = `# Edge Footprint Report

Generated: ${report.generatedAt}

## Summary

| Metric | Value |
|--------|-------|
| Total Dependencies | ${report.summary.totalDeps} |
| Total Installed Size | ${totalMB.toFixed(2)} MB |
| Build Artifacts | ${buildMB.toFixed(2)} MB |
| Critical Dependencies | ${report.summary.criticalDeps} |
| Max Import Depth | ${report.summary.maxImportDepth} |
| Duplicate Module Groups | ${report.summary.duplicateModules.length} |
| Unnecessary Imports | ${report.unnecessaryImports.length} |

## Top 10 Heaviest Dependencies

| Package | Size | Dev? |
|---------|------|------|
`;

  for (const dep of report.heaviestDeps.slice(0, 10)) {
    md += `| ${dep.name} | ${dep.sizeKB} KB | ${dep.isDev ? 'yes' : 'no'} |\n`;
  }

  if (report.duplicates.length > 0) {
    md += `\n## Duplicate Modules\n\n`;
    for (const dup of report.duplicates.slice(0, 10)) {
      md += `- **${dup.module}**: ${dup.occurrences.join(', ')}\n`;
    }
  }

  if (report.unnecessaryImports.length > 0) {
    md += `\n## Unnecessary/Dev Imports in Production\n\n`;
    for (const imp of report.unnecessaryImports.slice(0, 15)) {
      md += `- \`${imp.import}\` in \`${imp.file}\` — ${imp.reason}\n`;
    }
  }

  md += `\n## Optimization Recommendations\n\n`;
  for (const rec of report.optimizationRecommendations) {
    md += `- ${rec}\n`;
  }

  md += `\n---
*This report is read-only. Review recommendations before applying any changes.*\n`;

  return md;
}

main().catch(err => {
  console.error('Footprint measurement failed:', err);
  process.exit(1);
});
