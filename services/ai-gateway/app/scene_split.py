"""剧本场景切分契约 —— 与前端 src/pages/Canvas/sceneSplit.ts 同一规则
(canvas-node-optimize-panel design Decision 4)。

规则:
  1. 以 markdown 标题行 ^#{1,3}\\s+(.+) 作为场景分隔,标题文本即场景标题。
  2. 首个标题之前的非空内容归为「场景 1」。
  3. 全文无标题但非空 → 整体作为一场(标题「场景 1」);仅当没有任何非空行被归入时,
     才退化为单场「剧本」(content 截前 200 字)。

scene_index = 返回列表下标(0-based),与画布节点 id script-{i} 的 i、前端 splitScenes 一致。
rewrite-scene 必须用同一规则定位 scene_index,否则错位 —— 任何改动都要让
tests/test_scene_split.py 与前端 sceneSplit.test.ts 的同组样例同时成立。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_HEADING = re.compile(r"^#{1,3}\s+(.+)")


@dataclass
class Scene:
    title: str
    content: str


def _compute_spans(lines: list[str]) -> list[dict]:
    """逐行计算每场的标题与正文行范围 [start, end)(不含标题行)。与 split_scenes 同序。"""
    spans: list[dict] = []
    cur: dict | None = None
    for i, line in enumerate(lines):
        m = _HEADING.match(line)
        if m:
            if cur:
                spans.append(cur)
            cur = {"title": m.group(1), "start": i + 1, "end": i + 1}
        elif cur is not None:
            cur["end"] = i + 1
        elif not spans and line.strip():
            # 首个标题之前的正文 → 「场景 1」(正文含当前行)
            cur = {"title": "场景 1", "start": i, "end": i + 1}
    if cur:
        spans.append(cur)
    return spans


def split_scenes(content: str) -> list[Scene]:
    lines = content.split("\n")
    spans = _compute_spans(lines)
    scenes = [
        Scene(title=sp["title"], content="\n".join(lines[sp["start"]:sp["end"]]).strip())
        for sp in spans
    ]
    if not scenes and content.strip():
        scenes.append(Scene(title="剧本", content=content[:200]))
    return scenes


def replace_scene(content: str, scene_index: int, new_body: str) -> str:
    """把第 scene_index 场的正文替换为 new_body,标题行与其它场原样保留(精准单场)。"""
    lines = content.split("\n")
    spans = _compute_spans(lines)
    if scene_index < 0 or scene_index >= len(spans):
        raise IndexError(f"scene_index {scene_index} 越界(共 {len(spans)} 场)")
    sp = spans[scene_index]
    new_lines = new_body.split("\n")
    return "\n".join(lines[: sp["start"]] + new_lines + lines[sp["end"]:])
