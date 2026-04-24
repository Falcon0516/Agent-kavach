"""
KAVACH Call Queue Tool
Manages outbound police call queue (read/write to outbound_queue.json).
"""
import json
import os
import logging
from typing import Optional

logger = logging.getLogger("kavach.call_queue")

QUEUE_PATH = os.path.join(os.path.dirname(__file__), "..", "outbound_queue.json")


def _read_queue() -> list:
    """Read the current outbound queue."""
    try:
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write_queue(queue: list):
    """Write updated queue to file."""
    try:
        with open(QUEUE_PATH, "w", encoding="utf-8") as f:
            json.dump(queue, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to write call queue: {e}")


async def enqueue_call(
    numbers: list,
    threat_data: dict,
    priority: str = "high",
) -> dict:
    """Add a police call to the outbound queue.
    numbers: list of phone numbers to call (police station, 100, etc.)
    threat_data: dict with threat_level, summary, location, victim info
    Returns {queued: bool, queue_position: int}
    """
    entry = {
        "numbers": numbers,
        "threat_data": threat_data,
        "priority": priority,
        "status": "pending",
    }

    queue = _read_queue()
    queue.append(entry)
    _write_queue(queue)

    logger.info(f"Call queued: {len(numbers)} numbers, priority={priority}")
    return {"queued": True, "queue_position": len(queue)}


async def dequeue_call() -> Optional[dict]:
    """Pop the next call from the queue.
    Returns the call entry or None if queue is empty.
    """
    queue = _read_queue()
    if not queue:
        return None

    entry = queue.pop(0)
    _write_queue(queue)
    logger.info(f"Call dequeued: {entry.get('numbers', [])}")
    return entry


async def get_queue_status() -> dict:
    """Get current queue status."""
    queue = _read_queue()
    return {
        "pending": len(queue),
        "items": queue,
    }


async def clear_queue():
    """Clear the entire outbound queue."""
    _write_queue([])
    logger.info("Call queue cleared")
