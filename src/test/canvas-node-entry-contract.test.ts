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

  it('点节点后的协作上下文围绕当前对象启动，而不是打开独立聊天壳', () => {
    expect(indexSrc).toContain('void runAgentTurn(undefined, turnContextForNode(node));');
  });

  it('Canvas 主路径不再暴露详情或原地编辑分流', () => {
    expect(indexSrc).not.toContain("'详情'");
    expect(indexSrc).not.toContain('"详情"');
    expect(indexSrc).not.toContain("'原地编辑'");
    expect(indexSrc).not.toContain('"原地编辑"');
  });
});
