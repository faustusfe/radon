"""Shared Unusual Whales API utilities.

Provides authenticated access to the UW API using the requests library.
All scripts that call UW endpoints should import from here.
"""

import os

import requests

UW_BASE_URL = "https://api.unusualwhales.com/api"


def get_uw_token() -> str:
    """Read UW_TOKEN from the environment. Raises ValueError if missing."""
    token = os.environ.get("UW_TOKEN")
    if not token:
        raise ValueError(
            "UW_TOKEN environment variable is not set. "
            "Export it via: export UW_TOKEN='your-api-key'"
        )
    return token


def uw_api_get(endpoint: str, params: dict = None) -> dict:
    """Make an authenticated GET request to the Unusual Whales API.

    Args:
        endpoint: API path *without* leading slash, e.g. "stock/AAPL/info".
        params: Optional query parameters dict.

    Returns:
        Parsed JSON response dict.  On error returns {"error": "..."}.
    """
    endpoint = endpoint.lstrip("/")
    url = f"{UW_BASE_URL}/{endpoint}"
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {get_uw_token()}",
        "User-Agent": "convex-scavenger/1.0",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        return {"error": f"HTTP {e.response.status_code}: {e.response.reason}"}
    except requests.ConnectionError as e:
        return {"error": f"Connection failed: {e}"}
    except requests.Timeout:
        return {"error": "Request timed out"}
    except Exception as e:
        return {"error": str(e)}
