import { EmptyState } from '@/components/ui';

export default function MessagesHome() {
  return (
    <EmptyState
      icon="chat-circle"
      title="Select a conversation"
      body="Pick one from the list, or start a new message."
    />
  );
}
