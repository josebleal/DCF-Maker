"""
SEC EDGAR data provider.

Uses free public EDGAR APIs — no API key required, no scraping.

APIs used:
  1. https://www.sec.gov/files/company_tickers.json
     → maps ticker symbol → CIK number (cached in memory)
  2. https://data.sec.gov/submissions/CIK{cik:010d}.json
     → recent filings metadata (dates, accession numbers, form types)
  3. https://www.sec.gov/Archives/edgar/full-index/{cik}/{acc}/{acc}-index.json
     → filing index (list of documents inside a filing)
  4. Main filing .htm document
     → fetched and parsed for MD&A / Outlook guidance text

Purpose:
  - Provide auditable filing URLs (10-K, 10-Q) for each ticker
  - Extract guidance text from MD&A for assumption calibration
  - Used by auto_assumptions.py to generate filing memo
"""

from __future__ import annotations

import re
import time
import logging
from typing import Optional

import httpx

try:
    from bs4 import BeautifulSoup
    _BS4_AVAILABLE = True
except ImportError:
    _BS4_AVAILABLE = False

logger = logging.getLogger(__name__)

# ── Module-level cache ────────────────────────────────────────────────────────
_TICKER_TO_CIK: dict[str, int] = {}
_TICKER_CACHE_TTL = 3600 * 12        # 12 hours
_ticker_cache_loaded_at: float = 0.0

_HEADERS = {
    "User-Agent": "IC-DCF-Maker investment-club-research@edu",
    "Accept-Encoding": "gzip, deflate",
    "Accept": "application/json, text/html",
}

_BASE_SUBMISSIONS = "https://data.sec.gov/submissions"
_TICKERS_JSON     = "https://www.sec.gov/files/company_tickers.json"
_ARCHIVES_BASE    = "https://www.sec.gov/Archives/edgar/full-index"

# Keywords that signal guidance/outlook content in 10-K/10-Q text
_GUIDANCE_KEYWORDS = [
    "we expect", "we anticipate", "management expects", "outlook",
    "fiscal year", "guidance", "full year", "next year",
    "revenue growth", "revenue guidance", "revenue target",
    "we believe", "going forward", "the company expects",
]

# Max bytes to fetch from a filing document (10-Ks can be 50MB+; we only need MD&A)
_MAX_FILING_BYTES = 500_000   # 500 KB — enough for most MD&A sections


# ── Ticker → CIK lookup ───────────────────────────────────────────────────────

def _load_ticker_map() -> None:
    """Populate _TICKER_TO_CIK from SEC's company_tickers.json (cached)."""
    global _TICKER_TO_CIK, _ticker_cache_loaded_at
    now = time.time()
    if _TICKER_TO_CIK and (now - _ticker_cache_loaded_at) < _TICKER_CACHE_TTL:
        return
    try:
        with httpx.Client(timeout=15, headers=_HEADERS) as client:
            resp = client.get(_TICKERS_JSON)
            resp.raise_for_status()
            data = resp.json()
        _TICKER_TO_CIK = {v["ticker"].upper(): int(v["cik_str"]) for v in data.values()}
        _ticker_cache_loaded_at = now
        logger.info(f"SEC ticker map loaded: {len(_TICKER_TO_CIK)} entries")
    except Exception as e:
        logger.warning(f"Could not load SEC ticker map: {e}")


def _get_cik(ticker: str) -> Optional[int]:
    _load_ticker_map()
    return _TICKER_TO_CIK.get(ticker.upper())


# ── Filings metadata ──────────────────────────────────────────────────────────

def _get_submissions(cik: int) -> dict:
    url = f"{_BASE_SUBMISSIONS}/CIK{cik:010d}.json"
    try:
        with httpx.Client(timeout=15, headers=_HEADERS) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"SEC submissions fetch failed for CIK {cik}: {e}")
        return {}


# ── Filing document fetcher ───────────────────────────────────────────────────

def _get_filing_index(cik: int, accession: str) -> list[dict]:
    """
    Fetch the filing index JSON to get a list of documents in the filing.
    Returns list of {"name": str, "type": str, "description": str, "url": str}
    """
    acc_nodash = accession.replace("-", "")
    cik_str = str(cik).zfill(10)
    index_url = f"{_ARCHIVES_BASE}/{cik_str}/{acc_nodash}/{acc_nodash}-index.json"
    try:
        with httpx.Client(timeout=15, headers=_HEADERS) as client:
            resp = client.get(index_url)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
        items = []
        for f in data.get("directory", {}).get("item", []):
            name = f.get("name", "")
            doc_type = f.get("type", "")
            desc = f.get("description", "")
            if name:
                url = f"{_ARCHIVES_BASE}/{cik_str}/{acc_nodash}/{name}"
                items.append({"name": name, "type": doc_type, "description": desc, "url": url})
        return items
    except Exception as e:
        logger.debug(f"Filing index fetch failed: {e}")
        return []


