// Stage-template presets for a project's "Prefill stages…": one click lays out
// stage rows from a standard vocabulary so setting up a project takes minutes.
// Ported from StudioHours and retargeted: StudioLog stages carry NO fees, so
// the fee-split machinery and weights are gone — codes + names only. Codes
// land in Stage.code, a free string; nothing else enforces this vocabulary.

export interface StageTemplateStage {
  code: string;
  name: string;
}

export interface StageTemplate {
  id: string;
  label: string;
  /** one line, shown under the radio choice in the Prefill dialog */
  description: string;
  stages: StageTemplateStage[];
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    id: 'riba-2020',
    label: 'RIBA stages (2020)',
    description: 'Preparation through Handover, 6 stages — the RIBA 2020 Plan of Work.',
    stages: [
      { code: 'S1', name: 'Preparation and Briefing' },
      { code: 'S2', name: 'Concept Design' },
      { code: 'S3', name: 'Spatial Coordination' },
      { code: 'S4', name: 'Technical Design' },
      { code: 'S5', name: 'Construction / Site' },
      { code: 'S6', name: 'Handover' },
    ],
  },
  {
    id: 'aia-phases',
    label: 'AIA phases',
    description: 'Pre-Design through Construction Administration, 6 phases — the US vocabulary.',
    stages: [
      { code: 'PD', name: 'Pre-Design' },
      { code: 'SD', name: 'Schematic Design' },
      { code: 'DD', name: 'Design Development' },
      { code: 'CD', name: 'Construction Documents' },
      { code: 'BN', name: 'Bidding and Negotiation' },
      { code: 'CA', name: 'Construction Administration' },
    ],
  },
  {
    id: 'interiors-small',
    label: 'Interiors / small project',
    description: 'Concept through Site Follow-up, 4 short stages — for smaller scopes.',
    stages: [
      { code: 'CN', name: 'Concept' },
      { code: 'DV', name: 'Design Development' },
      { code: 'DC', name: 'Documentation' },
      { code: 'ST', name: 'Site Follow-up' },
    ],
  },
];
