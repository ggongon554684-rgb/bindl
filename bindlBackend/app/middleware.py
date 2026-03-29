"""Rate limiting middleware for FastAPI."""

import time
from typing import Dict, Tuple
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple rate limiter based on IP address.
    Limits requests per minute on specific endpoints.
    """
    
    # Format: {endpoint: (requests_per_minute, window_in_seconds)}
    RATE_LIMITS = {
        "/ai/scope": (10, 60),
        "/ai/reputation-summary": (10, 60),
    }
    
    def __init__(self, app):
        super().__init__(app)
        self.requests: Dict[Tuple[str, str], list] = defaultdict(list)  # {(ip, endpoint): [timestamp, ...]}
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        ip = request.client.host if request.client else "unknown"
        path = request.url.path
        
        # Check if this endpoint has a rate limit
        limit_key = None
        for endpoint, _ in self.RATE_LIMITS.items():
            if path.startswith(endpoint):
                limit_key = endpoint
                break
        
        if limit_key:
            limit, window = self.RATE_LIMITS[limit_key]
            key = (ip, limit_key)
            now = time.time()
            
            # Clean old requests outside the window
            self.requests[key] = [req_time for req_time in self.requests[key] if now - req_time < window]
            
            # Check if limit exceeded
            if len(self.requests[key]) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded: {limit} requests per {window} seconds"
                )
            
            # Record this request
            self.requests[key].append(now)
        
        return await call_next(request)
