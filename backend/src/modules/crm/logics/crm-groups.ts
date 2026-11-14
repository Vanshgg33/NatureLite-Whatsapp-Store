import { DEFAULT_CRM_FORMULAS, type CrmFormulas, type CrmSlotKey } from '../engine/crm-formulas';

/** The boxes on the CRM Logics flow. Boxes with slots have a formula; boxes with values have numbers; others are explanatory. */
export interface CrmOption { id: string; label: string; desc: string; set: Partial<CrmFormulas> }
export interface CrmGroup { id: string; title: string; help: string; slots: CrmSlotKey[]; values: string[]; options: CrmOption[] }

const D = DEFAULT_CRM_FORMULAS;
const LATE = '(min(max(daysLate, 0), 30) / 30)';

export const CRM_GROUPS: CrmGroup[] = [
  { id: 'orders', title: 'Orders', slots: [], values: [], options: [], help: 'Only delivered orders count (not replacements). Each customer\'s order dates and spend feed everything after this.' },
  {
    id: 'cycle', title: 'Reorder cycle', slots: ['personalCycle'], values: ['minOrdersForPersonal', 'fallbackCycleDays', 'reorderCycles'],
    help: 'How many days a customer normally takes to reorder. Their own pattern is used once they have enough orders; otherwise the category cycle, then the fallback.',
    options: [
      { id: 'median', label: 'Typical gap', desc: 'The middle gap between their orders, kept between 7 and 120 days. This is how it works today.', set: { personalCycle: D.personalCycle } },
      { id: 'mean', label: 'Average gap', desc: 'The average gap between their orders, kept between 7 and 120 days.', set: { personalCycle: 'min(max(meanGap, 7), 120)' } },
      { id: 'last', label: 'Latest gap', desc: 'Only the most recent gap, kept between 7 and 120 days. Reacts fastest to a change in habit.', set: { personalCycle: 'min(max(lastGap, 7), 120)' } },
      { id: 'early', label: 'Remind a bit early', desc: '90% of the typical gap, so calls come slightly before they run out.', set: { personalCycle: 'min(max(round(medianGap * 0.9), 7), 120)' } },
    ],
  },
  { id: 'late', title: 'Days late', slots: [], values: [], options: [], help: 'Last order date + reorder cycle = due date. Days late is today minus the due date (negative means not due yet).' },
  {
    id: 'segment', title: 'Customer stage', slots: [], values: ['dueSoonDays', 'atRiskAfterDays', 'dormantAfterDays', 'lostAfterDays'], options: [],
    help: 'Each customer gets one stage from days late: due soon, due today, overdue, at risk, dormant or lost. The numbers here are the cut-offs.',
  },
  { id: 'vip', title: 'VIP', slots: [], values: ['vipMinOrders', 'vipMinLifetimeValue'], options: [], help: 'A customer is a VIP when they meet both the order count and the lifetime spend.' },
  {
    id: 'priority', title: 'Call priority', slots: ['priorityScore'], values: ['priorityHighAt', 'priorityMediumAt'],
    help: 'A 0 to 100 score that decides who is called first, then split into high, medium and low.',
    options: [
      { id: 'balanced', label: 'Balanced', desc: '50% customer value, 40% how late they are, 10% for repeat buyers. This is how it works today.', set: { priorityScore: D.priorityScore } },
      { id: 'value', label: 'Value matters more', desc: '70% customer value, 20% lateness, 10% repeat buyers.', set: { priorityScore: `70 * ltvPct + 20 * ${LATE} + (orders >= 2 ? 10 : 0)` } },
      { id: 'late', label: 'Lateness matters more', desc: '30% customer value, 60% lateness, 10% repeat buyers.', set: { priorityScore: `30 * ltvPct + 60 * ${LATE} + (orders >= 2 ? 10 : 0)` } },
    ],
  },
  { id: 'queue', title: 'Call queue', slots: [], values: ['dailyCallTarget'], options: [], help: 'The queue lists customers by priority. The daily target is how many calls each caller aims for.' },
];
