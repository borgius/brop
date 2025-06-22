# BROP Markdown Format Guide with CSS Selectors

This guide explains how the BROP extension formats web pages into markdown with embedded CSS selectors, enabling AI agents to reference and interact with specific DOM elements.

## Overview

When using the `get_simplified_dom` command with `includeSelectors: true`, the BROP extension converts web pages to markdown and embeds CSS selectors in HTML comments. This allows AI agents to:
- Read human-friendly markdown content
- Identify actionable elements with precise CSS selectors
- Understand element types and form structure
- Automate browser interactions using these selectors

## Quick Reference

### Format Syntax
```
Element annotation: <!--elementType:selector-->
Form boundaries:    <!-- form-start: formSelector --> ... <!-- form-end -->
```

### Common Patterns
```markdown
[Sign In]<!--button:#login-btn-->                     # Button
[text: Email]<!--text:[name="email"]-->               # Text input
[password: Password]<!--password:#pass-->             # Password input
[Remember me]<!--checkbox:[name="remember"]-->        # Checkbox
[Male]<!--radio:[name="gender"][value="m"]-->         # Radio button
[select-one: USA, UK...]<!--select-one:#country-->    # Dropdown
[textarea: Message]<!--textarea:#msg-->               # Textarea
[Home](/)<!--link:#home-link-->                       # Link
```

## Key Format Rules

1. **Element Type and Selector Format**: `<!--elementType:selector-->`
   - Always includes the element type before the colon
   - Example: `<!--button:#submit-->`, `<!--text:[name="email"]-->`

2. **Form Boundaries**: Forms are wrapped with start/end markers
   - Start: `<!-- form-start: formSelector -->`
   - End: `<!-- form-end -->`
   - All form elements appear between these markers

3. **Element Display Format**: Varies by element type
   - Links: `[text](url)<!--link:selector-->`
   - Inputs: `[type: placeholder/value]<!--type:selector-->`
   - Buttons: `[text]<!--button:selector-->`
   - Checkboxes/Radios: `[label]<!--type:selector-->`
   - Selects: `[select-one: option1, option2...]<!--select-one:selector-->`

## Detailed Format Patterns

### 1. Links

Links maintain standard markdown format with element type and CSS selectors:

```markdown
[Link Text](https://example.com)<!--link:#element-id-->
[Another Link](https://site.com)<!--link:.link-class-->
[ARIA Link](https://url.com)<!--link:[aria-label="Description"]-->
```

### 2. Input Fields

Input elements show their type and placeholder/value content with element type in selector:

```markdown
[text: Username]<!--text:#username-field-->
[email: Enter your email]<!--email:[name="email"]-->
[password: Password]<!--password:[aria-label="User Password"]-->
[text: Search...]<!--text:#search-input-->
[Remember me]<!--checkbox:[name="remember"]-->
[Male]<!--radio:[name="gender"][value="male"]-->
```

**Format**: `[type: content]<!--elementType:selector-->`
- `type`: The displayed input type (text, email, password, etc.)
- `content`: Value, placeholder text, or label for checkboxes/radios
- `elementType`: The actual element type in the selector
- `selector`: The CSS selector to target this element

### 3. Textareas

Textareas follow the same pattern as inputs:

```markdown
[textarea: Enter your comments]<!--textarea:#comments-box-->
[textarea: Description]<!--textarea:[name="description"]-->
```

### 4. Select Dropdowns

Select elements show their options:

```markdown
[select-one: USA, Canada, UK]<!--select-one:[name="country"]-->
[select-multiple: Red, Blue, Green...]<!--select-multiple:#color-picker-->
```

### 5. Buttons

Buttons and clickable elements:

```markdown
[Submit]<!--button:#submit-btn-->
[Click Here]<!--button:.action-button-->
[Close]<!--clickable:[aria-label="Close dialog"]-->
```

### 6. Forms

Form elements are grouped with form boundaries:

```markdown
<!-- form-start: #login-form -->
## Login Form

[text: Username]<!--text:#username-->
[password: Password]<!--password:#password-->
[Remember me]<!--checkbox:[name="remember"]-->

[Sign In]<!--button:#signin-btn-->
<!-- form-end -->

<!-- form-start: .contact-form -->
## Contact Us

[text: Name]<!--text:[name="name"]-->
[email: Email]<!--email:[name="email"]-->
[select-one: General, Support, Sales]<!--select-one:[name="topic"]-->
[textarea: Your message]<!--textarea:#message-->

[Submit]<!--button:.submit-button-->
<!-- form-end -->
```

## Element Type Reference

The element type prefix in selectors helps identify the DOM element:

