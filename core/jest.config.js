const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.jsx?$": "ts-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@polymarket|ethers|@ethersproject)/)"
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};