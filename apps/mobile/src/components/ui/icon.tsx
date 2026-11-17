import { iconSize, type IconSize } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import {
  AppleLogo,
  ArrowRight,
  Bell,
  CalendarBlank,
  Camera,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChatCircle,
  Check,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Desktop,
  DotsThreeCircle,
  GoogleLogo,
  House,
  HouseLine,
  Moon,
  Plus,
  QrCode,
  SignOut,
  Sun,
  Tray,
  User,
  UsersThree,
  Warning,
  WarningCircle,
  WarningOctagon,
  WifiSlash,
  X,
  XCircle,
  type Icon as PhosphorIcon,
} from 'phosphor-react-native';

import { useTheme } from './theme';

/** The ONLY place Phosphor is imported on mobile (enforced by lint). Swap the icon set here. */
const icons: Record<IconName, PhosphorIcon> = {
  house: House,
  'house-line': HouseLine,
  'calendar-blank': CalendarBlank,
  'users-three': UsersThree,
  'chat-circle': ChatCircle,
  'credit-card': CreditCard,
  'dots-three-circle': DotsThreeCircle,
  bell: Bell,
  check: Check,
  'check-circle': CheckCircle,
  x: X,
  'x-circle': XCircle,
  clock: Clock,
  warning: Warning,
  'warning-circle': WarningCircle,
  'warning-octagon': WarningOctagon,
  'wifi-slash': WifiSlash,
  'caret-left': CaretLeft,
  'caret-right': CaretRight,
  'caret-up-down': CaretUpDown,
  plus: Plus,
  copy: Copy,
  'qr-code': QrCode,
  sun: Sun,
  moon: Moon,
  desktop: Desktop,
  'arrow-right': ArrowRight,
  'apple-logo': AppleLogo,
  'google-logo': GoogleLogo,
  user: User,
  'sign-out': SignOut,
  tray: Tray,
  camera: Camera,
};

export interface IconProps {
  name: IconName;
  weight?: 'regular' | 'fill';
  size?: IconSize;
  /** Semantic colour; defaults to ink. Pass a resolved theme colour (e.g. theme.color.muted). */
  color?: string;
}

export function Icon({ name, weight = 'regular', size = 'md', color }: IconProps) {
  const { theme } = useTheme();
  const Cmp = icons[name];
  return <Cmp weight={weight} size={iconSize[size]} color={color ?? theme.color.ink} />;
}
