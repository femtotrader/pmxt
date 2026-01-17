
# Balance


## Properties

Name | Type
------------ | -------------
`currency` | string
`total` | number
`available` | number
`locked` | number

## Example

```typescript
import type { Balance } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "currency": null,
  "total": null,
  "available": null,
  "locked": null,
} satisfies Balance

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Balance
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


