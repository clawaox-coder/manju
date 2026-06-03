import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clapperboard,
  MessageSquareText,
  Mic,
  Sparkles,
  UserCheck,
  Video,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { HeroWorkflowPreview } from '@/components/landing/HeroWorkflowPreview';
import { TechBackground } from '@/components/TechBackground';
import { getAccessToken } from '@/lib/api/tokens';

interface FlowCard {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const STEPS = [
  {
    number: '01',
    title: '说出你的故事线',
    desc: '一句灵感就够。AI 会补全角色、冲突、节奏，不用先写大纲。',
    tip: '写一个关于追梦的故事，主角是一名独立导演。',
    glow: 'from-[#a855f7]/40 via-[#6366f1]/30 to-slate-900',
  },
  {
    number: '02',
    title: '在画布上推演镜头',
    desc: '剧本、角色、分镜、配音和成片会在同一条工作流里连起来。',
    tip: '脚本、角色、分镜、视频都在一个工作流里同步生长。',
    glow: 'from-[#0891b2]/40 via-[#7c3aed]/30 to-slate-900',
  },
  {
    number: '03',
    title: '边聊边改到能发布',
    desc: '任何节点都能局部重写，创作不会因为返工而断掉。',
    tip: '把情绪再温暖一些，让结尾更有余韵。',
    glow: 'from-[#db2777]/40 via-[#8b5cf6]/30 to-slate-900',
  },
];

const FLOW: FlowCard[] = [
  { icon: MessageSquareText, title: '剧本创作', desc: '一句话开题，AI 给多个方向并继续扩写。' },
  { icon: Clapperboard, title: '分镜生成', desc: '自动拆镜并安排节奏，快速形成拍摄感。' },
  { icon: UserCheck, title: '角色一致性', desc: '角色形象跨镜头维持稳定，不再忽脸。' },
  { icon: Mic, title: '配音对白', desc: '音色、情绪、停顿可调，直接推进到可听版本。' },
  { icon: Video, title: '视频成片', desc: '从剧本到视频一条链路闭环，不再反复导出拼接。' },
];

export default function Landing() {
  const authed = !!getAccessToken();
  const primaryTo = authed ? '/home' : '/auth';
  const primaryLabel = authed ? '进入工作台' : '免费开始创作';
  const reduceMotion = useReducedMotion();

  const reveal = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: 'easeOut' as const },
  };

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[#09090b] text-foreground">
      <TechBackground />

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-[#09090b] shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">漫剧AI</span>
          </div>
          <div className="flex items-center gap-3">
            {!authed && (
              <Link to="/auth" className="text-sm text-white/60 transition hover:text-white">
                登录
              </Link>
            )}
            <Link
              to={primaryTo}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium text-[#09090b] shadow-[0_2px_12px_rgba(0,0,0,0.4)] transition hover:bg-white/90"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative">
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-20">
            <motion.div
              className="flex flex-col justify-center"
              initial={{ opacity: 0, x: reduceMotion ? 0 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
            >
              <motion.div
                className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur-sm"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
              >
                <WandSparkles className="h-3.5 w-3.5 text-white/60" />
                自然语言驱动的 AI 短剧创作
              </motion.div>
              <motion.h1
                className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease: 'easeOut' }}
              >
                <span className="text-white">
                  从一句想法，
                  <br />
                  进入短剧片场
                </span>
              </motion.h1>
              <motion.p
                className="mt-6 max-w-xl text-lg leading-8 text-white/60"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
              >
                漫剧AI 把剧本、分镜、角色、配音、视频生成整合进同一条工作流。
                你只需要描述故事，AI 就会把创作现场搭起来。
              </motion.p>
              <motion.div
                className="mt-8 flex flex-wrap items-center gap-3"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
              >
                <motion.div whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}>
                  <Link
                    to={primaryTo}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-medium text-[#09090b] shadow-[0_2px_16px_rgba(0,0,0,0.5)] transition hover:bg-white/90"
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
                <motion.a
                  href="#workflow"
                  className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/10"
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                >
                  查看流程
                </motion.a>
              </motion.div>
              <motion.div
                className="mt-10 grid gap-4 sm:grid-cols-3"
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: {
                    transition: {
                      staggerChildren: reduceMotion ? 0 : 0.08,
                      delayChildren: 0.3,
                    },
                  },
                }}
              >
                {[
                  ['零门槛创作', '自然语言即可开始'],
                  ['AI 全流程生成', '从脚本到视频一站式'],
                  ['你的创意主导', '随时调整，灵活掌控'],
                ].map(([title, desc]) => (
                  <motion.div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm"
                    variants={{
                      hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
                      show: { opacity: 1, y: 0 },
                    }}
                    whileHover={reduceMotion ? undefined : { y: -5, borderColor: 'rgba(255,255,255,0.3)' }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-white/55">{desc}</div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: reduceMotion ? 0 : 22 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
            >
              <div className="absolute -left-8 top-12 h-32 w-32 rounded-full bg-white/[0.06] blur-3xl" />
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/[0.04] blur-3xl" />
              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                transition={reduceMotion ? undefined : { duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <HeroWorkflowPreview />
              </motion.div>
              <motion.div
                className="absolute -bottom-6 -left-4 hidden max-w-[260px] rounded-3xl border border-white/10 bg-[#0e1730]/90 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.6)] backdrop-blur-md lg:block"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.38, ease: 'easeOut' }}
                whileHover={reduceMotion ? undefined : { y: -3 }}
              >
                <div className="text-xs text-white/45">创作提示</div>
                <div className="mt-2 text-sm font-medium text-white/90">
                  “一个关于追寻梦想的故事，女主是一名独立导演。”
                </div>
              </motion.div>
              <motion.div
                className="absolute -right-4 top-10 hidden rounded-3xl border border-white/10 bg-[#0e1730]/90 px-4 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.6)] backdrop-blur-md lg:block"
                initial={{ opacity: 0, y: reduceMotion ? 0 : -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.46, ease: 'easeOut' }}
                whileHover={reduceMotion ? undefined : { y: -3 }}
              >
                <div className="text-xs text-white/45">生成状态</div>
                <div className="mt-1 text-sm font-semibold text-emerald-300">剧本 + 分镜 + 配音联动中</div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-18 lg:px-8" id="workflow">
          <motion.div className="mx-auto max-w-2xl text-center" {...reveal}>
            <h2 className="text-4xl font-semibold tracking-tight text-white">三步，从想法到成片</h2>
            <p className="mt-3 text-sm leading-6 text-white/55">不是复杂的后台流程，而是一条能被创作者直接感知的工作线。</p>
          </motion.div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <motion.article
                key={step.number}
                className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-sm"
                {...reveal}
                transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.08, ease: 'easeOut' }}
                whileHover={reduceMotion ? undefined : { y: -6, borderColor: 'rgba(255,255,255,0.25)' }}
              >
                <div className="grid gap-4 p-6">
                  <div className="text-5xl font-semibold tracking-tight text-white/20">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">{step.desc}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[1.2fr_0.8fr] gap-3 border-t border-white/10 bg-white/[0.02] p-4">
                  <div className="rounded-2xl border border-white/10 bg-[#0d1426]/80 p-4 text-sm leading-6 text-white/70">
                    {step.tip}
                  </div>
                  <div className={`min-h-[92px] rounded-2xl border border-white/10 bg-gradient-to-br ${step.glow}`} />
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] px-6 py-12 backdrop-blur-sm sm:px-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.06),transparent_55%)]" />
            <div className="relative grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-white">一条流水线，全程在画布上</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-white/55">
                  每个环节都是画布上的一个节点。你可以随时回头改，Agent 会把改动继续传到后面的环节。
                </p>
              </div>
              <div
                data-testid="landing-flow-grid"
                className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
              >
                {FLOW.map((item) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
                      {...reveal}
                      transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.05, ease: 'easeOut' }}
                      whileHover={reduceMotion ? undefined : { y: -5, backgroundColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <h3 className="text-base font-semibold leading-6 text-white">{item.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-white/55">{item.desc}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <motion.section
          className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8"
          {...reveal}
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.18em] text-white/60">现在就开始你的第一部作品</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              让第一句话变成第一支短剧
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/55">
              一句话，几分钟，画面、对白和节奏都能开始动起来。
            </p>
          </div>
          <motion.div whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}>
            <Link
              to={primaryTo}
              className="inline-flex items-center gap-2 rounded-3xl bg-white px-8 py-4 text-sm font-medium text-[#09090b] shadow-[0_2px_20px_rgba(0,0,0,0.5)] transition hover:bg-white/90"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </motion.section>
      </main>
    </div>
  );
}
