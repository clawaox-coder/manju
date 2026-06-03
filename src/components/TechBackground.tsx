// 纯黑极简背景（参考 OiiOii）：home / landing 共用。放在 relative 根容器内作首个子元素，内容用 relative z-10 叠其上。
// 高质感来自克制，不堆特效：干净纯黑 + 极克制顶光（避免死黑）+ 极淡 noise（消 banding）。

// 细密噪点（SVG feTurbulence），低透明度叠加用，消除深色 banding。
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export function TechBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 纯黑基底 */}
      <div className="absolute inset-0 bg-[#09090b]" />
      {/* 极克制顶部冷光：几乎不可见，仅避免死黑、给一点纵深 */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(90% 45% at 50% -15%, rgba(124,92,246,0.10), transparent 60%)' }}
      />
      {/* noise grain：消 banding + 胶片质感 */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-soft-light"
        style={{ backgroundImage: NOISE }}
      />
    </div>
  );
}
