import sys
import os
import asyncio
import random
from typing import Dict, List, Any

# Add workspace root directory and interception directories to sys.path to resolve imports correctly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml", "Path_Pred_Interception")))

from MIDAS.ml.Path_Pred_Interception.missile_generator import generate_missile_data
from MIDAS.ml.Path_Pred_Interception.interception import monte_carlo_interception_with_success, distance

# Define base stations
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
interceptor_bases = list(base_names.keys())

def mock_yolov8_detect(speed_kmps: float) -> Dict[str, str]:
    """
    Mock YOLOv8 object detection and threat classifier
    """
    if speed_kmps >= 4.0:
        return {
            "type": "Hypersonic Missile",
            "threat_level": "CRITICAL",
            "color": "#ff0055"
        }
    elif speed_kmps >= 1.5:
        return {
            "type": "Cruise Missile",
            "threat_level": "HIGH",
            "color": "#ff6a00"
        }
    else:
        return {
            "type": "Drone Swarm",
            "threat_level": "MEDIUM",
            "color": "#ffd800"
        }

class RealTimeMissileSimulator:
    def __init__(self):
        self.active_missiles: Dict[int, Dict[str, Any]] = {}
        self.next_missile_id = 1

    def spawn_missile(self) -> int:
        missile_id = self.next_missile_id
        self.next_missile_id += 1

        # Generate a path with 20 to 30 steps, scaled with 25s per step to achieve realistic velocities
        steps = random.randint(20, 35)
        raw_data = generate_missile_data(steps=steps, time_per_step_sec=25.0)

        speed = raw_data["Average_Missile_Speed_kmps"]
        classification = mock_yolov8_detect(speed)

        self.active_missiles[missile_id] = {
            "id": missile_id,
            "coordinates": raw_data["Coordinates"],
            "altitudes": raw_data["Altitudes_km"],
            "speed": speed,
            "interceptor_speed": raw_data["Interceptor_Speed_kmps"],
            "classification": classification["type"],
            "threat_level": classification["threat_level"],
            "color": classification["color"],
            "current_step": 0,
            "total_steps": steps,
            "status": "ACTIVE",
            "neutralized_countdown": None
        }
        return missile_id

    def neutralize_missile(self, missile_id: int):
        if missile_id in self.active_missiles:
            missile = self.active_missiles[missile_id]
            if missile["status"] == "ACTIVE":
                missile["status"] = "NEUTRALIZED"
                missile["neutralized_countdown"] = 2  # Keep on map for 2 updates/seconds

    def update_missiles(self) -> List[Dict[str, Any]]:
        completed_missiles = []
        updates = []

        for m_id, missile in list(self.active_missiles.items()):
            step = missile["current_step"]
            coords = missile["coordinates"]
            total = missile["total_steps"]

            if missile["status"] == "NEUTRALIZED":
                # Decrement countdown and check for removal
                missile["neutralized_countdown"] -= 1
                if missile["neutralized_countdown"] <= 0:
                    completed_missiles.append(m_id)
                
                # Send static status update showing neutralized state
                current_pos = coords[min(step, len(coords) - 1)]
                updates.append({
                    "missile_id": m_id,
                    "type": missile["classification"],
                    "threat_level": "NEUTRALIZED",
                    "color": "#00ff66", # Neutralized Green
                    "speed": 0.0,
                    "current_position": current_pos,
                    "altitude": 0.0,
                    "predicted_path": [current_pos],
                    "step": step,
                    "total_steps": total,
                    "status": "NEUTRALIZED",
                    "interception_result": {
                        "success": True,
                        "message": "Threat successfully resolved by manual intercept."
                    }
                })
                # Increment step to prevent freeze if update loops process it
                missile["current_step"] += 1
                continue

            if step >= total:
                completed_missiles.append(m_id)
                continue

            current_pos = coords[step]
            remaining_path = coords[step:]

            # Run Monte Carlo simulation for the remaining path
            all_results, best = monte_carlo_interception_with_success(
                remaining_path,
                interceptor_bases,
                [missile["speed"]],
                [missile["interceptor_speed"]],
                samples=20
            )

            interception_result = None
            if best and best.get("success"):
                base_coords = tuple(best["base"]) if isinstance(best["base"], (list, tuple)) else tuple(best["base"]["coordinates"])
                interception_result = {
                    "interception_point": best["interception_point"],
                    "base": {
                        "name": base_names.get(base_coords, "Unknown"),
                        "coordinates": list(base_coords)
                    },
                    "missile_speed": best["missile_speed"],
                    "interceptor_speed": best["interceptor_speed"],
                    "missile_time": best["missile_time"],
                    "interceptor_time": best["interceptor_time"],
                    "success": True,
                    "risk_score": best["risk_score"],
                    "success_probability": best["success_probability"],
                    "distance": distance(base_coords, best["interception_point"]),
                    "method": "monte_carlo"
                }
            else:
                interception_result = {
                    "success": False,
                    "message": "Missile entered airspace - interception impossible"
                }

            updates.append({
                "missile_id": m_id,
                "type": missile["classification"],
                "threat_level": missile["threat_level"],
                "color": missile["color"],
                "speed": missile["speed"],
                "current_position": current_pos,
                "altitude": missile["altitudes"][step],
                "predicted_path": remaining_path,
                "step": step,
                "total_steps": total,
                "status": "ACTIVE",
                "interception_result": interception_result
            })

            missile["current_step"] += 1

        for m_id in completed_missiles:
            del self.active_missiles[m_id]

        return updates
