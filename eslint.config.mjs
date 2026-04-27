import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    ignores: [
      "convex/_generated/**",
      ".next/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
];

export default config;
