# BROP Markdown Format Guide with CSS Selectors

This guide explains how the BROP extension formats web pages into markdown with embedded CSS selectors, enabling AI agents to reference and interact with specific DOM elements.

## Overview

When using the `get_simplified_dom` command with `includeSelectors: true`, the BROP extension converts web pages to markdown and embeds CSS selectors in HTML comments. This allows AI agents to:
- Read human-friendly markdown content
- Identify actionable elements with precise CSS selectors
- Automate browser interactions using these selectors

## Format Patterns

### 1. Links

Links maintain standard markdown format with CSS selectors appended in comments:

```markdown
[Link Text](https://example.com)<!--#element-id-->
[Another Link](https://site.com)<!--.link-class-->
[ARIA Link](https://url.com)<!--[aria-label="Description"]-->
```

### 2. Input Fields

Input elements show their type and placeholder/value content:

```markdown
[text: Username]<!--#username-field-->
[email: Enter your email]<!--[name="email"]-->
[password: Password]<!--[aria-label="User Password"]-->
[text: Search...]<!--#search-input-->
```

**Format**: `[type: content]<!--selector-->`
- `type`: The input type (text, email, password, number, tel, etc.)
- `content`: Value, placeholder text, or "input" as fallback
- `selector`: The CSS selector to target this element

### 3. Textareas

Textareas follow the same pattern as inputs:

```markdown
[textarea: Enter your comments]<!--#comments-box-->
[textarea: Description]<!--[name="description"]-->
```

### 4. Select Dropdowns

Select elements show their type and concatenated options:

```markdown
[select-one: Choose Country USA Canada UK]<!--[name="country"]-->
[select-one: Small Medium Large]<!--#size-selector-->
```

### 5. Buttons

Buttons show their text content with selectors:

```markdown
[Submit]<!--#submit-button-->
[Sign In]<!--.btn-primary-->
[Continue]<!--[aria-label="Continue to next step"]-->
[Cancel]<!--[data-testid="cancel-btn"]-->
[Save Changes]<!--button:contains("Save Changes")-->
```

**Format**: `[button text]<!--selector-->`

### 6. Labels

Label elements appear as plain text with selectors:

```markdown
Username Label<!--label:contains("Username Label")-->
Email<!--[for="email-input"]-->
```

### 7. Other Interactive Elements

Elements with interactive properties (onclick, role, tabindex, etc.):

```markdown
[Click here]<!--div:contains("Click here")-->
[Menu Item]<!--[role="menuitem"]-->
[Tab Panel]<!--[tabindex="0"]-->
Clickable Text<!--span:contains("Clickable Text")-->
```

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
## Sign In

Please enter your credentials to continue.

[text: Email or username]<!--#login-email-->
[password: Password]<!--#login-password-->

[Remember me]<!--[name="remember"]-->

[Sign In]<!--#signin-button-->
[Forgot Password?](https://example.com/reset)<!--.forgot-password-link-->
```

### Navigation Menu Example

```markdown
## Navigation

[Home](/)<!--#nav-home-->
[Products](/products)<!--[aria-label="Browse products"]-->
[About](/about)<!--.nav-link-->
[Contact](/contact)<!--[data-testid="contact-link"]-->
[Search]<!--button:contains("Search")-->
```

### Complex Form Example

```markdown
## User Registration

Create your account<!--.form-title-->

First Name<!--label:contains("First Name")-->
[text: Enter first name]<!--[name="firstName"]-->

Last Name<!--label:contains("Last Name")-->
[text: Enter last name]<!--[name="lastName"]-->

Email<!--[for="email"]-->
[email: your@email.com]<!--#email-->

Country<!--label:contains("Country")-->
[select-one: Select Country USA Canada UK Australia]<!--#country-select-->

[textarea: Tell us about yourself]<!--[name="bio"]-->

[I agree to the terms]<!--#terms-checkbox-->
[Create Account]<!--.submit-button-->
```

## Using Selectors for Automation

AI agents can extract and use these selectors for browser automation:

1. **Extract selector from markdown**:
   ```
   Find: [Sign In]<!--#signin-button-->
   Extract: #signin-button
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