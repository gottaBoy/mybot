"""Immutable coding acceptance input, intentionally failing against the baseline."""
import unittest

from workbench.schemas import relative_path


class RelativePathAcceptance(unittest.TestCase):
    def test_rejects_newline(self):
        with self.assertRaises(ValueError):
            relative_path("source\nunexpected.py")

    def test_rejects_tab(self):
        with self.assertRaises(ValueError):
            relative_path("source\tunexpected.py")

    def test_retains_ordinary_source(self):
        self.assertEqual(relative_path("workbench/schemas.py"), "workbench/schemas.py")

    def test_retains_localized_source(self):
        self.assertEqual(relative_path("研发/方案.py"), "研发/方案.py")
