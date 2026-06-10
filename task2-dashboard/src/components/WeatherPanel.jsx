import { memo } from 'react';
import { ServicePanel } from './ServicePanel.jsx';
import { SERVICES } from '../config.js';

export const WeatherPanel = memo(function WeatherPanel(props) {
  return (
    <ServicePanel
      title="Weather"
      url={SERVICES.weather}
      options={props.options}
      renderData={(data) => (
        <div className="weather">
          <p className="weather__temp">{data?.tempC ?? '—'}°C</p>
          <p className="weather__cond">{data?.condition ?? 'Unknown'}</p>
          <p className="weather__loc">{data?.location ?? ''}</p>
        </div>
      )}
    />
  );
});
