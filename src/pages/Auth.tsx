import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { register, login } from '@/lib/api/auth';
import { cn } from '@/lib/utils';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && !form.name) {
      toast.error('请填写用户名');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
        toast.success('登录成功');
      } else {
        await register({ email: form.email, password: form.password, name: form.name });
        toast.success('注册成功');
      }
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">漫剧AI Studio</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'login' ? '登录你的账号' : '创建新账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">用户名</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="你的名字"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">邮箱</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">密码</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 10 位"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'login' ? (
            <span>
              还没有账号?{' '}
              <button className="text-brand-600 hover:underline" onClick={() => setMode('register')}>
                注册
              </button>
            </span>
          ) : (
            <span>
              已有账号?{' '}
              <button className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                登录
              </button>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}