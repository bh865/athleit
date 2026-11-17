import { AppScreen } from '@/components/app/app-screen';
import { ThreadList } from '@/components/messages/thread-list';

export default function MessagesScreen() {
  return (
    <AppScreen>
      <ThreadList />
    </AppScreen>
  );
}
