import { StripeProvider, useStripe, type PaymentSheet } from '@stripe/stripe-react-native';
import { componentTokens } from '@athleit/tokens';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/components/ui';

export interface StripePayProps {
  clientSecret: string;
  /** Direct charge: the intent lives on the team's connected account. */
  stripeAccountId: string;
  onResult: (r: { status: 'completed' | 'canceled' | 'failed'; code?: string }) => void;
}

const PUBLISHABLE = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

function Sheet({ clientSecret, onResult }: Omit<StripePayProps, 'stripeAccountId'>) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { theme } = useTheme();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const c = theme.color;
    // PaymentSheet styled from the semantic tokens (light and dark follow the active theme).
    const appearance: PaymentSheet.AppearanceParams = {
      colors: {
        primary: c.ink,
        background: c.surface,
        componentBackground: c.surfaceAlt,
        componentBorder: c.line,
        componentDivider: c.line,
        primaryText: c.ink,
        secondaryText: c.muted,
        componentText: c.ink,
        placeholderText: c.muted,
        icon: c.muted,
        error: c.bad,
      },
      shapes: { borderRadius: componentTokens.input.radius },
    };
    void (async () => {
      const init = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Athleit',
        returnURL: 'athleit://stripe-redirect',
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', testEnv: true },
        appearance,
      });
      if (init.error)
        return onResult({
          status: 'failed',
          ...(init.error.code ? { code: init.error.code } : {}),
        });
      const res = await presentPaymentSheet();
      if (!res.error) return onResult({ status: 'completed' });
      onResult({
        status: res.error.code === 'Canceled' ? 'canceled' : 'failed',
        ...(res.error.code ? { code: res.error.code } : {}),
      });
    })();
  }, [clientSecret, initPaymentSheet, presentPaymentSheet, onResult, theme]);
  return null;
}

/** Opens Stripe's PaymentSheet (Apple Pay / Google Pay / cards). Needs a development build, not Expo Go. */
export function StripePay(props: StripePayProps) {
  if (!PUBLISHABLE) {
    props.onResult({ status: 'failed', code: 'not_configured' });
    return null;
  }
  return (
    <StripeProvider
      publishableKey={PUBLISHABLE}
      stripeAccountId={props.stripeAccountId}
      urlScheme="athleit"
      merchantIdentifier="merchant.com.athleit.app"
    >
      <Sheet clientSecret={props.clientSecret} onResult={props.onResult} />
    </StripeProvider>
  );
}
