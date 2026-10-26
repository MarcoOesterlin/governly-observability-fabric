import { entity, uuid, text, date, one, authenticated } from '@microsoft/rayfin-core';
import { StewardCase } from './steward-case.js';

@authenticated('*')
@entity()
export class CaseIncidentLink {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @one(() => StewardCase) case!: StewardCase;
  @text({ max: 32 }) incident_key!: string;
  @date() linked_at!: Date;
  @text({ max: 120 }) linked_by!: string;
}
