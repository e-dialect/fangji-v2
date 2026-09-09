import unittest
from audit_keyboard_csv import missing_sequences


class KeyboardCoverageTest(unittest.TestCase):
    def test_mark_inside_other_key_does_not_cover_standalone_input(self):
        self.assertEqual(missing_sequences('a\u0303', {'ø\u0303'}), ['a\u0303'])
        self.assertEqual(missing_sequences('a\u0303', {'\u0303'}), [])

    def test_exact_composition_and_similar_symbols(self):
        self.assertEqual(missing_sequences('a\u0323\u0303', {'\u0323', '\u0303'}), [])
        self.assertEqual(missing_sequences('Ǿ〔∣', {'Ø', '[', '|'}), ['Ǿ', '〔', '∣'])
        self.assertEqual(missing_sequences('汉字𠮷，。ABC', set()), [])


if __name__ == '__main__':
    unittest.main()
