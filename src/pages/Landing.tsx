import { Link } from 'react-router-dom';
import {
  Sparkles, ArrowRight, MessageSquareText, FileText, LayoutGrid,
  UserCheck, Mic, Video, type LucideIcon,
} from 'lucide-react';
import { getAccessToken } from '@/lib/api/tokens';

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const PIPELINE: Feature[] = [
  { icon: FileText, title: '剧本创作', desc: '一句话开题，AI 续写、改写、给多个方向。' },
  { icon: LayoutGrid, title: '分镜生成', desc: '剧本自动拆解成分镜，画面节奏一目了然。' },
  { icon: UserCheck, title: '角色一致性', desc: '角色形象跨镜头保持稳定，不再忽脸。' },
  { icon: Mic, title: '配音对白', desc: '匹配音色、生成配音，情绪和节奏可调。' },
  { icon: Video, title: '视频生成', desc: '一键合成成片，导出可直接发布的短剧。' },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: '01', title: '说出你的想法', desc: '用自然语言描述故事，不用填表、不用分步骤。' },
  { n: '02', title: 'AI 在画布上展开', desc: '剧本、角色、分镜、配音、视频在一个画布里生长。' },
  { n: '03', title: '边聊边改，直到满意', desc: '点任意节点局部修改，Agent 驱动整条流水线。' },
];

export default function Landing() {
  const authed = !!getAccessToken();
  const primaryTo = authed ? '/home' : '/auth';
  const primaryLabel = authed ? '进入创作台' : '免费开始创作';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-20 flex items-center justify-between px-6 lg:px-10 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[linear-gradient(135deg,#111827,#2563eb)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">漫剧AI</span>
        </div>
        <div className="flex items-center gap-2">
          {!authed && (
            <Link to="/auth" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              登录
            </Link>
          )}
          <Link to={primaryTo} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
            {primaryLabel}
          </Link>
        </div>
      </nav>
      {/* PLACEHOLDER_BODY */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(37,99,235,0.12),transparent_45%)]" />
        <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground mb-6">
            <MessageSquareText className="w-3 h-3" />
            自然语言驱动的 AI 短剧创作
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight mb-5">
            把一句想法，<br className="hidden sm:block" />变成一部完整短剧
          </h1>
          <p className="text-base text-muted-foreground leading-7 max-w-xl mx-auto mb-8">
            不用填表、不用分步骤。在一张无限画布上，剧本、角色、分镜、配音、视频
            由 AI 一起生长，你只管聊，剩下的交给 Agent。
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to={primaryTo}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition"
            >
              {primaryLabel}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how"
              className="rounded-xl border border-border px-6 py-3 text-sm hover:bg-accent transition"
            >
              看看怎么用
            </a>
          </div>
        </div>
      </section>
      {/* PLACEHOLDER_SECTIONS */}
      <section id="how" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-semibold text-center mb-3">三步，从想法到成片</h2>
        <p className="text-sm text-muted-foreground text-center mb-12">没有学习曲线，会说话就会用。</p>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-card/50 p-6">
              <div className="text-3xl font-bold text-primary/30 mb-3">{s.n}</div>
              <h3 className="text-base font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-6">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold text-center mb-3">一条流水线，全程在画布上</h2>
          <p className="text-sm text-muted-foreground text-center mb-12">每个环节都是画布上的一个节点，随时回头改。</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PIPELINE.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-2xl border border-border bg-background p-5 hover:border-primary/40 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1.5">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-5">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {/* PLACEHOLDER_FOOTER */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">现在就开始你的第一部作品</h2>
        <p className="text-sm text-muted-foreground mb-8">一句话，几分钟，画布上见。</p>
        <Link
          to={primaryTo}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-7 py-3.5 text-sm font-medium hover:opacity-90 transition"
        >
          {primaryLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>漫剧AI · 自然语言驱动的短剧创作</span>
          </div>
          <span>© 2026 漫剧AI</span>
        </div>
      </footer>
    </div>
  );
}
