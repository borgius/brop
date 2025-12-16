const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'out', 'extension.js');
if (fs.existsSync(out)) {
  console.log('OK: output file exists:', out);
  process.exit(0);
} else {
  console.error('ERROR: output file missing:', out);
  process.exit(2);
}
