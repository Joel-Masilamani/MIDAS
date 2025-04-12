# test_interception_sim.py

import json
from datetime import datetime
from interception import (
    time_to_reach,
    calculate_heading,
    run_simulations_multiple,
    plot_all_missiles,
    estimate_risk
)

# Define interceptor bases (lat, lon)
interceptor_bases = [
    (28.61, 77.21),   # Delhi
    (19.07, 72.87),   # Mumbai
    (13.08, 80.27),   # Chennai
    (22.57, 88.36),   # Kolkata
    (12.97, 77.59),   # Bengaluru
    (23.03, 72.58),   # Ahmedabad
    (26.92, 75.80),   # Jaipur
    (17.38, 78.48),   # Hyderabad
    (21.17, 72.83),   # Surat
    (26.85, 80.95),   # Lucknow
    (17.68, 83.22)    # Visakhapatnam
]

# Base names for reporting
base_names = {
    (28.61, 77.21): "Delhi",
    (19.07, 72.87): "Mumbai",
    (13.08, 80.27): "Chennai",
    (22.57, 88.36): "Kolkata",
    (12.97, 77.59): "Bengaluru",
    (23.03, 72.58): "Ahmedabad",
    (26.92, 75.80): "Jaipur",
    (17.38, 78.48): "Hyderabad",
    (21.17, 72.83): "Surat",
    (26.85, 80.95): "Lucknow",
    (17.68, 83.22): "Visakhapatnam"
}

# Simulated real-time missile positions (each entry is a list of waypoints for one missile)
real_time_missile_paths = [
    [(33.0, 60.0), (32.8, 60.4), (32.6, 60.8), (32.4, 61.2), (32.2, 61.6), (32.0, 62.0), (31.8, 62.4), (31.6, 62.8), (31.4, 63.2), (31.2, 63.6), (31.0, 64.0)],
    [(18.0, 60.0), (17.8, 60.3), (17.6, 60.6), (17.4, 60.9), (17.2, 61.2), (17.0, 61.5), (16.8, 61.8), (16.6, 62.1), (16.4, 62.4), (16.2, 62.7), (16.0, 63.0)],
    [(30.0, 100.0), (29.8, 99.8), (29.6, 99.6), (29.4, 99.4), (29.2, 99.2), (29.0, 99.0), (28.8, 98.8), (28.6, 98.6), (28.4, 98.4), (28.2, 98.2), (28.0, 98.0)]
]

missile_speed = 2.0  # units per frame
interceptor_speed = 3.0  # faster than missiles
samples = 50

# Interception check using real-time tracking
enriched_results = []

for missile_id, path in enumerate(real_time_missile_paths, 1):
    intercepted = False
    for frame, current_pos in enumerate(path[1:], 1):
        missile_time = frame  # each frame = 1 time unit
        for base in interceptor_bases:
            interceptor_time = time_to_reach(current_pos, base, interceptor_speed)
            if interceptor_time <= missile_time:
                heading = calculate_heading(*path[frame - 1], *current_pos)
                risk = estimate_risk(current_pos)
                enriched_results.append({
                    "missile_id": missile_id,
                    "missile_position": current_pos,
                    "missile_time": missile_time,
                    "interceptor_time": interceptor_time,
                    "success_probability": round(1 - (interceptor_time / missile_time), 3),
                    "base": {
                        "name": base_names.get(tuple(base), "Unknown"),
                        "coordinates": base
                    },
                    "heading": heading,
                    "risk_score": risk,
                    "success": True,
                    "frame": frame
                })
                intercepted = True
                break
        if intercepted:
            break

    if not intercepted:
        heading = calculate_heading(*path[-2], *path[-1])
        risk = estimate_risk(path[-1])
        enriched_results.append({
            "missile_id": missile_id,
            "missile_position": path[-1],
            "missile_time": len(path) - 1,
            "interceptor_time": None,
            "success_probability": 0.0,
            "base": None,
            "heading": heading,
            "risk_score": risk,
            "success": False,
            "alert": f"Missile {missile_id} was NOT intercepted. Impact near {path[-1]}",
            "frame": len(path) - 1
        })

# Save to JSON
with open("real_time_interception_results.json", "w") as f:
    json.dump(enriched_results, f, indent=4)

# Optional: Visualize the missile paths and interception attempts
plot_all_missiles(real_time_missile_paths, enriched_results, interceptor_bases)
