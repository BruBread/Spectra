import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    // Build output and test artifacts are generated, not authored. `.next` is
    // ignored by default, but the e2e run builds into its own directory.
    ignores: ['.next/**', '.next-e2e/**', 'out/**', 'test-results/**', 'playwright-report/**', 'blob-report/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
