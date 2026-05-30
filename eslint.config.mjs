import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".tools/**", ".next/**", "node_modules/**", "out/**"],
  },
  ...nextVitals,
];

export default eslintConfig;
