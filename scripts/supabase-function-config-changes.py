"""List functions whose configuration changed; global changes require all (*)."""
import subprocess
import sys
import tomllib
from pathlib import Path


def changed_functions(before, after):
    old, new = dict(before), dict(after)
    old_functions, new_functions = old.pop('functions', {}), new.pop('functions', {})
    if old != new:
        return ['*']
    return sorted(name for name in old_functions.keys() | new_functions.keys()
                  if old_functions.get(name) != new_functions.get(name))


if __name__ == '__main__':
    old = subprocess.check_output(['git', 'show', f'{sys.argv[1]}:supabase/config.toml'], text=True)
    new = Path('supabase/config.toml').read_text()
    print('\n'.join(changed_functions(tomllib.loads(old), tomllib.loads(new))))
