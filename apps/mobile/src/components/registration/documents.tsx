import {
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_VISIBILITY_LABEL,
  categoryCounts,
  fileKind,
  fileSizeLabel,
  filterDocuments,
  friendlyError,
  shortDateLabel,
  splitPinned,
  type FileKind,
} from '@athleit/core';
import {
  listDocuments,
  signedDocumentUrl,
  type DocumentRow,
  type Owner,
} from '@athleit/db/registration';
import { componentTokens, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconCircle,
  LoadingSkeleton,
  Text,
  TextField,
  useTheme,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const KIND_ICON: Record<FileKind, IconName> = {
  pdf: 'file-pdf',
  doc: 'file-doc',
  sheet: 'file-xls',
  slides: 'file-ppt',
  image: 'image',
  file: 'file-text',
};

/**
 * Documents shelf for families and staff: pinned cards, category chips, search. Opens through a short-lived signed
 * URL in the in-app browser. Uploading and editing are web-only; staff get a note saying so.
 */
export function DocumentsSection({ owner, staff = false }: { owner: Owner; staff?: boolean }) {
  const { theme } = useTheme();
  const c = theme.color;
  const docs = useLoad(() => listDocuments(supabase, owner), [owner.teamId, owner.clubId]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function open(d: DocumentRow) {
    setError(null);
    const r = await signedDocumentUrl(supabase, d.storage_path);
    if (r.error) return setError(friendlyError(r.error));
    await WebBrowser.openBrowserAsync(r.data);
  }

  if (docs.loading) return <LoadingSkeleton />;
  if (docs.error)
    return (
      <ErrorState
        message="Can’t load documents. Check your connection and try again."
        onRetry={docs.reload}
      />
    );
  const all = docs.data ?? [];
  if (all.length === 0)
    return (
      <EmptyState
        icon="folder-open"
        title="No documents yet"
        {...(staff ? { body: 'Upload documents from the web app.' } : {})}
      />
    );
  const filtered = filterDocuments(all, { category, visibility: 'all', search });
  const showPinned = category === 'all' && !search.trim();
  const { pinned, rest } = splitPinned(filtered);
  const list = showPinned ? rest : filtered;

  const meta = (d: DocumentRow, date: boolean) =>
    `${DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category} · ${fileSizeLabel(d.size_bytes)}${date ? ` · ${shortDateLabel(d.created_at)}` : ''}`;

  return (
    <View style={{ gap: space[4] }}>
      <TextField
        label="Search documents"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[2] }}
      >
        {categoryCounts(all)
          .filter((x) => x.value === 'all' || x.count > 0)
          .map((x) => (
            <Chip
              key={x.value}
              label={`${x.label} ${x.count}`}
              selected={category === x.value}
              onPress={() => setCategory(x.value)}
            />
          ))}
      </ScrollView>
      <FormMessage error={error} />
      {showPinned && pinned.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <Text variant="label" muted>
            PINNED
          </Text>
          {pinned.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${d.title}`}
              onPress={() => void open(d)}
              style={{
                minHeight: componentTokens.minTarget,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                padding: space[4],
                borderRadius: componentTokens.card.radius,
                borderWidth: componentTokens.card.border,
                borderColor: c.line,
                backgroundColor: c.surface,
              }}
            >
              <IconCircle>
                <Icon name={KIND_ICON[fileKind(d.mime_type)]} />
              </IconCircle>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={2}>
                  {d.title}
                </Text>
                <Text variant="caption" muted>
                  {meta(d, false)}
                  {staff ? ` · ${DOCUMENT_VISIBILITY_LABEL[d.visibility] ?? d.visibility}` : ''}
                </Text>
              </View>
              <Icon name="push-pin" size="sm" weight="fill" color={c.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {list.length === 0 && pinned.length === 0 ? <Text muted>No documents match.</Text> : null}
      {list.map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${d.title}`}
          onPress={() => void open(d)}
          style={{
            minHeight: componentTokens.listRow.height,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <Icon name={KIND_ICON[fileKind(d.mime_type)]} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold" numberOfLines={1}>
              {d.title}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {meta(d, true)}
              {staff ? ` · ${DOCUMENT_VISIBILITY_LABEL[d.visibility] ?? d.visibility}` : ''}
            </Text>
          </View>
          <Icon name="arrow-square-out" size="sm" color={c.muted} />
        </Pressable>
      ))}
      {staff ? <WebNote /> : null}
    </View>
  );
}

function WebNote() {
  return (
    <Text variant="caption" muted>
      Upload documents from the web app.
    </Text>
  );
}
