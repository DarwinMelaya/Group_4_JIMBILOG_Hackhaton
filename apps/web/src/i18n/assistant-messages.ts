import type { CatalogEntry } from './catalog';

/**
 * Assistant extension (SA-2): page-aware chips and replies for Learn, pathway, clinic profiles, booking requests, status
 * lookup, reminders and care pages. Spread into the en/fil catalogs. Every entry is unreviewed DEMO wording and the Filipino
 * text is a draft. Nothing here diagnoses, advises on treatment, promises a booking or invents a contact detail.
 */
const u = (text: string): CatalogEntry => ({ text, review: 'unreviewed' });

export const assistantEn = {
  'assistant.tagline': u('Kalinga AI · scripted DEMO'),
  'assistant.typing': u('KAI is typing'),
  'assistant.suggest': u('More suggested questions'),
  'assistant.suggestMenu': u('Suggested questions'),
  'assistant.chip.pathway': u('Help me choose a clinic'),
  'assistant.chip.profile': u('What is on a clinic profile?'),
  'assistant.chip.booking': u('How do I request an appointment?'),
  'assistant.chip.status': u('Check my request'),
  'assistant.chip.reminders': u('About reminders'),
  'assistant.chip.care': u('Care navigation'),
  'assistant.reply.profile': u(
    'Each DEMO clinic profile shows services, opening times, how to reach the clinic and when its details were last checked. Every clinic here is fictitious. Details can change, so always confirm with a clinic before you go.',
  ),
  'assistant.reply.booking': u(
    'Open a clinic from the Clinics page and choose Send a request to this clinic. You pick a preferred date and time window, and no account is needed. This is a request, not a confirmation: nothing is booked until the clinic replies. The clinic may confirm, suggest another time or decline. You will get a reference and a secret code, so keep them to check the status later.',
  ),
  'assistant.reply.status': u(
    'On the Check a request page, enter the reference and the secret code you were given when you sent the request. The page shows the clinic reply, if there is one. If you lose the secret code, it cannot be recovered, so you would need to send a new request.',
  ),
  'assistant.reply.reminders': u(
    'Reminders are optional and off unless you choose them, on the Check a request page after you look up a request. They use short, neutral wording. In this DEMO reminders are mock only: no real message is sent to anyone.',
  ),
} as const satisfies Record<string, CatalogEntry>;

export const assistantFil = {
  'assistant.tagline': u('Kalinga AI · naka-script na DEMO'),
  'assistant.typing': u('Nagta-type si KAI'),
  'assistant.suggest': u('Higit pang mungkahing tanong'),
  'assistant.suggestMenu': u('Mga mungkahing tanong'),
  'assistant.chip.pathway': u('Tulungan akong pumili ng klinika'),
  'assistant.chip.profile': u('Ano ang nasa profile ng klinika?'),
  'assistant.chip.booking': u('Paano humiling ng appointment?'),
  'assistant.chip.status': u('Tingnan ang kahilingan ko'),
  'assistant.chip.reminders': u('Tungkol sa mga paalala'),
  'assistant.chip.care': u('Gabay sa pangangalaga'),
  'assistant.reply.profile': u(
    'Ipinapakita ng bawat profile ng DEMO na klinika ang mga serbisyo, oras ng bukas, paano makipag-ugnayan sa klinika at kung kailan huling sinuri ang detalye. Kathang-isip ang lahat ng klinika rito. Maaaring magbago ang detalye, kaya laging kumpirmahin sa klinika bago pumunta.',
  ),
  'assistant.reply.booking': u(
    'Magbukas ng klinika mula sa pahina ng Mga Klinika at piliin ang Magpadala ng request sa klinikang ito. Pipili ka ng gustong petsa at oras, at hindi kailangan ng account. Kahilingan ito, hindi kumpirmasyon: wala pang naka-book hangga\'t hindi sumasagot ang klinika. Maaaring kumpirmahin, magmungkahi ng ibang oras o tumanggi ang klinika. Makakatanggap ka ng reference at lihim na code, kaya itago ang mga ito para masuri ang katayuan sa ibang pagkakataon.',
  ),
  'assistant.reply.status': u(
    'Sa pahinang Suriin ang isang kahilingan, ilagay ang reference at lihim na code na ibinigay noong ipinadala mo ang kahilingan. Ipinapakita ng pahina ang sagot ng klinika, kung mayroon. Kapag nawala ang lihim na code, hindi na ito mababawi, kaya kakailanganin mong magpadala ng bagong kahilingan.',
  ),
  'assistant.reply.reminders': u(
    'Opsyonal ang mga paalala at hindi aktibo maliban kung pipiliin mo, sa pahinang Suriin ang isang kahilingan pagkatapos mong tingnan ang isang kahilingan. Maikli at neutral ang mga salita. Sa DEMO na ito, mock lamang ang mga paalala: walang totoong mensaheng ipinapadala sa sinuman.',
  ),
} as const satisfies Record<string, CatalogEntry>;
