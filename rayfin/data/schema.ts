import { IncidentState } from './incident-state.js';
import { IncidentEvent } from './incident-event.js';
import { IncidentComment } from './incident-comment.js';
import { StewardCase } from './steward-case.js';
import { CaseIncidentLink } from './case-incident-link.js';
import { QualityRule } from './quality-rule.js';
import { AppUser } from './app-user.js';
import { UserPreference } from './user-preference.js';
import {
  PubWorkspace,
  PubUserWorkspaceAccess,
  PubEntraUser,
  PubUserRole,
  PubDomain,
} from './published/identity.js';
import {
  PubOverviewKpi,
  PubHealthBucket,
  PubHealthDistribution,
} from './published/overview.js';
import {
  PubAsset,
  PubAssetLagPoint,
  PubRefreshRun,
  PubQualityResult,
  PubQualityFailedRow,
  PubAssetColumn,
  PubSchemaChange,
  PubLineageEdge,
} from './published/asset.js';
import { PubIncident, PubIncidentImpact } from './published/incident.js';
import { PubPublishRun } from './published/publish-run.js';

export type AppSchema = {
  IncidentState: IncidentState;
  IncidentEvent: IncidentEvent;
  IncidentComment: IncidentComment;
  StewardCase: StewardCase;
  CaseIncidentLink: CaseIncidentLink;
  QualityRule: QualityRule;
  AppUser: AppUser;
  UserPreference: UserPreference;
  PubWorkspace: PubWorkspace;
  PubUserWorkspaceAccess: PubUserWorkspaceAccess;
  PubEntraUser: PubEntraUser;
  PubUserRole: PubUserRole;
  PubDomain: PubDomain;
  PubOverviewKpi: PubOverviewKpi;
  PubHealthBucket: PubHealthBucket;
  PubHealthDistribution: PubHealthDistribution;
  PubAsset: PubAsset;
  PubAssetLagPoint: PubAssetLagPoint;
  PubRefreshRun: PubRefreshRun;
  PubQualityResult: PubQualityResult;
  PubQualityFailedRow: PubQualityFailedRow;
  PubAssetColumn: PubAssetColumn;
  PubSchemaChange: PubSchemaChange;
  PubLineageEdge: PubLineageEdge;
  PubIncident: PubIncident;
  PubIncidentImpact: PubIncidentImpact;
  PubPublishRun: PubPublishRun;
};

export const schema = [
  IncidentState,
  IncidentEvent,
  IncidentComment,
  StewardCase,
  CaseIncidentLink,
  QualityRule,
  AppUser,
  UserPreference,
  PubWorkspace,
  PubUserWorkspaceAccess,
  PubEntraUser,
  PubUserRole,
  PubDomain,
  PubOverviewKpi,
  PubHealthBucket,
  PubHealthDistribution,
  PubAsset,
  PubAssetLagPoint,
  PubRefreshRun,
  PubQualityResult,
  PubQualityFailedRow,
  PubAssetColumn,
  PubSchemaChange,
  PubLineageEdge,
  PubIncident,
  PubIncidentImpact,
  PubPublishRun,
];

