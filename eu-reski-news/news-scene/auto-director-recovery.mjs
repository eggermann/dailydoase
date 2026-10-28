import {
  autoDirectorPromptVersion,
  resolveEffectiveAutoFlags,
  validateAutoDirectorResponse,
} from './auto-director.mjs';
import { createAutoConceptSnapshot } from './auto-concepts.mjs';

export function recoverAutoDirectorDecision({
  savedRequest,
  expectedRequest,
  response,
  articleId,
  iteration,
  model,
  constraints,
}) {
  if (JSON.stringify(savedRequest) !== JSON.stringify(expectedRequest)) {
    throw new Error('Saved Auto Director request differs from this iteration; refusing to reinterpret its response');
  }

  const answer = validateAutoDirectorResponse(response, { sceneCount: constraints.sceneCount });
  const resolved = resolveEffectiveAutoFlags(answer.flags, constraints);
  const decision = {
    autoMode: true,
    iteration,
    articleId,
    model,
    promptVersion: autoDirectorPromptVersion,
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
    usage: response.usage || null,
    recoveredFromSavedResponse: true,
  };
  decision.conceptSnapshotHash = createAutoConceptSnapshot(decision).snapshotHash;
  return decision;
}
