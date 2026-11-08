"""Load and check a living-room case file."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

DEFAULT_MODEL = Path(
    "models/acoustics-of-a-living-room/living_room_acoustics_llrevit.mph"
)
# The gallery mesh was built at this drive frequency. Any other f0 needs a remesh.
SEEDED_F0 = "100[Hz]"
# hmax is lambda/6. Above this, the furnished-room mesh gets large quickly.
HIGH_FREQUENCY_HZ = 300.0

_HZ = re.compile(r"^\s*([0-9]*\.?[0-9]+)\s*(?:\[Hz\])?\s*$")


@dataclass(frozen=True)
class Case:
    path: Path
    model: Path
    f0: str
    nacc: str
    zncouch: str
    eigenfrequency_around: str
    listener_m: tuple[float, float, float] | None


def load_case(path: Path) -> Case:
    path = path.resolve()
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"{path} must be a mapping of case settings.")
    model = _resolve_model(path, _require_str(raw, "model", path))
    listener = _listener(raw.get("listener_m"), path)
    return Case(
        path=path,
        model=model,
        f0=_require_str(raw, "f0", path),
        nacc=_require_str(raw, "nacc", path),
        zncouch=_require_str(raw, "zncouch", path),
        eigenfrequency_around=_require_str(raw, "eigenfrequency_around", path),
        listener_m=listener,
    )


def frequency_hz(expr: str) -> float | None:
    """Return a plain hertz value when the expression is a single number."""
    match = _HZ.match(expr)
    if match is None:
        return None
    return float(match.group(1))


def check_frequency(expr: str, *, allow_high: bool) -> str | None:
    """Return an error message when f0 is high enough to need an explicit opt-in."""
    hz = frequency_hz(expr)
    if hz is None or hz <= HIGH_FREQUENCY_HZ or allow_high:
        return None
    return (
        f"f0 is {hz:g} Hz. The living-room mesh size is lambda/6, so this "
        f"refines the mesh well past the gallery case of 100 Hz. Re-run with "
        f"--allow-high-frequency to solve it anyway."
    )


def _require_str(raw: dict, key: str, path: Path) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path} is missing a string value for {key}.")
    if "\n" in value:
        raise ValueError(f"{path} field {key} must be one line.")
    return value.strip()


def _resolve_model(case_path: Path, model_field: str) -> Path:
    raw = Path(model_field)
    if raw.is_absolute():
        return raw
    candidates = [
        Path.cwd() / raw,
        case_path.parent.parent / raw,
        case_path.parent / raw,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return (case_path.parent.parent / raw).resolve()


def _listener(value, path: Path) -> tuple[float, float, float] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{path} listener_m must be three numbers, [x, y, z] in meters.")
    try:
        return (float(value[0]), float(value[1]), float(value[2]))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{path} listener_m must be three numbers.") from exc
