"""Command line for the living-room model."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from roomlab.case import DEFAULT_MODEL, check_frequency, load_case
from roomlab.run_model import run_case
from roomlab.session import start_client, stop_client


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="roomlab",
        description="Run the COMSOL 6.2 Acoustics of a Living Room model.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check_parser = sub.add_parser("check", help="Confirm COMSOL 6.2 and the seed model.")
    check_parser.add_argument("--model", type=Path, default=None)

    run_parser = sub.add_parser("run", help="Apply a case file and solve.")
    run_parser.add_argument("case", type=Path)
    run_parser.add_argument(
        "--study",
        choices=("freq", "modes", "both"),
        default="both",
        help="freq is the woofer playback. modes is the eigenfrequency study.",
    )
    run_parser.add_argument("--out", type=Path, default=None)
    run_parser.add_argument(
        "--allow-high-frequency",
        action="store_true",
        help="Allow f0 above 300 Hz. That refines the mesh.",
    )
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            return _check(args.model)
        return _run(args)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(exc, file=sys.stderr)
        return 1


def _check(model: Path | None) -> int:
    path = _find_model(model or DEFAULT_MODEL)
    print(f"Model file: {path}", flush=True)
    try:
        import mph  # noqa: F401
    except ImportError:
        print("Python package mph is not installed. From the repo root: pip install -e .", file=sys.stderr)
        return 1
    client = None
    try:
        client = start_client()
        loaded = client.load(path)
        names = ", ".join(f"{name}={loaded.parameter(name)}" for name in ("f0", "Nacc", "Zncouch"))
        print(f"COMSOL 6.2 opened the model. Parameters: {names}")
        client.remove(loaded)
    except Exception as exc:
        print(f"COMSOL 6.2 did not open the model: {exc}", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            stop_client(client)
    return 0


def _run(args) -> int:
    case = load_case(args.case)
    blocked = check_frequency(case.f0, allow_high=args.allow_high_frequency)
    if blocked:
        print(blocked, file=sys.stderr)
        return 1
    result = run_case(case, studies=args.study, out_dir=args.out)
    print(result.summary_path.read_text(encoding="utf-8"))
    if result.notes:
        return 1
    return 0


def _find_model(path: Path) -> Path:
    if path.is_file():
        return path.resolve()
    rooted = Path.cwd() / path
    if rooted.is_file():
        return rooted.resolve()
    raise FileNotFoundError(
        f"COMSOL model not found: {path}. "
        "Download the COMSOL 6.2 gallery files into models/acoustics-of-a-living-room/."
    )


if __name__ == "__main__":
    sys.exit(main())
