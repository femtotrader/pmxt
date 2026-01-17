
# FetchOpenOrders200Response


## Properties

Name | Type
------------ | -------------
`success` | boolean
`error` | [ErrorDetail](ErrorDetail.md)
`data` | [Array&lt;Order&gt;](Order.md)

## Example

```typescript
import type { FetchOpenOrders200Response } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "success": true,
  "error": null,
  "data": null,
} satisfies FetchOpenOrders200Response

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FetchOpenOrders200Response
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


