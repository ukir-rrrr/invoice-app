/* eslint-disable @typescript-eslint/no-require-imports */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

module.exports = defineConfig([
  ...expoConfig,
  ...tseslint.configs.recommended,
  {
    files: ['lib/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'domain must not import react' },
            { name: 'react-native', message: 'domain must not import react-native' },
            { name: 'expo-sqlite', message: 'domain must not import expo-sqlite' },
            { name: 'expo-print', message: 'domain must not import expo-print' },
          ],
          patterns: ['expo', 'expo-*', 'react', 'react-*'],
        },
      ],
    },
  },
  {
    ignores: ['node_modules/', 'dist/', '.expo/', 'lib/db/migrations/registry.ts'],
  },
]);
