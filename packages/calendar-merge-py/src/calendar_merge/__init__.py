"""Calendar merge: combines multiple weekly presence calendars into one. Domain-agnostic, no Home Assistant dependency."""

from .merge import CalendarEvent, merge_calendars

__all__ = ["CalendarEvent", "merge_calendars"]
