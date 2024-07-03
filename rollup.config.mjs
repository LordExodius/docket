// rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
  input: "dist/index.js",
  output: {
    file: "dist/bundle.js",
    format: "iife",
    name: "version",
    plugins: [terser()],
  },
  plugins: [commonjs(), resolve()],
};
