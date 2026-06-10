import { ShipmentsPanel } from './components/ShipmentsPanel.jsx';
import { FleetPanel } from './components/FleetPanel.jsx';
import { WeatherPanel } from './components/WeatherPanel.jsx';
import './App.css';

// How often each panel quietly re-polls its service in the background.
const REFRESH_MS = 15000;
const options = { refreshIntervalMs: REFRESH_MS };

export default function App() {
  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>Logistics Operations Dashboard</h1>
        <p>
          Live feed from Shipments, Fleet &amp; Weather services — each panel fails, retries and
          refreshes independently.
        </p>
      </header>
      <main className="dashboard__grid">
        <ShipmentsPanel options={options} />
        <FleetPanel options={options} />
        <WeatherPanel options={options} />
      </main>
    </div>
  );
}
