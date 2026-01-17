
# PriceCandle


## Properties

Name | Type
------------ | -------------
`timestamp` | number
`open` | number
`high` | number
`low` | number
`close` | number
`volume` | number

## Example

```typescript
import type { PriceCandle } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "timestamp": null,
  "open": null,
  "high": null,
  "low": null,
  "close": null,
  "volume": null,
} satisfies PriceCandle

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PriceCandle
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


