import { resolveNodeEntity, isContentNode } from '@/pages/Canvas/nodeEntity';

describe('resolveNodeEntity', () => {
  it('解析剧本场 script-{i}', () => {
    expect(resolveNodeEntity('script-0')).toEqual({ kind: 'script-scene', sceneIndex: 0 });
    expect(resolveNodeEntity('script-12')).toEqual({ kind: 'script-scene', sceneIndex: 12 });
  });

  it('解析分镜 shot-{uuid}(含连字符)', () => {
    expect(resolveNodeEntity('shot-018f-3c2a-7b9d')).toEqual({ kind: 'shot', shotId: '018f-3c2a-7b9d' });
  });

  it('解析角色 char-{assetId}(含连字符)', () => {
    expect(resolveNodeEntity('char-018f-aaaa')).toEqual({ kind: 'character', assetId: '018f-aaaa' });
  });

  it('解析枢纽节点', () => {
    expect(resolveNodeEntity('ai-gen')).toEqual({ kind: 'hub-ai' });
    expect(resolveNodeEntity('video-out')).toEqual({ kind: 'hub-video' });
  });

  it('解析协作对象节点', () => {
    expect(resolveNodeEntity('decision-confirm-voice')).toEqual({ kind: 'decision', decisionId: 'decision-confirm-voice' });
    expect(resolveNodeEntity('gate-script')).toEqual({ kind: 'decision', decisionId: 'gate-script' });
    expect(resolveNodeEntity('risk-script-shot-stale')).toEqual({ kind: 'risk', riskId: 'risk-script-shot-stale' });
  });

  it('未知 id(如 arrow-)返回 unknown', () => {
    expect(resolveNodeEntity('arrow-e1')).toEqual({ kind: 'unknown', raw: 'arrow-e1' });
  });

  it('isContentNode 区分内容/枢纽', () => {
    expect(isContentNode(resolveNodeEntity('shot-x'))).toBe(true);
    expect(isContentNode(resolveNodeEntity('script-1'))).toBe(true);
    expect(isContentNode(resolveNodeEntity('char-x'))).toBe(true);
    expect(isContentNode(resolveNodeEntity('ai-gen'))).toBe(false);
    expect(isContentNode(resolveNodeEntity('video-out'))).toBe(false);
    expect(isContentNode(resolveNodeEntity('decision-confirm-voice'))).toBe(false);
    expect(isContentNode(resolveNodeEntity('gate-script'))).toBe(false);
    expect(isContentNode(resolveNodeEntity('risk-script-shot-stale'))).toBe(false);
    expect(isContentNode(resolveNodeEntity('arrow-e1'))).toBe(false);
  });
});
