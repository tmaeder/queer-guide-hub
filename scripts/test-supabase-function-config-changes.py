import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('changes', Path(__file__).with_name('supabase-function-config-changes.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Selection(unittest.TestCase):
    def test_new_function_does_not_redeploy_existing_workers(self):
        old = {'project_id': 'project', 'functions': {'existing': {'verify_jwt': False}}}
        new = {'project_id': 'project', 'functions': {**old['functions'], 'new-worker': {'verify_jwt': False}}}
        self.assertEqual(module.changed_functions(old, new), ['new-worker'])
    def test_changed_or_removed_settings_are_selected(self):
        self.assertEqual(module.changed_functions({'functions': {'a': {'verify_jwt': True}, 'b': {}}}, {'functions': {'a': {'verify_jwt': False}}}), ['a', 'b'])
    def test_global_changes_redeploy_every_function(self):
        self.assertEqual(module.changed_functions({'project_id': 'old'}, {'project_id': 'new'}), ['*'])

if __name__ == '__main__':
    unittest.main()
