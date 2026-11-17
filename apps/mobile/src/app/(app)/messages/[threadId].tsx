import { useLocalSearchParams } from 'expo-router';

import { Conversation } from '@/components/messages/conversation';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  return <Conversation key={threadId} threadId={threadId} />;
}
