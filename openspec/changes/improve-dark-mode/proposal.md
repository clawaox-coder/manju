## Why

当前暗色模式能用,但观感偏「廉价」,有三个具体成因:首屏刷新时会闪一道白光(FOUC);调色板用纯黑 `#000000` 做基底且三个表面层级灰度挤在一起、缺乏 elevation 层次;主题切换逻辑散落在 store、useTheme、Canvas 三处并重复执行。这些一起让界面显得扁平、不精致。现在产品已进入打磨阶段,暗色是创作者长时间使用的主要场景,值得一次性收敛修正。

## What Changes

- **消除首屏闪白(FOUC)**:在 `index.html` 的 `<head>` 注入阻塞式内联脚本,在 React 挂载前依据 localStorage 中的主题立即给 `<html>` 加上 `.dark`,刷新不再先白后黑。
- **重做暗色调色板**:采用「真·近黑(中性)」基底 `#0a0a0b`,并按 elevation 思路逐层提亮一档(card `#161618` → popover `#1e1e20` → secondary `#202022` → muted/accent `#26262a`),border 提亮到 `#2a2a2e`,sidebar `#0e0e10` 与背景拉开,不再纯靠 border 撑边界。
- **恢复暗色 elevation 阴影**:`shadow-brand` 不再是 `none`,卡片/浮层在暗色下叠加轻微阴影,配合表面色差区分层级。
- **收敛主题逻辑到单一真相源**:`<html>` 的 `.dark` class 与 tldraw `colorScheme` 由一处集中副作用统一投射,消除 `store.setTheme` 与 `useTheme` 的重复 toggle,`auto` 的 `matchMedia` 监听只保留一份。
- **清理散落的硬编码颜色**:修复 `Billing.tsx` 中无效的 `bg-muted0` 拼写;`ApiKeys.tsx` 写死的 `bg-gray-900 text-gray-100` 代码块改用主题 token;盘点其余绕过 token 的硬编码用色。

## Capabilities

### New Capabilities
- `dark-mode`: 暗色模式的完整行为契约 —— 主题状态与持久化、首屏无闪烁应用、调色板与 elevation 层级、主题逻辑的单一真相源、跨组件(含 tldraw 画布)的一致投射。

### Modified Capabilities
<!-- 无既有 spec,首个 change -->

## Impact

- **样式**:`src/index.css`(`.dark` 调色板、`shadow-brand` 工具类)。
- **入口**:`index.html`(新增防闪烁内联脚本)。
- **主题逻辑**:`src/store/index.ts`(`setTheme`)、`src/hooks/useTheme.ts`、`src/pages/Canvas/index.tsx`(tldraw 偏好同步)收敛为单一副作用。
- **组件硬编码**:`src/pages/Billing.tsx`、`src/pages/ApiKeys.tsx` 等绕过 token 的用色点。
- **无破坏性变更**:主题 API(`theme`/`setTheme`、`light|dark|auto`)与持久化 key(`manju-store`)保持不变。
