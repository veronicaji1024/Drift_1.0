/**
 * @drift/agents — Drift 的 AI Agent 层
 *
 * 包含 Observer、Synthesizer、ProfileAgent、IntentDetector、
 * ConvergenceEngine 和 AgentScheduler。
 */

// ─── Agents ───
export { ObserverAgent } from './observer/observer-agent.js'
export { SynthesizerAgent } from './synthesizer/synthesizer-agent.js'
export { ProfileAgent } from './profile/profile-agent.js'
export { IntentDetector } from './intent-detector/intent-detector.js'
export { ConvergenceEngine } from './convergence/convergence-engine.js'
export { AgentScheduler } from './scheduler/agent-scheduler.js'
export type { AgentSchedulerDeps } from './scheduler/agent-scheduler.js'

// ─── Types ───
export type { BehaviorSignals, IntentResult, AgentTask, IntentType, IntentConfidence } from './types/index.js'
