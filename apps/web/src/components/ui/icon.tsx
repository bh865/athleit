'use client';

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
  Paperclip,
  ArrowUp,
  ArrowDown,
  Megaphone,
  Info,
  ThumbsUp,
  Heart,
  Smiley,
  Confetti,
  HandsClapping,
  Star,
  ArrowBendUpLeft,
  Flag,
  FilePdf,
  BellSlash,
  EyeSlash,
  Prohibit,
  Trash,
  PencilSimple,
  MapPin,
  Link as LinkIcon,
  ArrowClockwise,
  Repeat,
  Question,
  ShieldCheck,
  CaretDown,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

/** The ONLY place Phosphor is imported (enforced by lint). Swap the icon set here. */
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
  paperclip: Paperclip,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  megaphone: Megaphone,
  info: Info,
  'thumbs-up': ThumbsUp,
  heart: Heart,
  smiley: Smiley,
  confetti: Confetti,
  'hands-clapping': HandsClapping,
  star: Star,
  'arrow-bend-up-left': ArrowBendUpLeft,
  flag: Flag,
  'file-pdf': FilePdf,
  'bell-slash': BellSlash,
  'eye-slash': EyeSlash,
  prohibit: Prohibit,
  trash: Trash,
  pencil: PencilSimple,
  'map-pin': MapPin,
  link: LinkIcon,
  'arrow-clockwise': ArrowClockwise,
  repeat: Repeat,
  question: Question,
  'shield-check': ShieldCheck,
  'caret-down': CaretDown,
};

export type IconSizeName = 'sm' | 'md' | 'lg' | 'xl';
const sizeVar: Record<IconSizeName, string> = {
  sm: 'var(--icon-sm)',
  md: 'var(--icon-md)',
  lg: 'var(--icon-lg)',
  xl: 'var(--icon-xl)',
};

export interface IconProps {
  name: IconName;
  /** Regular by default; `fill` for the active/selected state. */
  weight?: 'regular' | 'fill';
  size?: IconSizeName;
  /** Provide for icons that carry meaning on their own; decorative icons are hidden from AT. */
  label?: string;
}

export function Icon({ name, weight = 'regular', size = 'md', label }: IconProps) {
  const Cmp = icons[name];
  return (
    <Cmp
      weight={weight}
      size={sizeVar[size]}
      color="currentColor"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
