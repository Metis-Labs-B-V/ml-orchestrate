#!/usr/bin/env python
import os
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent.parent
REQUIREMENTS_PATH = BACKEND_DIR / "requirements.txt"


def ensure_pip_chill():
    try:
        import pip_chill  # noqa: F401
        return
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pip-chill"])


def run_pip_install(args):
    if not args:
        print("Usage: pipin.py <pip install args>")
        print("Example: pipin.py django djangorestframework")
        sys.exit(1)
    subprocess.check_call([sys.executable, "-m", "pip", "install", *args])


def resolve_pip_chill_cmd():
    scripts_dir = Path(sys.executable).resolve().parent
    candidates = [
        scripts_dir / ("pip-chill.exe" if os.name == "nt" else "pip-chill"),
        scripts_dir / ("pip-chill"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return shutil.which("pip-chill")


def update_requirements():
    REQUIREMENTS_PATH.touch(exist_ok=True)
    pip_chill_cmd = resolve_pip_chill_cmd()
    if pip_chill_cmd:
        output = subprocess.check_output([pip_chill_cmd], text=True)
    else:
        output = subprocess.check_output([sys.executable, "-m", "pip_chill"], text=True)

    REQUIREMENTS_PATH.write_text(output)
    print(f"Updated {REQUIREMENTS_PATH}")


def main():
    ensure_pip_chill()
    run_pip_install(sys.argv[1:])
    update_requirements()


if __name__ == "__main__":
    main()
