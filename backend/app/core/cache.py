"""Simple in-process TTL cache for expensive read endpoints.

The DB is remote (Supabase), so every query round-trip is slow — endpoints that
run many sequential queries (board, trend groups) can take 10+ seconds. Trend
data only changes when the ETL runs (every 15min for scores, 6h for full
trends) or a manual refresh is triggered, so caching results for a short TTL
(or until explicitly cleared) is safe and removes repeat-request latency.
"""
import time
from functools import wraps
from typing import Callable, TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")

_cache: dict[tuple, tuple[float, object]] = {}


def _key_part(value: object) -> object:
    # Exclude the DB session from the cache key — it's a new object per request
    # but doesn't affect what the query returns.
    return None if isinstance(value, Session) else value


def ttl_cache(seconds: float) -> Callable[[Callable[..., T]], Callable[..., T]]:
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @wraps(fn)
        def wrapper(*args, **kwargs) -> T:
            key = (
                fn.__module__,
                fn.__qualname__,
                tuple(_key_part(a) for a in args),
                tuple(sorted((k, _key_part(v)) for k, v in kwargs.items())),
            )
            now = time.monotonic()
            cached = _cache.get(key)
            if cached is not None and now < cached[0]:
                return cached[1]  # type: ignore[return-value]
            value = fn(*args, **kwargs)
            _cache[key] = (now + seconds, value)
            return value

        return wrapper

    return decorator


def clear_cache() -> None:
    """Call after any ETL run or manual refresh so stale results aren't served."""
    _cache.clear()
