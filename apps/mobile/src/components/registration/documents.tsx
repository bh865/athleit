import { friendlyError } from '@athleit/core';
import { listDocuments, signedDocumentUrl, type Owner } from '@athleit/db/registration';
import { space } from '@athleit/tokens';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { FormMessage, H2, ListItem, LoadState } from '@/components/app/kit';
import { Icon, ListGroup, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const kb = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Documents shelf. Opens through a short-lived signed URL in the in-app browser. Uploading is on the web. */
export function DocumentsSection({ owner }: { owner: Owner }) {
  const docs = useLoad(() => listDocuments(supabase, owner), [owner.teamId, owner.clubId]);
  const [error, setError] = useState<string | null>(null);
  async function open(path: string) {
    setError(null);
    const r = await signedDocumentUrl(supabase, path);
    if (r.error) return setError(friendlyError(r.error));
    await WebBrowser.openBrowserAsync(r.data);
  }
  return (
    <View style={{ gap: space[3] }}>
      <H2>Documents</H2>
      <LoadState
        loading={docs.loading}
        error={docs.error}
        empty={docs.data?.length === 0}
        emptyText="No documents yet."
        onRetry={docs.reload}
      >
        <ListGroup>
          {(docs.data ?? []).map((d) => (
            <ListItem
              key={d.id}
              title={`${d.pinned ? '★ ' : ''}${d.title}`}
              subtitle={`${d.category} · ${kb(d.size_bytes)}`}
              right={<Icon name={d.mime_type === 'application/pdf' ? 'file-pdf' : 'file-text'} />}
              onPress={() => void open(d.storage_path)}
            />
          ))}
        </ListGroup>
      </LoadState>
      <FormMessage error={error} />
      <Text variant="caption" muted>
        Upload documents from the web app.
      </Text>
    </View>
  );
}
