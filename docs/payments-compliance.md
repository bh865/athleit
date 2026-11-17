# Payments: items to confirm with a lawyer before launch

These are open questions, not conclusions. Nothing here is legal advice.

1. **Card-network and state surcharge rules.** The pass-through "service fee" recovers card processing cost from the payer. Confirm whether it is
   a "surcharge" under card-network rules and in each state we operate (some restrict or prohibit surcharging, cap it, or require registration), and
   whether the answer differs for debit vs credit cards or for payments that are really donations/dues.
2. **Disclosure requirements.** Wording, placement and timing of the fee before the payer commits (review sheet, receipt, issuing form), including
   that the Athleit charge and service fee are separate line items. Current copy label: "Service fee" and "Athleit charge".
3. **Refunds of fees.** Whether the Athleit charge and service fee must be refunded with the payment (full and partial), what the refund flags in
   `fee_config` should default to, and how to describe that Stripe does not return its own processing fee.
4. **Sales tax / other taxes.** Whether any request (uniforms, merchandise vs dues/fees) carries sales tax, and who collects it.
5. **Merchant of record, money transmission, 1099-K.** Implications of the chosen Connect charge type (see payments-architecture.md) for who is the
   merchant of record, whether Athleit is a money transmitter, and tax reporting for teams and clubs.
6. **Minors' data and household payers.** Using a child's name in the payer-facing UI only (never in Stripe metadata or descriptions); COPPA/state
   privacy implications of storing payment history linked to a child.
7. **Statement descriptor and receipts.** Required content of receipts and descriptors in each state.
8. **Disputes.** Responsibility for chargebacks and the dispute fee, and terms we present to team admins.
9. **Terms for team/club admins.** Connected-account agreement, liability for refunds issued, and acceptable use.
