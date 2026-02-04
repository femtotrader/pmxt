
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'ts-jest',
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@polymarket|ethers|@ethersproject|axios)/)"
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};