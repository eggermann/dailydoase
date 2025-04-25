const store = require('../lib/store.cjs');
const assert = require('assert');
const path = require('path');

console.log('Running store tests...');

// Test initialization
console.log('Testing initialization...');
const imgPath = store.initCache();
assert(imgPath, 'Image path should be returned');
console.log('✓ Initialization successful');

// Test cache access
console.log('\nTesting cache access...');
const cache = store.getCache();
assert(typeof cache === 'object', 'Cache should be an object');
console.log('✓ Cache access successful');

// Test folder operations
console.log('\nTesting folder operations...');
const testFolder = 'tests';
const files = store.getFolder(testFolder);
console.log(`Found ${files.length} files in ${testFolder}`);
console.log('✓ Folder operations successful');

// Test total files
console.log('\nTesting total files...');
const total = store.totalFiles();
console.log(`Total files in store: ${total}`);
assert(typeof total === 'number', 'Total files should be a number');
console.log('✓ Total files check successful');

// Test limit setting
console.log('\nTesting limit setting...');
store.setLimit(20);
console.log('✓ Limit setting successful');

// Test cache refresh
console.log('\nTesting cache refresh...');
store.refreshCache();
console.log('✓ Cache refresh successful');

console.log('\nAll tests completed successfully!');