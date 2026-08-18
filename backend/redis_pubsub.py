"""Optional Redis pub/sub for multi-worker SSE fan-out.

If REDIS_URL env is set, publishes notification payloads to a Redis channel so that all
uvicorn workers (behind a load-balancer) receive the event and push to any locally-connected
SSE clients. Falls back to no-op if Redis is not configured or the redis package is missing.

To enable in production:
  1. `pip install redis` (async client is bundled since v4.2)
  2. Set REDIS_URL=redis://:pass@host:6379/0 in backend/.env
  3. Restart backend
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Callable, Optional

logger = logging.getLogger("epr.redis")

_redis_client = None
_subscribed = False


async def _get_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis.asyncio as redis  # type: ignore
        _redis_client = redis.from_url(url, encoding="utf-8", decode_responses=True)
        await _redis_client.ping()
        logger.info(f"Redis pub/sub connected: {url}")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}); falling back to in-process fan-out only.")
        return None


async def publish_to_redis(user_id: str, payload: dict):
    """Publish notification to Redis channel `epr:notif:{user_id}`. No-op if Redis not configured."""
    client = await _get_client()
    if not client:
        return
    try:
        await client.publish(f"epr:notif:{user_id}", json.dumps(payload))
    except Exception as e:
        logger.warning(f"Redis publish failed: {e}")


async def subscribe_worker(on_message: Callable[[str, dict], asyncio.Future]):
    """Subscribe once per worker; forwards Redis messages to local in-process queue via callback.

    on_message(user_id, payload) — should call _publish() from routes_notifications.
    """
    global _subscribed
    if _subscribed:
        return
    client = await _get_client()
    if not client:
        return
    _subscribed = True
    try:
        pubsub = client.pubsub()
        await pubsub.psubscribe("epr:notif:*")
        logger.info("Redis pub/sub worker subscribed")
        async for msg in pubsub.listen():
            if msg.get("type") != "pmessage":
                continue
            channel = msg["channel"]
            user_id = channel.split(":")[-1]
            try:
                payload = json.loads(msg["data"])
                await on_message(user_id, payload)
            except Exception as e:
                logger.warning(f"Redis message parse fail: {e}")
    except Exception as e:
        logger.warning(f"Redis subscribe worker exited: {e}")
        _subscribed = False
