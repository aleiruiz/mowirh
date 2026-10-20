import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'drizzle'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Data principle: nothing is hard-deleted. Use softDelete() instead.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='delete'][callee.object.name='db']",
          message: 'Hard deletes are not allowed. Use softDelete() from src/db/soft-delete.ts.',
        },
        {
          selector: "CallExpression[callee.property.name='delete'][callee.object.name='tx']",
          message: 'Hard deletes are not allowed. Use softDelete() from src/db/soft-delete.ts.',
        },
      ],
    },
  },
);
