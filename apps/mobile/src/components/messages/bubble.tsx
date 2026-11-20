import {
  messageA11yLabel,
  timeLabel,
  type ChatMessage,
  type DeliveryStatus,
  type Reaction as ReactionKey,
} from '@athleit/core';
import { getAttachmentUrl } from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';

import { Icon, Text, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';

import type { Attachment, Reaction } from './use-thread';

export const REACTION_ICON: Record<ReactionKey, IconName> = {
  thumbs_up: 'thumbs-up',
  heart: 'heart',
  laugh: 'smiley',
  celebrate: 'confetti',
  clap: 'hands-clapping',
  wow: 'star',
};
export const REACTION_LABEL: Record<string, string> = {
  thumbs_up: 'Thumbs up',
  heart: 'Heart',
  laugh: 'Laugh',
  celebrate: 'Celebrate',
  clap: 'Clap',
  wow: 'Wow',
};

function AttachmentView({
  a,
  onOpenImage,
}: {
  a: Attachment;
  onOpenImage?: (path: string) => void;
}) {
  const { theme } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getAttachmentUrl(supabase, a.path).then((r) => live && r.data && setUrl(r.data));
    return () => {
      live = false;
    };
  }, [a.path]);
  const name = a.path.split('/').pop() ?? 'file';
  if (a.mime.startsWith('image/')) {
    return url ? (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo ${name}. Open`}
        onPress={() => onOpenImage?.(a.path)}
      >
        <Image
          source={{ uri: url }}
          style={{
            width: componentTokens.bubble.maxWidthMobile - space[8],
            aspectRatio: 1,
            borderRadius: radius.sm,
          }}
          resizeMode="cover"
        />
      </Pressable>
    ) : (
      <View
        style={{
          width: componentTokens.bubble.maxWidthMobile - space[8],
          aspectRatio: 1,
          borderRadius: radius.sm,
          backgroundColor: theme.color.surfaceAlt,
        }}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`PDF ${name}`}
      onPress={() => url && void Linking.openURL(url)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        padding: space[2],
        borderRadius: radius.xs,
        backgroundColor: theme.color.surfaceAlt,
        minHeight: componentTokens.minTarget,
      }}
    >
      <Icon name="file-pdf" color={theme.color.ink} />
      <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
    </Pressable>
  );
}

export interface BubbleProps {
  message: ChatMessage;
  own: boolean;
  firstInRun: boolean;
  lastInRun: boolean;
  status: DeliveryStatus | null;
  reactions: Reaction[];
  attachments: Attachment[];
  quoted: ChatMessage | null;
  myId: string;
  announcement: boolean;
  readCount: number;
  showReads: boolean;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onDiscard: () => void;
  onOpenImage?: (path: string) => void;
}

/** Received: surface-alt left. Own: "sent" fill right. Radius 22, 6px tail on the last of a run. */
export function Bubble(p: BubbleProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const m = p.message;
  const removed = m.hidden || m.deleted;
  const failed = m.sendState === 'failed';
  const label = messageA11yLabel({ message: m, own: p.own }, p.status);

  if (p.announcement) {
    return (
      <Pressable
        onLongPress={p.onLongPress}
        accessibilityLabel={label}
        style={{
          gap: space[2],
          padding: space[4],
          borderRadius: radius.lg,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <Text variant="label" muted>
          ANNOUNCEMENT
        </Text>
        <Text>{m.hidden ? 'Removed by staff' : m.deleted ? 'Message deleted' : m.body}</Text>
        <Text variant="caption" muted>
          {m.senderName ?? 'Staff'} · {timeLabel(new Date(m.createdAt))}
          {p.showReads && !removed ? ` · ${p.readCount} read` : ''}
        </Text>
      </Pressable>
    );
  }

  const tail = componentTokens.bubble.tail;
  return (
    <View style={{ alignItems: p.own ? 'flex-end' : 'flex-start', gap: space[1] }}>
      {!p.own && p.firstInRun ? (
        <Text variant="caption" muted style={{ paddingHorizontal: space[3] }}>
          {m.senderName ?? 'Someone'}
        </Text>
      ) : null}
      <Pressable
        onLongPress={removed || m.sendState ? undefined : p.onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={removed ? undefined : 'Long press for reactions, reply and report'}
        style={{
          maxWidth: componentTokens.bubble.maxWidthMobile,
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          gap: space[2],
          borderRadius: componentTokens.bubble.radius,
          ...(p.lastInRun
            ? p.own
              ? { borderBottomRightRadius: tail }
              : { borderBottomLeftRadius: tail }
            : null),
          backgroundColor: removed ? c.surfaceAlt : p.own ? c.bubbleOwn : c.bubbleOther,
          opacity: m.sendState === 'sending' ? 0.6 : 1,
        }}
      >
        {p.quoted && !removed ? (
          <View
            style={{
              paddingLeft: space[3],
              borderLeftWidth: 3,
              borderLeftColor: p.own ? c.bubbleOwnInk : c.bubbleOtherInk,
              opacity: 0.75,
            }}
          >
            <Text
              variant="caption"
              style={{ color: p.own ? c.bubbleOwnInk : c.bubbleOtherInk }}
              numberOfLines={1}
            >
              {p.quoted.senderName ?? 'Someone'}
            </Text>
            <Text
              variant="caption"
              numberOfLines={2}
              style={{ color: p.own ? c.bubbleOwnInk : c.bubbleOtherInk }}
            >
              {p.quoted.body || 'Attachment'}
            </Text>
          </View>
        ) : null}
        {removed ? (
          <Text muted style={{ fontStyle: 'italic' }}>
            {m.hidden ? 'Removed by staff' : 'Message deleted'}
          </Text>
        ) : (
          <>
            {m.body ? (
              <Text style={{ color: p.own ? c.bubbleOwnInk : c.bubbleOtherInk }}>{m.body}</Text>
            ) : null}
            {p.attachments.map((a) => (
              <AttachmentView key={a.id} a={a} onOpenImage={p.onOpenImage} />
            ))}
          </>
        )}
      </Pressable>
      {p.reactions.length > 0 && !removed ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space[1],
            marginTop: -space[3],
            paddingHorizontal: space[3],
          }}
        >
          {p.reactions.map((r) => {
            const mine = r.profileIds.includes(p.myId);
            return (
              <Pressable
                key={r.emoji}
                onPress={() => p.onReact(r.emoji)}
                accessibilityRole="button"
                accessibilityLabel={`${REACTION_LABEL[r.emoji] ?? r.emoji}, ${r.profileIds.length}${mine ? ', you reacted' : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[1],
                  height: componentTokens.chat.reactionHeight,
                  paddingHorizontal: space[2],
                  borderRadius: radius.pill,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: mine ? c.ink : c.line,
                }}
              >
                <Icon
                  name={REACTION_ICON[r.emoji as ReactionKey] ?? 'heart'}
                  weight="fill"
                  size="sm"
                />
                <Text variant="monoSm">{r.profileIds.length}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {p.lastInRun || failed ? (
        <View
          style={{
            flexDirection: 'row',
            gap: space[2],
            paddingHorizontal: space[3],
            alignItems: 'center',
          }}
        >
          {failed ? (
            <>
              <Text variant="caption" accessibilityRole="alert" style={{ color: c.bad }}>
                Failed to send
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={p.onRetry}
                style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
              >
                <Text variant="caption" style={{ textDecorationLine: 'underline' }}>
                  Retry
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={p.onDiscard}
                style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
              >
                <Text variant="caption" style={{ textDecorationLine: 'underline' }}>
                  Discard
                </Text>
              </Pressable>
            </>
          ) : (
            <Text variant="monoSm" muted>
              {timeLabel(new Date(m.createdAt))}
              {p.own && p.status ? ` · ${p.status}` : ''}
              {m.editedAt ? ' · Edited' : ''}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
