import json
from typing import AsyncGenerator

import anthropic

from ..config import get_settings

SYSTEM_PROMPT = """你是一个专业的短剧编剧 AI 助手。根据用户提供的剧本上下文和指令，续写剧本内容。
要求：
- 保持与上下文一致的风格和语气
- 使用 Markdown 格式（## 表示场景标题）
- 对话用引号包裹
- 每个场景包含场景描述和角色对话
- 续写 1-3 个场景"""


async def stream_script_continue(
    context: str, instruction: str
) -> AsyncGenerator[dict, None]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    yield {"event": "start", "data": "{}"}

    try:
        async with client.messages.stream(
            model=settings.anthropic_model,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"当前剧本内容:\n{context}\n\n---\n指令: {instruction}",
                }
            ],
        ) as stream:
            async for text in stream.text_stream:
                yield {
                    "event": "delta",
                    "data": json.dumps({"text": text}, ensure_ascii=False),
                }

            message = await stream.get_final_message()
            usage = {
                "input_tokens": message.usage.input_tokens,
                "output_tokens": message.usage.output_tokens,
            }
            yield {"event": "done", "data": json.dumps({"usage": usage})}
    except Exception as e:
        yield {
            "event": "error",
            "data": json.dumps(
                {"code": "AI_PROVIDER_ERROR", "message": str(e)}, ensure_ascii=False
            ),
        }
