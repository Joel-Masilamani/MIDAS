import sys
import os
import asyncio
import json
import logging
from typing import List, Set

# Add backend directory to sys.path to find local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from simulator_bridge import RealTimeMissileSimulator, base_names


# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MIDAS-Backend")

app = FastAPI(title="MIDAS API", description="Missile Interception Decision & Analysis System API")

# Add CORS support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
active_connections: Set[WebSocket] = set()

# Initialize Simulator
simulator = RealTimeMissileSimulator()
latest_data = []

async def broadcast_updates():
    """
    Background worker loop that updates the simulation state and broadcasts telemetry to all connected clients.
    """
    global latest_data
    while True:
        try:
            # Maintain between 1 and 3 concurrent active missiles
            current_count = len(simulator.active_missiles)
            if current_count < 3:
                # Random chance to spawn a new missile when active count is low
                if current_count == 0 or asyncio.get_event_loop().time() % 10 < 3:
                    m_id = simulator.spawn_missile()
                    logger.info(f"Spawned new simulated threat ID: {m_id}")

            # Run state update step
            updates = simulator.update_missiles()
            latest_data = updates

            # Broadcast updates if there are connected clients
            if active_connections:
                payload = json.dumps({"type": "telemetry", "data": updates})
                # Create a list to iterate over to avoid modifying set during iteration
                for connection in list(active_connections):
                    try:
                        await connection.send_text(payload)
                    except Exception as e:
                        logger.warning(f"Error sending payload to client, removing connection: {e}")
                        active_connections.remove(connection)

            await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"Error in broadcast loop: {e}")
            await asyncio.sleep(2.0)

@app.on_event("startup")
async def startup_event():
    # Start the simulation background loop
    asyncio.create_task(broadcast_updates())
    logger.info("MIDAS Simulation Engine successfully started.")

@app.get("/api/status")
async def get_status():
    return {
        "status": "ONLINE",
        "active_clients": len(active_connections),
        "active_threats": len(simulator.active_missiles),
        "engine": "FastAPI + geopy Geodesic Kinematics"
    }

@app.get("/api/bases")
async def get_bases():
    """
    Return all interceptor bases and coordinates for frontend rendering
    """
    return [
        {
            "name": name,
            "coordinates": list(coords),
            "status": "ACTIVE"
        }
        for coords, name in base_names.items()
    ]

@app.get("/api/latest-results")
async def get_latest_results():
    return latest_data

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"New client connected. Active clients: {len(active_connections)}")

    # Send initial bases configuration and latest status snapshot
    try:
        await websocket.send_text(json.dumps({
            "type": "init",
            "bases": [
                {"name": name, "coordinates": list(coords), "status": "ACTIVE"}
                for coords, name in base_names.items()
            ]
        }))

        if latest_data:
            await websocket.send_text(json.dumps({
                "type": "telemetry",
                "data": latest_data
            }))

        # Keep connection open and listen for messages (like user manually triggering an intercept)
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.info(f"Received message from client: {message}")
            if message.get("type") == "manual_intercept":
                # Handle client manual intercept triggers and neutralize threat in the simulator
                m_id = message.get("missile_id")
                logger.info(f"Manual intercept triggered for missile {m_id}")
                simulator.neutralize_missile(m_id)


    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"Client disconnected. Active clients: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)
