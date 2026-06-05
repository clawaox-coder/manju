const indexSources = import.meta.glob('@/pages/Canvas/index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexSrc = Object.values(indexSources)[0] ?? '';

describe('Canvas node entry contract', () => {
  it('点节点会先收起全局协作，再直接拉起对象工作面', () => {
    expect(indexSrc).toMatch(
      /const handleNodeClick = useCallback\(\(nodeId: string\) => \{[\s\S]*?setSelectedNodeId\(nodeId\);[\s\S]*?setAssistantOpen\(false\);[\s\S]*?setObjectWorkbenchOpen\(true\);/,
    );
  });

  it('点节点只打开对象工作台，不自动发起 Agent 对话', () => {
    const handlerMatch = indexSrc.match(/const handleNodeClick = useCallback\(\(nodeId: string\) => \{[\s\S]*?\n {2}\}, \[\]\);/);
    expect(handlerMatch?.[0]).toBeTruthy();
    expect(handlerMatch?.[0]).not.toContain('runAgentTurn');
    expect(handlerMatch?.[0]).not.toContain('turnContextForNode');
  });

  it('点选节点要等指针抬起后再打开对象工作台，避免 tldraw 拖拽状态粘住', () => {
    expect(indexSrc).toContain("window.addEventListener('pointerup', finishSelection, { capture: true, once: true });");
    expect(indexSrc).toContain('window.requestAnimationFrame(() => {');
    expect(indexSrc).toContain('if (cancelled || movedDuringGesture) return;');
  });

  it('Canvas 主路径不再暴露详情或原地编辑分流', () => {
    expect(indexSrc).not.toContain("'详情'");
    expect(indexSrc).not.toContain('"详情"');
    expect(indexSrc).not.toContain("'原地编辑'");
    expect(indexSrc).not.toContain('"原地编辑"');
  });
});
