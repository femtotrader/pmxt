
# UnifiedMarket


## Properties

Name | Type
------------ | -------------
`id` | string
`title` | string
`outcomes` | [Array&lt;MarketOutcome&gt;](MarketOutcome.md)
`volume24h` | number
`liquidity` | number
`url` | string

## Example

```typescript
import type { UnifiedMarket } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "title": null,
  "outcomes": null,
  "volume24h": null,
  "liquidity": null,
  "url": null,
} satisfies UnifiedMarket

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as UnifiedMarket
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