def _fetch_filing_html(url: str, max_bytes: int = _MAX_FILING_BYTES) -> str:
    """
    Fetch the raw HTML of a filing document, truncated to max_bytes.
    Returns empty string on failure.
    """
    try:
        with httpx.Client(timeout=20, headers={**_HEADERS, "Accept": "text/html"}) as client:
            # Stream the response and read only up to max_bytes
            with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    return ""
                content = b""
                for chunk in resp.iter_bytes(chunk_size=16384):
                    content += chunk
                    if len(content) >= max_bytes:
                        break
        return content.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.debug(f"Filing HTML fetch failed ({url}): {e}")
        return ""


# ── MD&A guidance extraction ──────────────────────────────────────────────────

def _extract_mda_text(html: str) -> str:
    """
    Extract text from the Management's Discussion and Analysis section
    of a 10-K or 10-Q filing.
    Returns cleaned plain text (max ~5000 chars).
    """
    if not html:
        return ""

    # Try BeautifulSoup if available
    if _BS4_AVAILABLE:
        try:
            soup = BeautifulSoup(html, "html.parser")
            # Remove script and style elements
            for tag in soup(["script", "style", "table"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
        except Exception:
            text = re.sub(r"<[^>]+>", " ", html)
    else:
        # Fallback: strip HTML tags with regex
        text = re.sub(r"<[^>]+>", " ", html)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Find the MD&A section
    mda_markers = [
        "management's discussion and analysis",
        "management discussion and analysis",
        "item 2. management",
        "management's discussion",
    ]
    outlook_markers = [
        "outlook", "financial outlook", "revenue guidance",
        "fiscal year guidance", "forward-looking", "our expectations",
    ]

    text_lower = text.lower()

    # Try to find MD&A start
    mda_start = -1
    for marker in mda_markers:
        idx = text_lower.find(marker)
        if idx != -1:
            mda_start = idx
            break

    if mda_start == -1:
        # Fallback: find first occurrence of guidance keywords
        for keyword in _GUIDANCE_KEYWORDS:
            idx = text_lower.find(keyword)
            if idx != -1:
                mda_start = max(0, idx - 200)
                break

    if mda_start == -1:
        # No identifiable section — return first 3000 chars
        return text[:3000]

    # Extract from MD&A start; try to find an "Outlook" subsection
    mda_text = text[mda_start:mda_start + 8000]
    mda_lower = mda_text.lower()

    for marker in outlook_markers:
        idx = mda_lower.find(marker)
        if idx != -1:
            # Return ~2000 chars around the outlook section
            start = max(0, idx - 100)
            return mda_text[start:start + 3000]

    # Return first 3000 chars of MD&A
    return mda_text[:3000]


def _extract_guidance_snippets(mda_text: str) -> list[str]:
    """
    Extract sentences containing guidance/forward-looking language.
    Returns up to 5 relevant sentences.
    """
    if not mda_text:
        return []

    # Split into sentences
    sentences = re.split(r"(?<=[.!?])\s+", mda_text)
    snippets = []
    seen = set()

    guidance_patterns = [
        r"\d+\s*(?:to|–|-)\s*\d+\s*%",         # "X to Y%"
        r"\d+\.?\d*\s*%",                         # "X.X%"
        r"(?:billion|million)\s+(?:to|in)\s+fiscal",
        r"(?:expect|anticipate|guide|forecast|outlook|project)",
    ]

    for sent in sentences:
        if len(snippets) >= 5:
            break
        sent = sent.strip()
        if len(sent) < 30 or len(sent) > 400:
            continue
        sent_lower = sent.lower()
        # Must contain at least one guidance keyword AND something quantitative
        has_keyword = any(kw in sent_lower for kw in _GUIDANCE_KEYWORDS)
        has_number = bool(re.search(r"\d", sent))
        if has_keyword and has_number and sent not in seen:
            seen.add(sent)
            snippets.append(sent)

    return snippets


def _find_main_document(documents: list[dict], form_type: str) -> Optional[str]:
    """
    From a filing's document list, find the URL of the main filing document.
    Prefers HTM/HTML documents of the matching form type.
    """
    # Look for the primary document (usually type = "10-K" or "10-Q")
    for doc in documents:
        if doc.get("type", "").upper() in (form_type.upper(), form_type.upper() + "/A"):
            name = doc.get("name", "")
            if name.endswith((".htm", ".html")):
                return doc["url"]

    # Fallback: first htm file in the index
    for doc in documents:
        if doc.get("name", "").endswith((".htm", ".html")):
            return doc["url"]

    return None


# ── Main public function ──────────────────────────────────────────────────────

def get_filing_data(ticker: str) -> dict:
    """
    Fetch comprehensive SEC filing data for a ticker.

    Returns:
        {
            "latest_10k_url": str | None,
            "latest_10k_period": str | None,
            "latest_10q_url": str | None,
            "latest_10q_period": str | None,
            "cik": int | None,
            "entity_name": str | None,
            "guidance_snippets_10k": list[str],
            "guidance_snippets_10q": list[str],
            "mda_text_10k": str,
            "mda_text_10q": str,
        }
    """
    result: dict = {
        "latest_10k_url": None,
        "latest_10k_period": None,
        "latest_10q_url": None,
        "latest_10q_period": None,
        "cik": None,
        "entity_name": None,
        "guidance_snippets_10k": [],
        "guidance_snippets_10q": [],
        "mda_text_10k": "",
        "mda_text_10q": "",
    }

    cik = _get_cik(ticker)
    if not cik:
        logger.warning(f"No SEC CIK found for ticker {ticker}")
        return result

    result["cik"] = cik

    submissions = _get_submissions(cik)
    if not submissions:
        return result

    result["entity_name"] = submissions.get("name")

    filings = submissions.get("filings", {}).get("recent", {})
    if not filings:
        return result

    forms        = filings.get("form", [])
    accessions   = filings.get("accessionNumber", [])
    filing_dates = filings.get("filingDate", [])
    periods      = filings.get("reportDate", [])

    found_10k_acc = None
    found_10q_acc = None
    found_10k = False
    found_10q = False

    for i, form in enumerate(forms):
        if not found_10k and form in ("10-K", "10-K/A"):
            acc = accessions[i]
            acc_nodash = acc.replace("-", "")
            cik_str = str(cik).zfill(10)
            direct_url = (
                f"{_ARCHIVES_BASE}/{cik_str}/{acc_nodash}/{acc_nodash}-index.htm"
            )
            result["latest_10k_url"] = direct_url
            result["latest_10k_period"] = (
                periods[i] if i < len(periods) else filing_dates[i] if i < len(filing_dates) else ""
            )
            found_10k_acc = acc
            found_10k = True

        elif not found_10q and form in ("10-Q", "10-Q/A"):
            acc = accessions[i]
            acc_nodash = acc.replace("-", "")
            cik_str = str(cik).zfill(10)
            direct_url = (
                f"{_ARCHIVES_BASE}/{cik_str}/{acc_nodash}/{acc_nodash}-index.htm"
            )
            result["latest_10q_url"] = direct_url
            result["latest_10q_period"] = (
                periods[i] if i < len(periods) else filing_dates[i] if i < len(filing_dates) else ""
            )
            found_10q_acc = acc
            found_10q = True

        if found_10k and found_10q:
            break

    # ── Fetch and parse the 10-K document ────────────────────────────────────
    if found_10k_acc:
        try:
            docs_10k = _get_filing_index(cik, found_10k_acc)
            main_url_10k = _find_main_document(docs_10k, "10-K")
            if main_url_10k:
                html_10k = _fetch_filing_html(main_url_10k)
                mda_10k = _extract_mda_text(html_10k)
                result["mda_text_10k"] = mda_10k[:3000]
                result["guidance_snippets_10k"] = _extract_guidance_snippets(mda_10k)
        except Exception as e:
            logger.warning(f"10-K document parse failed for {ticker}: {e}")

    # ── Fetch and parse the 10-Q document ────────────────────────────────────
    if found_10q_acc:
        try:
            docs_10q = _get_filing_index(cik, found_10q_acc)
            main_url_10q = _find_main_document(docs_10q, "10-Q")
            if main_url_10q:
                html_10q = _fetch_filing_html(main_url_10q)
                mda_10q = _extract_mda_text(html_10q)
                result["mda_text_10q"] = mda_10q[:2000]
                result["guidance_snippets_10q"] = _extract_guidance_snippets(mda_10q)
        except Exception as e:
            logger.warning(f"10-Q document parse failed for {ticker}: {e}")

    return result
