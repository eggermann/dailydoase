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
  ['continuity notes for next shot', 'continuity'],
  ['continuity note for next shot', 'continuity'],
  ['continuity notes', 'continuity'],
  ['consistency for next shot', 'continuity'],
  ['consistency for the next shot', 'continuity'],
  ['consistency', 'continuity'],
  ['what should stay consistent', 'continuity'],
  ['location & actors', 'locationAndActors'],
  ['location and actors', 'locationAndActors'],
  ['room assets', 'assets'],
  ['assets', 'assets'],
  ['location', 'location'],
  ['actors', 'actors'],
  ['subject', 'subject'],
  ['setup', 'setup'],
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

  const jsonCandidate = normalized.replace(/[.;,\s]+$/g, '').trim();
  if (jsonCandidate.startsWith('[') && jsonCandidate.endsWith(']')) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => {
            if (entry && typeof entry === 'object') {
              const reference = trimVisionSectionValue(entry.reference || '', 80);
              const description = trimVisionSectionValue(entry.description || '', 180);
              if (reference && description) {
                return `${reference}: ${description}`;
              }
              return description || reference || trimVisionSectionValue(JSON.stringify(entry), 180);
            }
            return trimVisionSectionValue(entry, 180);
          })
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
  if (numberedItems.length > 1 || (/^\d+\.\s*/.test(normalized) && numberedItems.length === 1)) {
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

const sanitizeActorFragment = (value, fallbackReference = 'the actor') => {
  const normalized = trimVisionSectionValue(value, 200)
    .replace(/^\(?\d+\)?[.:)\s-]*/i, '')
    .replace(/^actor\s*\d+\s*[:.-]?\s*/i, '')
    .trim();

  if (!normalized) {
    return fallbackReference;
  }

  return normalized;
};

const parseActorEntry = (value, fallbackReference = 'the actor') => {
  const normalized = sanitizeActorFragment(value, fallbackReference);
  if (!normalized) {
    return null;
  }

  const labeledMatch = normalized.match(/^([^:]+):\s*(.+)$/);
  if (labeledMatch) {
    const sanitizedReference = sanitizeActorFragment(labeledMatch[1], fallbackReference).toLowerCase();
    return {
      reference: /^\d+$/.test(sanitizedReference) ? fallbackReference : trimVisionSectionValue(sanitizedReference, 80),
      description: sanitizeActorFragment(labeledMatch[2], fallbackReference),
    };
  }

  return {
    reference: fallbackReference,
    description: normalized,
  };
};

const parseStructuredActorEntries = (value) => {
  const normalized = normalizeVisionText(value);
  const jsonCandidate = normalized.replace(/[.;,\s]+$/g, '').trim();
  if (!jsonCandidate.startsWith('[') || !jsonCandidate.endsWith(']')) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.map((entry, index) => {
      const fallbackReference = parsed.length === 1 ? 'the actor' : `person ${index + 1}`;
      if (!entry || typeof entry !== 'object') {
        return parseActorEntry(entry, fallbackReference);
      }

      const reference = sanitizeActorFragment(
        entry.reference || entry.person || entry.name,
        fallbackReference
      ).toLowerCase();
      const description = sanitizeActorFragment(
        entry.description || entry.appearance || entry.identity,
        fallbackReference
      );
      const position = trimVisionSectionValue(
        entry.position || entry.framePosition || entry.frame_position,
        100
      ).toLowerCase();
      const orientation = trimVisionSectionValue(
        entry.orientation || entry.facing || entry.pose,
        80
      ).toLowerCase();
      const actor = {
        reference,
        description,
      };

      if (position) {
        actor.position = position;
      }
      if (orientation) {
        actor.orientation = orientation;
      }
      return actor;
    }).filter(Boolean);
  } catch (_) {
    return null;
  }
};

const parseStructuredAssetEntries = (value) => {
  const normalized = normalizeVisionText(value);
  const jsonCandidate = normalized.replace(/[.;,\s]+$/g, '').trim();
  if (!jsonCandidate.startsWith('[') || !jsonCandidate.endsWith(']')) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        const description = trimVisionSectionValue(entry, 180);
        return description ? { reference: `asset ${index + 1}`, description } : null;
      }
      const reference = trimVisionSectionValue(
        entry.reference || entry.name || entry.type || `asset ${index + 1}`,
        80
      ).toLowerCase();
      const description = trimVisionSectionValue(
        entry.description || entry.appearance || entry.details || reference,
        180
      );
      const position = trimVisionSectionValue(
        entry.position || entry.framePosition || entry.frame_position,
        100
      ).toLowerCase();
      return {
        reference,
        description,
        ...(position ? { position } : {}),
      };
    }).filter(Boolean);
  } catch (_) {
    return null;
  }
};

const readPseudoJsonStringField = (value, fieldName) => {
  const source = String(value || '');
  const escapedField = String(fieldName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"${escapedField}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`);
  const match = source.match(pattern);
  if (!match) {
    return '';
  }

  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return '';
  }
};

const readPseudoJsonArrayField = (value, fieldName) => {
  const source = String(value || '');
  const fieldIndex = source.indexOf(`"${fieldName}"`);
  if (fieldIndex < 0) {
    return null;
  }

  const arrayStart = source.indexOf('[', fieldIndex);
  if (arrayStart < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        const candidate = source.slice(arrayStart, index + 1);
        try {
          const parsed = JSON.parse(candidate);
          return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
          return null;
        }
      }
    }
  }

  return null;
};

