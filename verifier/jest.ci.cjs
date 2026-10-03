// CI gate: at least 70% line coverage on the files a pull request changes (decision: changed files,
// not global, so the floor does not punish the first contributor and is not permanently gamed).
module.exports = {
  ...require('./jest.config.cjs'),
  collectCoverage: true,
  coverageThreshold: { global: { lines: 70 } },
};
