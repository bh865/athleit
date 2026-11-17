import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
} from '@athleit/core';
import { componentTokens, radius, space, textStyles } from '@athleit/tokens';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Glass, Icon, Text, useTheme } from '@/components/ui';
import { fontFace } from '@/lib/fonts';

import type { PendingFile } from './use-thread';

/** Glass sheet pill (52): paperclip, "Message", 40px lime send button. */
export function Composer({
  replyTo,
  onClearReply,
  onTyping,
  onUpload,
  onSend,
}: {
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onTyping: () => void;
  onUpload: (uri: string, name: string, mime: string) => Promise<PendingFile | { error: string }>;
  onSend: (body: string, files: PendingFile[]) => Promise<void>;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading;
  const body = textStyles.body;

  const submit = async () => {
    if (!canSend) return;
    const t = text.trim();
    const attach = files;
    setText('');
    setFiles([]);
    setError(null);
    await onSend(t, attach);
  };

  const pick = async () => {
    setError(null);
    if (files.length >= MAX_ATTACHMENTS_PER_MESSAGE) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    const mime = asset.mimeType ?? 'image/jpeg';
    if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) {
      setError('Attach an image or a PDF.');
      return;
    }
    if ((asset.fileSize ?? 0) > MAX_ATTACHMENT_BYTES) {
      setError('That file is over 10 MB.');
      return;
    }
    setUploading(true);
    const up = await onUpload(asset.uri, asset.fileName ?? 'photo.jpg', mime);
    setUploading(false);
    if ('error' in up) setError(up.error);
    else setFiles((cur) => [...cur, up]);
  };

  return (
    <View
      style={{
        gap: space[2],
        paddingHorizontal: space[4],
        paddingBottom: space[3],
        paddingTop: space[2],
      }}
    >
      {replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            padding: space[2],
            borderRadius: radius.xs,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
            Replying to {replyTo.senderName ?? 'message'}: {replyTo.body.slice(0, 60)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            onPress={onClearReply}
            style={{
              width: componentTokens.minTarget,
              height: componentTokens.minTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size="sm" color={c.muted} />
          </Pressable>
        </View>
      ) : null}
      {files.map((f) => (
        <View
          key={f.path}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            padding: space[2],
            borderRadius: radius.xs,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Icon name={f.mime === 'application/pdf' ? 'file-pdf' : 'camera'} size="sm" />
          <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
            {f.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${f.name}`}
            onPress={() => setFiles((cur) => cur.filter((x) => x.path !== f.path))}
            style={{
              width: componentTokens.minTarget,
              height: componentTokens.minTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size="sm" color={c.muted} />
          </Pressable>
        </View>
      ))}
      {error ? (
        <Text variant="caption" accessibilityRole="alert" style={{ color: c.bad }}>
          {error}
        </Text>
      ) : null}
      <Glass
        level="sheet"
        cornerRadius={radius.xl - space[1] / 2}
        style={{
          minHeight: componentTokens.chat.composerHeightMobile,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space[1],
          gap: space[1],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          onPress={() => void pick()}
          style={{
            width: componentTokens.minTarget,
            height: componentTokens.minTarget,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="paperclip" color={c.muted} />
        </Pressable>
        <TextInput
          accessibilityLabel="Message"
          placeholder="Message"
          placeholderTextColor={c.muted}
          value={text}
          onChangeText={(t) => {
            setText(t);
            onTyping();
          }}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          style={{
            flex: 1,
            maxHeight: componentTokens.chat.composerHeightMobile * 3,
            paddingVertical: space[3],
            color: c.ink,
            fontFamily: fontFace[body.family][body.weight],
            fontSize: body.size,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void submit()}
          style={{
            width: componentTokens.chat.sendButton,
            height: componentTokens.chat.sendButton,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accent,
            opacity: canSend ? 1 : 0.4,
          }}
        >
          <Icon name="arrow-up" weight="fill" color={c.accentInk} />
        </Pressable>
      </Glass>
    </View>
  );
}
