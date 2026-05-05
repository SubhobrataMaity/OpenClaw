/**
 * Shared pipeline context — passed through every agent in the workflow.
 * Each layer writes its output to the appropriate key.
 */

export interface CampaignInput {
  industry: string;
  targetAudience: string;
  goal: string;
  brandVoice?: string;
  existingContent?: string;
}

export interface IntelligenceContext {
  research?: string;
  competitors?: Record<string, unknown>;
  trends?: Record<string, unknown>;
  audience?: Record<string, unknown>;
}

export interface StrategyContext {
  strategy?: Record<string, unknown>;
  positioning?: Record<string, unknown>;
  contentPlan?: Record<string, unknown>;
}

export interface ContentContext {
  written?: Record<string, unknown>;
  variations?: Record<string, unknown>;
  designBrief?: Record<string, unknown>;
  current?: Record<string, unknown>;
}

export interface EvaluationContext {
  criticOutput?: Record<string, unknown>;
  comparatorOutput?: Record<string, unknown>;
  scoringOutput?: Record<string, unknown>;
  goldStandards?: Array<Record<string, unknown>>;
  iteration?: number;
}

export interface ExecutionContext {
  campaignPlan?: Record<string, unknown>;
  platformVersions?: Record<string, unknown>;
  repurposed?: Record<string, unknown>;
}

export interface LearningContext {
  patterns?: Record<string, unknown>;
}

export interface SharedContext {
  input: CampaignInput;
  intelligence: IntelligenceContext;
  strategy: StrategyContext;
  content: ContentContext;
  evaluation: EvaluationContext;
  execution: ExecutionContext;
  learning: LearningContext;
  score: number;
  finalOutput?: Record<string, unknown>;
  metadata: {
    startedAt: string;
    completedAt?: string;
    totalIterations: number;
    agentLogs: Array<{ agent: string; timestamp: string; note: string }>;
    dbOutputId?: string;
  };
}

export function createContext(input: CampaignInput): SharedContext {
  return {
    input,
    intelligence: {},
    strategy: {},
    content: {},
    evaluation: { iteration: 0 },
    execution: {},
    learning: {},
    score: 0,
    metadata: {
      startedAt: new Date().toISOString(),
      totalIterations: 0,
      agentLogs: [],
    },
  };
}

export function logAgentRun(ctx: SharedContext, agent: string, note: string): void {
  ctx.metadata.agentLogs.push({
    agent,
    timestamp: new Date().toISOString().slice(11, 19),
    note,
  });
}
