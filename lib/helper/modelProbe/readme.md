# Chat Model Probe – Node Module

A Node.js module to **discover, probe, and filter Hugging Face chat models available for inference** using the Hugging Face Inference API.

---

## Installation

```bash
npm install
```

---

## Usage

```js
import { regenerateAvailabilityList } from './chatModelProbe/chatModelProbe.js';

// Regenerate the list (probes all models, writes JSON)
const availableModels = await regenerateAvailabilityList();

// Or, to use the cached list if available:
const cachedModels = await regenerateAvailabilityList(true);

console.log('Available chat models:', availableModels);
```

---

## API

### `regenerateAvailabilityList(useCache = false): Promise<Array>`

- `useCache` (boolean):  
  - `false` (default): Probes Hugging Face for live chat models and writes the result to JSON.
  - `true`: Returns the cached JSON if available, otherwise regenerates.

Returns:  
An array of available chat model objects:  
```js
[
  { model: "microsoft/Phi-3.5-mini-instruct", available: true },
  ...
]
```

---

## Requirements

- Node.js 18+
- Hugging Face API token (`HF_API_TOKEN` in `.env`)

---

## Purpose

This module helps you **filter and list currently available Hugging Face chat/instruct models** for inference, making it easy to select live endpoints for your applications.