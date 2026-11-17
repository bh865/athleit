import { Conversation } from '@/components/messages/conversation';

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  return <Conversation key={threadId} threadId={threadId} />;
}
