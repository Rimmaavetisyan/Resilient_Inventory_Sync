import { ServicePanel } from './ServicePanel.jsx';
import { SERVICES } from '../config.js';

export function ShipmentsPanel(props) {
  return (
    <ServicePanel
      title="Shipments"
      url={SERVICES.shipments}
      options={props.options}
      renderData={(data) => {
        const shipments = data?.shipments ?? [];
        return (
          <ul className="list">
            {shipments.map((s) => (
              <li key={s.id}>
                <strong>{s.id}</strong> → {s.destination} <em>({s.status})</em>
              </li>
            ))}
            {shipments.length === 0 && <li>No active shipments.</li>}
          </ul>
        );
      }}
    />
  );
}
