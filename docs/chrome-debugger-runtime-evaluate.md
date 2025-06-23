# Chrome Debugger API Runtime.evaluate Response Structure

## Overview

The Chrome Debugger API's `Runtime.evaluate` command evaluates JavaScript expressions and returns results in a specific format. This document describes the correct way to extract values from the response object.

## Response Structure

When you call `chrome.debugger.sendCommand` with `Runtime.evaluate`, the response has this structure:

```javascript
{
  result: {
    type: "string|number|boolean|object|undefined|function|symbol|bigint",
    value: <primitive_value>, // Only present for primitive types
    objectId: "...",          // Only present for objects
    className: "...",         // Only present for objects
    description: "...",       // String representation
    subtype: "array|null|node|regexp|date|map|set|weakmap|weakset|..."
  },
  exceptionDetails: {        // Only present if an error occurred
    text: "...",
    exception: {...},
    stackTrace: {...}
  }
}
```

## Extracting Values

### For Primitive Types (string, number, boolean, undefined, null)

```javascript
const response = await chrome.debugger.sendCommand(
  { tabId },
  "Runtime.evaluate",
  {
    expression: "document.title",
    returnByValue: true
  }
);

// Access the value directly
const value = response.result.value;
```

### For Objects

When `returnByValue` is false (default for objects):

```javascript
const response = await chrome.debugger.sendCommand(
  { tabId },
  "Runtime.evaluate",
  {
    expression: "document",
    returnByValue: false
  }
);

// Object reference information
const objectId = response.result.objectId;
const className = response.result.className;
const description = response.result.description;
```

### Error Handling

Always check for `exceptionDetails`:

```javascript
if (response.exceptionDetails) {
  throw new Error(response.exceptionDetails.text || 'Execution failed');
}
```

## Complete Example

```javascript
async function evaluateJS(tabId, expression, returnByValue = true) {
  try {
    // Attach debugger if needed
    await chrome.debugger.attach({ tabId }, "1.3");
    
    // Evaluate the expression
    const response = await chrome.debugger.sendCommand(
      { tabId },
      "Runtime.evaluate",
      {
        expression,
        returnByValue,
        awaitPromise: true,
        allowUnsafeEvalBlockedByCSP: true
      }
    );
    
    // Detach debugger
    await chrome.debugger.detach({ tabId });
    
    // Check for errors
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Execution failed');
    }
    
    // Extract the result
    const result = {
      success: true,
      type: response.result.type,
      subtype: response.result.subtype
    };
    
    // For primitive types, use value
    if (response.result.value !== undefined) {
      result.value = response.result.value;
    } else {
      // For objects, provide description
      result.value = response.result.description;
      result.objectId = response.result.objectId;
      result.className = response.result.className;
    }
    
    return result;
  } catch (error) {
    // Always detach debugger on error
    try {
      await chrome.debugger.detach({ tabId });
    } catch (detachError) {
      // Ignore detach errors
    }
    throw error;
  }
}
```

## Important Parameters

### returnByValue
- `true`: Returns the actual value (for serializable objects)
- `false`: Returns a reference (objectId) for complex objects

### awaitPromise
- `true`: Waits for Promise resolution
- `false`: Returns Promise object immediately

### allowUnsafeEvalBlockedByCSP
- `true`: Allows evaluation even if CSP blocks eval
- `false`: Respects CSP restrictions

## Type Information

Common `type` values:
- `"string"`, `"number"`, `"boolean"` - Primitive types
- `"object"` - Objects, arrays, null
- `"undefined"` - Undefined values
- `"function"` - Functions
- `"symbol"` - Symbols
- `"bigint"` - BigInt values

Common `subtype` values (when type is "object"):
- `"array"` - Arrays
- `"null"` - Null values
- `"node"` - DOM nodes
- `"regexp"` - Regular expressions
- `"date"` - Date objects
- `"map"`, `"set"` - Map/Set collections
- `"promise"` - Promise objects
- `"error"` - Error objects

## Best Practices

1. Always check for `exceptionDetails` before accessing `result`
2. Use `returnByValue: true` for primitive values and simple objects
3. Use `returnByValue: false` for DOM nodes and complex objects
4. Always detach the debugger in a try-finally block
5. Handle both `value` and `description` fields appropriately
6. Consider the `type` field when processing results

## Reference Implementation

The current implementation in `brop_server.js`:

```javascript
return {
  success: true,
  result: response.result.value !== undefined 
    ? response.result.value 
    : response.result.description,
  type: response.result.type,
  isPromise: response.result.subtype === 'promise',
  isSerializable: returnByValue
};
```

This correctly handles both primitive values (using `value`) and object references (using `description`) based on what's available in the response.