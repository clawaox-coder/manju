import type {
  Shot,
  Character,
  MusicTrack,
  SfxClip,
  Notification,
  ConsistencyEntry,
  Prop,
  Scene,
  Voice,
  ApiKey,
  Invoice
} from '@/types';

// 注: initialProjects / initialDrafts / initialShared / initialTrash 已由后端 project-service 取代,
// 见 src/hooks/useProjectApi.ts. 这里只保留尚无后端的领域 (assets/scripts/notifications/...) 的 mock,
// 等 T-007/T-008/notification-service 上线时各自删除对应条目.

export const initialShots: Shot[] = [
  { id: 1, num: '01', title: '场景 1 · 颁奖现场', type: '中景', duration: 5, dialog: '"恭喜林夕, 获得最佳新人奖!"', bg: 'scene-bg-hero' },
  { id: 2, num: '02', title: '场景 2 · 后台特写', type: '特写', duration: 3, dialog: '"这一刻我等了三年..."', bg: 'scene-bg-2' },
  { id: 3, num: '03', title: '场景 3 · 化妆间', type: '近景', duration: 4, dialog: '"妈, 我做到了!"', bg: 'scene-bg-1' },
  { id: 4, num: '04', title: '场景 4 · 记者采访', type: '中景', duration: 6, dialog: '"请问下一步的计划是?"', bg: 'scene-bg-4' },
  { id: 5, num: '05', title: '场景 5 · 城市夜景', type: '远景', duration: 5, dialog: '(无对白 · 抒情BGM)', bg: 'scene-bg-3' },
  { id: 6, num: '06', title: '场景 6 · 家中回忆', type: '中景', duration: 7, dialog: '"奶奶, 我得奖了..."', bg: 'scene-bg-5' }
];

export const initialCharacters: Character[] = [
  { id: 1, name: '林夕', desc: '女主角 · 23岁 · 演员', tags: [{ label: '温柔', color: 'pink' }, { label: '坚强', color: 'purple' }], appearsIn: 5, bg: 'char-bg-2', avatar: '👩' },
  { id: 2, name: '顾沉舟', desc: '男主角 · 28岁 · 导演', tags: [{ label: '霸总', color: 'indigo' }, { label: '深情', color: 'blue' }], appearsIn: 3, bg: 'char-bg-3', avatar: '🧑' },
  { id: 3, name: '秋月奶奶', desc: '配角 · 65岁 · 长辈', tags: [{ label: '慈祥', color: 'orange' }], appearsIn: 1, bg: 'char-bg-1', avatar: '👵' },
  { id: 4, name: '记者甲', desc: '群演 · 30岁', tags: [{ label: '路人', color: 'gray' }], appearsIn: 2, bg: 'char-bg-4', avatar: '🧔' },
  { id: 5, name: '小蓝', desc: '助理 · 22岁', tags: [{ label: '可爱', color: 'pink' }, { label: '活泼', color: 'green' }], appearsIn: 2, bg: 'char-bg-5', avatar: '👧' },
  { id: 6, name: '反派陆寒', desc: '反派 · 32岁', tags: [{ label: '腹黑', color: 'gray' }], appearsIn: 1, bg: 'char-bg-6', avatar: '🧛' }
];

export const initialMusic: MusicTrack[] = [
  { id: 1, name: '追光者 (影视氛围版)', cat: '抒情', mood: '励志', dur: '3:24', bpm: 92 },
  { id: 2, name: '夜空中最亮的星', cat: '流行', mood: '感动', dur: '4:12', bpm: 88 },
  { id: 3, name: '青空 (轻音乐版)', cat: '轻音乐', mood: '治愈', dur: '2:48', bpm: 76 },
  { id: 4, name: '霓虹深处', cat: '电子', mood: '紧张', dur: '3:56', bpm: 128 },
  { id: 5, name: '故乡的云', cat: '中国风', mood: '怀旧', dur: '4:30', bpm: 72 },
  { id: 6, name: '盛夏的果实', cat: '抒情', mood: '甜蜜', dur: '3:18', bpm: 84 },
  { id: 7, name: '时光列车', cat: '电子', mood: '梦幻', dur: '5:02', bpm: 110 },
  { id: 8, name: '清晨的雨滴', cat: '轻音乐', mood: '宁静', dur: '2:34', bpm: 68 }
];

