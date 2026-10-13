import compat from 'eslint-plugin-compat';
import parser from '@babel/eslint-parser';
export default [{
  files: ['src/app/**/*.tsx','src/lib/**/*.ts'],
  linterOptions: { reportUnusedDisableDirectives: "off" },
  languageOptions: { parser, parserOptions: { requireConfigFile: false, babelOptions: { parserOpts: { plugins: ['typescript', 'jsx'] } }, ecmaVersion: 'latest', sourceType: 'module' } },
  plugins: { compat }, rules: { 'compat/compat': 'error' },
  settings: { lintAllEsApis: true },
}];
