# DOM-First Browser Automation Example

## Key Principle: Always Get Simplified DOM First

The simplified DOM returns markdown format with CSS selectors for every interactive element. This ensures accurate element selection without guessing.

## Example: LinkedIn Automation Flow

### Step 1: Navigate and Get DOM
```typescript
// Navigate to LinkedIn
await bropTools.navigate_to_url({ url: "https://www.linkedin.com" });

// ALWAYS get DOM first
const domResult = await bropTools.get_simplified_dom();
console.log(domResult);
```

### Example DOM Output:
```markdown
# LinkedIn | Professional Networking

## Navigation
- [Home](css:a.nav-item__link[href="/feed/"])
- [My Network](css:a.nav-item__link[href="/mynetwork/"])
- [Jobs](css:a.nav-item__link[href="/jobs/"])
- [Sign In](css:a.sign-in-form__sign-in-btn)

## Main Content
### Sign In Form
- Input: [Email or Phone](css:input#session_key) - Current value: ""
- Input: [Password](css:input#session_password) - Current value: ""
- Button: [Sign in](css:button.sign-in-form__submit-btn)
- Link: [Forgot password?](css:a.sign-in-form__forgot-password)

## Footer
- [Join now](css:a.join-now)
```

### Step 2: Use Selectors from DOM
```typescript
// Now we know exact selectors from the DOM
// To sign in:
await bropTools.type_text({
  selector: "input#session_key",  // From DOM
  text: "user@email.com"
});

await bropTools.type_text({
  selector: "input#session_password",  // From DOM
  text: "password"
});

await bropTools.click_element({
  selector: "button.sign-in-form__submit-btn"  // From DOM
});
```

### Step 3: After Navigation, Get Fresh DOM
```typescript
// After signing in, page changed - get new DOM
const feedDom = await bropTools.get_simplified_dom();
```

### Example Feed DOM:
```markdown
# LinkedIn Feed

## Navigation
- [Home](css:a.nav-item__link.active) 
- Profile: [John Doe](css:button#ember25) 
- [Notifications](css:a.nav-item__link[href="/notifications/"])

## Search
- Input: [Search](css:input.search-global-typeahead__input) - Current value: ""
- Button: [Search](css:button.search-global-typeahead__button)

## Feed Posts
### Post 1
- Author: [Jane Smith](css:.feed-shared-update-v2:nth-child(1) .update-components-actor__name)
- Profile Link: [View Profile](css:.feed-shared-update-v2:nth-child(1) a.app-aware-link)
- Content: "Excited about AI developments..."
- Actions:
  - [Like](css:.feed-shared-update-v2:nth-child(1) button[aria-label*="Like"])
  - [Comment](css:.feed-shared-update-v2:nth-child(1) button[aria-label*="Comment"])
  - [Follow Jane](css:.feed-shared-update-v2:nth-child(1) button.follow)

### Post 2
- Author: [AI Influencer](css:.feed-shared-update-v2:nth-child(2) .update-components-actor__name)
- Profile Link: [View Profile](css:.feed-shared-update-v2:nth-child(2) a.app-aware-link)
```

### Step 4: Extract Data from DOM
```typescript
// Parse the DOM markdown to extract author data
const authors = [];
const domText = feedDom.content;

// Extract authors using regex on the markdown
const authorMatches = domText.matchAll(/Author: \[(.*?)\]\(css:(.*?)\)/g);
for (const match of authorMatches) {
  authors.push({
    name: match[1],
    selector: match[2]
  });
}

// Extract profile links
const profileMatches = domText.matchAll(/Profile Link: \[View Profile\]\(css:(.*?)\)/g);
```

### Step 5: Interact with Specific Elements
```typescript
// To follow the first author
const followSelector = ".feed-shared-update-v2:nth-child(1) button.follow";
await bropTools.click_element({ selector: followSelector });

// Or click on profile to navigate
const profileSelector = ".feed-shared-update-v2:nth-child(1) a.app-aware-link";
await bropTools.click_element({ selector: profileSelector });

// Get DOM of profile page
const profileDom = await bropTools.get_simplified_dom();
```

## Complete Example Function

```typescript
async function subscribeToLinkedInInfluencers(count: number = 5) {
  const results = [];
  
  // 1. Navigate to LinkedIn
  await bropTools.navigate_to_url({ url: "https://www.linkedin.com" });
  
  // 2. Get initial DOM
  const loginDom = await bropTools.get_simplified_dom();
  
  // 3. Check if we need to sign in
  if (loginDom.content.includes("Sign in")) {
    // Sign in process
    await bropTools.type_text({
      selector: "input#session_key",
      text: credentials.email
    });
    await bropTools.type_text({
      selector: "input#session_password", 
      text: credentials.password
    });
    await bropTools.click_element({
      selector: "button.sign-in-form__submit-btn"
    });
    
    // Wait for navigation
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // 4. Search for AI content
  await bropTools.navigate_to_url({
    url: "https://www.linkedin.com/search/results/content/?keywords=AI&sortBy=date"
  });
  
  // 5. Get search results DOM
  const searchDom = await bropTools.get_simplified_dom();
  
  // 6. Extract authors from DOM
  const authorData = extractAuthorsFromDom(searchDom.content);
  
  // 7. Visit each profile and follow
  for (let i = 0; i < Math.min(count, authorData.length); i++) {
    const author = authorData[i];
    
    // Navigate to profile
    await bropTools.click_element({ selector: author.profileSelector });
    
    // Get profile DOM
    const profileDom = await bropTools.get_simplified_dom();
    
    // Find follow button in DOM
    const followMatch = profileDom.content.match(/\[Follow\]\(css:(.*?)\)/);
    if (followMatch) {
      await bropTools.click_element({ selector: followMatch[1] });
      results.push({
        name: author.name,
        followed: true,
        profileUrl: await bropTools.get_current_url()
      });
    }
    
    // Go back to search results
    await bropTools.navigate_back();
  }
  
  return results;
}

function extractAuthorsFromDom(domContent: string) {
  const authors = [];
  const lines = domContent.split('\n');
  
  let currentPost = null;
  for (const line of lines) {
    if (line.startsWith('### Post')) {
      currentPost = {};
    } else if (line.includes('Author:') && currentPost) {
      const match = line.match(/Author: \[(.*?)\]/);
      if (match) currentPost.name = match[1];
    } else if (line.includes('Profile Link:') && currentPost) {
      const match = line.match(/\[View Profile\]\(css:(.*?)\)/);
      if (match) {
        currentPost.profileSelector = match[1];
        authors.push(currentPost);
        currentPost = null;
      }
    }
  }
  
  return authors;
}
```

## Key Benefits of DOM-First Approach

1. **No Guessing**: CSS selectors are provided by the DOM
2. **Current State**: Shows current values in inputs
3. **Dynamic Content**: Always get fresh DOM after actions
4. **Structured Data**: Markdown format is easy to parse
5. **Reliable**: Works even when page structure changes

## Best Practices

1. **Always Get DOM**: Before any interaction
2. **Parse Carefully**: Use the markdown structure
3. **Handle Changes**: Get fresh DOM after navigation
4. **Extract Data**: Use regex or parse the markdown
5. **Verify State**: Check current values in DOM

## Error Handling

```typescript
// If element not found in DOM
const dom = await bropTools.get_simplified_dom();
if (!dom.content.includes("Sign In")) {
  console.log("Expected element not found. Current page:");
  console.log(dom.content);
  // Adapt strategy based on actual content
}
```