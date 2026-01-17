
# Trade


## Properties

Name | Type
------------ | -------------
`id` | string
`price` | number
`amount` | number
`side` | string
`timestamp` | number

## Example

```typescript
import type { Trade } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "price": null,
  "amount": null,
  "side": null,
  "timestamp": null,
} satisfies Trade

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Trade
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


