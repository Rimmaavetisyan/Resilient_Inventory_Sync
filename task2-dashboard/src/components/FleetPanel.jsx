import { memo } from 'react';
import { ServicePanel } from './ServicePanel.jsx';
import { SERVICES } from '../config.js';

export const FleetPanel = memo(function FleetPanel(props) {
  return (
    <ServicePanel
      title="Fleet"
      url={SERVICES.fleet}
      options={props.options}
      renderData={(data) => {
        const vehicles = data?.vehicles ?? [];
        return (
          <ul className="list">
            {vehicles.map((v) => (
              <li key={v.id}>
                <strong>{v.id}</strong> — {v.status} @ {v.location}
              </li>
            ))}
            {vehicles.length === 0 && <li>No vehicles reporting.</li>}
          </ul>
        );
      }}
    />
  );
});
