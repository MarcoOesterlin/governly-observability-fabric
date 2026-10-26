import { createBrowserRouter } from 'react-router-dom';
import { Shell } from '../components/governly/Shell';
import { Overview } from '../pages/Overview';
import { Assets } from '../pages/Assets';
import { AssetDetail } from '../pages/AssetDetail';
import { Incidents } from '../pages/Incidents';
import { IncidentDetail } from '../pages/IncidentDetail';
import { Cases } from '../pages/Cases';
import { CaseDetail } from '../pages/CaseDetail';
import { Freshness } from '../pages/Freshness';
import { Quality } from '../pages/Quality';
import { SchemaDrift } from '../pages/SchemaDrift';
import { Settings } from '../pages/Settings';

export const routes = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'assets', element: <Assets /> },
      { path: 'assets/:assetKey', element: <AssetDetail /> },
      { path: 'assets/:assetKey/:tab', element: <AssetDetail /> },
      { path: 'incidents', element: <Incidents /> },
      { path: 'incidents/:incidentKey', element: <IncidentDetail /> },
      { path: 'cases', element: <Cases /> },
      { path: 'cases/:caseKey', element: <CaseDetail /> },
      { path: 'freshness', element: <Freshness /> },
      { path: 'quality', element: <Quality /> },
      { path: 'quality/:subview', element: <Quality /> },
      { path: 'schema', element: <SchemaDrift /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
