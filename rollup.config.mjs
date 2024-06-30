// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'dist/index.js',
  output: {
    file: 'dist/bundle.js',
    format: 'iife',
    name: 'MyModule'
  },
  plugins: [commonjs(), resolve()]
};