# JdmAli

`roomlab` runs the COMSOL 6.2 Acoustics of a Living Room model from a case file.

The gallery files stay in `models/acoustics-of-a-living-room/` on the machine with COMSOL. They are not in git. From the repo root:

```
pip install -e .
roomlab check
roomlab run cases/living_room.yaml
```

`roomlab check` needs COMSOL 6.2. The case file is `cases/living_room.yaml`. A run writes `results/<run>/summary.md`.
