/**
 * LAYER 3: COMPONENT TOKENS. Only the knobs a component needs that are not a plain
 * spacing/radius step. Values here are sizes in px.
 */
export const componentTokens = {
  button: { height: 48, heightLg: 56, minWidth: 44 },
  iconButton: { size: 44, sizeLg: 48 },
  input: { height: 52, radius: 18, focusBorder: 2 },
  chip: { radius: 16, height: 32 },
  badge: { minWidth: 20, height: 20 },
  statusDot: { size: 8 },
  avatar: { sm: 36, md: 44, lg: 56 },
  listRow: { height: 64, iconSize: 44 },
  card: { radius: 24, border: 1 },
  tabBar: { height: 68, radius: 34, itemWidth: 64, itemHeight: 54 },
  sidebar: { width: 248, radius: 28, itemHeight: 44 },
  bubble: { radius: 22, tail: 6, maxWidthWeb: 420, maxWidthMobile: 270 },
  chat: {
    threadListWidth: 340,
    headerHeightWeb: 76,
    headerHeightMobile: 112,
    composerHeightWeb: 56,
    composerHeightMobile: 52,
    sendButton: 40,
    threadAvatarWeb: 44,
    threadAvatarMobile: 52,
    reactionHeight: 24,
    typingDot: 8,
    unreadDot: 10,
  },
  emptyState: { iconCircle: 88 },
  skeleton: { rowHeight: 64 },
  sheetGrabber: { width: 36, height: 5 },
  qr: { size: 192 },
  minTarget: 44,
  focusRingWidth: 3,
} as const;
