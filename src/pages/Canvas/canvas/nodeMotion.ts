import type { Transition } from 'framer-motion';

const STAGGER_S = 0.12;
const ENTER_DURATION_S = 0.28;
export const EXIT_DURATION_S = 0.24;

// Candidate node ids end in their index (e.g. "candidate-script-2",
// "candidate-shot-0-1") — use it to stagger the pop-in.
export function staggerIndexFromId(id: string): number {
  const m = id.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

interface Pose {
  opacity: number;
  scale: number;
  y: number;
}

interface MotionProps {
  initial: Pose;
  animate: Pose;
  transition: Transition;
}

// Mount + status-change animation for canvas nodes. The node stays mounted
// while its status changes, so framer-motion tweens the `animate` target:
//   candidate → pop in (staggered) at reduced opacity ("tentative")
//   selected  → settle to full opacity
//   leaving   → fade + shrink out (unchosen candidates after a pick)
//   settled/active/undefined → subtle entrance
export function nodeMotionProps(nodeStatus: string | undefined, id: string): MotionProps {
  const isCandidate = nodeStatus === 'candidate';
  const isLeaving = nodeStatus === 'leaving';

  const initial: Pose = { opacity: 0, scale: isCandidate ? 0.85 : 0.95, y: isCandidate ? 10 : 4 };

  let animate: Pose;
  if (isLeaving) animate = { opacity: 0, scale: 0.82, y: -6 };
  else if (isCandidate) animate = { opacity: 0.75, scale: 1, y: 0 };
  else animate = { opacity: 1, scale: 1, y: 0 };

  const transition: Transition = {
    duration: isLeaving ? EXIT_DURATION_S : ENTER_DURATION_S,
    delay: isCandidate ? staggerIndexFromId(id) * STAGGER_S : 0,
    ease: 'easeOut',
  };

  return { initial, animate, transition };
}
