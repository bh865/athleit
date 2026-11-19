import { approveQuestion, formatFamilyCode, friendlyError, spellCode } from '@athleit/core';
import {
  decideHouseholdJoinRequest,
  getHouseholdJoinCode,
  getHouseholdJoinRequests,
  rotateHouseholdJoinCode,
} from '@athleit/db/api';
import { space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Button, Sheet, Text, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { FormMessage, H2, ListItem, LoadState } from './kit';

/** The Code tab of the household invite card (see the web FamilyCodePanel). */
export function FamilyCodePanel({
  householdId,
  childNames,
}: {
  householdId: string;
  childNames: readonly string[];
}) {
  const toast = useToast();
  const code = useLoad(() => getHouseholdJoinCode(supabase, householdId), [householdId]);
  const requests = useLoad(() => getHouseholdJoinRequests(supabase, householdId), [householdId]);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ id: string; name: string } | null>(null);
  const value = code.data?.join_code ?? '';

  async function rotate() {
    setBusy(true);
    setError(null);
    const res = await rotateHouseholdJoinCode(supabase, householdId);
    setBusy(false);
    setRotateOpen(false);
    if (res.error)
      return setError(
        "Couldn't generate a new code. Your current code still works. Try again in a moment.",
      );
    toast('New code generated. The old one no longer works.');
    code.reload();
  }
  async function decide(id: string, approve: boolean) {
    setBusy(true);
    setError(null);
    const res = await decideHouseholdJoinRequest(supabase, id, approve);
    setBusy(false);
    setApproving(null);
    if (res.error) setError(friendlyError(res.error));
    requests.reload();
  }

  return (
    <View style={{ gap: space[4] }}>
      <LoadState loading={code.loading} error={code.error} onRetry={code.reload}>
        <View style={{ gap: space[2] }}>
          <Text variant="caption" muted>
            Family code
          </Text>
          <Text
            variant="mono"
            selectable
            testID="family-code"
            accessibilityLabel={`Family code: ${spellCode(value)}`}
          >
            {formatFamilyCode(value)}
          </Text>
          <Button
            title="Copy"
            variant="secondary"
            icon="copy"
            onPress={() =>
              void Clipboard.setStringAsync(value).then(() => toast('Family code copied'))
            }
          />
          <Button
            title="Share"
            variant="secondary"
            icon="share-network"
            onPress={() =>
              void Share.share({ message: `Join our family on Athleit with this code: ${value}` })
            }
          />
        </View>
      </LoadState>
      <Text muted>
        Someone who enters this code sends a request. They get no access until you approve.
      </Text>
      <Button
        title="Generate new code"
        variant="ghost"
        icon="arrow-clockwise"
        onPress={() => setRotateOpen(true)}
        testID="family-code-rotate"
      />
      <FormMessage error={error} />

      <H2>Guardian requests</H2>
      <LoadState
        loading={requests.loading}
        error={requests.error}
        empty={requests.data?.length === 0}
        emptyText="No guardian requests."
        onRetry={requests.reload}
      >
        <View style={{ gap: space[3] }}>
          {requests.data?.map((r) => (
            <View key={r.request_id} style={{ gap: space[2] }}>
              <ListItem
                title={r.requester_name}
                subtitle={`wants to join your family${r.message ? ` · “${r.message}”` : ''}`}
              />
              <Button
                title="Approve"
                accessibilityLabel={`Approve ${r.requester_name}`}
                onPress={() => setApproving({ id: r.request_id, name: r.requester_name })}
              />
              <Button
                title="Decline"
                variant="secondary"
                accessibilityLabel={`Decline ${r.requester_name}`}
                onPress={() => void decide(r.request_id, false)}
              />
            </View>
          ))}
        </View>
      </LoadState>

      <Sheet
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title="Generate a new family code?"
        level="modal"
      >
        <Text variant="heading">Generate a new family code?</Text>
        <Text muted>The old code stops working. People who already joined keep their access.</Text>
        <Button title="Generate new code" loading={busy} onPress={() => void rotate()} />
        <Button title="Cancel" variant="ghost" onPress={() => setRotateOpen(false)} />
      </Sheet>
      <Sheet
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Give access?"
        level="modal"
      >
        <Text variant="heading">
          {approving ? approveQuestion(approving.name, childNames) : ''}
        </Text>
        <Text muted>
          Guardians can see and manage every child in this family. Only approve someone you know.
        </Text>
        <Button
          title="Give access"
          loading={busy}
          onPress={() => approving && void decide(approving.id, true)}
        />
        <Button title="Not now" variant="ghost" onPress={() => setApproving(null)} />
      </Sheet>
    </View>
  );
}
