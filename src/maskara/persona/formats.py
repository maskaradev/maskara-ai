"""Format-preserving helpers: keep the shape of an original string while swapping its content.

Pure functions; every random choice comes from a `Stream` the caller derives from the vault key.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from ..vault import Stream


def match_case(word: str, like: str) -> str:
    """`word` in the casing of `like`: SMITH, smith, or as given."""
    letters = [c for c in like if c.isalpha()]
    if len(letters) > 1 and all(c.isupper() for c in letters):
        return word.upper()
    if letters and all(c.islower() for c in letters):
        return word.lower()
    return word


def fill(template: str, s: Stream) -> str:
    """Same length and character classes: digits -> digits, letters -> letters of the same case."""
    out = []
    for c in template:
        if c.isdigit():
            out.append(str(s.below(10)))
        elif c.isalpha() and c.isascii():
            letter = chr(ord("a") + s.below(26))
            out.append(letter.upper() if c.isupper() else letter)
        else:
            out.append(c)
    return "".join(out)


def put_digits(template: str, digits: str) -> str:
    """Write `digits` into the digit positions of `template`, keeping everything else."""
    it = iter(digits)
    return "".join(next(it) if c.isdigit() else c for c in template)


def luhn_ok(digits: str) -> bool:
    return len(digits) > 1 and luhn_digit(digits[:-1]) == digits[-1]


def luhn_digit(payload: str) -> str:
    total = 0
    for i, c in enumerate(reversed(payload)):
        d = int(c) * (2 if i % 2 == 0 else 1)
        total += d - 9 if d > 9 else d
    return str(-total % 10)


# -- identifiers ------------------------------------------------------------------------------------

SSN = re.compile(r"^\d{3}([- ]?)\d{2}\1\d{4}$")

# Published test-card prefixes per network (first digits of the original -> replacement prefix).
# Test ranges are not issued to cardholders, so a replacement cannot be someone's real card.
CARD_PREFIXES = (("34", "378282"), ("37", "378282"), ("35", "353011"), ("30", "305693"), ("36", "305693"),
                 ("38", "305693"), ("6", "601111"), ("5", "555555"), ("2", "555555"), ("4", "411111"))


def ssn(template: str, s: Stream) -> str:
    """An SSN in the 900-999 area, which SSA never issues, with a group (01-49) outside ITIN ranges."""
    return put_digits(template, f"{s.between(900, 999)}{s.between(1, 49):02d}{s.between(1, 9999):04d}")


def card(template: str, s: Stream) -> str:
    """A Luhn-valid number of the same length and layout, under the network's test prefix."""
    digits = re.sub(r"\D", "", template)
    prefix = next((p for lead, p in CARD_PREFIXES if digits.startswith(lead)), "411111")
    body = prefix + "".join(str(s.below(10)) for _ in range(len(digits) - len(prefix) - 1))
    return put_digits(template, body + luhn_digit(body))


def identifier(template: str, s: Stream) -> str:
    """Character-class-preserving replacement; a Luhn-valid original stays Luhn-valid."""
    out = fill(template, s)
    digits = re.sub(r"\D", "", template)
    if template[-1:].isdigit() and len(digits) >= 8 and luhn_ok(digits):
        new = re.sub(r"\D", "", out)
        out = out[:-1] + luhn_digit(new[:-1])
    return out


# -- network ----------------------------------------------------------------------------------------

IPV4 = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
MAC = re.compile(r"^[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$")
URL = re.compile(r"^(?P<scheme>[a-z][a-z0-9+.-]*://)?(?P<www>www\.)?(?P<host>[^/\s:?#]+)(?P<rest>.*)$", re.IGNORECASE)
TEST_NETS = ("192.0.2", "198.51.100", "203.0.113")  # RFC 5737 documentation ranges
RESERVED_DOMAINS = ("example.com", "example.org", "example.net")  # RFC 2606


def network(text: str, s: Stream) -> str:
    """IPs go to documentation ranges, MACs get the locally-administered bit, hosts become example.*."""
    if IPV4.match(text):
        return f"{s.pick(TEST_NETS)}.{s.between(1, 254)}"
    if ":" in text and re.fullmatch(r"[0-9A-Fa-f:]+", text) and not MAC.match(text):
        groups = ":".join(f"{s.below(1 << 16):x}" for _ in range(6))
        return match_case(f"2001:db8:{groups}", text)
    if m := MAC.match(text):
        octets = [s.below(256) for _ in range(6)]
        octets[0] = (octets[0] | 0x02) & 0xFE  # locally administered, unicast: no vendor owns it
        return match_case(m.group(1).join(f"{o:02x}" for o in octets), text)
    if (m := URL.match(text)) and "." in m["host"]:
        rest = fill(m["rest"], s) if m["rest"] else ""
        return f"{m['scheme'] or ''}{m['www'] or ''}{s.pick(RESERVED_DOMAINS)}{rest}"
    return fill(text, s)


# -- contact ----------------------------------------------------------------------------------------

def phone(template: str, ten_digits: str) -> str | None:
    """Put a persona's 10-digit number into the original's layout, or None for unknown layouts."""
    digits = re.sub(r"\D", "", template)
    if len(digits) == 10:
        return put_digits(template, ten_digits)
    if len(digits) == 11 and digits[0] == "1":
        return put_digits(template, "1" + ten_digits)
    if len(digits) == 7:
        return put_digits(template, ten_digits[3:])
    return None


