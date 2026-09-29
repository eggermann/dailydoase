# System Patterns

## Working Pattern

`StoryTransport JSON -> concrete audio source -> o4-mini blueprint -> Gradio Space request -> MP3 + metadata`

## Quality Pattern

- Provider request is injectable and unit-tested.
- Source data contains no image paths or credentials.
- Prompt artifacts are saved before the external call.
