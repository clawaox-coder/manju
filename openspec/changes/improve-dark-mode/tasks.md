## 1. 消除首屏闪白(FOUC)

- [x] 1.1 在 `index.html` 的 `<head>` 注入阻塞式内联脚本:读取 `localStorage['manju-store']`,解析 `state.theme`,据此在 React 挂载前给 `<html>` 加 `.dark`
- [x] 1.2 脚本对 JSON 缺失/损坏做防御性处理,异常时回退到 `prefers-color-scheme` 系统偏好,不抛错、不阻塞
- [ ] 1.3 验证:暗色用户刷新首帧即为暗色,无白闪;清空 localStorage 后刷新回退系统偏好正常

## 2. 重做暗色调色板与层级

- [x] 2.1 在 `src/index.css` 的 `.dark` 块替换为近黑基底调色板:background `#0a0a0b`、card/popover `#161618`/`#1e1e20`、secondary `#202022`、muted/accent `#26262a`、border `#2a2a2e`、sidebar `#0e0e10`
- [x] 2.2 校验文字/背景对比度满足正文可读性(foreground、muted-foreground 对各表面)
- [x] 2.3 将 `shadow-brand` 工具类从 `box-shadow: none` 改为暗色下的轻微 elevation 阴影(浅色模式行为按需保留)
- [ ] 2.4 验证:背景/卡片/浮层三层视觉可区分,侧边栏与背景不靠边框硬撑

## 3. 收敛主题逻辑到单一真相源

- [x] 3.1 让 `store.setTheme`(`src/store/index.ts`)只更新 `theme` 状态,移除其内部的 `classList.toggle`
- [x] 3.2 在 `src/hooks/useTheme.ts` 集中处理:订阅 store theme + `matchMedia`,统一投射 `.dark` class,导出 effective theme
- [x] 3.3 重构 `src/pages/Canvas/index.tsx`:消费集中计算的 effective theme 同步 tldraw `colorScheme`,删除其自带的重复 `matchMedia` 监听
- [ ] 3.4 验证:切换主题时 `.dark` 仅被更新一次;`auto` 下系统切换时页面与画布一致跟随

## 4. 清理硬编码颜色

- [x] 4.1 修复 `src/pages/Billing.tsx:142` 无效类名 `bg-muted0`,替换为正确 token
- [x] 4.2 将 `src/pages/ApiKeys.tsx:136` 写死的 `bg-gray-900 text-gray-100` 代码块改用主题 token
- [x] 4.3 盘点其余绕过 token 的硬编码用色(保留叠加在图像/缩略图上的语义性遮罩如 `bg-black/40`),按需收敛到 token
- [x] 4.4 验证:无效颜色类名清零;代码块在浅色/暗色下均协调

## 5. 整体验收

- [x] 5.1 运行构建/类型检查,确保无报错
- [ ] 5.2 在 light/dark/auto 三种主题下走查主要页面(Dashboard、Settings、Canvas、Billing、ApiKeys)视觉一致、无回归
