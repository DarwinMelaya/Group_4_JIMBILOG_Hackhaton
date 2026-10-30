import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookHeart,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  EyeOff,
  HeartPulse,
  Hospital,
  LockKeyhole,
  MessageCircleHeart,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  UserRoundCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { URGENT_ARTICLE_SLUG } from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageId } from '../i18n/catalog';
import { HeroIllustration } from '../components/HeroIllustration';

const STEPS: readonly { n: 1 | 2 | 3 | 4; icon: LucideIcon }[] = [
  { n: 1, icon: BookHeart },
  { n: 2, icon: ClipboardCheck },
  { n: 3, icon: Hospital },
  { n: 4, icon: CalendarCheck },
];

const WHY: readonly { key: 'privacy' | 'info' | 'match' | 'guide'; icon: LucideIcon }[] = [
  { key: 'privacy', icon: LockKeyhole },
  { key: 'info', icon: BookHeart },
  { key: 'match', icon: Hospital },
  { key: 'guide', icon: MessageCircleHeart },
];

const TRUST: readonly { n: 1 | 2 | 3; icon: LucideIcon }[] = [
  { n: 1, icon: UserRoundCheck },
  { n: 2, icon: EyeOff },
  { n: 3, icon: ShieldCheck },
];

const EXPLORE: readonly { key: 'learn' | 'prepare' | 'after'; to: string; icon: LucideIcon }[] = [
  { key: 'learn', to: '/learn', icon: Stethoscope },
  { key: 'prepare', to: '/care/preparing-for-your-visit', icon: ClipboardCheck },
  { key: 'after', to: '/care/results', icon: HeartPulse },
];

const mid = (s: string) => s as MessageId;

export function Home() {
  const { t } = useI18n();
  return (
    <div className="landing">
      <section className="lp-hero" aria-labelledby="hero-title">
        <div className="lp-wrap lp-hero__grid">
          <div className="lp-hero__copy">
            <p className="lp-eyebrow">
              <span className="lp-eyebrow__brand">KALINGA</span> {t('landing.hero.eyebrow')}
            </p>
            <h1 id="hero-title">{t('home.hero.title')}</h1>
            <p className="lp-lead">{t('home.hero.body')}</p>
            <div className="actions">
              <Link to="/pathway" className="btn btn--primary">{t('home.hero.ctaClinics')}</Link>
              <Link to="/learn" className="btn btn--secondary">{t('home.hero.ctaLearn')}</Link>
            </div>
            <p className="hero__note">{t('home.hero.privacyNote')}</p>
          </div>
          <figure className="lp-hero__art">
            <HeroIllustration />
            <figcaption className="sr-only">{t('landing.hero.art')}</figcaption>
          </figure>
        </div>
      </section>

      <div className="lp-wrap lp-urgent-wrap">
        <section className="lp-urgent" aria-labelledby="urgent-title">
          <TriangleAlert className="lp-urgent__icon" size={28} aria-hidden="true" />
          <div className="lp-urgent__copy">
            <h2 id="urgent-title">{t('home.urgent.title')}</h2>
            <p>{t('home.urgent.body')}</p>
            <p>{t('learn.urgent.body')}</p>
          </div>
          <Link to={`/learn/${URGENT_ARTICLE_SLUG}`} className="btn btn--primary">
            {t('learn.urgent.cta')}
          </Link>
        </section>
      </div>

      <section className="lp-section lp-how" aria-labelledby="how-title">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <h2 id="how-title">{t('landing.how.title')}</h2>
            <p>{t('landing.how.intro')}</p>
          </div>
          <ol className="lp-steps">
            {STEPS.map(({ n, icon: Icon }) => (
              <li key={n} className="lp-step reveal">
                <span className="lp-step__badge" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <span className="lp-step__n" aria-hidden="true">0{n}</span>
                <h3>{t(mid(`landing.how.${n}.title`))}</h3>
                <p>{t(mid(`landing.how.${n}.body`))}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-section lp-why" aria-labelledby="why-title">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <h2 id="why-title">{t('landing.why.title')}</h2>
            <p>{t('landing.why.intro')}</p>
          </div>
          <ul className="lp-bento">
            {WHY.map(({ key, icon: Icon }) => (
              <li key={key} className={`lp-bento__item lp-bento__item--${key} reveal`}>
                <span className="lp-chip-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3>{t(mid(`landing.why.${key}.title`))}</h3>
                <p>{t(mid(`landing.why.${key}.body`))}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-section lp-explore" aria-labelledby="explore-title">
        <div className="lp-wrap">
          <div className="lp-head lp-head--light reveal">
            <h2 id="explore-title">{t('landing.explore.title')}</h2>
            <p>{t('landing.explore.intro')}</p>
          </div>
          <ul className="lp-cards">
            {EXPLORE.map(({ key, to, icon: Icon }) => (
              <li key={key} className="reveal">
                <Link to={to} className="lp-card">
                  <span className="lp-chip-icon" aria-hidden="true">
                    <Icon size={24} strokeWidth={2} />
                  </span>
                  <span className="lp-card__title">{t(mid(`landing.explore.${key}.title`))}</span>
                  <span className="lp-card__body">{t(mid(`landing.explore.${key}.body`))}</span>
                  <ArrowRight className="lp-card__arrow" size={20} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="lp-explore__cta">
            <Link to="/learn" className="btn btn--on-dark">{t('landing.explore.cta')}</Link>
          </p>
        </div>
      </section>

      <section className="lp-section lp-care" aria-labelledby="care-title">
        <div className="lp-wrap lp-care__grid">
          <div className="lp-care__copy reveal">
            <h2 id="care-title">{t('landing.care.title')}</h2>
            <p>{t('landing.care.body')}</p>
            <div className="actions">
              <Link to="/pathway" className="btn btn--primary">{t('landing.care.cta')}</Link>
              <Link to="/clinics" className="btn btn--secondary">{t('landing.care.browse')}</Link>
            </div>
          </div>
          <div className="lp-care__art reveal" aria-hidden="true">
            <ul className="lp-pathchips">
              <li className="lp-pathchip lp-pathchip--1"><LockKeyhole size={20} />{t('landing.care.chip.privacy')}</li>
              <li className="lp-pathchip lp-pathchip--2"><Wallet size={20} />{t('landing.care.chip.cost')}</li>
              <li className="lp-pathchip lp-pathchip--3"><Clock size={20} />{t('landing.care.chip.hours')}</li>
            </ul>
            <Hospital className="lp-care__hospital" size={72} strokeWidth={1.5} />
          </div>
        </div>
      </section>

      <section className="lp-section lp-trust" aria-labelledby="trust-title">
        <div className="lp-wrap">
          <div className="lp-head lp-head--light reveal">
            <h2 id="trust-title">{t('landing.trust.title')}</h2>
            <p>{t('landing.trust.intro')}</p>
          </div>
          <ul className="lp-trust__grid">
            {TRUST.map(({ n, icon: Icon }) => (
              <li key={n} className="lp-trust__item reveal">
                <span className="lp-chip-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3>{t(mid(`landing.trust.${n}.title`))}</h3>
                <p>{t(mid(`landing.trust.${n}.body`))}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-final" aria-labelledby="final-title">
        <div className="lp-wrap">
          <div className="lp-final__card reveal">
            <h2 id="final-title">{t('landing.final.title')}</h2>
            <p>{t('landing.final.body')}</p>
            <Link to="/clinics" className="btn btn--primary">{t('landing.final.cta')}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
