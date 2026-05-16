// Run with: cd supabase/functions && deno test _tests/stripe-webhook-helpers.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  buildCheckoutCompletedUpdate,
  buildRenewalDonation,
  isRenewalInvoice,
} from '../stripe-webhook/helpers.ts'

const NOW = '2026-05-16T15:00:00.000Z'

Deno.test('buildCheckoutCompletedUpdate sets minimal fields when customer/subscription absent', () => {
  const out = buildCheckoutCompletedUpdate({}, NOW)
  assertEquals(out, { status: 'completed', updated_at: NOW })
})

Deno.test('buildCheckoutCompletedUpdate extracts customer ID from string', () => {
  const out = buildCheckoutCompletedUpdate({ customer: 'cus_123' }, NOW)
  assertEquals(out.stripe_customer_id, 'cus_123')
})

Deno.test('buildCheckoutCompletedUpdate extracts customer ID from object', () => {
  const out = buildCheckoutCompletedUpdate({ customer: { id: 'cus_456' } }, NOW)
  assertEquals(out.stripe_customer_id, 'cus_456')
})

Deno.test('buildCheckoutCompletedUpdate handles subscription as string or object', () => {
  assertEquals(
    buildCheckoutCompletedUpdate({ subscription: 'sub_a' }, NOW).stripe_subscription_id,
    'sub_a',
  )
  assertEquals(
    buildCheckoutCompletedUpdate({ subscription: { id: 'sub_b' } }, NOW).stripe_subscription_id,
    'sub_b',
  )
})

Deno.test('buildCheckoutCompletedUpdate omits null/undefined customer + subscription', () => {
  const out = buildCheckoutCompletedUpdate({ customer: null, subscription: null }, NOW)
  assertEquals(Object.keys(out).sort(), ['status', 'updated_at'])
})

const ORIGINAL = {
  user_id: 'user-1',
  email: 'alice@example.com',
  donor_name: 'Alice',
  message: 'Keep up the work',
  is_anonymous: false,
  currency: 'usd',
  recurring_interval: 'month',
}

Deno.test('buildRenewalDonation carries over fixed fields from original', () => {
  const out = buildRenewalDonation(
    ORIGINAL,
    { id: 'in_abc', amount_paid: 2500, customer: 'cus_x' },
    'sub_xyz',
  )
  assertEquals(out.user_id, 'user-1')
  assertEquals(out.email, 'alice@example.com')
  assertEquals(out.donor_name, 'Alice')
  assertEquals(out.message, 'Keep up the work')
  assertEquals(out.is_anonymous, false)
  assertEquals(out.currency, 'usd')
  assertEquals(out.recurring_interval, 'month')
  assertEquals(out.donation_type, 'recurring')
  assertEquals(out.status, 'completed')
})

Deno.test('buildRenewalDonation captures invoice ID + amount + subscription ID', () => {
  const out = buildRenewalDonation(
    ORIGINAL,
    { id: 'in_999', amount_paid: 1000, customer: 'cus_z' },
    'sub_789',
  )
  assertEquals(out.stripe_session_id, 'in_999')
  assertEquals(out.stripe_subscription_id, 'sub_789')
  assertEquals(out.amount, 1000)
  assertEquals(out.stripe_customer_id, 'cus_z')
})

Deno.test('buildRenewalDonation handles customer as object or missing', () => {
  const objCust = buildRenewalDonation(
    ORIGINAL,
    { id: 'in_1', amount_paid: 1, customer: { id: 'cus_obj' } },
    'sub_x',
  )
  assertEquals(objCust.stripe_customer_id, 'cus_obj')

  const noCust = buildRenewalDonation(
    ORIGINAL,
    { id: 'in_2', amount_paid: 1 },
    'sub_y',
  )
  assertEquals(noCust.stripe_customer_id, null)
})

Deno.test('isRenewalInvoice false for subscription_create (initial checkout)', () => {
  assertEquals(isRenewalInvoice({ billing_reason: 'subscription_create' }), false)
})

Deno.test('isRenewalInvoice true for renewal-class billing reasons', () => {
  assertEquals(isRenewalInvoice({ billing_reason: 'subscription_cycle' }), true)
  assertEquals(isRenewalInvoice({ billing_reason: 'subscription_update' }), true)
  assertEquals(isRenewalInvoice({ billing_reason: null }), true)
  assertEquals(isRenewalInvoice({}), true)
})
