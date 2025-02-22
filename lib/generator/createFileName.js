/**
 * Create a file name based on a configuration object.
 *
 * @param {Object} config - The configuration object.
 * @param {Array} config.words - An array of word entries. Each entry should be an array:
 *   - First element: the word (string).
 *   - Second element: either a string (e.g. language code) or an object (e.g. { startWord: '...' }).
 * @param {String} [extension] - Optional file extension (e.g. 'txt' or 'json').
 * @returns {String} The generated file name.
 */
function createFileName(config, extension = '') {
    if (!config || !Array.isArray(config.words)) {
        throw new Error('Invalid configuration: expected an object with a "words" array.');
    }

    const processedWords = config.words.map(entry => {
        if (!Array.isArray(entry) || entry.length < 2) {
            throw new Error('Each word entry must be an array with at least two elements.');
        }
        let [word, extra] = entry;

        // Remove leading punctuation like ":" or underscores.
        word = word.replace(/^[\W_]+/, '');
        // Normalize word (for instance, convert to lower case)
        word = word.toLowerCase();

        let extraPart = '';
        if (typeof extra === 'string') {
            extraPart = extra.trim().toLowerCase();
        } else if (typeof extra === 'object' && extra !== null) {
            // Use the startWord property if provided and non-empty.
            if (extra.startWord && typeof extra.startWord === 'string' && extra.startWord.trim() !== '') {
                extraPart = extra.startWord.trim().toLowerCase();
            }
        }

        // Combine the main word and extra part if available.
        return extraPart ? `${word}-${extraPart}` : word;
    });

    // Join words with hyphens.
    let fileName = processedWords.join('-');

    // Append file extension if provided.
    if (extension) {
        if (!extension.startsWith('.')) {
            extension = '.' + extension;
        }
        fileName += extension;
    }

    return fileName;
}
/*
// Example usage:
const config = {
    words: [
        ['Robotics', 'en'],
        [':NewsStream', { startWord: '' }],
        ['Humanities', 'en']
    ]
};

const fileName = createFileName(config, 'txt'); // "robotics-en-newsstream-humanities-en.txt"
console.log(fileName);
*/
// For Node.js library usage, you can export the function:
export { createFileName };