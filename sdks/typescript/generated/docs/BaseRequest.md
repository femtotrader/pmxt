
# BaseRequest

Base request structure with optional credentials

## Properties

Name | Type
------------ | -------------
`credentials` | [ExchangeCredentials](ExchangeCredentials.md)

## Example

```typescript
import type { BaseRequest } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "credentials": null,
} satisfies BaseRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as BaseRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


