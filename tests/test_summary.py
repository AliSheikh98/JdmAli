import unittest
from pathlib import Path

from roomlab.case import Case
from roomlab.summary import render_summary


class SummaryTests(unittest.TestCase):
    def test_renders_level_and_modes(self):
        case = Case(
            path=Path("cases/living_room.yaml"),
            model=Path("model.mph"),
            f0="100[Hz]",
            nacc="1[m/s^2]",
            zncouch="1000-900*i[Pa*s/m]",
            eigenfrequency_around="10[Hz]",
            listener_m=(1.0, 2.0, 1.2),
        )
        text = render_summary(
            case,
            studies=["Study 1 Frequency Domain"],
            spl_db=72.5,
            modes=[(38.39, 1.15), (49.52, 0.899)],
            images=["spl.png"],
            solved_mph="living_room.mph",
            bounds=[0, 8, 0, 6, 0, 3],
            notes=["Plot pg7 was not exported: headless"],
        )
        self.assertIn("72.50 dB", text)
        self.assertIn("38.39", text)
        self.assertIn("spl.png", text)
        self.assertIn("headless", text)
        self.assertIn("x 0 to 8", text)


if __name__ == "__main__":
    unittest.main()
