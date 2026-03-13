"""
Abstract base class for all data providers.
Implement this interface to add SEC, Alpha Vantage, FMP, Polygon, etc.
"""

from abc import ABC, abstractmethod
from api.schemas import CompanyInfo, HistoricalData


class BaseDataProvider(ABC):

    @abstractmethod
    def search(self, query: str) -> list[CompanyInfo]:
        """Search for companies matching ticker or name."""
        ...

    @abstractmethod
    def get_historicals(self, ticker: str) -> HistoricalData:
        """Return 5+ years of normalized historical financials."""
        ...
