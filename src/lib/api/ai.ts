import { getAccessToken } from './tokens';

const AI_BASE = import.meta.env.VITE_PUBLIC_AI_API_BASE ?? 'http://localhost:8005';

export interface ScriptContinueInput {
  project_id: string;
  context: string;
  instruction: string;
}

export interface SSEEvent {
  event: 'start' | 'delta' | 'done' | 'error';
  data: Record<string, unknown>;
}

export async function streamScriptContinue(
  input: ScriptContinueInput,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
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
          onEvent({ event: currentEvent as SSEEvent['event'], data });
        } catch {}
      }
    }
  }
}
