module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['prettier'],
  plugins: ['prettier', '@typescript-eslint', 'import'],
  rules: {
    'prettier/prettier': 'error'
  }
}
