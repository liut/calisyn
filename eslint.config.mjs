import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'docs/**',
    'service/**',
    'node_modules/**',
    'dist/**',
    '.devcontainer/**',
    '.gitlab-ci.yml',
    'kubernetes/**',
    'CONTRIBUTING*.md',
  ],
})
