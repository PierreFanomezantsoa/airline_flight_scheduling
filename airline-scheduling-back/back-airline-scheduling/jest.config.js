module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testMatch: [
    '<rootDir>/test/unit/**/*.spec.ts',
    '<rootDir>/test/integration/**/*.spec.ts',
    '<rootDir>/test/business/**/*.spec.ts',
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/migrations/**'],
  coverageDirectory: 'coverage',
};
