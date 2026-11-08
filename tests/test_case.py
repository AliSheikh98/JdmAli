import unittest
from pathlib import Path

from roomlab.case import check_frequency, load_case

ROOT = Path(__file__).resolve().parents[1]
CASE = ROOT / "cases" / "living_room.yaml"


class CaseTests(unittest.TestCase):
    def test_example_case(self):
        case = load_case(CASE)
        self.assertEqual(case.f0, "100[Hz]")
        self.assertEqual(case.nacc, "1[m/s^2]")
        self.assertEqual(case.zncouch, "1000-900*i[Pa*s/m]")
        self.assertEqual(case.eigenfrequency_around, "10[Hz]")
        self.assertIsNone(case.listener_m)
        self.assertTrue(str(case.model).endswith("living_room_acoustics_llrevit.mph"))

    def test_listener_must_be_three_numbers(self):
        bad = ROOT / "cases" / "_bad_listener.yaml"
        bad.write_text(
            "model: models/acoustics-of-a-living-room/living_room_acoustics_llrevit.mph\n"
            "f0: 100[Hz]\n"
            "nacc: 1[m/s^2]\n"
            "zncouch: 1[Pa*s/m]\n"
            "eigenfrequency_around: 10[Hz]\n"
            "listener_m: [1, 2]\n",
            encoding="utf-8",
        )
        try:
            with self.assertRaises(ValueError):
                load_case(bad)
        finally:
            bad.unlink()

    def test_high_frequency_guard(self):
        self.assertIsNone(check_frequency("100[Hz]", allow_high=False))
        self.assertIsNone(check_frequency("2*f0", allow_high=False))
        self.assertIsNotNone(check_frequency("400[Hz]", allow_high=False))
        self.assertIsNone(check_frequency("400[Hz]", allow_high=True))


if __name__ == "__main__":
    unittest.main()
