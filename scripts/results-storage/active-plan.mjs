// Presentation-only campaign plan. Never contributes members or targets to profiles.
export const PLAN = Object.freeze({
  id: '20261006-u5-retained-matrix',
  source: 'https://github.com/NextEval/nexteval-bench/blob/main/docs/model-harness-matrix.md',
  scope: { maxdim: 5, repetitions: 3, max_eval_factor: 50 },
  families: [
    { family:'GPT', harnesses:['codex'], efforts:['medium','high'], models:[
      ['gpt-5.5','GPT-5.5'], ['gpt-5.6-sol','GPT-5.6 Sol'], ['gpt-5.6-terra','GPT-5.6 Terra'],
      ['gpt-5.6-luna','GPT-5.6 Luna'], ['gpt-6-sol','GPT-6 Sol'], ['gpt-6-luna','GPT-6 Luna'],
      ['gpt-6-astra','GPT-6 Astra'], ['gpt-6.1-sol','GPT-6.1 Sol'],
    ] },
    { family:'Claude', harnesses:['claude-code'], efforts:['medium','high'], models:[
      ['claude-sonnet-5','Claude Sonnet 5'], ['claude-opus-5-5','Claude Opus 5.5'], ['claude-fable-5-1','Fable 5.1'],
      ['claude-haiku-5-5','Claude Haiku 5.5'],
    ] },
    { family:'Qwen', harnesses:['codex','claude-code'], efforts:['high'], models:[
      ['qwen3.8-flash','Qwen 3.8 Flash'], ['qwen3.8-max','Qwen 3.8 Max'],
    ] },
    { family:'DeepSeek', harnesses:['codex','claude-code'], efforts:['high'], models:[
      // V4 Flash is retired; only its completed Claude Code arm remains in the plan.
      ['deepseek-v4-flash','DeepSeek V4 Flash',null,['claude-code']], ['deepseek-v4-pro','DeepSeek V4 Pro'],
      ['deepseek-v4.1-flash','DeepSeek V4.1 Flash'],
    ] },
    { family:'GLM', harnesses:['codex','claude-code'], efforts:['high'], models:[
      ['glm-5.3','GLM 5.3'], ['glm-5.3-flash','GLM 5.3 Flash'],
    ] },
    { family:'Hunyuan', harnesses:['codex','claude-code'], efforts:['high'], models:[
      ['hy4-preview','HY4 Preview'],
    ] },
    { family:'MiMo', harnesses:['codex','claude-code'], efforts:['on'], models:[
      ['mimo-v2.6-flash','MiMo V2.6 Flash'], ['mimo-v2.6-pro','MiMo V2.6 Pro'],
    ] },
    { family:'Kimi', harnesses:['codex','claude-code'], efforts:['high'], models:[
      ['kimi-k3','Kimi K3'],
    ] },
  ],
});

export function plannedParticipants() {
  return PLAN.families.flatMap(({family,harnesses,efforts,models}) =>
    models.flatMap(([model,display_name,condition,only]) => (only || harnesses).flatMap(harness => efforts.map(effort => ({
      participant_id:`${harness}--${model}--${effort}`,
      label:`${display_name} / ${harness} / ${effort}`,
      model, display_name, harness, effort, family, condition:condition || null, planned:true,
    })))));
}

export function participantFamily(participant) {
  const model = participant.model?.split('/').at(-1);
  return PLAN.families.find(f => f.models.some(([id]) => id === model))?.family || participant.family || '';
}
