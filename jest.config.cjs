module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/lib/**/__tests__/**/*.test.tsx',
    '<rootDir>/lib/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.tsx',
    '<rootDir>/app/api/**/__tests__/**/*.test.ts'
  ],
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleNameMapper: {
    '^.+\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/$1'
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: false
    }
  },
  testTimeout: 30000
};