export const initialSfx: SfxClip[] = [
  { id: 1, name: '门铃响', cat: '生活', mood: '日常', dur: '0:02' },
  { id: 2, name: '掌声爆发', cat: '人群', mood: '热烈', dur: '0:05' },
  { id: 3, name: '闪光灯连闪', cat: '场景', mood: '紧张', dur: '0:04' },
  { id: 4, name: '心跳加速', cat: '情绪', mood: '紧张', dur: '0:08' },
  { id: 5, name: '落雨声', cat: '自然', mood: '忧伤', dur: '0:30' },
  { id: 6, name: '转场嗖声', cat: '转场', mood: '快速', dur: '0:01' },
  { id: 7, name: '微信提示音', cat: 'UI', mood: '日常', dur: '0:01' },
  { id: 8, name: '打耳光', cat: '动作', mood: '激烈', dur: '0:02' },
  { id: 9, name: '电梯叮', cat: '生活', mood: '日常', dur: '0:01' },
  { id: 10, name: '高跟鞋走路', cat: '脚步', mood: '优雅', dur: '0:06' }
];

export const initialNotifications: Notification[] = [
  { id: 1, icon: 'check', color: 'green', title: '渲染完成', body: '「都市修仙」V3 已渲染完成 · 1080P', time: '5 分钟前', read: false },
  { id: 2, icon: 'user', color: 'purple', title: '林夕 评论了你的项目', body: '"第 3 镜的转场可以再快一点"', time: '20 分钟前', read: false },
  { id: 3, icon: 'star', color: 'yellow', title: '套餐即将到期', body: '当前团队版将于 6 月 15 日续费', time: '2 小时前', read: false },
  { id: 4, icon: 'check', color: 'green', title: 'AI 分镜生成完成', body: '已为「霓虹酒吧的秘密」生成 24 个分镜', time: '昨天', read: true }
];

export const initialConsistency: ConsistencyEntry[] = [
  { name: '林夕', avatar: '👩', bg: 'char-bg-2', score: 96, issues: 0, appearsIn: 5 },
  { name: '顾沉舟', avatar: '🧑', bg: 'char-bg-3', score: 88, issues: 1, appearsIn: 3, issueDetails: ['场景 3 中, 顾沉舟服装颜色与场景 4 不一致'] },
  { name: '记者甲', avatar: '🧔', bg: 'char-bg-4', score: 74, issues: 2, appearsIn: 2, issueDetails: ['场景 4 出场记者外貌存在轻微差异', '发型描述与人设卡不符'] },
  { name: '秋月奶奶', avatar: '👵', bg: 'char-bg-1', score: 98, issues: 0, appearsIn: 1 }
];

export const initialProps: Prop[] = [
  { id: 1, name: '金奖杯', cat: '道具', uses: 14, icon: '🏆', bg: 'char-bg-1' },
  { id: 2, name: '红色玫瑰', cat: '道具', uses: 32, icon: '🌹', bg: 'char-bg-2' },
  { id: 3, name: '宝剑', cat: '武器', uses: 8, icon: '⚔️', bg: 'char-bg-3' },
  { id: 4, name: '手机', cat: '电子', uses: 48, icon: '📱', bg: 'char-bg-4' },
  { id: 5, name: '笔记本电脑', cat: '电子', uses: 22, icon: '💻', bg: 'char-bg-5' },
  { id: 6, name: '咖啡杯', cat: '道具', uses: 38, icon: '☕', bg: 'char-bg-6' },
  { id: 7, name: '红毯', cat: '场景道具', uses: 6, icon: '📜', bg: 'char-bg-1' },
  { id: 8, name: '蛋糕', cat: '食物', uses: 12, icon: '🎂', bg: 'char-bg-2' },
  { id: 9, name: '戒指', cat: '饰品', uses: 18, icon: '💍', bg: 'char-bg-3' },
  { id: 10, name: '雨伞', cat: '道具', uses: 24, icon: '☂️', bg: 'char-bg-4' },
  { id: 11, name: '信件', cat: '道具', uses: 15, icon: '💌', bg: 'char-bg-5' },
  { id: 12, name: '相机', cat: '电子', uses: 9, icon: '📷', bg: 'char-bg-6' }
];

