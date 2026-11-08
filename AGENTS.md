# Living-room acoustics

The seed model is COMSOL 6.2 gallery model 55971, Acoustics of a Living Room. It lives on disk at `models/acoustics-of-a-living-room/living_room_acoustics_llrevit.mph` and is not committed. Do not edit that file. Do not download a 6.3 or 6.4 mph. This install is 6.2.

Change a run by editing `cases/living_room.yaml` only:

- `f0` is the woofer frequency. The mesh size is one sixth of the wavelength at `f0`. Leave it at `100[Hz]` unless the user asks. Above 300 Hz, `roomlab run` stops until `--allow-high-frequency` is passed.
- `nacc` is the normal acceleration on both woofer cones. Both speakers share this value.
- `zncouch` is the couch impedance.
- `eigenfrequency_around` is the eigenfrequency search shift for Study 2.
- `listener_m` is an optional listening point in meters. Leave it unset until a solved run reports geometry bounds, then pick a point inside those bounds.

Commands, from the repo root, on the machine where COMSOL 6.2 is installed:

```
pip install -e .
roomlab check
roomlab run cases/living_room.yaml
roomlab run cases/living_room.yaml --study freq
roomlab run cases/living_room.yaml --study modes
```

Read `results/<run>/summary.md` and `solve.log`. Playback level is Study 1. Room modes are Study 2. Solved copies and plots stay in `results/`.
