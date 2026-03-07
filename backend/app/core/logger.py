import logging
import sys

from app.core.config import settings


def _build_logger() -> logging.Logger:
    log = logging.getLogger("jobsync")
    log.setLevel(logging.DEBUG if settings.ENV == "development" else logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    fmt = "%(asctime)s [%(levelname)s] %(name)s — %(message)s"
    handler.setFormatter(logging.Formatter(fmt))
    log.addHandler(handler)
    return log


logger = _build_logger()
