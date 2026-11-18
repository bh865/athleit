import { useEffect } from 'react';

import type { StripePayProps } from './stripe-pay';

/** The native PaymentSheet doesn't exist on web (the website uses Stripe's Payment Element instead). */
export function StripePay({ onResult }: StripePayProps) {
  useEffect(() => onResult({ status: 'failed', code: 'unsupported' }), [onResult]);
  return null;
}
export type { StripePayProps };
