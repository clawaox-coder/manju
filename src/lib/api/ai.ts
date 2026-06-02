import { getAccessToken } from './tokens';
import { request } from './client';

const AI_BASE = import.meta.env.VITE_PUBLIC_AI_API_BASE ?? 'http://localhost:8005';

// ---- SSE streaming (script continue) ----

export interface ScriptContinueInput {
  project_id: string;
  context: string;
  instruction: string;
}

export interface SSEEvent {
  event: 'start' | 'delta' | 'done' | 'error';
  data: Record<string, unknown>;
}

export async function* streamScriptContinue(
  input: ScriptContinueInput,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const token = getAccessToken();
  const res = await fetch(`${AI_BASE}/v1/ai/script/continue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `AI 请求失败: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取 SSE 流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        try {
          const data = JSON.parse(raw);
          yield { event: currentEvent as SSEEvent['event'], data };
        } catch { /* malformed SSE line, skip */ }
      }
    }
  }
}

// ---- Storyboard generate (background task) ----

export interface StoryboardGenerateInput {
  project_id: string;
  style?: string;
  shot_ids?: string[];
  regenerate_all?: boolean;
}

export interface AiTaskResponse {
  task_id: string;
  status: string;
}

export async function storyboardGenerate(input: StoryboardGenerateInput): Promise<AiTaskResponse> {
  return request<AiTaskResponse>('/v1/ai/storyboard/generate', {
    method: 'POST',
    body: input,
    base: AI_BASE,
  });
}

// ---- Task status polling ----

export interface AiTask {
  id: string;
  team_id: string;
  user_id: string;
  project_id: string | null;
  task_type: string;
  status: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export async function getAiTask(taskId: string): Promise<AiTask> {
  return request<AiTask>(`/v1/ai/tasks/${taskId}`, { base: AI_BASE });
}

// ---- TTS (Text-to-Speech) ----

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface TTSInput {
  text: string;
  voice: TTSVoice;
  speed?: number;
}

export async function generateTTS(params: TTSInput): Promise<Blob> {
  const token = getAccessToken();
  const res = await fetch(`${AI_BASE}/v1/ai/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail?.message || `TTS 生成失败: ${res.status}`);
  }
  return res.blob();
}

// ---- Intent Classification ----

export type IntentType = 'continue' | 'skip' | 'modify' | 'back' | 'off_topic' | 'clarify';

export interface IntentClassifyInput {
  message: string;
  stage: string;
  step: string;
  context: string;
}

export interface IntentResult {
  intent: IntentType;
  params: Record<string, string>;
  confidence: number;
}

export async function classifyIntent(input: IntentClassifyInput): Promise<IntentResult> {
  return request<IntentResult>('/v1/ai/intent/classify', {
    method: 'POST',
    body: input,
    base: AI_BASE,
  });
}

// ---- Voice Match ----

export interface VoiceMatchInput {
  project_id: string;
  content: string;
  auto_assign?: boolean;
}

export interface VoiceMatchEntry {
  character_name: string;
  voice_profile: { gender: string; age: string; tone: string };
  confidence: number;
}

export interface VoiceMatchResult {
  matches: VoiceMatchEntry[];
}

export async function voiceMatch(input: VoiceMatchInput): Promise<VoiceMatchResult> {
  return request<VoiceMatchResult>('/v1/ai/voice/match', {
    method: 'POST',
    body: input,
    base: AI_BASE,
  });
}

// ---- Conversational chat agent (POST /v1/ai/chat) ----
// The Canvas agent's free-form conversation. One request per turn; the backend
// LLM agent reasons about stage + context and returns a structured response:
// natural reply + dynamically-generated quick-reply options + extracted idea
// settings + an optional trigger to fire a production action.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  has_script?: boolean;
  has_shots?: boolean;
  has_voice?: boolean;
  has_video?: boolean;
  idea?: Record<string, string>;
}

export interface ChatInput {
  project_id?: string | null;
  stage: string;
  messages: ChatTurn[];
  context?: ChatContext;
}

export interface ChatTrigger {
  action: 'generate_script' | 'generate_storyboard' | 'match_voice' | 'render_video';
  params?: Record<string, unknown>;
}

export interface ChatResponse {
  thinking: string;
  reply: string;
  options: { label: string; value: string }[];
  extracted: Record<string, string>;
  trigger: ChatTrigger | null;
}

export async function chat(input: ChatInput): Promise<ChatResponse> {
  // ai-gateway returns a raw JSON body (no {data} envelope), so we fetch
  // directly rather than going through request() which unwraps .data.
  const token = getAccessToken();
  const res = await fetch(`${AI_BASE}/v1/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: { message?: string } })?.detail;
    throw new Error(detail?.message || `对话请求失败: ${res.status}`);
  }
  return res.json() as Promise<ChatResponse>;
}

// ---- Title generation (POST /v1/ai/title) ----
// 用用户的第一句话生成一个简短的项目/对话标题。返回裸 JSON {title}。

export interface TitleInput {
  message: string;
  project_id?: string | null;
}

export interface TitleResponse {
  title: string;
}

export async function generateTitle(input: TitleInput): Promise<TitleResponse> {
  const token = getAccessToken();
  const res = await fetch(`${AI_BASE}/v1/ai/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: { message?: string } })?.detail;
    throw new Error(detail?.message || `标题生成失败: ${res.status}`);
  }
  return res.json() as Promise<TitleResponse>;
}
