const path = require('path');

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      path.resolve(__dirname, '../verifier/node_modules/ts-jest'),
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'ES2022',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: [
            path.resolve(__dirname, '../verifier/node_modules/@types/node'),
            path.resolve(__dirname, '../verifier/node_modules/@types/jest'),
          ],
        },
      },
    ],
  },
};
