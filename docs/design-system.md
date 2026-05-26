---
doc: design-system
scope: [frontend]
applies-to:
  - "src/components/ui/**/*.tsx"
  - "src/components/layout/**/*.tsx"
  - "src/components/domain/**/*.tsx"
  - "src/pages/**/*.tsx"
  - "src/index.css"
audience: [frontend-agent, ui-agent]
priority: high
depends-on: [coding-standards]
provides: [design-tokens, component-rules, motion-rules, a11y-rules]
purpose: 设计契约. agent 写 UI 组件 / 页面前必读. 改 token 或新增组件先改本文档.
last-verified: 2026-05-24
---

# 设计系统

## 1. 设计原则 (must follow)

```yaml
brand-voice:    "轻量 + 友好, 不专业感压迫"
ai-marker:      "任何 AI 加速点必带 Sparkles ✨ 图标"
feedback:       "破坏性动作必有 confirm; 普通动作必有 toast"
keyboard-first: "全键盘可达, 焦点环可见"
density:        "信息密但留白足"
```

## 2. 颜色 Token

### 2.1 Brand Purple

```yaml
brand-50:   "#f5f3ff"   # 高亮背景
brand-100:  "#ede9fe"   # hover / 选中态
brand-300:  "#c4b5fd"   # 边框 / 焦点环
brand-500:  "#8b5cf6"   # 强调
brand-600:  "#7c3aed"   # 主色 (按钮/链接) ★
brand-700:  "#6d28d9"   # 主色 hover
```

### 2.2 Gradients

```css
gradient-purple        : linear-gradient(135deg, #7c3aed, #ec4899)
gradient-purple-soft   : linear-gradient(135deg, #ede9fe, #fce7f3)
```

```yaml
usage:
  gradient-purple:      [logo, primary-CTA, AI-icons, hero-card]
  gradient-purple-soft: [active-nav-item, AI-tip-card, sidebar-promo]
```

### 2.3 Semantic Tokens (oklch, src/index.css)

| token | light | dark | use |
|---|---|---|---|
| background | `oklch(1 0 0)` | `oklch(.145 0 0)` | page bg |
| foreground | `oklch(.145 0 0)` | `oklch(.985 0 0)` | primary text |
| card | `oklch(1 0 0)` | `oklch(.205 0 0)` | card bg |
| muted | `oklch(.97 0 0)` | `oklch(.269 0 0)` | weak bg |
| muted-foreground | `oklch(.556 0 0)` | `oklch(.708 0 0)` | secondary text |
| accent | `oklch(.97 0 0)` | `oklch(.269 0 0)` | hover bg |
| border | `oklch(.922 0 0)` | `oklch(.269 0 0)` | borders |
| destructive | `oklch(.577 .245 27.3)` | same | error |
| primary | `brand-600` | `brand-500` | actions |

### 2.4 State Colors (限定 shade, 不自由用)

```yaml
success: { text: text-green-600,  bg: bg-green-50 }
warning: { text: text-yellow-700, bg: bg-yellow-50 }
error:   { text: text-red-600,    bg: bg-red-50 }
info:    { text: text-blue-600,   bg: bg-blue-50 }
```

### 2.5 Placeholder Gradients (装饰图)

```yaml
scene-bg-1 ~ scene-bg-7, scene-bg-hero    # 场景占位
char-bg-1 ~ char-bg-6                     # 角色头像占位
```

### 2.6 对比度 (硬性)

```yaml
text-on-bg:       ">=7:1 (WCAG AAA)"
large-text:       ">=4.5:1"
border-on-bg:     ">=3:1"
dark-mode-audit:  "all pages, manually verified"
```

## 3. 字号

```yaml
font-family: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif"
no-web-fonts: true   # 不加载额外字体, 用系统字体

scale:
  text-[10px]:  "10px - 标签角标"
  text-[11px]:  "11px - 时间戳"
  text-xs:      "12px - 次要信息, label"
  text-sm:      "14px - DEFAULT body"
  text-base:    "16px - 标题强调"
  text-lg:      "18px - 二级标题"
  text-xl:      "20px - 页面标题 H1"
  text-2xl:     "24px - 统计大数字"
  text-3xl:     "30px - 价格"
  text-4xl:     "36px - hero"

weight:
  font-normal:    "400 - body"
  font-medium:    "500 - label"
  font-semibold:  "600 - heading, button"
  font-bold:      "700 - hero, key number"

leading:
  body:     leading-relaxed (1.625)
  heading:  leading-tight (1.25)
  list:     leading-snug (1.375)
```

## 4. 间距 / 圆角 / 阴影

