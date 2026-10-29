import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  autoDirectorPromptVersion,
  previousAutoDirectorPromptVersion,
  resolveEffectiveAutoFlags,
  validateAutoDirectorResponse,
  validatePreviousAutoDirectorResponse,
} from './auto-director.mjs';
import { createAutoConceptSnapshot } from './auto-concepts.mjs';

export function buildAutoDirectorCorrectionRequest(request, response, validationError) {
  return {
    ...request,
    messages: [...request.messages, {
      role: 'assistant',
      content: response.choices?.[0]?.message?.content || '',
    }, {
      role: 'user',
      content: `Correct your decision once. Validation error: ${validationError}. Return all required fields, choose sceneCount within the supplied bounds, explain it in sceneCountReason, and obey videoVision=on only with videoDirection=on.`,
    }],
  };
}

export function addUsageIdempotently(record, field, usage) {
  const previousUsage = record[field] || {};
  record[field] = usage || null;
  if (!usage) return;
  const totals = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
  record.usage = Object.fromEntries(totals.map((key) => [
    key,
    Math.max(0, (record.usage?.[key] || 0) + (usage[key] || 0) - (previousUsage[key] || 0)),
  ]));
}

async function readJsonIfPresent(path) {
  try {
    await access(path);
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function recoverSavedAutoDirectorDecision({
  directory,
  expectedRequest,
  articleId,
  iteration,
  model,
  constraints,
  record,
  applyDecision,
  persist,
}) {
  const decisionPath = join(directory, 'auto-decisions.json');
  if (await pathExists(decisionPath)) return null;

  const requestPath = join(directory, 'auto-director-request.json');
  const responsePath = join(directory, 'auto-director-response.json');
  const revisionRequestPath = join(directory, 'auto-director-revision-request.json');
  const revisionResponsePath = join(directory, 'auto-director-revision-response.json');
  const response = await readJsonIfPresent(responsePath);
  const revisionResponse = await readJsonIfPresent(revisionResponsePath);
  if (!response && !revisionResponse) return null;

  const savedRequest = await readJsonIfPresent(requestPath);
  if (!savedRequest) {
    throw new Error('Saved Auto Director response has no original request; refusing to reconstruct or issue another paid request');
  }
  const recoveredDecision = recoverAutoDirectorDecision({
    savedRequest,
    expectedRequest,
    response,
    revisionRequest: await readJsonIfPresent(revisionRequestPath),
    revisionResponse,
    articleId,
    iteration,
    model,
    constraints,
  });

  applyDecision(record, recoveredDecision);
  addUsageIdempotently(record, 'autoDirectorUsage', recoveredDecision.usage);
  await persist();
  await writeFile(decisionPath, `${JSON.stringify(recoveredDecision, null, 2)}\n`, { flag: 'wx' });
  return recoveredDecision;
}

export function recoverAutoDirectorDecision({
  savedRequest,
  expectedRequest,
  response,
  revisionRequest,
  revisionResponse,
  articleId,
  iteration,
  model,
  constraints,
}) {
  const previousVersion = isPreviousAutoDirectorRequest(savedRequest, expectedRequest);
  if (JSON.stringify(savedRequest) !== JSON.stringify(expectedRequest) && !previousVersion) {
    throw new Error('Saved Auto Director request differs from this iteration; refusing to reinterpret its response');
  }
  const validateResponse = previousVersion ? validatePreviousAutoDirectorResponse : validateAutoDirectorResponse;

  let selectedResponse = response;
  if (revisionRequest && !revisionResponse) {
    try {
      validateResponse(response, { sceneCount: constraints.sceneCount });
    } catch {
      throw new Error('Saved Auto Director correction request has no saved response; refusing to issue another paid request');
    }
    throw new Error('Saved Auto Director correction request conflicts with a valid original response');
  }
  if (revisionResponse) {
    if (!revisionRequest) {
      throw new Error('Saved Auto Director revision response has no matching request; refusing to reconstruct');
    }
    let initialValidationError;
    try {
      validateResponse(response, { sceneCount: constraints.sceneCount });
    } catch (error) {
      initialValidationError = error.message;
    }
    if (!initialValidationError) {
      throw new Error('Saved Auto Director revision response conflicts with a valid original response');
    }
    const validationError = previousVersion
      ? extractPreviousValidationError(revisionRequest)
      : initialValidationError;
    const expectedRevisionRequest = buildAutoDirectorCorrectionRequest(savedRequest, response, validationError);
    if (JSON.stringify(revisionRequest) !== JSON.stringify(expectedRevisionRequest)) {
      throw new Error('Saved Auto Director revision request differs from its original request/response');
    }
    selectedResponse = revisionResponse;
  }
  const answer = validateResponse(selectedResponse, { sceneCount: constraints.sceneCount });
  const resolved = resolveEffectiveAutoFlags(answer.flags, constraints);
  if (previousVersion) delete resolved.effectiveFlags.guernicaStyleReference;
  const decision = {
    autoMode: true,
    iteration,
    articleId,
    model,
    promptVersion: previousVersion ? previousAutoDirectorPromptVersion : autoDirectorPromptVersion,
    dramaturgicalConcept: answer.dramaturgicalConcept,
    visualConcept: answer.visualConcept,
    motionConcept: answer.motionConcept,
    audioConcept: answer.audioConcept,
    sceneCount: answer.sceneCount,
    sceneCountReason: answer.sceneCountReason,
    selectedFlags: answer.flags,
    effectiveFlags: resolved.effectiveFlags,
    constraints,
    reason: answer.reason,
    constraintsApplied: resolved.constraintsApplied,
    usage: selectedResponse.usage || null,
    recoveredFromSavedResponse: true,
  };
  decision.conceptSnapshotHash = createAutoConceptSnapshot(decision).snapshotHash;
  return decision;
}

function extractPreviousValidationError(revisionRequest) {
  const prefix = 'Correct your decision once. Validation error: ';
  const suffix = '. Return all required fields, choose sceneCount within the supplied bounds, explain it in sceneCountReason, and obey videoVision=on only with videoDirection=on.';
  const content = revisionRequest?.messages?.at(-1)?.content;
  if (typeof content !== 'string' || !content.startsWith(prefix) || !content.endsWith(suffix)) {
    throw new Error('Saved Auto Director V2 correction request is malformed');
  }
  return content.slice(prefix.length, -suffix.length);
}

function isPreviousAutoDirectorRequest(savedRequest, expectedRequest) {
  if (!savedRequest || !expectedRequest) return false;
  const legacyExpected = structuredClone(expectedRequest);
  const decisionInstruction = ' Decide whether the full Guernica painting should be supplied as a style image reference for this article; use it sparingly when it strengthens the concept, and turn it off when it would dominate the article-specific imagery. This choice does not control the separate Guernica figure catalog or a user-fixed Guernica location reference.';
  legacyExpected.messages[0].content = legacyExpected.messages[0].content.replace(decisionInstruction, '');
  legacyExpected.messages[0].content = legacyExpected.messages[0].content.replace(
    'Choose only schema values. Do not change models, providers, image/video resolution, costs, iteration count, article order, duration bounds, paths, reference assets, or operational settings; choose only whether a reference is used and which existing duration mode to use where an explicit flag permits it. Your scene count and duration mode are fixed once this decision is saved.',
    'Choose only schema values. Do not change models, providers, image/video resolution, costs, iteration count, article order, scene durations, paths, references, or operational settings. Your scene count is fixed once this decision is saved.',
  );
  const userMessage = JSON.parse(legacyExpected.messages[1].content);
  delete userMessage.availableFlags.guernicaStyleReference;
  delete userMessage.availableFlags.guernicaFigureReference;
  delete userMessage.availableFlags.sceneDurationMode;
  delete userMessage.fixedConstraints.guernicaFigureReferenceAvailable;
  delete userMessage.fixedConstraints.sceneDurationModeAvailable;
  legacyExpected.messages[1].content = JSON.stringify(userMessage);
  const schema = legacyExpected.response_format.json_schema.schema;
  delete schema.properties.flags.properties.guernicaStyleReference;
  delete schema.properties.flags.properties.guernicaFigureReference;
  delete schema.properties.flags.properties.sceneDurationMode;
  schema.properties.flags.required = schema.properties.flags.required.filter((key) => key !== 'guernicaStyleReference');
  schema.properties.flags.required = schema.properties.flags.required.filter((key) => key !== 'guernicaFigureReference' && key !== 'sceneDurationMode');
  return JSON.stringify(savedRequest) !== JSON.stringify(expectedRequest)
    && JSON.stringify(savedRequest) === JSON.stringify(legacyExpected);
}
