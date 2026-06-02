import { splitScenes } from '@/pages/Canvas/sceneSplit';

// 这组样例即「场景切分契约」——后端 rewrite-scene 必须复现同样的 scene_index。
describe('splitScenes', () => {
  it('按 markdown 标题切分为多场,保序、标题取自标题行', () => {
    const content = ['# 开场', '夜。雨。', '## 冲突', '他举起伞。', '### 反转', '伞是把刀。'].join('\n');
    const scenes = splitScenes(content);
    expect(scenes.map((s) => s.title)).toEqual(['开场', '冲突', '反转']);
    expect(scenes[0].content).toBe('夜。雨。');
    expect(scenes[2].content).toBe('伞是把刀。');
  });

  it('首个标题之前的正文归入「场景 1」', () => {
    const content = ['一段没有标题的开头', '# 第二段', '正文'].join('\n');
    const scenes = splitScenes(content);
    expect(scenes[0]).toEqual({ title: '场景 1', content: '一段没有标题的开头' });
    expect(scenes[1]).toEqual({ title: '第二段', content: '正文' });
  });

  it('全文无标题但非空 → 单场「场景 1」', () => {
    const scenes = splitScenes('就一行没有标题的内容');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('场景 1');
    expect(scenes[0].content).toBe('就一行没有标题的内容');
  });

  it('空 / 纯空白 → 空数组', () => {
    expect(splitScenes('')).toEqual([]);
    expect(splitScenes('   \n  \n')).toEqual([]);
  });

  it('scene_index 即数组下标,与 script-{i} 对齐', () => {
    const scenes = splitScenes(['# A', 'a', '# B', 'b', '# C', 'c'].join('\n'));
    expect(scenes[1].title).toBe('B'); // script-1 → scene_index 1
  });
});