def ascii_letters(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


def email(original: str, first: str, last: str, domain: str, s: Stream) -> str:
    """An address in the original's local-part style: first.last, first_last, or flast; digits kept."""
    local = original.split("@", 1)[0]
    sep = next((c for c in ".-_" if c in local.strip(".-_")), None)
    f, ln = ascii_letters(first), ascii_letters(last)
    out = f"{f}{sep}{ln}" if sep else f"{f[:1]}{ln}"
    if n := sum(c.isdigit() for c in local):
        out += "".join(str(s.below(10)) for _ in range(n))
    return f"{out}@{domain}"


# -- dates ------------------------------------------------------------------------------------------

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_MON = (r"(?P<mon>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
        r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?")
_WD = (r"(?:(?P<wd>mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?"
       r"|sat(?:urday)?|sun(?:day)?)\.?,?\s+)?")
_ORD = r"(?P<ord>st|nd|rd|th)?"
DATE_PATTERNS = [re.compile(p, re.IGNORECASE) for p in (
    r"(?<!\d)(?P<y>\d{4})(?P<s>[-/.])(?P<m>\d{1,2})(?P=s)(?P<d>\d{1,2})(?!\d)",       # 2004-03-07T10:00
    r"(?<!\d)(?P<m>\d{1,2})(?P<s>[-/.])(?P<d>\d{1,2})(?P=s)(?P<y>\d{4}|\d{2})(?!\d)",  # 3/7/2004, 03-07-04
    _WD + _MON + r"\s+(?P<d>\d{1,2})" + _ORD + r"\b(?:,?\s+(?P<y>\d{4})\b)?",  # Sunday, March 7th, 2004
    _WD + r"\b(?P<d>\d{1,2})" + _ORD + r"\s+(?:of\s+)?" + _MON + r"(?:,?\s+(?P<y>\d{4})\b)?",  # 7 March 2004
    r"\b" + _MON + r",?\s+(?P<y>\d{4})\b",                                   # March 2004
)]
NO_YEAR = 2000  # a leap year, so 'Feb 29' without a year still parses


def _parse(m: re.Match) -> tuple[date, bool] | None:
    """The match as (date, day_first), or None if it is not a real calendar date."""
    g = m.groupdict()
    if g.get("mon"):
        month = next(i for i, name in enumerate(MONTHS, 1) if name.lower().startswith(g["mon"][:3].lower()))
    else:
        month = int(g["m"])
    day = int(g["d"]) if g.get("d") else 15  # month-year only: shift from mid-month
    year = int(g["y"]) if g.get("y") else NO_YEAR
    if g.get("y") and len(g["y"]) == 2:
        year += 2000 if year <= 30 else 1900
    day_first = False
    if not g.get("mon") and month > 12 and day <= 12:  # 25/12/2004 can only be day-first
        month, day, day_first = day, month, True
    try:
        return date(year, month, day), day_first
    except ValueError:
        return None


def _name(full: str, like: str) -> str:
    """Month or weekday name in the style of `like`: full or abbreviated, same casing."""
    word = like.rstrip(".")
    if len(word) > 4 or word.lower() in ("may", "june", "july"):
        return match_case(full, word)
    return match_case(full[:4] if full == "September" and len(word) == 4 else full[:3], word)


def _ordinal(day: int, like: str) -> str:
    suffix = "th" if 11 <= day % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return match_case(suffix, like)


def _render(m: re.Match, new: date, day_first: bool) -> str:
    g = m.groupdict()
    values = {"mon": _name(MONTHS[new.month - 1], g["mon"]) if g.get("mon") else None,
              "wd": _name(WEEKDAYS[new.weekday()], g["wd"]) if g.get("wd") else None,
              "ord": _ordinal(new.day, g["ord"]) if g.get("ord") else None}
    if g.get("y"):
        values["y"] = f"{new.year % 100:02d}" if len(g["y"]) == 2 else str(new.year)
    # Zero-padded if the original shows it: a leading zero, or two-digit month and day ('12/25').
    padded = any(g.get(k, "").startswith("0") for k in "md") or (len(g.get("m") or "") == len(g.get("d") or "") == 2)
    for key, value in (("m", new.month), ("d", new.day)):
        slot = {"m": "d", "d": "m"}[key] if day_first else key
        if g.get(slot):
            values[slot] = f"{value:02d}" if padded else str(value)
    # Rebuild the matched text, swapping only the groups that hold date parts.
    out, pos = [], m.start()
    for (a, b), v in sorted((m.span(k), v) for k, v in values.items() if v is not None and m.group(k)):
        out += [m.string[pos:a], v]
        pos = b
    out.append(m.string[pos:m.end()])
    return "".join(out)


def shift_dates(text: str, days: int) -> tuple[str, int]:
    """Shift every date in `text` by `days`, keeping each one's format. Returns (text, dates shifted).

    Numeric dates are read month-first (US English) unless the first number cannot be a month.
    Weekday names are recomputed; month-year dates move by the shift of their mid-month day.
    """
    found: list[tuple[int, int, re.Match]] = []
    for pattern in DATE_PATTERNS:
        for m in pattern.finditer(text):
            found.append((m.start(), -m.end(), m))
    out, pos, n = [], 0, 0
    for start, neg_end, m in sorted(found, key=lambda f: (f[0], f[1])):
        if start < pos or not (parsed := _parse(m)):
            continue
        d, day_first = parsed
        out += [text[pos:start], _render(m, d + timedelta(days=days), day_first)]
        pos, n = -neg_end, n + 1
    out.append(text[pos:])
    return "".join(out), n


def parse_date(text: str) -> date | None:
    """The first date in `text`, read as `shift_dates` reads it, or None."""
    found = sorted((m.start(), -m.end(), i, m) for i, p in enumerate(DATE_PATTERNS) for m in p.finditer(text))
    for *_, m in found:
        if parsed := _parse(m):
            return parsed[0]
    return None
