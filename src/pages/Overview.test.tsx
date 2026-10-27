import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from '../app/theme';
import {
  ASSETS,
  HEALTH_BAR_HEIGHTS,
  INCIDENTS,
  INCIDENTS_TOP,
  KPIS,
  SCHEMA_CHANGES,
} from '../fixtures/design';
import { Overview } from './Overview';

function PathProbe() {
  const { pathname } = useLocation();
  return <div data-testid="path-probe">{pathname}</div>;
}

const mount = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <Overview
          kpis={KPIS}
          healthBarHeights={HEALTH_BAR_HEIGHTS}
          healthyCount={142}
          warningCount={19}
          criticalCount={8}
          assets={ASSETS}
          incidentsTop={INCIDENTS_TOP}
          schemaChanges={SCHEMA_CHANGES}
        />
        <PathProbe />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('Overview', () => {
  it('renders the page heading and subtitle copy', () => {
    mount();
    expect(screen.getByText('Observability Overview')).toBeInTheDocument();
    expect(screen.getByText('169')).toBeInTheDocument();
  });

  it('renders all four KPI cards with their values', () => {
    mount();
    for (const [label, value] of [
      ['Healthy assets', '84%'],
      ['Active incidents', '7'],
      ['Freshness SLA', '96.2%'],
      ['Open cases', '3'],
    ]) {
      expect(screen.getAllByText(label)[0]).toBeInTheDocument();
      expect(screen.getAllByText(value)[0]).toBeInTheDocument();
    }
  });

  it('renders 40 signal bars', () => {
    const { container } = mount();
    expect(container.querySelectorAll('[data-health-bar]')).toHaveLength(40);
  });

  it('renders the health legend counts', () => {
    mount();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders the monitored data assets with mono names and excludes runtime pipelines', () => {
    mount();
    expect(screen.getByText('Monitored assets')).toBeInTheDocument();
    for (const name of [
      'sales.fact_orders',
      'finance.gl_transactions',
      'customer_360',
      'marketing.campaign_events',
      'product.usage_events',
      'hr.headcount',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText('ingest_orders_pipeline')).not.toBeInTheDocument();
  });

  it('shows late freshness in the critical colour', () => {
    mount();
    expect(screen.getByText('2h 14m ago')).toHaveStyle({ color: 'var(--crit)' });
    expect(screen.getByText('4m ago')).toHaveStyle({ color: 'var(--fgm)' });
  });

  it('renders the top four incidents only', () => {
    mount();
    expect(screen.getByText('INC-2048')).toBeInTheDocument();
    expect(screen.getByText('INC-2043')).toBeInTheDocument();
    expect(screen.queryByText('INC-2039')).not.toBeInTheDocument();
  });

  it('flags the breaking schema change', () => {
    mount();
    expect(screen.getByText('Breaking')).toBeInTheDocument();
  });

  it('does not render a capacity card', () => {
    mount();
    expect(screen.queryByText(/Capacity/)).not.toBeInTheDocument();
  });

  it('navigates to the asset on row click', async () => {
    mount();
    await userEvent.click(screen.getByText('finance.gl_transactions'));
    expect(screen.getByTestId('path-probe').textContent).toContain('/assets/finance.gl_transactions');
  });

  it('excludes resolved incidents from the Active incidents card', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Overview
            kpis={KPIS}
            healthBarHeights={HEALTH_BAR_HEIGHTS}
            healthyCount={142}
            warningCount={19}
            criticalCount={8}
            assets={ASSETS}
            incidentsTop={INCIDENTS}
            schemaChanges={SCHEMA_CHANGES}
          />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('INC-2039')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
  });
});
