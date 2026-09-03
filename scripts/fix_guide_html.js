/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const viPath = path.join(__dirname, '../messages/vi.json');
/* eslint-disable @typescript-eslint/no-require-imports */
const enPath = path.join(__dirname, '../messages/en.json');
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const fixJson = (filePath) => {
/* eslint-disable @typescript-eslint/no-require-imports */
  let content = fs.readFileSync(filePath, 'utf8');
/* eslint-disable @typescript-eslint/no-require-imports */
  content = content.replace(/<b>/g, '__b__').replace(/<\/b>/g, '__/b__');
/* eslint-disable @typescript-eslint/no-require-imports */
  fs.writeFileSync(filePath, content);
/* eslint-disable @typescript-eslint/no-require-imports */
};
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
fixJson(viPath);
/* eslint-disable @typescript-eslint/no-require-imports */
fixJson(enPath);
/* eslint-disable @typescript-eslint/no-require-imports */
console.log('JSON fixed!');
