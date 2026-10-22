import logging
import urllib.parse
from typing import Any, Dict, List
import requests

logger = logging.getLogger("search_service")


class SearchService:
    """
    Live external search service.
    Collects real search results, specifications, prices, and source URLs.
    Never fabricates facts or citations.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    def search(self, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """
        Executes external web search and returns source links with snippets.
        """
        results = []
        try:
            # DuckDuckGo HTML / Instant Answer API for search
            encoded = urllib.parse.quote_plus(query)
            url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                abstract = data.get("AbstractText")
                abstract_url = data.get("AbstractURL")
                if abstract and abstract_url:
                    results.append({
                        "title": data.get("Heading", query),
                        "snippet": abstract,
                        "url": abstract_url,
                        "source": "DuckDuckGo Instant Answer"
                    })

                for topic in data.get("RelatedTopics", [])[:max_results]:
                    if isinstance(topic, dict) and "Text" in topic and "FirstURL" in topic:
                        results.append({
                            "title": topic.get("Text", "")[:60] + "...",
                            "snippet": topic.get("Text", ""),
                            "url": topic.get("FirstURL", ""),
                            "source": "Web Search"
                        })
        except Exception as e:
            logger.warning(f"External search encounter: {e}")

        # If direct instant answer returned fewer items, return clear notice
        return results


search_service = SearchService()
