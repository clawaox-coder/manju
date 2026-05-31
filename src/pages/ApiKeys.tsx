import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ApiKeys() {
  const apiKeys = useStore((s) => s.apiKeys);
  const removeApiKey = useStore((s) => s.removeApiKey);
  const revokeApiKey = useStore((s) => s.revokeApiKey);
  const addApiKey = useStore((s) => s.addApiKey);
  const confirm = useConfirm();

  function generate() {
    const name = window.prompt('为新密钥命名:', `新密钥-${new Date().toLocaleDateString('zh-CN')}`);
    if (!name) return;
    const tail = Math.random().toString(36).substring(2, 6);
    addApiKey({
      id: `k${Date.now()}`,
      name,
      prefix: 'sk-mjs-new',
      tail: `…${tail}`,
      created: '2026-05-24',
      lastUsed: '从未',
      perm: '读+写',
      status: 'active'
    });
    toast.success(`已生成「${name}」, 请立即复制 (此密钥只显示一次)`);
  }

  function revoke(id: string, name: string) {
    confirm({
      title: '撤销密钥',
      message: `撤销后「${name}」将立即失效, 所有使用该密钥的应用都将无法调用 API, 确定吗?`,
      okText: '撤销',
      danger: true,
      onConfirm: () => {
        revokeApiKey(id);
        toast.info(`「${name}」已撤销`);
      }
    });
  }

  function del(id: string, name: string) {
    confirm({
      title: '删除密钥',
      message: `从列表中永久移除「${name}」?`,
      okText: '删除',
      danger: true,
      onConfirm: () => {
        removeApiKey(id);
        toast.info('已删除');
      }
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">API 密钥</h1>
          <p className="text-xs text-muted-foreground mt-1">用于在 CI/CD 或第三方应用中调用 漫剧AI Studio API</p>
        </div>
        <Button onClick={generate}>+ 生成新密钥</Button>
      </div>

      <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/50 p-4 mb-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-yellow-900 dark:text-yellow-200">
          <div className="font-semibold mb-1">密钥安全提示</div>
          API 密钥具有账户权限, 请妥善保管, 切勿提交到代码仓库或暴露在前端代码中。一旦泄露请立即撤销。
        </div>
      </Card>

      <Card className="overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">名称</th>
              <th className="px-5 py-3 text-left font-medium">密钥</th>
              <th className="px-5 py-3 text-left font-medium">权限</th>
              <th className="px-5 py-3 text-left font-medium">创建时间</th>
              <th className="px-5 py-3 text-left font-medium">最近使用</th>
              <th className="px-5 py-3 text-left font-medium">状态</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k) => (
              <tr key={k.id} className={cn('border-t border-border/50 hover:bg-accent/50', k.status === 'revoked' && 'opacity-50')}>
                <td className="px-5 py-3 text-sm font-medium">{k.name}</td>
                <td className="px-5 py-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {k.prefix}
                    {k.tail}
                  </code>
                </td>
                <td className="px-5 py-3 text-xs">
                  <Badge variant={k.perm === '读+写' ? 'default' : k.perm === '只读' ? 'gray' : 'warning'}>{k.perm}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{k.created}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{k.lastUsed}</td>
                <td className="px-5 py-3">
                  <Badge variant={k.status === 'active' ? 'success' : 'gray'}>{k.status === 'active' ? '有效' : '已撤销'}</Badge>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {k.status === 'active' ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => toast.success(`已复制「${k.name}」到剪贴板`)}>
                        复制
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => revoke(k.id, k.name)}>
                        撤销
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500" onClick={() => del(k.id, k.name)}>
                      删除
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">快速开始</h2>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">cURL · 创建视频任务</div>
            <pre className="bg-secondary text-secondary-foreground border border-border rounded-lg p-3 text-xs overflow-x-auto">
              <code>{`curl -X POST https://api.manju-ai.studio/v1/videos \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"project_id":"p_123","preset":"rhythm","resolution":"1080p"}'`}</code>
            </pre>
          </div>
          <div className="flex gap-3 text-xs">
            <button onClick={() => toast.info('正在打开 API 文档...')} className="text-primary hover:underline">
              完整 API 文档 →
            </button>
            <button onClick={() => toast.info('SDK 列表已打开')} className="text-primary hover:underline">
              SDK 下载 →
            </button>
            <button onClick={() => toast.info('Webhook 配置已打开')} className="text-primary hover:underline">
              Webhook 配置 →
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
