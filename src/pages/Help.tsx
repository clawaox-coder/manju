import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, Video, MessageCircle, BookOpen, Lightbulb, Headphones, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SHORTCUT_GROUPS } from '@/hooks/useShortcuts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CARDS = [
  { title: '新手教程', desc: '10 分钟做出你的第一部 AI 短剧', Icon: GraduationCap, color: 'bg-muted' },
  { title: '视频教程', desc: '24 集深度教学课程', Icon: Video, color: 'bg-muted' },
  { title: '社区论坛', desc: '5 万创作者一起交流', Icon: MessageCircle, color: 'bg-muted' },
  { title: 'API 文档', desc: '开发者集成指南', Icon: BookOpen, color: 'bg-muted' },
  { title: '反馈建议', desc: '告诉我们如何改进', Icon: Lightbulb, color: 'bg-muted' },
  { title: '联系客服', desc: '7×24 小时在线支持', Icon: Headphones, color: 'bg-muted' }
];

const FAQS: [string, string][] = [
  ['如何上传剧本生成分镜?', '在剧本创作页面粘贴文本, 或上传 .txt/.docx 文件, 点击「AI 生成分镜」即可。'],
  ['一次能渲染多长的视频?', '专业版单次最长 30 分钟, 团队版 60 分钟, 企业版无限制。'],
  ['生成的视频版权归谁?', '所有由您账户生成的视频, 版权完全归您所有, 可商用。'],
  ['如何邀请团队成员?', '前往团队协作页面 → 邀请成员, 输入对方邮箱发送邀请链接。'],
  ['支持哪些导出格式?', 'MP4 (H.264/H.265)、MOV、WebM, 分辨率支持 720p/1080p/2K/4K。']
];

export default function Help() {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">帮助中心</h1>
        <p className="text-xs text-muted-foreground mt-1">教程、常见问题和快捷键速查</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {CARDS.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card
              className="p-5 cursor-pointer hover:shadow-lg transition group"
              onClick={() => {
                if (c.title === 'API 文档') navigate('/apikeys');
                else if (c.title === '反馈建议') {
                  const txt = window.prompt('请告诉我们您的想法或问题:');
                  if (txt) toast.success('反馈已提交, 谢谢!');
                } else toast.info(`${c.title} 已打开`);
              }}
            >
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-3', c.color)}>
                <c.Icon className="w-6 h-6 text-white" />
              </div>
              <div className="font-semibold mb-1">{c.title}</div>
              <div className="text-xs text-muted-foreground">{c.desc}</div>
              <div className="text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition">前往 →</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">键盘快捷键</h2>
          <span className="text-xs text-muted-foreground">
            按 <kbd>?</kbd> 可随时呼出
          </span>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.cat}>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{g.cat}</div>
              <div className="space-y-2">
                {g.items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-foreground/80">{s.desc}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">常见问题</h2>
        <div className="space-y-2">
          {FAQS.map(([q, a]) => (
            <details key={q} className="border border-border rounded-lg group">
              <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-sm hover:bg-accent list-none">
                <span className="font-medium">{q}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-3 text-xs text-muted-foreground">{a}</div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
