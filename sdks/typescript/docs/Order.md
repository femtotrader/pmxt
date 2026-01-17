
# Order


## Properties

Name | Type
------------ | -------------
`id` | string
`marketId` | string
`outcomeId` | string
`side` | string
`type` | string
`price` | number
`amount` | number
`status` | string
`filled` | number
`remaining` | number
`timestamp` | number

## Example

```typescript
import type { Order } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "marketId": null,
  "outcomeId": null,
  "side": null,
  "type": null,
  "price": null,
  "amount": null,
  "status": null,
  "filled": null,
  "remaining": null,
  "timestamp": null,
} satisfies Order

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Order
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


