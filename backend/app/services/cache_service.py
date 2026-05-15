import json
import os
from typing import Optional, Dict

CACHE_FILE = "email_cache.json"

class CacheService:
    def __init__(self):
        self.cache_path = CACHE_FILE
        self._ensure_cache_exists()

    def _ensure_cache_exists(self):
        if not os.path.exists(self.cache_path):
            with open(self.cache_path, 'w') as f:
                json.dump({}, f)

    def get_cached_summary(self, email_id: str) -> Optional[Dict]:
        try:
            with open(self.cache_path, 'r') as f:
                cache = json.load(f)
                return cache.get(email_id)
        except Exception:
            return None

    def save_to_cache(self, email_id: str, data: Dict):
        try:
            cache = {}
            with open(self.cache_path, 'r') as f:
                cache = json.load(f)
            
            cache[email_id] = data
            
            with open(self.cache_path, 'w') as f:
                json.dump(cache, f, indent=2)
        except Exception:
            pass