const recoverPseudoJsonVisionFields = (value) => {
  const actors = readPseudoJsonArrayField(value, 'Actors');
  const assets = readPseudoJsonArrayField(value, 'Assets');
  const fields = [
    ['Subject', readPseudoJsonStringField(value, 'Subject')],
    ['Setting', readPseudoJsonStringField(value, 'Setting')],
    ['Framing', readPseudoJsonStringField(value, 'Framing')],
    ['Location', readPseudoJsonStringField(value, 'Location')],
    ['Actors', actors ? JSON.stringify(actors) : ''],
    ['Assets', assets ? JSON.stringify(assets) : ''],
    ['Description', readPseudoJsonStringField(value, 'Description')],
    ['Continuity', readPseudoJsonStringField(value, 'Continuity Checklist for Next Shot')],
  ].filter(([, fieldValue]) => fieldValue);

  return fields.map(([label, fieldValue]) => `${label}: ${fieldValue}`).join('\n');
};

export const summarizeVisionActorIdentity = (actors = []) => {
  const normalizedActors = Array.isArray(actors)
    ? actors.filter((actor) => actor?.description)
    : [];
  if (normalizedActors.length === 0) {
    return '';
  }

  if (normalizedActors.length === 1) {
    return splitAtActorBoundary(sanitizeActorFragment(normalizedActors[0].description));
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

  const explicitSetup = trimVisionSectionValue(context.sections?.setup || '', 180);
  if (explicitSetup) {
    return explicitSetup;
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
    const content = trimVisionSectionValue(
      text.slice(start, end),
      ['actors', 'assets'].includes(canonicalLabel) ? 1200 : 220
    );
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
  const setup = trimVisionSectionValue(sections.setup || sections.description || '', 180);

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

  if (setup) {
    return setup;
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
  const rawVisionText = String(value ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonStart = rawVisionText.startsWith('{') ? 0 : -1;
  const jsonEnd = rawVisionText.lastIndexOf('}');
  const rawJsonCandidate = jsonStart >= 0 && jsonEnd > jsonStart
    ? rawVisionText.slice(jsonStart, jsonEnd + 1)
    : '';
  if (rawJsonCandidate) {
    try {
      const parsed = JSON.parse(rawJsonCandidate);
      const getField = (name) => Object.entries(parsed)
        .find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
      const fieldText = (field) => {
        if (typeof field === 'string') return field;
        if (field && typeof field.description === 'string') return field.description;
        return field ? JSON.stringify(field) : '';
      };
      const labeledText = [
        ['Subject', fieldText(getField('subject'))],
        ['Setting', fieldText(getField('setting'))],
        ['Framing', fieldText(getField('framing'))],
        ['Lighting', fieldText(getField('lighting'))],
        ['Location', fieldText(getField('location'))],
        ['Actors', getField('actors') ? JSON.stringify(getField('actors')) : ''],
        ['Assets', getField('assets') ? JSON.stringify(getField('assets')) : ''],
        ['Description', fieldText(getField('description'))],
        ['Continuity', fieldText(getField('continuity')) || fieldText(getField('what should stay consistent'))],
      ]
        .filter(([, field]) => field)
        .map(([label, field]) => `${label}: ${field}`)
        .join('\n');
      if (labeledText) {
        return extractVisionStoryContext(labeledText);
      }
    } catch (_) {
      const recoveredVisionText = recoverPseudoJsonVisionFields(rawJsonCandidate);
      if (recoveredVisionText) {
        return extractVisionStoryContext(recoveredVisionText);
      }
      // Continue with labeled-text parsing for other pseudo-JSON model output.
    }
  }

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
    const structuredActors = parseStructuredActorEntries(sections.actors || '');
    if (structuredActors) {
      return structuredActors;
    }

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
  const assetEntries = parseStructuredAssetEntries(sections.assets || '')
    || splitVisionList(sections.assets || '').map((description, index) => ({
      reference: `asset ${index + 1}`,
      description,
    }));
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
    || sections.setup
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
    assets: assetEntries,
    assetSummary: assetEntries.map((asset) => [
      asset.reference,
      asset.description,
      asset.position ? `position=${asset.position}` : '',
    ].filter(Boolean).join(', ')).join('; '),
    peopleCount: actorEntries.length,
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
  const context = value && typeof value === 'object'
    ? value
    : extractVisionStoryContext(value);
  const parts = [];
  if (context.location) {
    parts.push(`Location: ${context.locationSummary || context.location}.`);
  }
  if ((context.actors || []).length > 0) {
    parts.push(`People: ${context.peopleCount}.`);
    parts.push(`Actors: ${JSON.stringify(context.actors)}.`);
  } else if (context.locationAndActors) {
    parts.push(`Location & actors: ${context.locationAndActors}.`);
  }
  if ((context.assets || []).length > 0) {
    parts.push(`Assets: ${JSON.stringify(context.assets)}.`);
  }
  if (context.setupSummary) {
    parts.push(`Setup: ${context.setupSummary}.`);
  } else if (context.description) {
    parts.push(`Description: ${context.description}.`);
  }
  if (context.continuity) {
    parts.push(`Continuity: ${context.continuity}.`);
  }
  return trimVisionSectionValue(parts.join(' '), 900);
};

export const createFrameVisionHelper = (options = {}) => {
  const {
    enabled = true,
    prompt,
    providers = [],
    maxTokens,
    logPrefix = 'frame-vision',
    onResult = null,
  } = options;

  const visionHelper = createVisionHelper({
    ...(prompt ? { prompt } : {}),
    ...(providers.length > 0 ? { providers } : {}),
    ...(Number.isFinite(maxTokens) ? { maxTokens } : {}),
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