```yaml
spacing-gap:
  gap-1, gap-1.5:   "icon 紧贴文本"
  gap-2:            "button 内 icon-label (8px)"
  gap-3:            "紧凑列表项 (12px)"
  gap-4:            "常规网格 (16px)"
  gap-5:            "card 内部 (20px)"
  gap-6:            "大块 (24px)"

page-padding:
  mobile:   "p-4 (16px)"
  desktop:  "p-6 (24px)"
  max-width: "max-w-7xl mx-auto (=1280px)"

card-padding:
  list-item:   p-3
  default:     p-4
  large:       p-5 ~ p-6

radius:
  rounded:       "4px - chip, kbd"
  rounded-md:    "6px - sm button"
  rounded-lg:    "8px - input, default button"
  rounded-xl:    "12px - card, dialog ★"
  rounded-2xl:   "16px - hero, plan card"
  rounded-full:  "9999px - avatar, chip, switch"

shadow:
  shadow-sm:    "card default"
  shadow-md:    "button hover"
  shadow-lg:    "dropdown, popover"
  shadow-xl:    "dialog"
  shadow-2xl:   "video preview, hero overlay"
  shadow-purple: "0 8px 24px -8px rgb(124 58 237 / .4)  # brand button"
```

## 5. 组件规则

### 5.1 Button

```yaml
variants:  [default, secondary, outline, ghost, destructive, link]
sizes:     [sm, default, lg, icon]
default-cta:        variant=default (gradient)
secondary-action:   variant=outline
table-action:       variant=ghost
destructive:        variant=destructive (red)
icon-button:        size=icon (40x40)

rules:
  - "button 内 icon size=w-3.5 h-3.5 (sm) | w-4 h-4 (default) | w-5 h-5 (lg)"
  - "primary CTA 每页面最多 1 个"
  - "destructive button 总是放右"
```

### 5.2 Card

```yaml
default:    "rounded-xl border border-border bg-card shadow-sm"
list-item:  p-3
info-card:  p-4
setting:    p-5
hero:       p-6
hover:      "添加 hover:shadow-md transition"
```

### 5.3 Badge

```yaml
variants:  [default, secondary, outline, success, warning, destructive, gray]
size:      "text-[10px] font-medium px-2 py-0.5"
position:  "absolute top-2 left-2 (image overlay) | inline (next to text)"
```

### 5.4 Dialog

```yaml
default-max-width:   max-w-lg
confirm-max-width:   max-w-md
form-max-width:      max-w-lg
content-rich:        max-w-2xl
shortcuts-or-settings: max-w-3xl

structure:
  - DialogHeader > DialogTitle (text-lg font-bold)
  - DialogHeader > DialogDescription (text-sm text-muted-foreground)
  - body
  - DialogFooter (right-aligned, destructive on right)

a11y:
  - "Radix 自带焦点陷阱 + ESC 关闭 + aria-modal"
  - "title 必填"
```

### 5.5 表单元素

```yaml
Input:
  height:   h-9
  radius:   rounded-lg
  border:   "border border-border bg-card"
  focus:    "ring-2 ring-ring/50"
  invalid:  "border-red-500"

Switch:
  off:      bg-muted
  on:       gradient-purple

Slider:
  track:    bg-muted
  range:    gradient-purple
  thumb:    "border-2 border-primary bg-card"
```

### 5.6 表格

```yaml
header:
  classes:  "bg-muted text-xs text-muted-foreground"
  weight:   font-medium

row:
  classes:  "border-t border-border/50 hover:bg-accent/50"

cell-padding: "px-5 py-3"
action-column: "text-right, use variant=ghost size=sm"
```

### 5.7 图标 (lucide-react)

```yaml
sizes:
  inline-xs:       "w-3 h-3"      # text-xs 内
  button-default:  "w-3.5 h-3.5 (sm) | w-4 h-4 (default)"
  button-large:    "w-5 h-5 (lg)"
  hero:            "w-6 h-6 ~ w-8 h-8"
  avatar:          "w-12 h-12"

colors:
  default:    text-muted-foreground
  primary:    text-brand-600
  state:      "text-{state}-600 with bg-{state}-50"

required-icons:
  ai-action:  Sparkles (mandatory)
  loading:    Loader2 + animate-spin
  destructive: Trash2 / AlertTriangle
```

## 6. 动效

```yaml
duration:
  micro:        "80-150ms - hover, button press"
  default:      "180-220ms - page transition, card enter"
  dialog:       "300-450ms - modal open, drawer slide"
  forbid:       ">500ms (perceived as lag)"

easing:
  default:      ease-out (cubic-bezier(0, 0, .2, 1))
  spring:       "stiffness=300 damping=20 (framer-motion)"

patterns:
  list-stagger:
    pattern: |
      {items.map((it, i) => (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
        />
      ))}

  card-hover:
    pattern: "<motion.div whileHover={{ y: -4 }} transition={{ type:'spring', stiffness:300, damping:20 }} />"

route-transition:
  forbidden: "AnimatePresence wrapping <Outlet />"
  reason:    "与 Suspense + lazy chunks 冲突, 见 src/components/layout/AppShell.tsx 注释"
  alternative: "页面内自己做入场动画"

respect-reduced-motion:
  rule: "if (matchMedia('(prefers-reduced-motion: reduce)').matches) disable all"
```

