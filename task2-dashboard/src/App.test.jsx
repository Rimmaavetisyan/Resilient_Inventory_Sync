import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

describe('App', () => {
  beforeEach(() => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('shipments'))
        return Promise.resolve(
          jsonResponse({ shipments: [{ id: 'S1', destination: 'Berlin', status: 'in transit' }] })
        );
      if (url.includes('fleet'))
        return Promise.resolve(
          jsonResponse({ vehicles: [{ id: 'V9', status: 'active', location: 'Hub A' }] })
        );
      if (url.includes('weather'))
        return Promise.resolve(jsonResponse({ tempC: 18, condition: 'Cloudy', location: 'Munich' }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders all three service panels with their data', async () => {
    render(<App />);

    expect(screen.getByText('Logistics Operations Dashboard')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Berlin/)).toBeInTheDocument(); 
      expect(screen.getByText(/V9/)).toBeInTheDocument();
      expect(screen.getByText(/18°C/)).toBeInTheDocument(); 
      expect(screen.getByText(/Munich/)).toBeInTheDocument(); 
    });
  });
});