- `link` - `<a>` anchor elements
- `button` - `<button>` elements
- `text`, `email`, `password`, etc. - `<input>` types
- `checkbox` - `<input type="checkbox">`
- `radio` - `<input type="radio">`
- `textarea` - `<textarea>` elements
- `select-one` - `<select>` single selection
- `select-multiple` - `<select multiple>` multi-selection
- `label` - `<label>` elements
- `clickable` - Elements with onclick or role attributes
- Other HTML tag names for remaining elements


## CSS Selector Priority

The system uses a priority order to generate the most reliable selector:

1. **ID** (`#element-id`) - Most specific and reliable
2. **aria-label** (`[aria-label="Description"]`) - Accessibility-friendly
3. **data-testid** (`[data-testid="element-test-id"]`) - Test-friendly
4. **name** (`[name="field-name"]`) - Common for form elements
5. **Class** (`.primary-class`) - First meaningful class (filters out CSS modules)
6. **Text content** (`element:contains("text")`) - Based on visible text
7. **nth-child** (`element:nth-child(n)`) - Position-based (last resort)

## Examples in Context

### Login Form Example

```markdown
<!-- form-start: #login-form -->
## Sign In

Please enter your credentials to continue.

[text: Email or username]<!--text:#login-email-->
[password: Password]<!--password:#login-password-->

[Remember me]<!--checkbox:[name="remember"]-->

[Sign In]<!--button:#signin-button-->
[Forgot Password?](https://example.com/reset)<!--link:.forgot-password-link-->
<!-- form-end -->
```

### Navigation Menu Example

```markdown
## Navigation

[Home](/)<!--link:#nav-home-->
[Products](/products)<!--link:[aria-label="Browse products"]-->
[About](/about)<!--link:.nav-link-->
[Contact](/contact)<!--link:[data-testid="contact-link"]-->
[Search]<!--button:button:contains("Search")-->
```

### Complex Form Example

```markdown
<!-- form-start: #registration-form -->
## User Registration

Create your account

[text: Enter first name]<!--text:[name="firstName"]-->
[text: Enter last name]<!--text:[name="lastName"]-->
[email: your@email.com]<!--email:#email-->

[select-one: USA, Canada, UK, Australia]<!--select-one:#country-select-->

[textarea: Tell us about yourself]<!--textarea:[name="bio"]-->

[I agree to the terms]<!--checkbox:#terms-checkbox-->
[Create Account]<!--button:.submit-button-->
<!-- form-end -->
```

## Comprehensive Format Rules

### Element Annotation Rules

1. **Every actionable element gets a comment** with format `<!--elementType:selector-->`
2. **Element type always comes first**, followed by colon, then the CSS selector
3. **No spaces** in the comment between element type, colon, and selector
4. **Element types are lowercase** (e.g., `button`, not `Button`)

### Form Boundary Rules

1. **Form start markers** include the form's CSS selector: `<!-- form-start: #formId -->`
2. **Form end markers** are simply: `<!-- form-end -->`
3. **All form elements** must appear between these boundaries
4. **Nested forms** are not supported (follows HTML standards)
5. **Form selector** in the start marker helps target specific forms

### Content Display Rules

1. **Input fields** show their type explicitly: `[text: placeholder]`, `[email: value]`
2. **Checkboxes/Radios** show their label text without type prefix: `[Remember me]`
3. **Select elements** show their type and first few options: `[select-one: USA, Canada, UK...]`
4. **Buttons** show just their text: `[Submit]`
5. **Links** use standard markdown: `[text](url)`

### Selector Priority Rules

When multiple selector options exist, the system chooses in this order:
1. ID selector (most specific)
2. ARIA label attribute
3. data-testid attribute
4. name attribute (for form elements)
5. First meaningful class
6. Text content selector
7. Position-based selector (last resort)

## Using Selectors for Automation

AI agents can extract and use these selectors for browser automation:

1. **Parse the element annotation**:
   ```
   Find: [Sign In]<!--button:#signin-button-->
   Extract: 
   - Element type: button
   - Selector: #signin-button
   ```

2. **Identify form boundaries**:
   ```
   Find: <!-- form-start: #login-form -->
   Extract:
   - Form selector: #login-form
   - All elements until <!-- form-end --> belong to this form
   ```

2. **Use with automation commands**:
   ```json
   {
     "method": "click",
     "params": {
       "selector": "#signin-button"
     }
   }
   ```

3. **Fill form fields**:
   ```json
   {
     "method": "type",
     "params": {
       "selector": "#login-email",
       "text": "user@example.com"
     }
   }
   ```

## Benefits for AI Agents

