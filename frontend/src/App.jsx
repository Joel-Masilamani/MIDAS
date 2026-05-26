import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { 
  Radar, 
  ShieldAlert, 
  Activity, 
  Wifi, 
  WifiOff, 
  Skull, 
  MapPin, 
  Crosshair, 
  TrendingUp, 
  Zap, 
  AlertTriangle,
  Flame,
  Radio
} from 'lucide-react';
import './index.css';

// Fix default leaflet icon configuration issues in React builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom markers using HTML/CSS for advanced dark theme designs
const createBaseIcon = (isDefending) => {
  return L.divIcon({
    className: 'custom-base-marker',
    html: `
      <div class="base-ping-ring ${isDefending ? 'defending' : ''}">
        <div class="base-ping-dot" style="${isDefending ? 'background-color: #ff0055; box-shadow: 0 0 8px #ff0055;' : 'background-color: #00e5ff; box-shadow: 0 0 8px #00e5ff;'}"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

const createMissileIcon = (color) => {
  return L.divIcon({
    className: 'custom-missile-marker',
    html: `
      <div style="
        width: 14px;
        height: 14px;
        background-color: ${color};
        border-radius: 50%;
        box-shadow: 0 0 12px ${color};
        border: 2px solid #ffffff;
        animation: pulse 1s infinite alternate;
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

const createInterceptionIcon = () => {
  return L.divIcon({
    className: 'custom-intercept-marker',
    html: `
      <div style="
        width: 16px;
        height: 16px;
        border: 2px dashed #00ff66;
        border-radius: 50%;
        background-color: rgba(0, 255, 102, 0.2);
        box-shadow: 0 0 10px #00ff66;
        animation: pulse 0.5s infinite alternate;
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const createExplosionIcon = () => {
  return L.divIcon({
    className: 'custom-explosion-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        display: flex;
        justify-content: center;
        align-items: center;
      ">
        <div style="
          width: 14px;
          height: 14px;
          background-color: #ff0055;
          border-radius: 50%;
          box-shadow: 0 0 20px #ff0055, 0 0 40px #ff6a00;
          border: 2px solid #ffffff;
          animation: pulse 0.1s infinite alternate;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

function App() {
  const [missiles, setMissiles] = useState([]);
  const [bases, setBases] = useState([]);
  const [selectedMissileId, setSelectedMissileId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [logs, setLogs] = useState([]);
  
  const wsRef = useRef(null);

  // Set up WebSocket client connection
  useEffect(() => {
    const connectWS = () => {
      const socket = new WebSocket('ws://localhost:8000/ws');
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
        addLog('SYS', 'Establishing encrypted telemetry channel to server...');
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'init') {
          setBases(payload.bases);
          addLog('SYS', 'Base configuration data received. Tracking 11 nodes.');
        } else if (payload.type === 'telemetry') {
          setMissiles(payload.data);
          
          // Log new threat warnings
          payload.data.forEach(m => {
            if (m.step === 0) {
              addLog('ALERT', `NEW THREAT: ${m.type} detected | Spd: ${m.speed.toFixed(2)} km/s`);
            }
            if (m.step === m.total_steps - 1) {
              addLog('IMPACT', `THREAT IMPACT: Missile #${m.missile_id} reached bounds.`);
            }
          });
        }
      };

      socket.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        addLog('SYS', 'Telemetry channel offline. Attempting handshake...');
        setTimeout(connectWS, 3000);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    };

    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const addLog = (tag, message) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, tag, message }, ...prev].slice(0, 10));
  };

  const triggerManualIntercept = (missileId) => {
    if (wsRef.current && connectionStatus === 'CONNECTED') {
      wsRef.current.send(JSON.stringify({
        type: 'manual_intercept',
        missile_id: missileId
      }));
      addLog('CMD', `MANUAL LAUNCH: Interceptor dispatched to Missile #${missileId}`);
    }
  };

  // Find currently selected missile
  const selectedMissile = missiles.find(m => m.missile_id === selectedMissileId) || missiles[0];

  // Helper to check if a base is actively defending any of the threats
  const defendingBases = missiles
    .filter(m => m.interception_result && m.interception_result.success && m.interception_result.base)
    .map(m => m.interception_result.base.name);

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="tactical-header">
        <div className="header-title">
          <Radar className="logo-pulse" size={28} color="#00e5ff" />
          <h1>MIDAS COMMAND CENTER</h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div className={`status-badge ${connectionStatus === 'CONNECTED' ? '' : 'disconnected'}`} style={connectionStatus !== 'CONNECTED' ? {borderColor: '#ff0055', color: '#ff0055', background: 'rgba(255, 0, 85, 0.1)'} : {}}>
            <div className="status-indicator" style={connectionStatus !== 'CONNECTED' ? {backgroundColor: '#ff0055', boxShadow: '0 0 8px #ff0055'} : {}}></div>
            <span>RADAR: {connectionStatus}</span>
          </div>
        </div>
      </header>

      {/* LEFT SIDEBAR - BASE NATIVE NODES */}
      <aside className="airspace-sidebar">
        <div className="panel-header">
          <h2>Interceptor Nodes</h2>
          <span style={{ fontSize: '12px' }}>{bases.length} Online</span>
        </div>
        <div className="base-grid">
          {bases.map((base) => {
            const isDefending = defendingBases.includes(base.name);
            return (
              <div className="base-item" key={base.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapPin size={16} color={isDefending ? '#ff0055' : '#00e5ff'} />
                  <span>{base.name}</span>
                </div>
                <span className={`base-status-tag ${isDefending ? 'defending' : ''}`}>
                  {isDefending ? 'ENGAGED' : 'READY'}
                </span>
              </div>
            );
          })}
        </div>
      </aside>

      {/* CENTER VIEWPORT (MAP) */}
      <main className="map-viewport">
        {/* Radar scan radial sweep overlay */}
        <div className="radar-sweep"></div>

        <MapContainer 
          center={[23.5, 78.5]} 
          zoom={5} 
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {/* CartoDB Sleek Dark Matter Base Tiles */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* Render Base Markers */}
          {bases.map((base) => {
            const isDefending = defendingBases.includes(base.name);
            return (
              <Marker 
                key={base.name}
                position={base.coordinates} 
                icon={createBaseIcon(isDefending)}
              />
            );
          })}

          {/* Render Missile Telemetry & Interceptor Vector Links */}
          {missiles.map((m) => {
            const result = m.interception_result;
            const currentPos = m.current_position;
            const path = m.predicted_path;

            return (
              <React.Fragment key={m.missile_id}>
                {/* Simulated Missile Icon or Explosion if Neutralized */}
                <Marker 
                  position={currentPos} 
                  icon={m.status === 'NEUTRALIZED' ? createExplosionIcon() : createMissileIcon(m.color)}
                  eventHandlers={{
                    click: () => setSelectedMissileId(m.missile_id)
                  }}
                />

                {/* Remaining Trajectory Vector Path */}
                {path && path.length > 0 && (
                  <Polyline 
                    positions={[currentPos, ...path]} 
                    color={m.color} 
                    dashArray="5, 10" 
                    weight={2} 
                  />
                )}

                {/* Interception point marker and flight paths */}
                {result && result.success && result.interception_point && result.base && (
                  <>
                    <Marker 
                      position={result.interception_point}
                      icon={createInterceptionIcon()}
                    />
                    {/* Interceptor dispatch vector path */}
                    <Polyline 
                      positions={[result.base.coordinates, result.interception_point]} 
                      color="#00ff66" 
                      dashArray="2, 6" 
                      weight={2} 
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* DECISION ANALYSIS CARD OVERLAY */}
        {selectedMissile && selectedMissile.interception_result && (
          <div className="interception-overlay">
            <div className="panel-header" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} color="#00ff66" />
                <h3 style={{ fontSize: '14px', textTransform: 'uppercase' }}>Interception Math (Missile #{selectedMissile.missile_id})</h3>
              </div>
            </div>
            
            {selectedMissile.status === 'NEUTRALIZED' ? (
              <div style={{ color: '#00ff66', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Flame size={24} />
                <div>
                  <p style={{ fontWeight: 'bold' }}>THREAT NEUTRALIZED</p>
                  <p style={{ fontSize: '12px', color: '#9cb8cc' }}>Manual command code triggered intercept successfully.</p>
                </div>
              </div>
            ) : selectedMissile.interception_result.success && selectedMissile.interception_result.base ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="cyber-panel" style={{ padding: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#9cb8cc' }}>Primary Base</span>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', marginTop: '4px' }}>
                      {selectedMissile.interception_result.base.name}
                    </p>
                  </div>
                  <div className="cyber-panel" style={{ padding: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#9cb8cc' }}>Kill Probability</span>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#00ff66', marginTop: '4px' }}>
                      {(selectedMissile.interception_result.success_probability * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#9cb8cc' }}>Intercept Coordinate:</span>
                    <p style={{ color: '#fff', marginTop: '2px' }}>
                      {selectedMissile.interception_result.interception_point[0].toFixed(3)}, {selectedMissile.interception_result.interception_point[1].toFixed(3)}
                    </p>
                  </div>
                  <div>
                    <span style={{ color: '#9cb8cc' }}>Airspace Risk Score:</span>
                    <p style={{ color: selectedMissile.interception_result.risk_score > 5000 ? '#ff0055' : '#ffd800', marginTop: '2px' }}>
                      {selectedMissile.interception_result.risk_score.toFixed(0)} units
                    </p>
                  </div>
                  <div>
                    <span style={{ color: '#9cb8cc' }}>Interceptor Travel Time:</span>
                    <p style={{ color: '#fff', marginTop: '2px' }}>
                      {selectedMissile.interception_result.interceptor_time.toFixed(1)}s
                    </p>
                  </div>
                  <div>
                    <span style={{ color: '#9cb8cc' }}>Missile Impact Margin:</span>
                    <p style={{ color: '#fff', marginTop: '2px' }}>
                      {selectedMissile.interception_result.missile_time.toFixed(1)}s
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#ff0055', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={24} />
                <div>
                  <p style={{ fontWeight: 'bold' }}>CRITICAL WARSPACE BREACH</p>
                  <p style={{ fontSize: '11px', color: '#9cb8cc' }}>Threat coordinates have penetrated defensive bubble bounds.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* RIGHT SIDEBAR - THREAT HUD & WARNING LOGS */}
      <aside className="alerts-sidebar">
        <div>
          <div className="panel-header">
            <h2>Active Threat HUD</h2>
            <span style={{ fontSize: '12px', color: missiles.length > 0 ? '#ff0055' : '#00e5ff' }}>
              {missiles.length} Active
            </span>
          </div>

          <div style={{ maxHeight: '42vh', overflowY: 'auto' }}>
            {missiles.map((m) => (
              <div 
                className={`threat-card ${m.threat_level.toLowerCase()} ${selectedMissileId === m.missile_id ? 'active' : ''}`}
                key={m.missile_id}
                onClick={() => setSelectedMissileId(m.missile_id)}
                style={selectedMissileId === m.missile_id ? {borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)'} : {}}
              >
                <div className="threat-header">
                  <span style={{ fontWeight: 'bold' }}>THREAT #{m.missile_id}</span>
                  <span className={`threat-badge ${m.threat_level.toLowerCase()}`}>
                    {m.threat_level}
                  </span>
                </div>
                <div className="threat-details">
                  <span>Type:</span>
                  <span style={{ color: '#fff' }}>{m.type}</span>
                  <span>Velocity:</span>
                  <span style={{ color: '#fff' }}>{m.speed.toFixed(2)} km/s</span>
                  <span>Altitude:</span>
                  <span style={{ color: '#fff' }}>{m.altitude.toFixed(1)} km</span>
                  <span>Intercept Base:</span>
                  <span style={{ color: m.status === 'NEUTRALIZED' ? '#00ff66' : '#ffd800', fontWeight: 'bold' }}>
                    {m.status === 'NEUTRALIZED' 
                      ? 'RESOLVED' 
                      : (m.interception_result && m.interception_result.success && m.interception_result.base
                        ? m.interception_result.base.name 
                        : 'NONE')}
                  </span>
                </div>
                
                <button 
                  className="intercept-btn" 
                  disabled={m.status === 'NEUTRALIZED'}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerManualIntercept(m.missile_id);
                  }}
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    borderColor: m.status === 'NEUTRALIZED' ? '#00ff66' : m.color,
                    color: '#fff',
                    background: m.status === 'NEUTRALIZED' ? 'rgba(0, 255, 102, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderRadius: '4px',
                    padding: '6px 0',
                    fontSize: '11px',
                    cursor: m.status === 'NEUTRALIZED' ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: m.status === 'NEUTRALIZED' ? 0.7 : 1
                  }}
                  onMouseOver={(e) => {
                    if (m.status !== 'NEUTRALIZED') {
                      e.target.style.background = m.color;
                      e.target.style.color = '#000';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (m.status !== 'NEUTRALIZED') {
                      e.target.style.background = 'transparent';
                      e.target.style.color = '#fff';
                    }
                  }}
                >
                  {m.status === 'NEUTRALIZED' ? 'THREAT RESOLVED' : 'Confirm Kill Code'}
                </button>
              </div>
            ))}
            
            {missiles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#9cb8cc' }}>
                <ShieldAlert size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                <p>No active threats in airspace bounds.</p>
              </div>
            )}
          </div>
        </div>

        {/* LOG SECTION */}
        <div style={{ flexGrow: 1, borderTop: '1px solid var(--border-cyan)', paddingTop: '15px' }}>
          <div className="panel-header">
            <h2>Command Activity Logs</h2>
            <Radio size={16} className="logo-pulse" />
          </div>
          <div style={{ fontSize: '11px', overflowY: 'auto', maxHeight: '35vh', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {logs.map((log, idx) => (
              <div key={idx} style={{ borderBottom: '1px solid rgba(0,229,255,0.05)', paddingBottom: '4px' }}>
                <span style={{ color: '#9cb8cc' }}>[{log.time}] </span>
                <span style={{ 
                  color: log.tag === 'ALERT' ? '#ff0055' : log.tag === 'CMD' ? '#ffd800' : log.tag === 'IMPACT' ? '#ff6a00' : '#00e5ff',
                  fontWeight: 'bold'
                }}>[{log.tag}] </span>
                <span style={{ color: '#fff' }}>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;
