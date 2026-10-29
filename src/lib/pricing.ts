// The numbers the public pricing page shows. Each one mirrors the code or the Stripe setup;
// change them together.

/** Price per paid seat, GBP, excluding VAT (Stripe prices `ormo_seat_monthly` / `ormo_seat_annual`, D1). */
export const seatPrice = { month: 10, year: 100 } as const;

/** Months free on annual billing: 12 × the monthly price, less the annual price. */
export const annualMonthsFree = (12 * seatPrice.month - seatPrice.year) / seatPrice.month;

/** Free trial length: create_organisation sets trial_ends_at = now() + 14 days (migration 20261028112834). */
export const trialDays = 14;

/** Paid seats during the trial: organisation_subscriptions.trial_seat_allowance default (migration 20261029171524). */
export const trialSeats = 10;
