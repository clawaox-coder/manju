import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen, waitFor } from './utils';
import { DEMO_CANVAS_PROJECT_ID, demoCanvasCharacters, demoCanvasShots } from '@/pages/Canvas/demoCanvasData';
import { ScriptSceneEditor } from '@/pages/Canvas/workbench/editors/ScriptSceneEditor';
import { StoryboardCardEditor } from '@/pages/Canvas/workbench/editors/StoryboardCardEditor';
import { CharacterProfileEditor } from '@/pages/Canvas/workbench/editors/CharacterProfileEditor';

describe('Canvas demo editor mode', () => {
  it('shows script editor as a read-only demo workbench instead of a broken rewrite form', async () => {
    renderWithProviders(
      <ScriptSceneEditor projectId={DEMO_CANVAS_PROJECT_ID} sceneIndex={0} />,
    );

    await waitFor(() => {
      expect(screen.getByText('开场 · 屋顶误入')).toBeInTheDocument();
    });
    expect(screen.getByTestId('demo-script-preview')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toHaveAttribute('data-surface', 'embedded');
    expect(screen.queryByText('演示工作态')).not.toBeInTheDocument();
    expect(screen.getByText(/真实项目里，这里会直接进入剧本改写/)).toBeInTheDocument();
    expect(screen.getByText(/像给编剧一句明确反馈那样继续改这一场/)).toBeInTheDocument();
    expect(screen.queryByText(/^剧本$/)).not.toBeInTheDocument();
    expect(screen.queryByText('当前场次')).not.toBeInTheDocument();
    expect(screen.queryByText('先判断这一场是否成立，再决定怎么重写它。')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('描述你想要的重写方向…')).not.toBeInTheDocument();
  });

  it('shows storyboard editor as a read-only demo workbench instead of live tweak controls', async () => {
    renderWithProviders(
      <StoryboardCardEditor projectId={DEMO_CANVAS_PROJECT_ID} shotId={String(demoCanvasShots[0].id)} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Shot 01 · 屋顶误入')).toBeInTheDocument();
    });
    expect(screen.getByTestId('demo-storyboard-preview')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toHaveAttribute('data-surface', 'embedded');
    expect(screen.queryByText('演示工作态')).not.toBeInTheDocument();
    expect(screen.getByText(/真实项目里，这里会直接进入对白、时长和重画这条连续工作流/)).toBeInTheDocument();
    expect(screen.getByText(/真实项目里会先改对白和节奏，再决定是不是要重画这一镜/)).toBeInTheDocument();
    expect(screen.queryByText(/^分镜$/)).not.toBeInTheDocument();
    expect(screen.queryByText('镜头 1')).not.toBeInTheDocument();
    expect(screen.queryByText('等待生成')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('比如:短一点、口语化…')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('画面描述(可选)…')).not.toBeInTheDocument();
  });

  it('shows character editor as a read-only demo workbench instead of live optimize controls', async () => {
    renderWithProviders(
      <CharacterProfileEditor projectId={DEMO_CANVAS_PROJECT_ID} assetId={demoCanvasCharacters[0].id} />,
    );

    await waitFor(() => {
      expect(screen.getByText(demoCanvasCharacters[0].description ?? '')).toBeInTheDocument();
    });
    expect(screen.getByTestId('demo-character-description')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toBeInTheDocument();
    expect(screen.getByTestId('demo-workbench-notice')).toHaveAttribute('data-surface', 'embedded');
    expect(screen.queryByText('演示工作态')).not.toBeInTheDocument();
    expect(screen.getByText(/真实项目里，这里会直接进入改设定、改名称和生成头像这条角色工作流/)).toBeInTheDocument();
    expect(screen.getByText(/真实项目里会先把设定和名字调顺，需要时再补一句换形象/)).toBeInTheDocument();
    expect(screen.queryByText('角色卡')).not.toBeInTheDocument();
    expect(screen.getAllByText(demoCanvasCharacters[0].name)).toHaveLength(1);
    expect(screen.queryByText('先把角色设定和形象调整顺，再决定会不会影响分镜和配音。')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('比如:更冷酷、加身世背景…')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('头像描述(可选)…')).not.toBeInTheDocument();
  });
});
