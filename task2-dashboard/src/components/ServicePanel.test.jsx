import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServicePanel } from './ServicePanel.jsx';

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
const fastOpts = { baseDelayMs: 1, maxDelayMs: 5, jitter: false };

describe('ServicePanel', () => {
  it('shows a loading state, then renders data on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { value: 42 }));

    render(
      <ServicePanel
        title="Shipments"
        url="/api/shipments"
        options={{ ...fastOpts, fetchImpl }}
        renderData={(d) => <span>value: {d.value}</span>}
      />
    );

    // loading appears first
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('value: 42')).toBeInTheDocument());
  });

  it('shows a "Updated …" timestamp and a Refresh button on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { value: 1 }));

    render(
      <ServicePanel
        title="Weather"
        url="/api/weather"
        options={{ ...fastOpts, fetchImpl }}
        renderData={(d) => <span>v{d.value}</span>}
      />
    );

    await waitFor(() => expect(screen.getByText('v1')).toBeInTheDocument());
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('manual Refresh re-fetches in the background, keeping data visible', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200, { value: 'one' }))
      .mockResolvedValueOnce(response(200, { value: 'two' }));

    render(
      <ServicePanel
        title="Shipments"
        url="/api/shipments"
        options={{ ...fastOpts, fetchImpl }}
        renderData={(d) => <span>{d.value}</span>}
      />
    );

    await waitFor(() => expect(screen.getByText('one')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(screen.getByText('two')).toBeInTheDocument());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('renders an error + Retry button, and recovers when Retry is clicked', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(500)) 
      .mockResolvedValueOnce(response(500)) 
      .mockResolvedValue(response(200, { value: 'recovered' })); 
    render(
      <ServicePanel
        title="Fleet"
        url="/api/fleet"
        options={{ ...fastOpts, maxRetries: 1, fetchImpl }}
        renderData={(d) => <span>{d.value}</span>}
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Couldn’t load Fleet/);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('recovered')).toBeInTheDocument());
  });
});
