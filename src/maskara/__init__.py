"""maskara: swap personal data for consistent synthetic personas, and measure that the data stayed useful.

    import maskara
    result = maskara.mask(tables={...}, texts={...}, subjects={...})

See `maskara.api` for the full contract.
"""

__version__ = "0.0.1"

from .api import MaskaraNotice, MaskingError, MaskResult, Mention, mask

__all__ = ["MaskResult", "MaskaraNotice", "MaskingError", "Mention", "__version__", "mask"]
