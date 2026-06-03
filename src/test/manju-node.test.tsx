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
    render(renderByType(props({ nodeType: 'storyboard', title: 'Shot 01', badge: '日系动漫', body: '「住手！」' })));
    expect(screen.getByText('分镜')).toBeInTheDocument();
    expect(screen.getByText('Shot 01')).toBeInTheDocument();
    expect(screen.getByText('日系动漫')).toBeInTheDocument();
    expect(screen.getByText('「住手！」')).toBeInTheDocument();
  });

  it('storyboard：无对白回退「无对白」', () => {
    render(renderByType(props({ nodeType: 'storyboard', title: 'Shot 02', body: '' })));
    expect(screen.getByText('无对白')).toBeInTheDocument();
  });

  it('character：显示角色名与描述', () => {
    render(renderByType(props({ nodeType: 'character', title: '林夏', body: '高中生，性格倔强。' })));
    expect(screen.getByText('林夏')).toBeInTheDocument();
    expect(screen.getByText('高中生，性格倔强。')).toBeInTheDocument();
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

  it('script 正文为空时回退占位，而非空白方块', () => {
    render(renderByType(props({ nodeType: 'script', title: '场景', body: '' })));
    expect(screen.getByText('等待生成...')).toBeInTheDocument();
  });
});
