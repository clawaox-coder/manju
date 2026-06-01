import { motion } from 'framer-motion';
import foxUrl from '@/assets/agents/fox.png';
import owlUrl from '@/assets/agents/owl.png';
import tigerUrl from '@/assets/agents/tiger.png';
import catUrl from '@/assets/agents/cat.png';
import beaverUrl from '@/assets/agents/beaver.png';

// AI 身份头像：按阶段换角色（创意总监🦊/编剧🦉/导演🐯/声优🐱/剪辑🦫）。
// 形象用微软 Fluent Emoji（MIT，可商用），3D 萌系、风格统一、辨识度高；
// framer-motion 加轻动效（常态浮动，思考/生成时更活泼）。

export type AgentRole = 'idea' | 'script' | 'storyboard' | 'voice' | 'video';

export const AGENT_META: Record<AgentRole, { name: string; emoji: string; src: string }> = {
  idea: { name: '创意总监', emoji: '🦊', src: foxUrl },
  script: { name: '编剧', emoji: '🦉', src: owlUrl },
  storyboard: { name: '导演', emoji: '🐯', src: tigerUrl },
  voice: { name: '声优', emoji: '🐱', src: catUrl },
  video: { name: '剪辑', emoji: '🦫', src: beaverUrl },
};

interface Props {
  role: AgentRole;
  size?: number;
  /** 思考/生成中：动效更活泼。 */
  busy?: boolean;
}

export function AgentAvatar({ role, size = 30, busy = false }: Props) {
  const meta = AGENT_META[role] ?? AGENT_META.idea;
  return (
    <motion.img
      src={meta.src}
      alt={meta.name}
      draggable={false}
      style={{ width: size, height: size }}
      className="shrink-0 select-none object-contain"
      animate={busy ? { y: [0, -3, 0], rotate: [0, -5, 5, 0] } : { y: [0, -2, 0] }}
      transition={{ duration: busy ? 1.1 : 3, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
