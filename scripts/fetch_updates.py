#!/usr/bin/env python3
"""
Fetch daily NFC North news and generate summaries using Claude.

Uses ESPN's public news endpoint for headlines, then Claude with web search
to write short fan-friendly summaries for each team.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import httpx

# NFC North teams with their ESPN IDs
TEAMS = {
    "bears": {"name": "Chicago Bears", "espn_id": "3"},
    "lions": {"name": "Detroit Lions", "espn_id": "8"},
    "packers": {"name": "Green Bay Packers", "espn_id": "9"},
    "vikings": {"name": "Minnesota Vikings", "espn_id": "16"},
}

ESPN_NEWS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{team_id}/news"


def fetch_espn_headlines(team_id: str, limit: int = 5) -> list[str]:
    """Fetch recent headlines from ESPN for a team."""
    try:
        resp = httpx.get(
            ESPN_NEWS_URL.format(team_id=team_id),
            params={"limit": limit},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        headlines = [
            article.get("headline", "")
            for article in data.get("articles", [])
            if article.get("headline")
        ]
        return headlines
    except Exception as e:
        print(f"  Warning: ESPN fetch failed ({e}), will rely on web search")
        return []


def generate_summary(client: anthropic.Anthropic, team_name: str, headlines: list[str]) -> str:
    """Use Claude with web search to generate a team summary."""

    headlines_text = "\n".join(f"- {h}" for h in headlines) if headlines else "(no headlines available)"

    prompt = f"""Write exactly 2 short sentences about today's {team_name} news.

Headlines: {headlines_text}

Search for the single biggest story from the last 24 hours.

STRICT RULES:
- Maximum 2 sentences total
- Maximum 40 words total
- No newlines
- No markdown
- Just the key facts"""

    response = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
    )

    # Extract all text blocks from response (web search may produce multiple)
    texts = [block.text for block in response.content if block.type == "text"]
    return " ".join(texts).strip() if texts else "No update available."


def main():
    # Check for API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    updates = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "teams": {}
    }

    for team_key, team_info in TEAMS.items():
        print(f"Processing {team_info['name']}...")

        # Fetch ESPN headlines
        headlines = fetch_espn_headlines(team_info["espn_id"])
        if headlines:
            print(f"  Found {len(headlines)} headlines")

        # Generate summary with Claude
        summary = generate_summary(client, team_info["name"], headlines)
        print(f"  Generated summary")

        updates["teams"][team_key] = {
            "name": team_info["name"],
            "summary": summary,
        }

    # Write output
    output_path = Path(__file__).parent.parent / "data" / "updates.json"
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(updates, f, indent=2)

    print(f"\nWrote updates to {output_path}")


if __name__ == "__main__":
    main()
