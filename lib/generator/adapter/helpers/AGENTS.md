# Helper Folder Notes

- For live OpenAI tests in this folder, keep short runnable command comments at the top of the test file and directly above each live test.
- Each commented command line should be fully copy/paste ready on its own, including the correct path form for the current working directory it mentions.
- Prefer `npm test -- <file> --runInBand` for helper tests in this folder.
- For single live tests, prefer `npm test -- <file> --runInBand -t "<exact test name>"`.
