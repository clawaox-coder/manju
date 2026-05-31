## Context

暗色模式现状(见 proposal):`<html>.dark` class 由 `store.setTheme`(`src/store/index.ts:152`)和 `useTheme`(`src/hooks/useTheme.ts`)各 toggle 一次;Canvas 页(`src/pages/Canvas/index.tsx:118`)另起一份 effect 同步 tldraw 的 `colorScheme`;`auto` 的 `matchMedia` 监听在 useTheme 与 Canvas 各一份。调色板定义在 `src/index.css` 的 `.dark` 块,纯黑 `#000000` 基底,表面层级灰度挤在 0~22,`shadow-brand` 被定义为 `box-shadow: none`。主题状态经 zustand persist 存于 `manju-store`。

约束:不改主题对外 API(`theme`/`setTheme`、`light|dark|auto`)与持久化 key;Tailwind v4 + `@custom-variant dark (&:is(.dark *))` 机制保持不变;tldraw 画布需跟随主题。

## Goals / Non-Goals

**Goals:**
- 首屏刷新无白闪(FOUC),暗色用户刷新直接是暗色。
- 调色板有清晰的 elevation 层级,观感不再扁平/廉价。
- 主题 → DOM/tldraw 的投射收敛到单一真相源,消除重复 toggle 与重复监听。
- 顺手修掉绕过 token 的硬编码用色(含 `bg-muted0` bug)。

**Non-Goals:**
- 不改浅色模式视觉(仅在必要时让被硬编码的点回归 token,顺带受益)。
- 不引入主题切换动画/过渡特效。
- 不新增第三套主题或自定义主题能力。
- 不改 tldraw 自身的内部配色,只切换其 light/dark 偏好。

## Decisions

**1. FOUC 用 `<head>` 内联阻塞脚本解决,而非 React 内。**
React 副作用最早也在首次绘制后才跑,必然晚。内联脚本读取 `localStorage['manju-store']`(zustand persist 的 JSON,取 `state.theme`),解析失败回退 `auto`/系统偏好,在解析 HTML 时同步给 `<html>` 加 `.dark`。替代方案 `prefers-color-scheme` 纯 CSS:不可行,因为用户可显式选 light/dark 覆盖系统。

**2. 调色板采用「真·近黑(中性)」+ 逐层 elevation。**
基底 `#0a0a0b`,card `#161618`、popover `#1e1e20`、secondary `#202022`、muted/accent `#26262a`、border `#2a2a2e`、sidebar `#0e0e10`。理由:纯黑会与白字产生 halation 且 OLED 拖影;层级靠「每升一层提亮一档」拉开。替代方案冷调深灰蓝已评估并舍弃,选中性以求稳重。

**3. 暗色恢复轻微 elevation 阴影。**
`shadow-brand` 不再 `none`,暗色下叠加低透明度深色阴影,与表面色差共同区分层级。替代方案纯靠色差:层级仍偏弱,故叠加阴影。

**4. 主题投射收敛为单一副作用。**
保留 `setTheme` 只更新 store 状态;由一处集中逻辑(订阅 store theme + `matchMedia`)统一投射 `.dark` 与 tldraw `colorScheme`。Canvas 仅消费已计算的 effective theme,不再自带监听。替代方案在 `setTheme` 里 toggle:无法覆盖 `auto` 下系统变化与刷新恢复,故选集中订阅。

## Risks / Trade-offs

- [内联脚本与 zustand persist 的存储格式耦合] → 脚本对 JSON 结构做防御性解析,任何异常回退到系统偏好;persist key/结构变更时需同步更新脚本(在 tasks 标注)。
- [近黑而非纯黑,OLED 省电略降] → 可接受,换取无 halation 与更佳层级,符合主流做法。
- [收敛主题逻辑触及 Canvas/tldraw 同步] → 保留 effective theme 推导,先验证画布明暗仍正确切换再删旧监听。
- [调色板大改可能波及个别依赖旧灰阶的硬编码点] → 同一 change 内一并盘点清理,降低视觉回归面。
