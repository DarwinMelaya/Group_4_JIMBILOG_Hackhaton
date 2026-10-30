export * from './locales.js';

export const REQUEST_STATUSES = ['pending_review', 'confirmed', 'alternative_required', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export * from './config.js';
export * from './articles.js';
export * from './clinics.js';
export * from './pathway.js';
export * from './booking.js';
export * from './staff.js';
export * from './governance.js';
export * from './reminders.js';
