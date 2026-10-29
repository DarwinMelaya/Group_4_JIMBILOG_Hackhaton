export * from './locales.js';

export const REQUEST_STATUSES = ['pending_review', 'confirmed', 'alternative_required', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export * from './config.js';
