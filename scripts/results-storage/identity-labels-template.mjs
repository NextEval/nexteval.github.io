const exactModels = new Map();
for (const model of MODEL_IDENTITIES.models) {
  for (const alias of model.aliases) {
    if (exactModels.has(alias)) throw new Error('Ambiguous model alias');
    exactModels.set(alias,model);
  }
}
export function modelIdentity(participant) {
  if (!participant.model || participant.model==='none') {
    if (!['scipy','reference'].includes(participant.harness)) throw new Error('Missing model identity');
    return null;
  }
  const value=exactModels.get(participant.model);
  if (!value) throw new Error('Unregistered model identity');
  return value;
}
export const modelName = participant => modelIdentity(participant)?.display_name || participant.label;
export function harnessName(participant) {
  const value=MODEL_IDENTITIES.harnesses[participant.harness];
  if (!value) throw new Error('Unregistered harness');
  return value;
}
export const configurationName = participant => `${modelName(participant)}${participant.effort ? ` (${participant.effort})` : ''}`;
export function presentationParticipant(participant) {
  const identity=modelIdentity(participant);
  return {...participant,canonical_model_id:identity?.id || null,display_name:modelName(participant),family:identity?.family || participant.family};
}
