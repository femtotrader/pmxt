const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const {
  removeGeneratedApiDocExamples,
  removeGeneratedModelDocExamples,
  removeGeneratedReadmeUsageExample,
  stripGeneratedApiDocExamples,
  stripGeneratedModelDocExample,
  stripGeneratedReadmeUsageExample,
} = require(path.join(repoRoot, 'sdks/typescript/scripts/fix-generated.js'));

const modelDocWithPlaceholder = `# UnifiedMarket

## Properties

Name | Type
------------ | -------------
\`marketId\` | string

## Example

\`\`\`typescript
import type { UnifiedMarket } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "marketId": null,
} satisfies UnifiedMarket
\`\`\`

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
`;

const apiDocWithExample = `# DataFeedsApi

## feedList

### Example

\`\`\`ts
const body = {
  feed: feed_example,
} satisfies FeedListRequest;
\`\`\`

### Parameters

This endpoint does not need any parameter.
`;

const readmeWithUsageExample = `# pmxtjs@2.17.1

## Usage

First, install the SDK from npm.

\`\`\`bash
npm install pmxtjs --save
\`\`\`

Next, try it out.


\`\`\`ts
const body = {
  feed: feed_example,
  symbol: symbol_example,
} satisfies FeedFetchHistoricalPricesRequest;
\`\`\`

## Documentation

### API Endpoints
`;

describe('TypeScript generated model docs', () => {
  test('strips placeholder model example blocks', () => {
    const fixed = stripGeneratedModelDocExample(modelDocWithPlaceholder);

    expect(fixed).toContain('## Properties');
    expect(fixed).toContain('`marketId` | string');
    expect(fixed).not.toContain('TODO: Update the object below with actual values');
    expect(fixed).not.toMatch(/## Example[\s\S]*?\bsatisfies\s+[A-Za-z0-9_]+/);
  });

  test('removes model examples without touching API endpoint docs', () => {
    const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmxt-typescript-generated-docs-'));

    try {
      const modelPath = path.join(docsDir, 'UnifiedMarket.md');
      const apiPath = path.join(docsDir, 'DataFeedsApi.md');
      fs.writeFileSync(modelPath, modelDocWithPlaceholder, 'utf8');
      fs.writeFileSync(apiPath, apiDocWithExample, 'utf8');

      expect(removeGeneratedModelDocExamples(docsDir)).toBe(1);

      expect(fs.readFileSync(modelPath, 'utf8')).not.toContain(
        'TODO: Update the object below with actual values'
      );
      expect(fs.readFileSync(apiPath, 'utf8')).toBe(apiDocWithExample);
    } finally {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
  });

  test('strips generated API endpoint examples with placeholder variables', () => {
    const fixed = stripGeneratedApiDocExamples(apiDocWithExample);

    expect(fixed).toContain('## feedList');
    expect(fixed).toContain('### Parameters');
    expect(fixed).not.toContain('feed_example');
    expect(fixed).not.toMatch(/### Example[\s\S]*?\bsatisfies\s+[A-Za-z0-9_]+/);
  });

  test('removes API endpoint examples without touching model docs', () => {
    const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmxt-typescript-generated-docs-'));

    try {
      const modelPath = path.join(docsDir, 'UnifiedMarket.md');
      const apiPath = path.join(docsDir, 'DataFeedsApi.md');
      fs.writeFileSync(modelPath, modelDocWithPlaceholder, 'utf8');
      fs.writeFileSync(apiPath, apiDocWithExample, 'utf8');

      expect(removeGeneratedApiDocExamples(docsDir)).toBe(1);

      expect(fs.readFileSync(apiPath, 'utf8')).not.toContain('feed_example');
      expect(fs.readFileSync(modelPath, 'utf8')).toBe(modelDocWithPlaceholder);
    } finally {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
  });

  test('strips generated README usage example placeholders', () => {
    const fixed = stripGeneratedReadmeUsageExample(readmeWithUsageExample);

    expect(fixed).toContain('npm install pmxtjs --save');
    expect(fixed).toContain('## Documentation');
    expect(fixed).not.toContain('Next, try it out.');
    expect(fixed).not.toContain('feed_example');
  });

  test('removes generated README usage example from a docs directory', () => {
    const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmxt-typescript-generated-readme-'));

    try {
      const readmePath = path.join(docsRoot, 'README.md');
      fs.writeFileSync(readmePath, readmeWithUsageExample, 'utf8');

      expect(removeGeneratedReadmeUsageExample(docsRoot)).toBe(1);
      expect(fs.readFileSync(readmePath, 'utf8')).not.toContain('feed_example');
    } finally {
      fs.rmSync(docsRoot, { recursive: true, force: true });
    }
  });
});
