export { TFIDFEngine } from './TFIDFEngine.js'
export { OpenAICompatibleEngine } from './OpenAICompatibleEngine.js'
export { PRESET_ENGINES } from './AIEngine.js'
export type { AIEngine, QuestionContext, PingResult } from './AIEngine.js'
export * as ClusterService from './ClusterService.js'
export { buildEngine } from './buildEngine.js'
export { detectIntentByRules } from './SaveIntentClassifier.js'
export type { IntentInput } from './SaveIntentClassifier.js'
export {
  L1_CATEGORIES, L1_NAMES, L1_NAME_SET,
  isValidL1Name, getL1ByName, formatL1ListForPrompt,
} from './L1Categories.js'
export type { L1Category } from './L1Categories.js'
