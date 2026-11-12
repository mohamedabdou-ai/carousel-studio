"""Carousel Studio shared Python package (CONTRACT 9.4).

Canonical copy: ``carousel-design/scripts/_cs/``. Other skills receive byte-identical copies of the modules they need
(``tools/sync_shared.py``, CONTRACT 2.4); a synced skill must never import a module it did not receive.

Python 3.11, standard library only, Windows and Linux. All text is UTF-8, all paths are ``pathlib.Path``.
"""

__version__ = "1.2.0"

#: Error codes of CONTRACT 0.4. CLI scripts print ``cs-error: <code>: <message>`` to stderr.
ERROR_CODES = (
    "E_SCHEMA", "E_FONT_MISSING", "E_FIT_OVERFLOW", "E_PAINT_TAINTED", "E_PAINT_UNSUPPORTED", "E_ENCODER_UNSUPPORTED",
    "E_DEP_LOAD", "E_NO_CAPABILITY", "E_CONFLICT", "E_ABORTED", "E_USAGE", "E_INTERNAL",
)

#: Exit codes shared by every CLI (CONTRACT 0.4).
EXIT_OK, EXIT_FIX, EXIT_BLOCK, EXIT_USAGE, EXIT_DATA, EXIT_NOINPUT, EXIT_INTERNAL, EXIT_CANTCREAT, EXIT_CONFLICT = 0, 1, 2, 64, 65, 66, 70, 73, 75


class CSError(Exception):
    """An error with a machine-readable ``code`` (same codes as the browser runtime) and optional ``detail``."""

    def __init__(self, code, message="", detail=None):
        super().__init__(message or code)
        self.code = code
        self.detail = detail

    def __str__(self):
        text = super().__str__()
        return text if text and text != self.code else self.code
