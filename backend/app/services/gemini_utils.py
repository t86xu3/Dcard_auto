"""
Gemini API 共用工具函數
從 llm_service.py 和 seo_service.py 提取的重複程式碼
"""
import re
import logging

logger = logging.getLogger(__name__)


def strip_markdown(text: str) -> str:
    """清除 Markdown 語法，保留純文字（Dcard 不支援 Markdown）"""
    # 移除標題符號 ### ## #（保留文字）
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # 移除粗體 **text** 或 __text__（保留文字）
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    # 移除斜體 *text* 或 _text_（但保留表情符號旁的 *）
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
    # 移除 markdown 列表符號 - item（但保留 --- 分隔線）
    text = re.sub(r'^- (?!-)', '', text, flags=re.MULTILINE)
    # 保留圖片標記 {{IMAGE:...}} 不動
    return text


def track_gemini_usage(response, model: str = "gemini-2.5-flash"):
    """追蹤 Gemini API 用量"""
    try:
        from app.services.usage_tracker import usage_tracker

        input_tokens = 0
        output_tokens = 0

        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            input_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
            output_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0

        usage_tracker.record_usage(
            provider="google",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        logger.info(f"API 用量 ({model}): input={input_tokens}, output={output_tokens}")
    except Exception as e:
        logger.warning(f"用量追蹤失敗: {e}")
