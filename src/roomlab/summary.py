"""Text summary of one living-room run."""

from __future__ import annotations

from roomlab.case import Case


def render_summary(
    case: Case,
    *,
    studies: list[str],
    spl_db: float | None,
    modes: list[tuple[float, float]],
    images: list[str],
    solved_mph: str | None,
    bounds: list[float] | None,
    notes: list[str],
) -> str:
    lines = [
        "# Living room",
        "",
        f"- Case: `{case.path}`",
        f"- Model: `{case.model}`",
        f"- f0: `{case.f0}`",
        f"- Nacc: `{case.nacc}`",
        f"- Zncouch: `{case.zncouch}`",
        f"- Eigenfrequency search: `{case.eigenfrequency_around}`",
        f"- Studies solved: {', '.join(studies) if studies else 'none'}",
        "",
    ]
    if bounds and len(bounds) >= 6:
        lines.append(
            "- Geometry bounds, meters: "
            f"x {bounds[0]:.3g} to {bounds[1]:.3g}, "
            f"y {bounds[2]:.3g} to {bounds[3]:.3g}, "
            f"z {bounds[4]:.3g} to {bounds[5]:.3g}"
        )
        lines.append("")
    if case.listener_m is None:
        lines.append("No listening point was set in the case file.")
    elif spl_db is None:
        lines.append(
            f"Listening point { _point(case.listener_m) } m. "
            "Sound pressure level was not evaluated."
        )
    else:
        lines.append(
            f"Sound pressure level at { _point(case.listener_m) } m: {spl_db:.2f} dB."
        )
    lines.append("")
    if modes:
        lines.append("## Eigenfrequencies")
        lines.append("")
        lines.append("| Real (Hz) | Imaginary (Hz) |")
        lines.append("| --- | --- |")
        for real, imag in modes:
            lines.append(f"| {real:.4g} | {imag:.4g} |")
        lines.append("")
    if images or solved_mph:
        lines.append("## Files")
        lines.append("")
        for image in images:
            lines.append(f"- `{image}`")
        if solved_mph:
            lines.append(f"- `{solved_mph}`")
        lines.append("")
    if notes:
        lines.append("## Notes")
        lines.append("")
        for note in notes:
            lines.append(f"- {note}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _point(coords: tuple[float, float, float]) -> str:
    return f"({coords[0]:.4g}, {coords[1]:.4g}, {coords[2]:.4g})"
