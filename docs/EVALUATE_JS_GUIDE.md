# evaluate_js Command Guide

## Overview

The `evaluate_js` command is one of the most powerful features of BROP, allowing you to execute arbitrary JavaScript code in the context of a web page. It uses the Chrome Debugger API to provide full JavaScript execution capabilities, including support for async operations, DOM manipulation, and complex data extraction.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Code Formats](#code-formats)
3. [Working with Arguments](#working-with-arguments)
4. [Async Operations](#async-operations)
5. [DOM Manipulation](#dom-manipulation)
6. [Data Extraction](#data-extraction)
7. [Error Handling](#error-handling)
8. [Limitations and Workarounds](#limitations-and-workarounds)
9. [Best Practices](#best-practices)
10. [Common Patterns](#common-patterns)

## Basic Usage

The simplest way to use `evaluate_js` is to pass a JavaScript expression:

```javascript
// Get the page title
const result = await client.sendCommand('evaluate_js', {
  tabId: 123,
  code: 'document.title'
});
console.log(result.result); // "Example Page"
```

## Code Formats

### 1. Simple Expressions

Any valid JavaScript expression can be evaluated:

```javascript
// Mathematical operations
'2 + 2'                              // Returns: 4
'Math.sqrt(16)'                      // Returns: 4
'new Date().getFullYear()'           // Returns: 2023

// String operations
'"hello".toUpperCase()'              // Returns: "HELLO"
'`Today is ${new Date().toDateString()}`' // Returns: "Today is Mon Jan 01 2023"
```

### 2. Property Access

Access any property or method on the page:

```javascript
'window.location.href'               // Current URL
'document.body.clientHeight'         // Body height
'navigator.userAgent'                // Browser user agent
'localStorage.length'                // Number of localStorage items
```

### 3. Multiple Statements

Use semicolons to separate statements and `return` for the final value:

```javascript
// Calculate and return
'const x = 10; const y = 20; return x + y;'

// Process and return
`const links = document.querySelectorAll('a');
 const httpLinks = Array.from(links).filter(a => a.href.startsWith('http'));
 return httpLinks.length;`
```

### 4. Object and Array Literals

Create and return complex data structures:

```javascript
// Return an object
'({ name: "test", timestamp: Date.now(), active: true })'

// Return an array
'[1, 2, 3, 4, 5].map(x => x * x)'

// Complex nested structure
`({
  pageInfo: {
    title: document.title,
    url: window.location.href
  },
  stats: {
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length
  }
})`
```

### 5. Function Definitions

Functions are automatically invoked if no arguments are provided:

```javascript
// Simple function (auto-invoked)
'function getTitle() { return document.title; }'

// Arrow function (auto-invoked)
'() => document.querySelectorAll("input[type=text]").length'

// Async function (auto-invoked)
'async function() { await new Promise(r => setTimeout(r, 100)); return "done"; }'
```

## Working with Arguments

Pass arguments to functions using the `args` parameter:

```javascript
// Simple function with arguments
await client.sendCommand('evaluate_js', {
  tabId: 123,
  code: '(a, b) => a + b',
  args: [5, 3]
});
// Returns: 8

// Function with object argument
await client.sendCommand('evaluate_js', {
  tabId: 123,
  code: '(config) => document.querySelector(config.selector).textContent',
  args: [{ selector: 'h1' }]
});

// Array processing
await client.sendCommand('evaluate_js', {
  tabId: 123,
  code: '(numbers) => numbers.reduce((sum, n) => sum + n, 0)',
  args: [[1, 2, 3, 4, 5]]
});
// Returns: 15
```

## Async Operations

Full support for promises and async/await:

```javascript
// Wait for a specific time
`async () => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return 'Waited 2 seconds';
}`

// Fetch data from API
`async () => {
  const response = await fetch('/api/users');
  const users = await response.json();
  return users.length;
}`

// Wait for element to appear
`async () => {
  let attempts = 0;
  while (!document.querySelector('.dynamic-content') && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  return document.querySelector('.dynamic-content')?.textContent || 'Not found';
}`
```

## DOM Manipulation

Modify the page content and structure:

```javascript
// Add a new element
`const div = document.createElement('div');
 div.id = 'my-banner';
 div.style.cssText = 'position: fixed; top: 0; width: 100%; background: yellow; padding: 10px; z-index: 9999;';
 div.textContent = 'This is a test banner';
 document.body.appendChild(div);
 return 'Banner added';`

// Modify existing elements
`document.querySelectorAll('a').forEach(link => {
   link.style.color = 'red';
   link.style.textDecoration = 'underline';
 });
 return 'Links styled';`

// Remove elements
`const ads = document.querySelectorAll('.advertisement');
 ads.forEach(ad => ad.remove());
 return \`Removed \${ads.length} ads\`;`

// Click buttons programmatically
`document.getElementById('submit-button').click();
 return 'Button clicked';`
```

## Data Extraction

Extract structured data from pages:

```javascript
// Extract table data
`Array.from(document.querySelectorAll('table tr')).map(row => {
   const cells = row.querySelectorAll('td');
   return {
     name: cells[0]?.textContent.trim(),
     email: cells[1]?.textContent.trim(),
     role: cells[2]?.textContent.trim()
   };
 }).filter(row => row.name);`

// Extract product information
`Array.from(document.querySelectorAll('.product-card')).map(card => ({
   title: card.querySelector('h3')?.textContent.trim(),
   price: card.querySelector('.price')?.textContent.trim(),
   image: card.querySelector('img')?.src,
   inStock: !card.querySelector('.out-of-stock'),
   link: card.querySelector('a')?.href
 }));`

// Extract form data
`const formData = {};
 document.querySelectorAll('input, select, textarea').forEach(field => {
   if (field.name) {
     formData[field.name] = field.value;
   }
 });
 return formData;`
```

## Error Handling

The command provides detailed error information:

```javascript
try {
  const result = await client.sendCommand('evaluate_js', {
    tabId: 123,
    code: 'nonExistentFunction()'
  });
} catch (error) {
  console.error('Error:', error.message);
  // "JavaScript execution failed: Uncaught ReferenceError: nonExistentFunction is not defined"
}

// Handle errors within the code
`try {
   const data = JSON.parse(document.getElementById('data').textContent);
   return data;
 } catch (e) {
   return { error: 'Failed to parse data', message: e.message };
 }`
```

## Limitations and Workarounds

### 1. file:// URLs

Some operations fail with local files due to Chrome security:

```javascript
// This might fail on file:// URLs
'window'  // Error: "Object reference chain is too long"

// Workaround: Return specific properties
'({ href: window.location.href, title: document.title })'
```

### 2. Circular References

Objects with circular references can't be serialized:

```javascript
// This will fail
'document'  // Has circular references when returnByValue is true

// Solution 1: Use returnByValue: false
await client.sendCommand('evaluate_js', {
  tabId: 123,
  code: 'document',
  returnByValue: false
});

// Solution 2: Extract needed properties
'({ title: document.title, url: document.URL, readyState: document.readyState })'
```

### 3. Large Data Sets

Very large results might fail to serialize:

```javascript
// Instead of returning all HTML
'document.body.innerHTML'  // Might be too large

// Return processed/filtered data
`document.body.innerText.substring(0, 1000) + '...'`
```

## Best Practices

### 1. Always Check Element Existence

```javascript
// Bad: Might throw if element doesn't exist
'document.getElementById("submit").click()'

// Good: Check existence first
`const btn = document.getElementById("submit");
 if (btn) {
   btn.click();
   return "Clicked";
 } else {
   return "Button not found";
 }`
```

### 2. Use Descriptive Variable Names

```javascript
// Bad: Hard to understand
'Array.from(document.querySelectorAll("a")).map(e=>e.href)'

// Good: Clear and maintainable
`const allLinks = document.querySelectorAll('a');
 const hrefs = Array.from(allLinks).map(link => link.href);
 return hrefs;`
```

### 3. Handle Async Operations Properly

```javascript
// Bad: Might not wait for dynamic content
'document.querySelector(".dynamic")?.textContent'

// Good: Wait for content to load
`async () => {
   // Wait up to 5 seconds for element
   const maxWait = 5000;
   const start = Date.now();
   
   while (Date.now() - start < maxWait) {
     const element = document.querySelector('.dynamic');
     if (element) return element.textContent;
     await new Promise(r => setTimeout(r, 100));
   }
   
   return null; // Element not found
 }`
```

### 4. Return Meaningful Data

```javascript
// Bad: Returns undefined if not found
'document.querySelector(".price")?.textContent'

// Good: Provides context
`const priceElement = document.querySelector('.price');
 return {
   found: !!priceElement,
   price: priceElement?.textContent || 'N/A',
   currency: priceElement?.getAttribute('data-currency') || 'USD'
 };`
```

## Common Patterns

### Wait and Retry Pattern

```javascript
`async (selector, maxAttempts = 30) => {
   for (let i = 0; i < maxAttempts; i++) {
     const element = document.querySelector(selector);
     if (element) return { found: true, attempt: i + 1, text: element.textContent };
     await new Promise(r => setTimeout(r, 100));
   }
   return { found: false, attempts: maxAttempts };
 }`
```

### Form Filling Pattern

```javascript
`(formData) => {
   const results = [];
   for (const [name, value] of Object.entries(formData)) {
     const field = document.querySelector(\`[name="\${name}"]\`);
     if (field) {
       field.value = value;
       field.dispatchEvent(new Event('input', { bubbles: true }));
       field.dispatchEvent(new Event('change', { bubbles: true }));
       results.push({ field: name, success: true });
     } else {
       results.push({ field: name, success: false, error: 'Field not found' });
     }
   }
   return results;
 }`
```

### Scroll and Load Pattern

```javascript
`async () => {
   const initialCount = document.querySelectorAll('.item').length;
   
   // Scroll to bottom
   window.scrollTo(0, document.body.scrollHeight);
   
   // Wait for new content
   await new Promise(r => setTimeout(r, 1000));
   
   const finalCount = document.querySelectorAll('.item').length;
   return {
     initialCount,
     finalCount,
     newItems: finalCount - initialCount
   };
 }`
```

### Extract and Transform Pattern

```javascript
`const rawData = Array.from(document.querySelectorAll('.data-row')).map(row => ({
   raw: row.textContent,
   processed: row.textContent.trim().toLowerCase(),
   hasLink: !!row.querySelector('a'),
   className: row.className
 }));
 
 return {
   total: rawData.length,
   withLinks: rawData.filter(d => d.hasLink).length,
   unique: [...new Set(rawData.map(d => d.processed))].length,
   data: rawData.slice(0, 10) // Return first 10 for preview
 };`
```

## Debugging Tips

1. **Use console.log in development** (but remove for production):
```javascript
`console.log('Starting extraction...');
 const data = document.querySelector('.data');
 console.log('Found:', data);
 return data?.textContent;`
```

2. **Return debug information**:
```javascript
`const startTime = performance.now();
 const elements = document.querySelectorAll('.item');
 const processed = Array.from(elements).map(e => e.textContent);
 
 return {
   executionTime: performance.now() - startTime,
   elementCount: elements.length,
   processedCount: processed.length,
   data: processed
 };`
```

3. **Check for common issues**:
```javascript
`return {
   hasJQuery: typeof jQuery !== 'undefined',
   documentReady: document.readyState,
   bodyExists: !!document.body,
   customDataAttribute: document.body?.hasAttribute('data-loaded')
 };`
```

## Performance Considerations

1. **Minimize DOM queries**:
```javascript
// Inefficient: Multiple queries
`const titles = [];
 for (let i = 0; i < document.querySelectorAll('.item').length; i++) {
   titles.push(document.querySelectorAll('.item')[i].querySelector('h3').textContent);
 }`

// Efficient: Single query
`Array.from(document.querySelectorAll('.item h3')).map(h3 => h3.textContent)`
```

2. **Use efficient selectors**:
```javascript
// Slower: Complex selector
'document.querySelectorAll("div > ul > li > a.link")'

// Faster: ID or class
'document.querySelectorAll(".link")'
```

3. **Limit data size**:
```javascript
// Return only what you need
`const allData = Array.from(document.querySelectorAll('.item')).map(item => ({
   id: item.dataset.id,
   title: item.querySelector('h3')?.textContent.trim()
   // Don't include unnecessary properties
 }));
 
 return {
   count: allData.length,
   sample: allData.slice(0, 10),
   hasMore: allData.length > 10
 };`
```

## Security Considerations

1. **Never execute untrusted code**
2. **Sanitize any user input** before including in code
3. **Be careful with sensitive data** - don't log passwords or tokens
4. **Respect robots.txt** and website terms of service
5. **Use read-only operations** when possible

## Conclusion

The `evaluate_js` command is a powerful tool for browser automation, web scraping, and testing. By understanding its capabilities and limitations, you can build robust automation scripts that handle complex web interactions with ease.

Remember to always test your code with the actual websites you're targeting, as page structures and behaviors can vary significantly. Start with simple expressions and gradually build up to more complex operations as you become familiar with the command's behavior.