export const initialScenes: Scene[] = [
  { id: 1, name: '繁华都市夜景', cat: '室外', uses: 32, bg: 'scene-bg-3' },
  { id: 2, name: '电影片场', cat: '室内', uses: 18, bg: 'scene-bg-hero' },
  { id: 3, name: '化妆间', cat: '室内', uses: 12, bg: 'scene-bg-2' },
  { id: 4, name: '颁奖典礼舞台', cat: '室内', uses: 8, bg: 'scene-bg-4' },
  { id: 5, name: '古风庭院', cat: '古风', uses: 24, bg: 'scene-bg-1' },
  { id: 6, name: '校园教室', cat: '室内', uses: 18, bg: 'scene-bg-5' },
  { id: 7, name: '海边日落', cat: '自然', uses: 9, bg: 'scene-bg-6' },
  { id: 8, name: '霓虹酒吧', cat: '室内', uses: 6, bg: 'scene-bg-7' }
];

export const initialVoices: Voice[] = [
  { id: 1, name: '苏瑶', desc: '温柔女声 · 23岁', tags: [{ label: '温柔', color: 'pink' }, { label: '情感', color: 'purple' }], bg: 'char-bg-2', icon: '👩' },
  { id: 2, name: '墨白', desc: '磁性男声 · 28岁', tags: [{ label: '磁性', color: 'indigo' }, { label: '霸总', color: 'gray' }], bg: 'char-bg-3', icon: '🧑' },
  { id: 3, name: '陈宇', desc: '青年男声 · 25岁', tags: [{ label: '阳光', color: 'green' }, { label: '校园', color: 'yellow' }], bg: 'char-bg-4', icon: '👨' },
  { id: 4, name: '秋月', desc: '老旦 · 60岁', tags: [{ label: '慈祥', color: 'orange' }, { label: '长辈', color: 'amber' }], bg: 'char-bg-1', icon: '👵' }
];

export const initialApiKeys: ApiKey[] = [
  { id: 'k1', name: '生产环境-主密钥', prefix: 'sk-mjs-prod', tail: '…a7f2', created: '2026-03-10', lastUsed: '2 分钟前', perm: '读+写', status: 'active' },
  { id: 'k2', name: 'CI/CD 自动发布', prefix: 'sk-mjs-ci', tail: '…x9k1', created: '2026-04-22', lastUsed: '2 小时前', perm: '只写', status: 'active' },
  { id: 'k3', name: '内部测试 (临时)', prefix: 'sk-mjs-tmp', tail: '…d4n8', created: '2026-05-19', lastUsed: '昨天', perm: '只读', status: 'active' },
  { id: 'k4', name: '已撤销-旧密钥', prefix: 'sk-mjs-old', tail: '…q1m5', created: '2025-11-02', lastUsed: '2026-03-01', perm: '读+写', status: 'revoked' }
];

export const initialInvoices: Invoice[] = [
  { id: 'INV-2026-05', date: '2026-05-15', plan: '团队版 · 月度', amount: '¥ 599.00', status: '已支付' },
  { id: 'INV-2026-04', date: '2026-04-15', plan: '团队版 · 月度', amount: '¥ 599.00', status: '已支付' },
  { id: 'INV-2026-03', date: '2026-03-15', plan: '团队版 · 月度', amount: '¥ 599.00', status: '已支付' },
  { id: 'INV-2026-02', date: '2026-02-15', plan: '团队版 · 月度', amount: '¥ 599.00', status: '已支付' },
  { id: 'INV-2026-01', date: '2026-01-15', plan: '团队版 · 月度', amount: '¥ 599.00', status: '已支付' }
];
