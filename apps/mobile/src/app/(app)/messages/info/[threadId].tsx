import { useLocalSearchParams } from 'expo-router';

import { AppScreen } from '@/components/app/app-screen';
import { ThreadInfo } from '@/components/messages/thread-info';

export default function ThreadInfoScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  return (
    <AppScreen>
      <ThreadInfo threadId={threadId} />
    </AppScreen>
  );
}
