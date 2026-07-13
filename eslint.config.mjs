export default [
  {
    files: ['src/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', performance: 'readonly', console: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', screen: 'readonly',
        fetch: 'readonly', alert: 'readonly', Image: 'readonly', URL: 'readonly',
        Blob: 'readonly', process: 'readonly', globalThis: 'readonly',
        Buffer: 'readonly', Option: 'readonly', HTMLElement: 'readonly',
        ResizeObserver: 'readonly', SVGElement: 'readonly',
      },
    },
    rules: {
      // The whole point: a name used but never imported or declared.
      // This is exactly the bug that stopped BATTLE from starting.
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
