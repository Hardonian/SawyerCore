# Edge Footprint Report

Generated: 2026-08-23T02:26:30.990Z

## Summary

| Metric | Value |
|--------|-------|
| Total Dependencies | 157 |
| Total Installed Size | 72.50 MB |
| Build Artifacts | 0.54 MB |
| Critical Dependencies | 11 |
| Max Import Depth | 1 |
| Duplicate Module Groups | 2 |
| Unnecessary Imports | 0 |

## Top 10 Heaviest Dependencies

| Package | Size | Dev? |
|---------|------|------|
| typescript | 23071 KB | yes |
| stripe | 14370 KB | no |
| tsx | 12088 KB | yes |
| lightningcss-win32-x64-msvc | 9279 KB | no |
| zod | 3510 KB | no |
| eslint | 2938 KB | yes |
| vite | 2284 KB | no |
| vitest | 1861 KB | yes |
| esquery | 1071 KB | no |
| ajv | 916 KB | no |

## Duplicate Modules

- **@types**: @types/express, @types/node
- **@typescript-eslint**: @typescript-eslint/eslint-plugin, @typescript-eslint/parser

## Optimization Recommendations

- Consider replacing or lazy-loading typescript (22.5 MB) if used in cold paths.
- Deduplicate overlapping packages: @types, @typescript-eslint (2 duplicate sets)
- Total installed dependencies: 72.5 MB. Consider pruning devDependencies in production.
- Convert eager imports to lazy dynamic imports for cold-start-critical paths.
- Split optional providers into separate entry points for edge runtime.
- Gate expensive analytics or billing initialization behind runtime flags.

---
*This report is read-only. Review recommendations before applying any changes.*
