import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
  },
];

export default eslintConfig;
