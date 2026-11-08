"""Load the living-room model, apply a case, and solve."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from roomlab.case import SEEDED_F0, Case
from roomlab.session import start_client, stop_client
from roomlab.summary import render_summary

FREQ_STUDY = "Study 1 Frequency Domain"
MODE_STUDY = "Study 2 Eigenfrequency"
SPL_PLOT = "pg2"
MODE_PLOT = "pg7"
FREQ_DATASET = "dset1"
MODE_DATASET = "dset2"


@dataclass
class RunResult:
    directory: Path
    summary_path: Path
    studies: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def run_case(
    case: Case,
    *,
    studies: str = "both",
    out_dir: Path | None = None,
) -> RunResult:
    if studies not in {"freq", "modes", "both"}:
        raise ValueError(f"Unknown study selection {studies!r}.")
    if not case.model.is_file():
        raise FileNotFoundError(
            f"COMSOL model not found: {case.model}. "
            "Download the COMSOL 6.2 Acoustics of a Living Room files into "
            "models/acoustics-of-a-living-room/."
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory = (out_dir or Path("results") / stamp).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    log_path = directory / "solve.log"
    notes: list[str] = []
    solved: list[str] = []
    images: list[str] = []
    spl_db: float | None = None
    modes: list[tuple[float, float]] = []
    bounds: list[float] | None = None
    solved_mph: Path | None = None

    client = None
    try:
        client = start_client()
        _log(log_path, f"Loading {case.model}")
        model = client.load(case.model)
        _apply(model, case, log_path)
        bounds = _bounds(model, notes)
        if _normalize(case.f0) != _normalize(SEEDED_F0):
            _log(log_path, "Rebuilding mesh because f0 differs from 100[Hz].")
            model.mesh("Mesh 1")
        if studies in {"freq", "both"}:
            _log(log_path, f"Solving {FREQ_STUDY}")
            model.solve(FREQ_STUDY)
            solved.append(FREQ_STUDY)
            spl_db = _listening_level(model, case, notes, log_path)
            _export_plot(model, SPL_PLOT, directory / "spl.png", images, notes, log_path)
        if studies in {"modes", "both"}:
            _log(log_path, f"Solving {MODE_STUDY}")
            model.solve(MODE_STUDY)
            solved.append(MODE_STUDY)
            modes = _eigenfrequencies(model, notes, log_path)
            _export_plot(model, MODE_PLOT, directory / "modes.png", images, notes, log_path)
        solved_mph = directory / "living_room.mph"
        _log(log_path, f"Saving {solved_mph}")
        try:
            model.save(solved_mph)
        except Exception as exc:
            solved_mph = None
            notes.append(f"Could not save the solved model: {exc}")
            _log(log_path, notes[-1])
        client.remove(model)
    except Exception as exc:
        notes.append(str(exc))
        _log(log_path, str(exc))
    finally:
        if client is not None:
            stop_client(client)

    summary = render_summary(
        case,
        studies=solved,
        spl_db=spl_db,
        modes=modes,
        images=images,
        solved_mph=solved_mph.name if solved_mph else None,
        bounds=bounds,
        notes=notes,
    )
    summary_path = directory / "summary.md"
    summary_path.write_text(summary, encoding="utf-8")
    return RunResult(directory=directory, summary_path=summary_path, studies=solved, notes=notes)


def _apply(model, case: Case, log_path: Path) -> None:
    for name, value in (
        ("f0", case.f0),
        ("Nacc", case.nacc),
        ("Zncouch", case.zncouch),
    ):
        _log(log_path, f"Set {name} = {value}")
        model.parameter(name, value)
    shift = case.eigenfrequency_around
    _log(log_path, f"Set eigenfrequency shift = {shift}")
    model.java.study("std2").feature("eig").set("shift", shift)


def _bounds(model, notes: list[str]) -> list[float] | None:
    try:
        raw = model.java.component("comp1").geom("geom1").getBoundingBox()
        return [float(value) for value in raw]
    except Exception as exc:
        notes.append(f"Geometry bounds were not read: {exc}")
        return None


def _listening_level(model, case: Case, notes: list[str], log_path: Path) -> float | None:
    if case.listener_m is None:
        return None
    x, y, z = case.listener_m
    tag = "roomlab_listener"
    try:
        numerical = model.java.result().numerical()
        numerical.create(tag, "EvalPoint")
        point = model.java.result().numerical(tag)
        point.set("data", FREQ_DATASET)
        _set_strings(point, "expr", ["acpr.Lp_t"])
        _set_strings(point, "unit", ["dB"])
        point.set("x", str(x))
        point.set("y", str(y))
        point.set("z", str(z))
        values = _flatten(point.getReal())
        if not values:
            raise RuntimeError("COMSOL returned no sound pressure level.")
        level = values[0]
        _log(log_path, f"SPL at ({x}, {y}, {z}) = {level} dB")
        return level
    except Exception as exc:
        notes.append(f"Listening-point evaluation failed: {exc}")
        _log(log_path, notes[-1])
        return None


def _eigenfrequencies(model, notes: list[str], log_path: Path) -> list[tuple[float, float]]:
    tag = "roomlab_modes"
    try:
        numerical = model.java.result().numerical()
        numerical.create(tag, "EvalGlobal")
        group = model.java.result().numerical(tag)
        group.set("data", MODE_DATASET)
        _set_strings(group, "expr", ["freq"])
        _set_strings(group, "unit", ["Hz"])
        real = _flatten(group.getReal())
        imag = _flatten(group.getImag())
        if len(imag) < len(real):
            imag = imag + [0.0] * (len(real) - len(imag))
        modes = list(zip(real, imag))
        _log(log_path, f"Eigenfrequencies: {modes}")
        return modes
    except Exception as exc:
        notes.append(f"Eigenfrequency readout failed: {exc}")
        _log(log_path, notes[-1])
        return []


def _export_plot(model, tag: str, destination: Path, images: list[str], notes: list[str], log_path: Path) -> None:
    export_tag = f"roomlab_img_{tag}"
    try:
        model.java.result(tag).run()
        export = model.java.result().export()
        export.create(export_tag, "Image")
        image = model.java.result().export(export_tag)
        image.set("plotgroup", tag)
        image.set("pngfilename", str(destination))
        image.run()
        images.append(destination.name)
        _log(log_path, f"Wrote {destination}")
    except Exception as exc:
        notes.append(f"Plot {tag} was not exported: {exc}")
        _log(log_path, notes[-1])


def _set_strings(node, name: str, values: list[str]) -> None:
    try:
        node.set(name, values)
        return
    except Exception:
        pass
    import jpype

    node.set(name, jpype.JArray(jpype.JString)(values))


def _flatten(data) -> list[float]:
    if data is None:
        return []
    values: list[float] = []
    for item in data:
        try:
            values.append(float(item))
        except TypeError:
            values.extend(float(part) for part in item)
    return values


def _normalize(expr: str) -> str:
    return expr.replace(" ", "")


def _log(path: Path, message: str) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(message + "\n")
