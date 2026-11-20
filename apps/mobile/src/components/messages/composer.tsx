import {
  ATTACHMENT_LIMITS_TEXT,
  attachmentProblemText,
  characterCounter,
  MAX_MESSAGE_LENGTH,
  validateAttachment,
  type ChatMessage,
} from '@athleit/core';
import { componentTokens, radius, space, textStyles } from '@athleit/tokens';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Glass, Icon, Mono, Sheet, Text, useTheme } from '@/components/ui';
import { loadDraft, saveDraft } from '@/lib/drafts';
import { fontFace } from '@/lib/fonts';

import type { PendingFile } from './use-thread';

/** Glass sheet pill (52): paperclip, "Message", 40px lime send button. */
export function Composer({
  threadId,
  replyTo,
  onClearReply,
  onTyping,
  onUpload,
  onSend,
}: {
  threadId: string;
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
  const [attachOpen, setAttachOpen] = useState(false);
  const [failedPick, setFailedPick] = useState<{ uri: string; name: string; mime: string } | null>(null);
  // Local draft per conversation (device only); it also feeds the inbox "Draft:" prefix.
  const loaded = useRef(false);
  useEffect(() => {
    let live = true;
    void loadDraft(threadId).then((d) => {
      if (live && d) setText((cur) => cur || d);
      loaded.current = true;
    });
    return () => {
      live = false;
    };
  }, [threadId]);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => void saveDraft(threadId, text), 400);
    return () => clearTimeout(id);
  }, [text, threadId]);
  const counter = characterCounter(text.length);
  const over = text.length > MAX_MESSAGE_LENGTH;
  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading && !over;
  const body = textStyles.body;

  const submit = async () => {
    if (!canSend) return;
    const t = text.trim();
    const attach = files;
    setText('');
    void saveDraft(threadId, '');
    setFiles([]);
    setError(null);
    await onSend(t, attach);
  };

  const attach = async (source: 'camera' | 'library') => {
    setAttachOpen(false);
    setError(null);
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Allow camera access in Settings to take a photo for a message.');
        return;
      }
    }
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    const mime = asset.mimeType ?? 'image/jpeg';
    const problem = validateAttachment({ type: mime, size: asset.fileSize ?? 1 }, files.length);
    if (problem) {
      setError(attachmentProblemText(problem));
      return;
    }
    await upload(asset.uri, asset.fileName ?? 'photo.jpg', mime);
  };

  const upload = async (uri: string, name: string, mime: string) => {
    setUploading(true);
    setFailedPick(null);
    const up = await onUpload(uri, name, mime);
    setUploading(false);
    if ('error' in up) {
      setError(up.error);
      setFailedPick({ uri, name, mime });
    } else setFiles((cur) => [...cur, up]);
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
      {uploading ? (
        <Text variant="caption" muted accessibilityRole="progressbar">
          Uploading…
        </Text>
      ) : null}
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="caption" accessibilityRole="alert" style={{ color: c.bad, flex: 1 }}>
            {error}
          </Text>
          {failedPick ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry upload"
              onPress={() => void upload(failedPick.uri, failedPick.name, failedPick.mime)}
              style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
            >
              <Text variant="bodyBold">Retry</Text>
            </Pressable>
          ) : null}
        </View>
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
          accessibilityLabel="Attach a photo or file"
          onPress={() => setAttachOpen(true)}
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
      {counter !== null ? (
        <Mono
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{ alignSelf: 'flex-end', color: counter < 0 ? c.bad : c.muted }}
        >
          {counter < 0 ? `${-counter} over the limit` : `${counter} left`}
        </Mono>
      ) : null}
      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)} title="Attach">
        <View style={{ gap: space[2] }}>
          {[
            { label: 'Camera', icon: 'camera' as const, run: () => void attach('camera') },
            { label: 'Photo library', icon: 'image' as const, run: () => void attach('library') },
          ].map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={o.run}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}
            >
              <Icon name={o.icon} />
              <Text variant="bodyBold">{o.label}</Text>
            </Pressable>
          ))}
          <Text variant="caption" muted>
            {ATTACHMENT_LIMITS_TEXT} Adding PDFs from Files is coming in a later update.
          </Text>
        </View>
      </Sheet>
    </View>
  );
}
