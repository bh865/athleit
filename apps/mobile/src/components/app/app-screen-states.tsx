import { ErrorState, LoadingSkeleton } from '@/components/ui';

export function ErrorNotice() {
  return <ErrorState message="We couldn’t load your account. Pull to refresh or sign in again." />;
}

export function Loading() {
  return <LoadingSkeleton />;
}
