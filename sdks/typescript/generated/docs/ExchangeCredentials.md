
# ExchangeCredentials

Optional authentication credentials for exchange operations

## Properties

Name | Type
------------ | -------------
`apiKey` | string
`privateKey` | string
`apiSecret` | string
`passphrase` | string

## Example

```typescript
import type { ExchangeCredentials } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "apiKey": null,
  "privateKey": null,
  "apiSecret": null,
  "passphrase": null,
} satisfies ExchangeCredentials

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ExchangeCredentials
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


