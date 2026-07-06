// Lean, high-value lint — correctness + size budgets, zero style rules
// (Prettier owns style). Runs via `npm run lint` (part of `npm run check`).
// Mirrors the silver-castle (Asset Rise) config.
//
// File-size budgets: new/normal files hard-error over 600 lines; the LEGACY
// files below predate the budget and are capped at 900 — they may only
// shrink. Never add to the list.

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// Files already over 600 lines when the budget landed (2026-07-06).
const LEGACY_OVERSIZED = [
  'apps/web/src/pages/admin/god/Workflow.tsx',
  'apps/web/src/pages/admin/god/Buildings.tsx',
  'apps/web/src/pages/admin/god/Misc.tsx',
  'apps/web/src/pages/admin/god/Polls.tsx',
  'apps/web/src/pages/admin/PipelineRuns.tsx',
  'apps/web/src/pages/admin/Agents.tsx',
  'apps/web/src/pages/admin/god/Documents.tsx',
  'apps/web/src/pages/admin/Costs.tsx',
  'apps/web/src/pages/admin/god/Broadcast.tsx',
]

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/web/public/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 600, skipBlankLines: false, skipComments: false }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    // CommonJS config files (tailwind/postcss).
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { 'max-lines': 'off' },
  },
  {
    files: LEGACY_OVERSIZED,
    rules: {
      'max-lines': ['error', { max: 900, skipBlankLines: false, skipComments: false }],
    },
  },
)
