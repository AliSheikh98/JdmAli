"""Start and stop a COMSOL 6.2 session through MPh."""

from __future__ import annotations

COMSOL_VERSION = "6.2"


def start_client():
    import mph

    return mph.start(version=COMSOL_VERSION)


def stop_client(client) -> None:
    try:
        client.clear()
    except Exception:
        pass
    try:
        client.disconnect()
    except Exception:
        pass
