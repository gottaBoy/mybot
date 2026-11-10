from collections import Counter
from pathlib import Path
import re


def test_work_item_ids_and_summary_remain_consistent():
    text = (Path(__file__).resolve().parents[1] / "docs/WORK_ITEMS.md").read_text()
    rows = re.findall(r"^\| (\d{3}) \| ([^|]+?) \|", text, re.MULTILINE)
    assert [int(identifier) for identifier, _ in rows] == list(range(1, 120))
    counts = Counter(status.strip() for _, status in rows)
    assert set(counts) <= {"完成", "部分", "待办", "授权门槛", "暂缓"}
    for status, count in counts.items():
        assert f"| {status} | {count} |" in text
    assert f"完成 {counts['完成']} 项，未完全完成 {119 - counts['完成']} 项" in text
