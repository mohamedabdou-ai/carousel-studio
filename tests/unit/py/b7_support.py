"""Shared helpers for the unit tests that run a skill's scripts inside the test process.

Why this exists. Each skill folder carries its own copy of the `_cs` package (some of them trimmed), and a script finds the one it
belongs to through `sys.path` and `sys.modules`. A test runner imports every test module before it runs any of them and may run them
in any order, so a module that leaves a `_cs`, a search-path entry or a loaded script behind changes what the next module imports.
The rules for a test module that loads a script:

1. Load it in `setUpModule` / `setUpClass`, never at import time (all modules are imported first, and the imports pile up).
2. Call `cleanup()` from `tearDownModule`. It puts `sys.path`, the `_cs` modules and the bytecode flag back exactly as they were
   found, so it is safe in any order and safe to call twice.
3. Do not read the interpreter's state (`sys.path`, `sys.modules`) in the test itself; ask the helper.

`prepare(skill)` makes `import _cs` resolve for the scripts of one skill (its own synced copy, else the canonical one in
carousel-design). `load_script(skill, filename)` does that and imports the script. `enter(scripts_dir, *fallbacks)` and
`load_module(path, name)` are the same thing for a folder that is not a skill's `scripts/` (tests that point at another tree).
`load_tool(filename)` imports a repository tool from tools/ (it has no `_cs`, so there is no scope to close).
Bytecode is not written while a scope is open, so a test run leaves no `__pycache__` in the plugin folder.
"""
import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"

_state = None                   # what the interpreter looked like before the first enter()/prepare() of this scope
_loaded_scripts = []


def skill_dir(name):
    return SKILLS / name


def real_cs_dir(skill_name):
    """The `scripts` folder holding a genuine `_cs` package for this skill, or None."""
    for base in (skill_dir(skill_name) / "scripts", SKILLS / "carousel-design" / "scripts"):
        if (base / "_cs" / "__init__.py").is_file():
            return base
    return None


def real_qa_available(skill_name):
    """True when the genuine _cs.qa exists. Has no side effects, so it is safe in a skipUnless decorator."""
    base = real_cs_dir(skill_name)
    return bool(base and (base / "_cs" / "qa.py").is_file())


def _cs_keys():
    return [k for k in sys.modules if k == "_cs" or k.startswith("_cs.")]


def _purge_cs():
    for key in _cs_keys():
        del sys.modules[key]


def enter(scripts_dir, *fallback_dirs):
    """Open a scope: remember the interpreter's state, set aside any `_cs` already imported, and put `scripts_dir` first on
    `sys.path` (fallbacks after the rest), so `import _cs` finds the copy that sits next to the scripts under test."""
    global _state
    if _state is None:
        _state = {"path": list(sys.path), "cs": {k: sys.modules[k] for k in _cs_keys()}, "bytecode": sys.dont_write_bytecode}
        sys.dont_write_bytecode = True
    _purge_cs()
    sys.path.insert(0, str(scripts_dir))
    for extra in fallback_dirs:
        if str(extra) not in sys.path:
            sys.path.append(str(extra))


def prepare(skill_name):
    """Make `import _cs` resolve for scripts of `skill_name`; return 'synced' or 'canonical'."""
    base = real_cs_dir(skill_name)
    if base is None:
        raise RuntimeError("the shared _cs package is missing; run python tools/sync_shared.py")
    enter(base)
    return "synced" if base == skill_dir(skill_name) / "scripts" else "canonical"


def load_module(path, name):
    """Import the file at `path` as module `name` (registered in sys.modules while the scope is open, as dataclasses need)."""
    path = Path(path)
    scripts_dir = str(path.parent)
    if scripts_dir not in sys.path[:1]:
        sys.path.insert(0, scripts_dir)           # a script puts its own folder first as well; do it before it has to
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    _loaded_scripts.append(name)
    spec.loader.exec_module(module)
    return module


def load_script(skill_name, filename, module_name=None):
    prepare(skill_name)
    path = skill_dir(skill_name) / "scripts" / filename
    return load_module(path, module_name or ("b7_" + path.stem))


def load_tool(filename, module_name=None):
    """Import a repository tool (tools/<filename>) without putting tools/ on sys.path. The module stays registered under a name of its
    own (`<stem>_under_test`), which is what its dataclasses need and clashes with nothing."""
    path = REPO / "tools" / filename
    name = module_name or (path.stem + "_under_test")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def cleanup():
    """Undo every change made by enter(), prepare(), load_module() and load_script(): the search path, the `_cs` modules,
    the loaded scripts and the bytecode flag go back to what they were. Calling it twice, or without a scope, does nothing."""
    global _state
    for name in _loaded_scripts:
        sys.modules.pop(name, None)
    _loaded_scripts.clear()
    if _state is None:
        return
    _purge_cs()
    sys.modules.update(_state["cs"])
    sys.path[:] = _state["path"]
    sys.dont_write_bytecode = _state["bytecode"]
    _state = None
