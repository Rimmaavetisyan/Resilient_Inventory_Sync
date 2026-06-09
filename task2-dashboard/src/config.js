const BASE = import.meta.env?.VITE_API_BASE ?? '';

export const SERVICES = {
  shipments: `${BASE}/api/shipments`,
  fleet: `${BASE}/api/fleet`,
  weather: `${BASE}/api/weather`,
};
