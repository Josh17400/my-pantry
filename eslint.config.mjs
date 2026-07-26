// @ts-check
/**
 * Flat ESLint config for The Good Pantry.
 *
 * Scope: packages/core (pure TS domain) and apps/web (React + Capacitor).
 * Deno edge functions (supabase/functions/**) are intentionally excluded —
 * they use a separate toolchain and must not share this type graph.
 */
import eslint from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

/** Shared type-aware rules for both core and web. */
const sharedTsRules = {
  // Architecture / correctness — keep the codebase any-free
  '@typescript-eslint/no-explicit-any': 'error',

  // Promise hygiene
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': [
    'error',
    { checksVoidReturn: { attributes: false } },
  ],

  // Prefer `import type` for type-only imports.
  // Allow `import('x').Y` annotations — used for lazy/dynamic type refs in drivers.
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      prefer: 'type-imports',
      fixStyle: 'separate-type-imports',
      disallowTypeAnnotations: false,
    },
  ],

  // Import ordering (autofixable)
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',

  // ---------------------------------------------------------------------------
  // Deliberate disables — mass noise that is not worth honoring today.
  // Prefer config-level disable with a reason over scattering eslint-disable.
  // ---------------------------------------------------------------------------

  // Template-literal / + on branded strings and unit keys produces hundreds of
  // false positives without improving correctness. TypeScript already covers
  // real type errors; keep this off until we invest in template-literal types.
  '@typescript-eslint/restrict-template-expressions': 'off',
  '@typescript-eslint/restrict-plus-operands': 'off',

  // Domain code uses `??` and `||` for defaulting empty strings and zeroish
  // amounts intentionally; strict-boolean-expressions is too noisy here.
  '@typescript-eslint/strict-boolean-expressions': 'off',

  // Prefer readability over forcing `??` everywhere existing `||` defaults live.
  '@typescript-eslint/prefer-nullish-coalescing': 'off',

  // Vitest and domain helpers use non-null assertions after guards; ban would
  // force less-readable rewrites without catching real bugs under strict TS.
  '@typescript-eslint/no-non-null-assertion': 'off',

  // Empty catch blocks / interfaces that mirror DB rows are intentional patterns.
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-empty-object-type': 'off',
  '@typescript-eslint/consistent-type-definitions': 'off',

  // Unsafe-* rules on `unknown` from JSON / SQLite rows create wall-to-wall
  // noise; the codebase is already any-free and uses explicit casts at boundaries.
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-enum-comparison': 'off',

  // Number()/String()/Boolean() at SQLite/JSON boundaries look redundant to the
  // type checker but document intentional coercion of driver-returned values.
  '@typescript-eslint/no-unnecessary-type-conversion': 'off',

  // `Unit | string` and `Error | unknown` unions document intent at boundaries;
  // the "redundant constituent" flag is pure noise for that style.
  '@typescript-eslint/no-redundant-type-constituents': 'off',

  // Barrel re-exports of @deprecated aliases (e.g. sortAndDedupe) are intentional
  // public API stability; React FormEvent deprecation is a types-version quirk.
  '@typescript-eslint/no-deprecated': 'off',

  // Map/object key deletes in caches are normal; prefer-for-of/optional-chain are
  // style-only and fight existing loops written for index access.
  '@typescript-eslint/no-dynamic-delete': 'off',
  '@typescript-eslint/prefer-for-of': 'off',
  '@typescript-eslint/prefer-optional-chain': 'off',
  '@typescript-eslint/no-unnecessary-type-parameters': 'off',
  '@typescript-eslint/no-invalid-void-type': 'off',

  // Style preferences that fight existing idioms
  '@typescript-eslint/no-unnecessary-condition': 'off',
  '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  '@typescript-eslint/no-confusing-void-expression': 'off',
  '@typescript-eslint/only-throw-error': 'off',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/prefer-promise-reject-errors': 'off',
  '@typescript-eslint/no-base-to-string': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  // Base recommended also has no-unused-vars; let the TS rule own it
  'no-unused-vars': 'off',
};

export default tseslint.config(
  // ---------------------------------------------------------------------------
  // Global ignores
  // ---------------------------------------------------------------------------
  {
    name: 'larder/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.tsbuildinfo',
      // Capacitor native shells (generated / not our TS app code)
      'native/**',
      // Deno edge functions — separate toolchain; do not mix type systems
      'supabase/functions/**',
      // One-off Node screenshot/smoke scripts (plain ESM, not in tsconfigs)
      'apps/web/scripts/**',
      // Design assets / reports
      'reports/**',
      'design/**',
    ],
  },

  // ---------------------------------------------------------------------------
  // Base JS + TypeScript (type-aware) for core + web
  // ---------------------------------------------------------------------------
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    name: 'larder/ts-base',
    files: ['packages/core/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: sharedTsRules,
  },

  // ---------------------------------------------------------------------------
  // packages/core — pure TypeScript domain. No React, no native, no DOM.
  // This is the single most valuable rule set: purity is why Expo → Capacitor
  // re-platform cost almost nothing. Fail the build rather than rely on vigilance.
  // ---------------------------------------------------------------------------
  {
    name: 'larder/core-architecture',
    files: ['packages/core/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'packages/core must stay platform-free. No React — keep UI in apps/web.',
            },
            {
              name: 'react-dom',
              message:
                'packages/core must stay platform-free. No react-dom — keep UI in apps/web.',
            },
            {
              name: 'react-native',
              message:
                'packages/core must stay platform-free. No react-native.',
            },
            {
              name: 'react-router',
              message:
                'packages/core must stay platform-free. Routing belongs in apps/web.',
            },
            {
              name: 'react-router-dom',
              message:
                'packages/core must stay platform-free. Routing belongs in apps/web.',
            },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*', 'react-native/*'],
              message:
                'packages/core must stay platform-free. No React family imports.',
            },
            {
              group: ['@capacitor/*', '@capacitor-community/*'],
              message:
                'packages/core must stay platform-free. Capacitor APIs belong in apps/web or native shells.',
            },
            {
              group: ['expo', 'expo-*', '@expo/*'],
              message:
                'packages/core must stay platform-free. No Expo imports.',
            },
          ],
        },
      ],
      // Virtual browser / DOM globals — core runs in Node tests and must not
      // depend on browser APIs. Node globals remain available (see languageOptions).
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'packages/core must not use browser globals (window).',
        },
        {
          name: 'document',
          message: 'packages/core must not use browser globals (document).',
        },
        {
          name: 'navigator',
          message: 'packages/core must not use browser globals (navigator).',
        },
        {
          name: 'localStorage',
          message: 'packages/core must not use browser globals (localStorage).',
        },
        {
          name: 'sessionStorage',
          message:
            'packages/core must not use browser globals (sessionStorage).',
        },
        {
          name: 'indexedDB',
          message: 'packages/core must not use browser globals (indexedDB).',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // apps/web — React + browser + Capacitor
  // ---------------------------------------------------------------------------
  {
    name: 'larder/web-react',
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      // PropTypes are unused under TypeScript
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',

      // Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Config / build files at package roots (may not sit in a project)
  {
    name: 'larder/config-files',
    files: [
      '**/*.{js,cjs,mjs}',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/drizzle.config.ts',
      '**/tailwind.config.js',
      '**/postcss.config.js',
      'eslint.config.js',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
