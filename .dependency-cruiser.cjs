// Architecture boundaries — enforced, not aspirational.
// Run: npm run check:boundaries (also runs as part of the root `npm run build`).
// Mirrors the silver-castle (Asset Rise) config — same three laws.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'shared-no-upward-import',
      comment: 'packages/shared is the foundation — it may never import from apps/*.',
      severity: 'error',
      from: { path: '^packages/shared' },
      to: { path: '^apps/' },
    },
    {
      name: 'api-no-import-web',
      comment: 'apps/api may not reach into apps/web.',
      severity: 'error',
      from: { path: '^apps/api' },
      to: { path: '^apps/web' },
    },
    {
      name: 'web-no-import-api',
      comment:
        'apps/web may not import runtime code from apps/api. Exception: type-only ' +
        'imports (the tRPC AppRouter type re-export in types/app-router.ts).',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^apps/api', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'shared-one-public-door',
      comment: 'Import @asset-rise/shared only — never a file inside packages/shared/src.',
      severity: 'error',
      from: { path: '^apps/' },
      to: { path: '^packages/shared/src/(?!index\\.ts$)' },
    },
    {
      name: 'no-circular',
      comment:
        'Circular imports rot into load-order bugs; break the cycle instead. ' +
        'Cycles through a deliberate lazy `import()` or type-only edges are allowed.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['dynamic-import', 'type-only'] },
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|coverage)/' },
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
}
