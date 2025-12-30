import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextConfig,
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  {
    ignores: ['recovered:/**'],
  },
];

export default config;
