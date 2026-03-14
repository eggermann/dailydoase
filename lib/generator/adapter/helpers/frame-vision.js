import { createVisionHelper } from './vision-model.js';

const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
};

export const normalizeVisionText = (value) => String(value ?? '')
  .replace(/^#+\s*/gm, '')
  .replace(/\*\*/g, '')
  .replace(/^\s*[-*]\s*/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

const VISION_SECTION_LABELS = [
  ['consistency for next shot', 'continuity'],
  ['consistency for the next shot', 'continuity'],
  ['consistency', 'continuity'],
  ['what should stay consistent', 'continuity'],
  ['location & actors', 'locationAndActors'],
  ['location and actors', 'locationAndActors'],
  ['location', 'location'],
  ['actors', 'actors'],
  ['subject', 'subject'],
  ['setting', 'setting'],
  ['framing', 'framing'],
  ['lighting', 'lighting'],
  ['description', 'description'],
  ['continuity', 'continuity'],
];

const VISION_SECTION_REGEX = new RegExp(
  `\\b(${VISION_SECTION_LABELS.map(([label]) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')})\\s*:`,
  'ig'
);

const trimVisionSectionValue = (value, maxLength = 220) => {
  const normalized = normalizeVisionText(value).replace(/[.:;,\s]+$/g, '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trim()}...`
    : normalized;
};

const canonicalizeVisionSectionLabel = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return VISION_SECTION_LABELS.find(([label]) => label === normalized)?.[1] || '';
};

const splitVisionList = (value) => {
  const normalized = normalizeVisionText(value);
  if (!normalized) {
    return [];
  }

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => trimVisionSectionValue(entry, 180))
          .filter(Boolean);
      }
    } catch (_) {
      // Fall back to string parsing when the model emits pseudo-JSON.
    }
  }

  const numberedItems = normalized
    .split(/\s+(?=\d+\.\s+)/)
    .map((entry) => entry.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
  if (numberedItems.length > 1) {
    return numberedItems
      .map((entry) => trimVisionSectionValue(entry, 180))
      .filter(Boolean);
  }

  const listItems = normalized
    .split(/\s*[;|]\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return (listItems.length > 0 ? listItems : [normalized])
    .map((entry) => trimVisionSectionValue(entry, 180))
    .filter(Boolean);
};

const splitAtLocationBoundary = (value) => {
  const normalized = trimVisionSectionValue(value, 220);
  if (!normalized) {
    return '';
  }

  const match = normalized.match(/^(.*?)(?:,\s+|\s+with\s+|\s+featuring\s+|\s+showing\s+|\s+where\s+|\s+that\s+has\s+|\s+including\s+)/i);
  if (!match) {
    return normalized;
  }

  return trimVisionSectionValue(match[1], 180) || normalized;
};

const splitAtActorBoundary = (value) => {
  const normalized = trimVisionSectionValue(value, 220);
  if (!normalized) {
    return '';
  }

  const match = normalized.match(
    /^(.*?)(?:,\s+|\s+(?:sitting|looking|turned|leaning|standing|frozen|rising|running|moving|glancing|staring|bolting)\b.*)$/i
  );
  if (!match) {
    return normalized;
  }

  return trimVisionSectionValue(match[1], 180) || normalized;
};

const parseCombinedLocationAndActors = (value) => {
  const normalized = trimVisionSectionValue(value, 260);
  if (!normalized) {
    return {
      location: '',
      actorText: '',
    };
  }

  const match = normalized.match(/^(.*?)(?:\s+(?:in|inside|within|at)\s+)(.+)$/i);
  if (!match) {
    return {
      location: '',
      actorText: '',
    };
  }

  return {
    actorText: trimVisionSectionValue(match[1], 180),
    location: trimVisionSectionValue(match[2], 180),
  };
};

export const summarizeVisionActors = (actors = []) => {
  const normalizedActors = Array.isArray(actors)
    ? actors.filter((actor) => actor?.description)
    : [];

  if (normalizedActors.length === 0) {
    return '';
  }

  if (normalizedActors.length === 1) {
    return trimVisionSectionValue(normalizedActors[0].description, 200);
  }

  return trimVisionSectionValue(
    normalizedActors
      .map((actor, index) => `${actor.reference || `actor ${index + 1}`} (${actor.description})`)
      .join('; '),
    260
  );
};

export const summarizeVisionLocation = (value) => splitAtLocationBoundary(value);

const parseActorEntry = (value, fallbackReference = 'the actor') => {
  const normalized = trimVisionSectionValue(value, 200);
  if (!normalized) {
    return null;
  }

  const labeledMatch = normalized.match(/^([^:]+):\s*(.+)$/);
  if (labeledMatch) {
    return {
      reference: trimVisionSectionValue(labeledMatch[1], 80).toLowerCase(),
      description: trimVisionSectionValue(labeledMatch[2], 180),
    };
  }

  return {
    reference: fallbackReference,
    description: normalized,
  };
};

export const summarizeVisionActorIdentity = (actors = []) => {
  const normalizedActors = Array.isArray(actors)
    ? actors.filter((actor) => actor?.description)
    : [];
  if (normalizedActors.length === 0) {
    return '';
  }

  if (normalizedActors.length === 1) {
    return splitAtActorBoundary(normalizedActors[0].description);
  }

  return trimVisionSectionValue(
    normalizedActors
      .map((actor, index) => {
        const reference = trimVisionSectionValue(actor.reference || `actor ${index + 1}`, 60);
        const description = splitAtActorBoundary(actor.description);
        return `${reference} (${description})`;
      })
      .join('; '),
    220
  );
};

export const summarizeVisionLocationActors = ({
  location = '',
  actors = [],
  fallback = '',
} = {}) => {
  const normalizedLocation = summarizeVisionLocation(location);
  const actorSummary = summarizeVisionActorIdentity(actors) || summarizeVisionActors(actors);

  if (actorSummary && normalizedLocation) {
    return trimVisionSectionValue(
      `${actorSummary} in ${normalizedLocation.replace(/^in\s+/i, '')}`,
      260
    );
  }

  return actorSummary || normalizedLocation || trimVisionSectionValue(fallback, 260);
};

export const summarizeVisionSetup = (value) => {
  const context = typeof value === 'string' ? extractVisionStoryContext(value) : value;
  if (!context || typeof context !== 'object') {
    return '';
  }

  const framing = trimVisionSectionValue(context.sections?.framing || '', 120);
  const lighting = trimVisionSectionValue(context.sections?.lighting || '', 120);
  const location = summarizeVisionLocation(context.location || context.sections?.setting || '');
  const parts = [];

  if (framing) {
    parts.push(framing);
  }
  if (location) {
    parts.push(`in ${location.replace(/^in\s+/i, '')}`);
  }
  if (lighting) {
    parts.push(`under ${lighting.replace(/^under\s+/i, '')}`);
  }

  return trimVisionSectionValue(parts.join(' '), 220);
};

export const extractVisionSections = (value) => {
  const text = normalizeVisionText(value);
  if (!text) {
    return {};
  }

  const matches = Array.from(text.matchAll(VISION_SECTION_REGEX));
  if (matches.length === 0) {
    return {};
  }

  const sections = {};
  matches.forEach((match, index) => {
    const canonicalLabel = canonicalizeVisionSectionLabel(match[1]);
    if (!canonicalLabel) {
      return;
    }

    const start = Number(match.index) + match[0].length;
    const end = index < matches.length - 1 ? Number(matches[index + 1].index) : text.length;
    const content = trimVisionSectionValue(text.slice(start, end));
    if (content) {
      sections[canonicalLabel] = content;
    }
  });

  return sections;
};

export const summarizeVisionAnchor = (value) => {
  const original = normalizeVisionText(value);
  const sections = extractVisionSections(original);
  const subject = trimVisionSectionValue(sections.subject || '', 180);
  const setting = trimVisionSectionValue(sections.setting || '', 180);

  if (subject || setting) {
    const parts = [];
    if (subject) {
      parts.push(subject);
    }
    if (setting) {
      parts.push(`in ${setting.replace(/^in\s+/i, '')}`);
    }
    const combined = parts.join(', ').replace(/[.:;,\s]+$/g, '').trim();
    return combined.length > 180 ? `${combined.slice(0, 177).trim()}...` : combined;
  }

  const normalized = original
    .replace(/^(?:here(?:’|')?s|here is)\s+(?:an?\s+)?(?:analysis|breakdown|description)(?:\s+of\s+the\s+visible\s+shot)?(?:\s+based\s+on\s+your\s+(?:request|image|description|provided image))?:\s*/i, '')
    .replace(/^the image (?:shows|depicts|contains)\s*/i, '')
    .replace(/^visible shot analysis:\s*/i, '')
    .replace(/^camera shot description:\s*/i, '')
    .replace(/^subject:\s*/i, '')
    .trim();

  if (!normalized) {
    return '';
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized;
  const compact = firstSentence.replace(/[.:;,\s]+$/g, '').trim();
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
};

export const extractVisionStoryContext = (value) => {
  const normalized = normalizeVisionText(value);
  const sections = extractVisionSections(normalized);
  const combinedLocationActors = parseCombinedLocationAndActors(sections.locationAndActors || '');
  const location = trimVisionSectionValue(
    sections.location
    || combinedLocationActors.location
    || sections.setting,
    180
  );
  const actorEntries = (() => {
    const explicitActors = splitVisionList(sections.actors || '');
    const fallbackActor = trimVisionSectionValue(
      sections.subject || combinedLocationActors.actorText,
      180
    );
    const baseEntries = explicitActors.length > 0 ? explicitActors : (fallbackActor ? [fallbackActor] : []);

    return baseEntries
      .map((entry, index, array) => {
        const fallbackReference = array.length === 1 ? 'the actor' : `actor ${index + 1}`;
        if (explicitActors.length > 0) {
          return parseActorEntry(entry, fallbackReference);
        }
        return parseActorEntry(sections.subject || entry, fallbackReference);
      })
      .filter(Boolean);
  })();
  const locationAndActors = summarizeVisionLocationActors({
    location,
    actors: actorEntries,
    fallback: sections.locationAndActors
      || [
        sections.subject,
        sections.setting ? `in ${sections.setting.replace(/^in\s+/i, '')}` : '',
      ].filter(Boolean).join(', '),
  });
  const description = trimVisionSectionValue(
    sections.description
    || [
      sections.subject,
      sections.setting ? `Setting: ${sections.setting}` : '',
      sections.framing ? `Framing: ${sections.framing}` : '',
      sections.lighting ? `Lighting: ${sections.lighting}` : '',
    ].filter(Boolean).join('. ')
    || normalized,
    260
  );
  const continuity = trimVisionSectionValue(sections.continuity || '', 220);

  return {
    sections,
    anchor: summarizeVisionAnchor(normalized),
    location,
    actors: actorEntries,
    actorSummary: summarizeVisionActors(actorEntries),
    actorIdentity: summarizeVisionActorIdentity(actorEntries),
    locationSummary: summarizeVisionLocation(location),
    setupSummary: summarizeVisionSetup({ sections, location }),
    locationAndActors,
    description,
    continuity,
  };
};

export const summarizeVisionStoryContext = (value) => {
  const context = extractVisionStoryContext(value);
  const parts = [];
  if (context.location) {
    parts.push(`Location: ${context.locationSummary || context.location}.`);
  }
  if (context.actors.length > 0) {
    parts.push(`Actors: ${JSON.stringify(context.actors)}.`);
  } else if (context.locationAndActors) {
    parts.push(`Location & actors: ${context.locationAndActors}.`);
  }
  if (context.setupSummary) {
    parts.push(`Setup: ${context.setupSummary}.`);
  } else if (context.description) {
    parts.push(`Description: ${context.description}.`);
  }
  if (context.continuity) {
    parts.push(`Continuity: ${context.continuity}.`);
  }
  return trimVisionSectionValue(parts.join(' '), 360);
};

export const createFrameVisionHelper = (options = {}) => {
  const {
    enabled = true,
    prompt,
    providers = [],
    logPrefix = 'frame-vision',
    onResult = null,
  } = options;

  const visionHelper = createVisionHelper({
    ...(prompt ? { prompt } : {}),
    ...(providers.length > 0 ? { providers } : {}),
  });
  const visionCache = new Map();
  let visionAvailable = enabled;
  let hasLoggedVisionDisable = false;

  return async function getFrameVision(frame, overrides = {}) {
    if (!visionAvailable || !frame?.image?.path) {
      return '';
    }

    const imagePath = frame.image.path;
    if (visionCache.has(imagePath)) {
      return visionCache.get(imagePath);
    }

    try {
      const result = await visionHelper({
        imagePath,
        ...(overrides.prompt ? { prompt: overrides.prompt } : {}),
      });
      const outputText = normalizeVisionText(result?.outputText);
      visionCache.set(imagePath, outputText);
      if (typeof onResult === 'function') {
        await onResult({
          frame,
          imagePath,
          outputText,
          result,
          overrides,
        });
      }
      return outputText;
    } catch (error) {
      visionAvailable = false;
      if (!hasLoggedVisionDisable) {
        hasLoggedVisionDisable = true;
        console.log('');
        console.log(`${ANSI.yellow}[${logPrefix}] vision disabled${ANSI.reset}`);
        console.log(`  reason: ${error.message}`);
        console.log('');
      }
      return '';
    }
  };
};

export default {
  createFrameVisionHelper,
  normalizeVisionText,
  summarizeVisionAnchor,
  extractVisionSections,
  extractVisionStoryContext,
  summarizeVisionActors,
  summarizeVisionActorIdentity,
  summarizeVisionLocation,
  summarizeVisionLocationActors,
  summarizeVisionSetup,
  summarizeVisionStoryContext,
};