## 7. 响应式断点

```yaml
breakpoints:
  sm:   640px    # 大手机
  md:   768px    # 平板竖
  lg:   1024px   # 平板横, 笔记本 ★ 主要适配点
  xl:   1280px   # 桌面
  2xl:  1536px   # 大显示器

grid-density:
  projects:  "lg:grid-cols-4 md:grid-cols-3 grid-cols-2"
  characters: "lg:grid-cols-4 md:grid-cols-3 grid-cols-2"
  props:     "lg:grid-cols-6 md:grid-cols-4 grid-cols-2"
  templates: "lg:grid-cols-4 md:grid-cols-2 grid-cols-1"

sidebar:
  desktop:   "fixed 224px (w-56), 始终可见"
  tablet/mobile: "drawer, 从左滑入, bg-black/50 overlay"

header:
  height:    h-16 (fixed 64px)
  mobile:    "logo 文字隐藏, 只留图标; 搜索折叠到下拉"
```

## 8. 文案规范

```yaml
voice:
  - "简洁直接: '删除项目' 不是 '是否确认删除该项目'"
  - "用户视角: '已加入回收站' 不是 '已执行删除操作'"
  - "错误友好: 告知 what + how-to-fix"
  - "禁用装饰: 不要 '超棒的新功能 ✨'"

punctuation:
  - "中文用全角逗号 / 句号"
  - "中英混排留 1 空格"
  - "数字与单位留空格: '24 GB', '6 个'"

formats:
  number:    "toLocaleString(): 284,000"
  percent:   "0 小数: 78%"
  filesize:  "1.5 MB (不是 1500 KB)"
  time:
    same-day:    "5 分钟前 / 2 小时前"
    last-week:   "昨天 / 3 天前"
    older:       "2026-05-23"
```

## 9. 可访问性

```yaml
focus-ring:
  classes:    "focus-visible:ring-2 focus-visible:ring-ring/50"
  rule:       "all interactive elements"

aria:
  modal:      'aria-modal="true" + focus trap (Radix 自带)'
  toast:      'role="status" + aria-live="polite"'
  icon-button: 'aria-label 必填'

keyboard:
  tab-order:  "符合视觉阅读顺序"
  escape:     "关闭弹层"
  arrow:      "列表移动"
  enter:      "确认"
  space:      "toggle / play-pause"

screen-reader:
  aria-live:  "状态变化用 aria-live='polite'"
  alt-text:   "图片必有 alt, 装饰图 alt=''"
  label:      "form 字段必有关联 <label>"
```

## 10. 暗色主题

```yaml
class-on:        html (不在 body)
hook:            src/hooks/useTheme.ts
auto-follow:     "theme='auto' 监听 prefers-color-scheme"
persist:         "zustand persist (manju-store)"

design:
  - "不是单纯反色, semantic token 单独定义"
  - "高亮色降饱和度 (避免荧光)"
  - "阴影变浅 (深色背景上不需要强阴影)"
  - "渐变保留, 但底色深 (from-purple-950/30)"
  - "卡片用 bg-card 而非纯黑, 层次清晰"

audit-required:
  - "所有 21 页面必须手动审查"
  - "重点: 图表色 / 占位渐变 / 头像 / 状态标签"
```

## 11. 组件检查清单 (写新组件前)

```yaml
must-have:
  - props 类型完整 (interface + JSDoc)
  - forwardRef + displayName
  - className 透传 (用 cn() 合并)
  - 浅色 + 暗色双版本通过审查
  - 焦点环 + 键盘导航
  - aria 标签
  - 加载状态 + 错误状态 + 空状态
  - 移动端响应式

文件位置:
  shadcn 原语:    src/components/ui/<name>.tsx
  布局:           src/components/layout/<Name>.tsx
  业务组件:       src/components/domain/<Name>.tsx

命名:
  files:        kebab-case (button.tsx)
  components:   PascalCase (Button)
  props-iface:  <Name>Props (ButtonProps)
```

## 12. 禁止事项

```yaml
forbidden:
  - "AnimatePresence 包 <Outlet />"                # 见 §6
  - "h-full 在 motion.div 直接子元素 (高度坍缩)"
  - "color 用 hex 字面量 (必须用 token)"
  - "spacing 用 px (除非组件级)"
  - "新加 web font (用系统字体)"
  - "全局样式 (除 src/index.css)"
  - "!important (除非 sonner 等三方库覆盖)"
  - "z-index > 100 (modal 50, overlay 100 顶)"
  - "硬编码中文文案 (P1 后用 i18n)"
  - "在组件里直接 fetch (用 hooks 或 api client)"
```
