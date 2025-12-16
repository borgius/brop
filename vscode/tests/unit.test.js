const assert = require('assert');
const mapping = require('../out/tool-mapping.js');

console.log('Unit test: tool mapping');
assert.strictEqual(typeof mapping.TOOL_MAPPING, 'object');
assert.strictEqual(mapping.getMethodForTool('brop_navigate'), 'navigate');
assert.strictEqual(mapping.getMethodForTool('brop_click_element'), 'click');
console.log('Mapping tests passed');

console.log('All unit tests passed');
