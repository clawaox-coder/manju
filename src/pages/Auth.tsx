import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { register, login, forgotPassword } from '@/lib/api/auth';
import { API_BASE_AUTH } from '@/lib/api/client';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email) {
      toast.error('请填写邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await forgotPassword(form.email);
        toast.success('如果该邮箱已注册, 重置链接已发送');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : '操作失败');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!form.password) {
      toast.error('请填写密码');
      return;
    }
    if (form.password.length < 10) {
      toast.error('密码至少需要 10 位');
      return;
    }
    if (mode === 'register' && !form.name.trim()) {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败');
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
            {mode === 'login' && '登录你的账号'}
            {mode === 'register' && '创建新账号'}
            {mode === 'forgot' && '重置密码'}
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
          {mode !== 'forgot' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">密码</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="至少 10 位"
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : mode === 'register' ? '注册' : '发送重置链接'}
          </Button>
        </form>

        {mode === 'login' && (
          <div className="mt-3 text-center">
            <button
              className="text-xs text-muted-foreground hover:text-brand-600 hover:underline"
              onClick={() => setMode('forgot')}
            >
              忘记密码?
            </button>
          </div>
        )}

        {mode === 'login' && (
          <div className="mt-4">
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">或</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => { window.location.href = `${API_BASE_AUTH}/v1/auth/oauth/github`; }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub 登录
            </Button>
          </div>
        )}

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'login' && (
            <span>
              还没有账号?{' '}
              <button className="text-brand-600 hover:underline" onClick={() => setMode('register')}>
                注册
              </button>
            </span>
          )}
          {mode === 'register' && (
            <span>
              已有账号?{' '}
              <button className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                登录
              </button>
            </span>
          )}
          {mode === 'forgot' && (
            <span>
              <button className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                返回登录
              </button>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}