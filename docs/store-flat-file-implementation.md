# Store Replacement Implementation Plan
*Technical specifications for replacing store.cjs with flat-file-db*

## Current Store API Analysis

The current store module (`lib/store.cjs`) provides these key functionalities:

```javascript
{
    initCache,     // Initialize cache from directory
    refreshCache,  // Refresh entire cache
    getCache,      // Get full cache state
    getFolder,     // Get files from specific folder
    addFile,       // Add file to cache
    shiftFile,     // Remove and return first file from folder
    imgPath,       // Get image directory path
    totalFiles,    // Get total number of cached files
    setLimit       // Set processing limit
}
```

## Data Structure

Current in-memory structure:
```javascript
_cache = {
    [folderName]: FileMetadata[]
}

// FileMetadata structure
{
    file: string,      // File name
    ext: string,       // File extension
    fullPath: string,  // Absolute file path
    folderName: string,// Folder name
    url: string,       // Relative URL path
    mtime: Date,       // Last modified time
    jsonPath: string   // Path to associated JSON file
}
```

## Flat-File-DB Implementation

### 1. Package Installation
```bash
npm install flat-file-db
```

### 2. Database Structure

```javascript
// Main database instance
const db = flatfile.sync('store.db');

// Key structure for files
// folder:filename -> metadata
{
    "folder1:file1.png": {
        file: "file1.png",
        ext: ".png",
        fullPath: "/abs/path/to/file1.png",
        folderName: "folder1",
        url: "folder1/file1.png",
        mtime: "2025-04-25T11:53:41.000Z",
        jsonPath: "/abs/path/to/file1.json"
    }
}

// Metadata key for storing global info
"__metadata__": {
    totalFiles: 0,
    imgPath: "/path/to/images",
    limit: 10
}
```

### 3. Function Implementations

#### Initialize Database
```javascript
function initCache(imageDir) {
    const db = flatfile.sync('store.db');
    // Scan directory and populate db
    // Set metadata
    db.put('__metadata__', { 
        imgPath: imageDir,
        totalFiles: 0,
        limit: DEFAULT_LIMIT 
    });
    return imageDir;
}
```

#### Get Folder Contents
```javascript
function getFolder(folderName) {
    const db = flatfile.sync('store.db');
    const files = [];
    
    db.values().forEach(value => {
        if (value.folderName === folderName) {
            files.push(value);
        }
    });
    
    return files.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));
}
```

#### Add File
```javascript
function addFile(folderName, fileName) {
    const db = flatfile.sync('store.db');
    const key = `${folderName}:${fileName}`;
    const metadata = createFileMetadata(fileName, ...);
    
    db.put(key, metadata);
    
    const meta = db.get('__metadata__');
    meta.totalFiles++;
    db.put('__metadata__', meta);
}
```

#### Shift File
```javascript
function shiftFile(folderName) {
    const db = flatfile.sync('store.db');
    const files = getFolder(folderName);
    
    if (files.length > 0) {
        const file = files[0];
        db.del(`${folderName}:${file.file}`);
        
        const meta = db.get('__metadata__');
        meta.totalFiles--;
        db.put('__metadata__', meta);
        
        return file;
    }
    return null;
}
```

## Migration Steps

1. **Backup**
   ```bash
   cp lib/store.cjs lib/store.cjs.bak
   ```

2. **Dependencies**
   - Add flat-file-db to package.json
   - Run npm install

3. **Implementation**
   - Create new store implementation
   - Maintain exact API compatibility
   - Use flat-file-db for persistence
   - Keep in-memory cache for performance

4. **Testing**
   ```javascript
   // Test cases
   const store = require('./lib/store.cjs');
   
   // Initialize
   store.initCache('/path/to/images');
   
   // Add file
   store.addFile('folder1', 'test.png');
   
   // Get folder
   const files = store.getFolder('folder1');
   
   // Shift file
   const file = store.shiftFile('folder1');
   ```

## Performance Considerations

1. Keep in-memory cache alongside flat-file-db for read performance
2. Batch write operations when possible
3. Use sync operations for consistency with current implementation
4. Consider adding index for folder-based queries

## Rollback Plan

1. Keep backup of original store.cjs
2. Maintain database file alongside in-memory cache during testing
3. Switch back to original implementation if issues occur:
   ```bash
   mv lib/store.cjs.bak lib/store.cjs