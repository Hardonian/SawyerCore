# Edge Footprint Report

Generated: 2026-04-29T02:32:19.162Z

## Summary

| Metric | Value |
|--------|-------|
| Total Dependencies | 207 |
| Total Installed Size | 54.09 MB |
| Build Artifacts | 0.53 MB |
| Critical Dependencies | 12 |
| Max Import Depth | 1 |
| Duplicate Module Groups | 2 |
| Unnecessary Imports | 0 |

## Top 10 Heaviest Dependencies

| Package | Size | Dev? |
|---------|------|------|
| typescript | 23071 KB | yes |
| stripe | 14370 KB | no |
| zod | 3510 KB | no |
| eslint | 3081 KB | yes |
| rollup | 2768 KB | no |
| vite | 2183 KB | no |
| vitest | 1347 KB | yes |
| esquery | 1071 KB | no |
| ajv | 916 KB | no |
| yaml | 669 KB | no |

## Duplicate Modules

- **@types**: @types/express, @types/node, @types/stripe
- **@typescript-eslint**: @typescript-eslint/eslint-plugin, @typescript-eslint/parser

## Optimization Recommendations

- Consider replacing or lazy-loading typescript (22.5 MB) if used in cold paths.
- Deduplicate overlapping packages: @types, @typescript-eslint (2 duplicate sets)
- Total installed dependencies: 54.1 MB. Consider pruning devDependencies in production.
- Convert eager imports to lazy dynamic imports for cold-start-critical paths.
- Split optional providers into separate entry points for edge runtime.
- Gate expensive analytics or billing initialization behind runtime flags.

---
*This report is read-only. Review recommendations before applying any changes.*
