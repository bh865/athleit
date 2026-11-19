import {
  householdJoinCodeSchema,
  joinFamilyProblem,
  requestToJoinHouseholdSchema,
} from '@athleit/core';
import { requestToJoinHousehold } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useState } from 'react';

import { FormMessage } from '@/components/app/kit';
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const MAX = 500;

const PROBLEM_COPY = {
  invalid_code:
    'That code isn’t right, or it has expired or been replaced. Check it or ask for a new one.',
  already_member: 'You’re already a guardian of this family.',
  too_many_attempts: 'Too many tries. Wait a few minutes and try again.',
  error: 'Couldn’t send the request. Check your connection and try again.',
} as const;

/** "Join a family with a code": sends a request; a guardian of that family approves it. */
export function JoinFamilySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<keyof typeof PROBLEM_COPY | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    setCode('');
    setMessage('');
    setCodeError(undefined);
    setProblem(null);
    setSent(false);
  }

  async function submit() {
    setProblem(null);
    const parsed = requestToJoinHouseholdSchema.safeParse({ code, message });
    if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
    setCodeError(undefined);
    setBusy(true);
    const res = await requestToJoinHousehold(supabase, parsed.data);
    setBusy(false);
    if (res.error) return setProblem(joinFamilyProblem(res.error.message));
    setSent(true);
  }

  return (
    <Sheet open={open} onClose={close} title="Join a family with a code">
      {sent ? (
        <>
          <Text variant="heading">Request sent</Text>
          <Text muted>
            A guardian in that family will review it. You’ll see the family here once they approve.
          </Text>
          <Button title="Done" onPress={close} />
        </>
      ) : (
        <>
          <Text variant="heading">Join a family with a code</Text>
          <TextField
            label="Family code"
            mono
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            value={code}
            hint="Letters and numbers only"
            error={
              codeError ?? (problem && problem !== 'error' ? PROBLEM_COPY[problem] : undefined)
            }
            onChangeText={(t) => {
              setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setCodeError(undefined);
              setProblem(null);
            }}
            testID="family-code-input"
          />
          <TextField
            label="Message (optional)"
            value={message}
            maxLength={MAX}
            multiline
            onChangeText={setMessage}
          />
          <Text variant="mono" muted style={{ textAlign: 'right', marginTop: -space[2] }}>
            {message.length} / {MAX}
          </Text>
          {problem === 'error' ? <FormMessage error={PROBLEM_COPY.error} /> : null}
          <Button
            title="Send request"
            loading={busy}
            disabled={!householdJoinCodeSchema.safeParse(code).success}
            onPress={() => void submit()}
          />
          <Button title="Cancel" variant="ghost" onPress={close} />
        </>
      )}
    </Sheet>
  );
}
