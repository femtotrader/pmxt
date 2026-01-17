
# FetchOHLCVRequest


## Properties

Name | Type
------------ | -------------
`args` | [Array&lt;FetchOHLCVRequestArgsInner&gt;](FetchOHLCVRequestArgsInner.md)
`credentials` | [ExchangeCredentials](ExchangeCredentials.md)

## Example

```typescript
import type { FetchOHLCVRequest } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "args": ["0x123...",{"resolution":"1h"}],
  "credentials": null,
} satisfies FetchOHLCVRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FetchOHLCVRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


