module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/lib/**/__tests__/**/*.test.tsx',
    '<rootDir>/lib/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/components/**/__tests__/**/*.test.ts?(x)',
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.tsx',
    '<rootDir>/app/api/**/__tests__/**/*.test.ts'
  ],
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx'
        },
        diagnostics: false
      }
    ]
  },
  moduleNameMapper: {
    '^.+\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/$1'
  },
  testTimeout: 30000
};