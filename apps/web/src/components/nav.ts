import { BookHeart, Hospital, House, Menu, type LucideIcon } from 'lucide-react';
import type { MessageId } from '../i18n/catalog';

export interface NavItem {
  to: string;
  labelId: MessageId;
  icon: LucideIcon;
}

/** Locked four-item navigation: Home / Learn / Clinics / Menu (master prompt section 3). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelId: 'nav.home', icon: House },
  { to: '/learn', labelId: 'nav.learn', icon: BookHeart },
  { to: '/clinics', labelId: 'nav.clinics', icon: Hospital },
  { to: '/menu', labelId: 'nav.menu', icon: Menu },
];
