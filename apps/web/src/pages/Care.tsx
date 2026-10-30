import { Link } from 'react-router-dom';
import { URGENT_ARTICLE_SLUG } from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageId } from '../i18n/catalog';

/**
 * Care navigation pages (S8-1). Generic, provider-led guidance only: no lab results are stored or shown, nothing here
 * diagnoses or advises on treatment, and no phone number, address or hotline is invented. Wording lives in the i18n
 * catalog (unreviewed DEMO) and every page carries the "DEMO – not clinically reviewed" label.
 */
interface CareTopic {
  slug: 'results' | 'treatment-and-referral' | 'preparing-for-your-visit';
  titleId: MessageId;
  introId: MessageId;
  indexBodyId: MessageId;
  pointIds: readonly MessageId[];
}

export const CARE_TOPICS: readonly CareTopic[] = [
  {
    slug: 'results',
    titleId: 'care.results.title',
    introId: 'care.results.intro',
    indexBodyId: 'care.index.results.body',
    pointIds: ['care.results.p1', 'care.results.p2', 'care.results.p3', 'care.results.p4', 'care.results.p5'],
  },
  {
    slug: 'treatment-and-referral',
    titleId: 'care.treatment.title',
    introId: 'care.treatment.intro',
    indexBodyId: 'care.index.treatment.body',
    pointIds: ['care.treatment.p1', 'care.treatment.p2', 'care.treatment.p3', 'care.treatment.p4', 'care.treatment.p5'],
  },
  {
    slug: 'preparing-for-your-visit',
    titleId: 'care.prepare.title',
    introId: 'care.prepare.intro',
    indexBodyId: 'care.index.prepare.body',
    pointIds: ['care.prepare.p1', 'care.prepare.p2', 'care.prepare.p3', 'care.prepare.p4', 'care.prepare.p5', 'care.prepare.p6'],
  },
];

function DemoLabel() {
  const { t } = useI18n();
  return (
    <p className="review-badge" data-review="demo">
      <strong className="review-badge__demo">{t('care.demo')}</strong>
    </p>
  );
}

export function CareIndex() {
  const { t } = useI18n();
  return (
    <div className="care">
      <h1>{t('care.title')}</h1>
      <DemoLabel />
      <p>{t('care.intro')}</p>
      <h2>{t('care.index.heading')}</h2>
      <ul className="care__topics">
        {CARE_TOPICS.map((topic) => (
          <li key={topic.slug} className="card">
            <h3>
              <Link to={`/care/${topic.slug}`}>{t(topic.titleId)}</Link>
            </h3>
            <p>{t(topic.indexBodyId)}</p>
          </li>
        ))}
      </ul>
      <p>{t('care.providerLed')}</p>
    </div>
  );
}

export function CareTopicPage({ slug }: { slug: CareTopic['slug'] }) {
  const { t } = useI18n();
  const topic = CARE_TOPICS.find((c) => c.slug === slug);
  if (!topic) return null;
  return (
    <article className="care" data-care-topic={slug}>
      <p>
        <Link to="/care">{t('care.back')}</Link>
      </p>
      <h1>{t(topic.titleId)}</h1>
      <DemoLabel />
      <p>{t(topic.introId)}</p>
      <ul className="care__points">
        {topic.pointIds.map((id) => (
          <li key={id}>{t(id)}</li>
        ))}
      </ul>
      <p>{t('care.providerLed')}</p>
      <p>{t('care.noContacts')}</p>
      <section className="card" aria-labelledby="care-urgent-title">
        <h2 id="care-urgent-title">{t('home.urgent.title')}</h2>
        <p>{t('care.urgent.body')}</p>
        <Link to={`/learn/${URGENT_ARTICLE_SLUG}`} className="btn btn--secondary">
          {t('learn.urgent.cta')}
        </Link>
      </section>
      <h2>{t('care.related')}</h2>
      <ul>
        <li>
          <Link to="/appointments/lookup">{t('menu.requests.lookup')}</Link>
        </li>
        <li>
          <Link to="/clinics">{t('nav.clinics')}</Link>
        </li>
      </ul>
    </article>
  );
}

export const CareResults = () => <CareTopicPage slug="results" />;
export const CareTreatment = () => <CareTopicPage slug="treatment-and-referral" />;
export const CarePreparing = () => <CareTopicPage slug="preparing-for-your-visit" />;
