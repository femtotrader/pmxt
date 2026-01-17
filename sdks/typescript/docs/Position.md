
# Position


## Properties

Name | Type
------------ | -------------
`marketId` | string
`outcomeId` | string
`outcomeLabel` | string
`size` | number
`entryPrice` | number
`currentPrice` | number
`unrealizedPnL` | number
`realizedPnL` | number

## Example

```typescript
import type { Position } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "marketId": null,
  "outcomeId": null,
  "outcomeLabel": null,
  "size": null,
  "entryPrice": null,
  "currentPrice": null,
  "unrealizedPnL": null,
  "realizedPnL": null,
} satisfies Position

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Position
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


