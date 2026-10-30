import type { CatalogEntry } from './catalog';

/**
 * Admin aggregate report copy (S8-2). Kept in its own module and spread into the en/fil catalogs. Every entry is unreviewed
 * DEMO wording; the Filipino text is a draft. The report shows counts only, never records.
 */
const u = (text: string): CatalogEntry => ({ text, review: 'unreviewed' });

export const reportEn = {
  'reports.title': u('Request summary'),
  'reports.link': u('Request summary'),
  'reports.intro': u('Counts of appointment requests by month and status. These are totals only: no individual request, age, contact or reference is shown.'),
  'reports.scope.all': u('Scope: all clinics'),
  'reports.scope.clinic': u('Scope: your clinic only'),
  'reports.privacy': u('To protect privacy, any count below 5 (including zero) is shown as "<5", and a second count may also be hidden so that a hidden number cannot be worked out from the totals.'),
  'reports.demo': u('DEMO data only. These figures come from test requests and are not real activity.'),
  'reports.months.label': u('Months to show'),
  'reports.months.3': u('Last 3 months'),
  'reports.months.6': u('Last 6 months'),
  'reports.months.12': u('Last 12 months'),
  'reports.loading': u('Loading summary...'),
  'reports.table.caption': u('Appointment requests by month and status'),
  'reports.col.period': u('Month'),
  'reports.col.received': u('Received'),
  'reports.col.awaiting': u('Awaiting reply'),
  'reports.col.confirmed': u('Confirmed'),
  'reports.col.alternative': u('Other time offered'),
  'reports.col.cancelled': u('Cancelled'),
  'reports.col.expired': u('Expired'),
  'reports.attendance': u('Attendance reporting is approved but no attendance data is collected in this DEMO.'),
  'reports.export': u('Download CSV'),
  'reports.export.help': u('The CSV has the same suppressed counts as the table. Each download is recorded in the audit log.'),
  'reports.export.done': u('CSV download started.'),
} as const satisfies Record<string, CatalogEntry>;

export const reportFil = {
  'reports.title': u('Buod ng mga kahilingan'),
  'reports.link': u('Buod ng mga kahilingan'),
  'reports.intro': u('Bilang ng mga kahilingan sa appointment ayon sa buwan at katayuan. Kabuuan lamang ito: walang ipinapakitang indibidwal na kahilingan, edad, contact o reference.'),
  'reports.scope.all': u('Saklaw: lahat ng klinika'),
  'reports.scope.clinic': u('Saklaw: ang klinika mo lamang'),
  'reports.privacy': u('Para protektahan ang privacy, ang anumang bilang na mas mababa sa 5 (kasama ang zero) ay ipinapakita bilang "<5", at maaaring itago rin ang isa pang bilang para hindi makuwenta ang nakatagong numero mula sa mga kabuuan.'),
  'reports.demo': u('DEMO na datos lamang. Galing ang mga bilang na ito sa mga pagsubok na kahilingan at hindi totoong aktibidad.'),
  'reports.months.label': u('Bilang ng buwang ipapakita'),
  'reports.months.3': u('Huling 3 buwan'),
  'reports.months.6': u('Huling 6 na buwan'),
  'reports.months.12': u('Huling 12 buwan'),
  'reports.loading': u('Kinukuha ang buod...'),
  'reports.table.caption': u('Mga kahilingan sa appointment ayon sa buwan at katayuan'),
  'reports.col.period': u('Buwan'),
  'reports.col.received': u('Natanggap'),
  'reports.col.awaiting': u('Naghihintay ng sagot'),
  'reports.col.confirmed': u('Nakumpirma'),
  'reports.col.alternative': u('Inalok ng ibang oras'),
  'reports.col.cancelled': u('Kinansela'),
  'reports.col.expired': u('Nag-expire'),
  'reports.attendance': u('Aprubado ang pag-uulat ng pagdalo ngunit walang datos ng pagdalo na kinokolekta sa DEMO na ito.'),
  'reports.export': u('I-download ang CSV'),
  'reports.export.help': u('Pareho ng nakatagong bilang sa talahanayan ang laman ng CSV. Naitatala sa audit log ang bawat download.'),
  'reports.export.done': u('Nagsimula na ang pag-download ng CSV.'),
} as const satisfies Record<string, CatalogEntry>;
