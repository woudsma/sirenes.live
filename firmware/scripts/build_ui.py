Import("env")
import subprocess
import os
import sys

def build_ui(source, target, env):
    ui_dir = os.path.abspath(os.path.join(env["PROJECT_DIR"], "..", "ui"))
    print(f"\n>>> Building UI ({ui_dir})...")
    result = subprocess.run(["npm", "run", "build"], cwd=ui_dir)
    if result.returncode != 0:
        print("ERROR: UI build failed — aborting filesystem upload")
        sys.exit(1)
    print(">>> UI build done\n")

env.AddPreAction("$BUILD_DIR/littlefs.bin", build_ui)
