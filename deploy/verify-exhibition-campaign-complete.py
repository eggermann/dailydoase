#!/usr/bin/env python3
"""Return success only when every enabled Scene profile completed its configured iteration count."""
import json
import sys
from pathlib import Path

def read_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)

def main():
    if len(sys.argv) != 3:
        return 2
    repository_root = Path(sys.argv[1]).resolve()
    output_directory = Path(sys.argv[2]).resolve()
    try:
        settings = read_json(repository_root / "eu-reski-news/default-exhibition-settings.json")
        default_iterations = settings["generation"]["iterations"]
        scene_directory = (repository_root / "eu-reski-news/scenes/campaign-10h").resolve()
        expected = {}
        for scene_path in sorted(scene_directory.glob("*.scene.json")):
            scene = read_json(scene_path)
            name = scene.get("name")
            if not name:
                raise ValueError(f"Scene profile has no name: {scene_path.name}")
            count = scene.get("generationOverrides", {}).get("iterations", default_iterations)
            if not isinstance(count, int) or count < 1 or name in expected:
                raise ValueError(f"Invalid or duplicate Scene profile: {scene_path.name}")
            expected[name] = count
        state = read_json(output_directory / "exhibition-state.json")
        workers = state.get("sceneWorkers", {})
        if not expected or len(workers) != len(expected):
            return 1
        if {worker.get("name") for worker in workers.values()} != set(expected):
            return 1
        for worker in workers.values():
            if worker.get("status") != "completed":
                return 1
            run_directory = Path(worker["runDirectory"]).resolve()
            if not run_directory.is_relative_to(output_directory):
                return 1
            run = read_json(run_directory / "run.json")
            count = expected[worker["name"]]
            if run.get("status") != "completed" or run.get("iterationLimit") != count:
                return 1
            if len(run.get("iterations", [])) != count:
                return 1
        return 0
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
