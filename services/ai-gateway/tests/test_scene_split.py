"""场景切分契约的后端侧锁定 —— 这组样例必须与前端 src/test/sceneSplit.test.ts 一致。"""

import pytest

from app.scene_split import Scene, replace_scene, split_scenes


def test_split_by_headings():
    content = "\n".join(["# 开场", "夜。雨。", "## 冲突", "他举起伞。", "### 反转", "伞是把刀。"])
    scenes = split_scenes(content)
    assert [s.title for s in scenes] == ["开场", "冲突", "反转"]
    assert scenes[0].content == "夜。雨。"
    assert scenes[2].content == "伞是把刀。"


def test_preamble_becomes_scene_1():
    content = "\n".join(["一段没有标题的开头", "# 第二段", "正文"])
    scenes = split_scenes(content)
    assert scenes[0] == Scene(title="场景 1", content="一段没有标题的开头")
    assert scenes[1] == Scene(title="第二段", content="正文")


def test_no_heading_single_scene():
    scenes = split_scenes("就一行没有标题的内容")
    assert len(scenes) == 1
    assert scenes[0].title == "场景 1"
    assert scenes[0].content == "就一行没有标题的内容"


def test_empty_or_whitespace():
    assert split_scenes("") == []
    assert split_scenes("   \n  \n") == []


def test_scene_index_aligns_with_array():
    scenes = split_scenes("\n".join(["# A", "a", "# B", "b", "# C", "c"]))
    assert scenes[1].title == "B"  # script-1 → scene_index 1


def test_replace_scene_keeps_others_verbatim():
    content = "\n".join(["# A", "aaa", "## B", "bbb", "### C", "ccc"])
    out = replace_scene(content, 1, "改后的 B 正文")
    assert out == "\n".join(["# A", "aaa", "## B", "改后的 B 正文", "### C", "ccc"])


def test_replace_preamble_scene():
    content = "\n".join(["开头正文", "# B", "bbb"])
    out = replace_scene(content, 0, "新开头")
    assert out == "\n".join(["新开头", "# B", "bbb"])


def test_replace_out_of_range_raises():
    with pytest.raises(IndexError):
        replace_scene("# A\naaa", 5, "x")