1. **Human-readable context**: The markdown provides semantic understanding
2. **Precise element targeting**: CSS selectors enable accurate automation
3. **Fallback options**: Multiple selector strategies ensure reliability
4. **Accessibility focus**: Prioritizes ARIA labels and semantic selectors
5. **Test-friendly**: Supports data-testid attributes

## Implementation Notes

- Selectors are only added when `includeSelectors: true`
- HTML comments keep selectors invisible in rendered markdown
- The system identifies actionable elements automatically
- Selectors are generated at extraction time, reflecting current DOM state

## Supported Element Types

The following elements receive CSS selectors:
- `<a>` - Links
- `<button>` - Buttons
- `<input>` - All input types
- `<textarea>` - Text areas
- `<select>` - Dropdowns
- `<label>` - Form labels
- Elements with `onclick` handlers
- Elements with `role` attributes
- Elements with `tabindex`
- Elements with `cursor: pointer` style

This format enables AI agents to understand page structure while maintaining the ability to interact with specific elements programmatically.

## Using Selectors with Form Filling

The CSS selectors extracted by `get_simplified_dom` can be used with the `fill_form` command to automate form interactions. Here's how they work together:

### 1. Extract Form Structure

First, use `get_simplified_dom` to understand the form:

```javascript
// Request
{
  "method": "get_simplified_dom",
  "params": {
    "tabId": 123,
    "includeSelectors": true
  }
}

// Returns markdown with form elements:
// <!-- form-start: #user-form -->
// [text: Email]<!--text:[name="email"]-->
// [password: Password]<!--password:#password-field-->
// [select-one: USA, Canada, UK]<!--select-one:[name="country"]-->
// [Submit]<!--button:.submit-button-->
// <!-- form-end -->
```

### 2. Fill Form Using Field Identifiers

The `fill_form` command uses the same identifiers shown in the selectors:

```javascript
{
  "method": "fill_form",
  "params": {
    "tabId": 123,
    "formData": {
      "email": "user@example.com",      // Matches [name="email"]
      "password-field": "secure123",    // Matches #password-field
      "country": "Canada"               // Matches [name="country"]
    },
    "submit": true
  }
}
```

### 3. Field Matching Strategies

The `fill_form` command locates fields in this order:
1. **Name attribute**: `[name="fieldname"]` → use `"fieldname": "value"`
2. **ID attribute**: `#field-id` → use `"field-id": "value"`
3. **Data-testid**: `[data-testid="field"]` → use `"field": "value"`
4. **Placeholder text**: Fields with matching placeholder
5. **Label text**: Fields associated with matching labels

### 4. Example Workflow

```javascript
// Step 1: Get page structure
const dom = await sendCommand('get_simplified_dom', { tabId, includeSelectors: true });

// Markdown shows:
// <!-- form-start: #login-form -->
// ## Login Form
// [text: Username]<!--text:#username-->
// [password: Password]<!--password:[name="pass"]-->
// [Remember me]<!--checkbox:[name="remember"]-->
// [Submit]<!--button:#login-btn-->
// <!-- form-end -->

// Step 2: Fill and submit form
const result = await sendCommand('fill_form', {
  tabId,
  formData: {
    "username": "john.doe",      // Matches #username
    "pass": "secret123",         // Matches [name="pass"]
    "remember": true             // Matches [name="remember"]
  },
  submit: true
});
```

### 5. Tips for AI Agents

- Extract the identifier from CSS selectors by removing special characters:
  - `#username` → use key `"username"`
  - `[name="email"]` → use key `"email"`
  - `[data-testid="submit-btn"]` → use key `"submit-btn"`
- For select elements, use the option text or value shown in markdown
- Boolean values work for checkboxes: `true`, `false`, `"on"`, `"off"`
- The `fill_form` command provides detailed feedback about which fields were filled

This integration allows AI agents to understand page structure through markdown while maintaining precise control over form automation.

### 6. Working with Multiple Forms

When a page has multiple forms, use the form selector from the form boundaries:

```javascript
// Markdown shows multiple forms:
// <!-- form-start: #search-form -->
// [text: Search]<!--text:#search-input-->
// [Search]<!--button:#search-btn-->
// <!-- form-end -->
//
// <!-- form-start: .login-form -->
// [text: Username]<!--text:[name="user"]-->
// [password: Password]<!--password:[name="pass"]-->
// [Login]<!--button:#login-->
// <!-- form-end -->

// Target specific form:
const result = await sendCommand('fill_form', {
  tabId,
  formData: {
    "user": "john",
    "pass": "secret"
  },
  formSelector: ".login-form"  // Only fill fields in this form
});
```

The form boundaries help AI agents:
- Understand which fields belong together
- Target specific forms on complex pages
- Avoid filling unrelated fields
- Identify form submission buttons