import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderByType } from '@/pages/Canvas/canvas/ManjuNodeView';
import type { ManjuNodeProps } from '@/pages/Canvas/canvas/ManjuNodeView';

// P4.6：节点按 type 显示与其语义相符的信息，而非一律降级为无差别方块。
function props(over: Partial<ManjuNodeProps>): ManjuNodeProps {
  return { w: 200, h: 120, nodeType: 'script', title: '', body: '', badge: '', imageUrl: '', status: '', ...over };
}

describe('ManjuNode renderByType（画布节点语义渲染）', () => {
  it('script：显示编号 badge + 标题 + 正文', () => {
    render(renderByType(props({ nodeType: 'script', title: '开场', badge: '1', body: '主角登场，雨夜。' })));
    expect(screen.getByText('剧本')).toBeInTheDocument();
    expect(screen.getByLabelText('节点操作')).toBeInTheDocument();
    expect(screen.getByText('开场')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('主角登场，雨夜。')).toBeInTheDocument();
  });

  it('storyboard：有对白时显示对白，风格作 badge', () => {
    render(renderByType(props({ nodeType: 'storyboard', title: 'Shot 01', badge: '日系动漫', body: '「住手！」', status: 'stale' })));
    expect(screen.getByText('分镜')).toBeInTheDocument();
    expect(screen.getByText('Shot 01')).toBeInTheDocument();
    expect(screen.getByText('日系动漫')).toBeInTheDocument();
    expect(screen.getByText('「住手！」')).toBeInTheDocument();
    expect(screen.getByText('待刷新')).toBeInTheDocument();
  });

  it('storyboard：无对白回退「无对白」', () => {
    render(renderByType(props({ nodeType: 'storyboard', title: 'Shot 02', body: '' })));
    expect(screen.getByText('无对白')).toBeInTheDocument();
  });

  it('character：显示角色名与描述', () => {
    render(renderByType(props({ nodeType: 'character', title: '林夏', body: '高中生，性格倔强。', status: 'warning' })));
    expect(screen.getByText('林夏')).toBeInTheDocument();
    expect(screen.getByText('高中生，性格倔强。')).toBeInTheDocument();
    expect(screen.getByText('需确认')).toBeInTheDocument();
  });

  it('ai：显示标题与模型 badge', () => {
    render(renderByType(props({ nodeType: 'ai', title: 'AI 分镜生成', badge: 'Sonnet 4.6', status: 'running' })));
    expect(screen.getByText('AI 分镜生成')).toBeInTheDocument();
    expect(screen.getByText('Sonnet 4.6')).toBeInTheDocument();
  });

  it('video：显示时长 badge 与状态', () => {
    render(renderByType(props({ nodeType: 'video', title: '成片', badge: '01:30', body: '等待素材', status: 'waiting' })));
    expect(screen.getByText(/成片/)).toBeInTheDocument();
    expect(screen.getByText('01:30')).toBeInTheDocument();
    expect(screen.getByText('等待素材')).toBeInTheDocument();
  });

  it('decision：显示待拍板卡片与说明', () => {
    render(renderByType(props({ nodeType: 'decision', title: '确定整体声音策略并进入配音', badge: '关联 3 个对象', body: '选择后会围绕这个对象进入拍板工作态。', status: 'candidate' })));
    expect(screen.getByText('待拍板')).toBeInTheDocument();
    expect(screen.getByText('关联 3 个对象')).toBeInTheDocument();
    expect(screen.getByText('确定整体声音策略并进入配音')).toBeInTheDocument();
    expect(screen.getByText('候选')).toBeInTheDocument();
  });

  it('risk：显示风险卡片与风险状态', () => {
    render(renderByType(props({ nodeType: 'risk', title: '剧本比现有分镜更新，部分镜头需要重新确认或刷新', badge: '关联 2 个对象', body: '选择后会围绕这个对象进入风险评估工作态。', status: 'stale' })));
    expect(screen.getByText('风险')).toBeInTheDocument();
    expect(screen.getByText('关联 2 个对象')).toBeInTheDocument();
    expect(screen.getByText('待刷新')).toBeInTheDocument();
  });

  it('script 正文为空时回退占位，而非空白方块', () => {
    render(renderByType(props({ nodeType: 'script', title: '场景', body: '', status: 'locked' })));
    expect(screen.getByText('等待生成...')).toBeInTheDocument();
    expect(screen.getByText('已锁定')).toBeInTheDocument();
  });
});
