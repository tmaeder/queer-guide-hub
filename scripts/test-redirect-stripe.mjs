import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import Stripe from 'stripe';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';
const root = 'supabase/functions/';
function source(file) {
  let value = readFileSync(root + file, 'utf8');
  const tree = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true);
  for (const statement of [...tree.statements].reverse())
    if (ts.isImportDeclaration(statement))
      value = value.slice(0, statement.getStart(tree)) + value.slice(statement.end);
  return value.replace(/^export\s+/gm, '');
}
const db = await createRedirectTestDb();
try {
  await db.exec('SET ROLE service_role; SET request.jwt.claims=\'{"role":"service_role"}\';');
  const {
    rows: [link],
  } = await db.query(
    "INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','stripe-fixture','https://example.com/donate') RETURNING id",
  );
  const {
    rows: [visit],
  } = await db.query(
    "SELECT public.record_redirect_visit($1,'/go/stripe-fixture',NULL,NULL,'fixture','CH','fixture',302,'a','https://example.com/donate') AS id",
    [link.id],
  );
  const user = '00000000-0000-4000-8000-000000000001';
  // Exercise the actual checkout handler against isolated rows. The fixture
  // transaction alone lifts the two tenant fences; rollback restores them.
  await db.exec(
    'BEGIN; RESET ROLE; ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence; ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence; SET LOCAL ROLE service_role;',
  );
  try {
    const other = webcrypto.randomUUID();
    const foreignClick = webcrypto.randomUUID();
    const expiredClick = webcrypto.randomUUID();
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Checkout fixture','checkout-fixture')",
      [other],
    );
    const {
      rows: [foreignLink],
    } = await db.query(
      "INSERT INTO public.redirects(workspace_id,type,slug,target) VALUES($1,'SHORT','foreign-checkout','https://example.org/foreign') RETURNING id",
      [other],
    );
    await db.query(
      "INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,ts,path,status) VALUES($1,$2,$3,now(),'/foreign-checkout',302)",
      [other, foreignLink.id, foreignClick],
    );
    await db.query(
      "INSERT INTO public.redirect_events(redirect_id,click_id,ts,path,status) VALUES($1,$2,now()-interval '31 days','/expired-checkout',302)",
      [link.id, expiredClick],
    );
    const sessions = [];
    const donations = [];
    let checkoutHandler;
    const checkoutClient = {
      rpc: async () => ({ data: true, error: null }),
      from: (table) => {
        if (table === 'donations')
          return {
            insert: async (value) => {
              donations.push(value);
              return { error: null };
            },
          };
        assert.equal(table, 'redirect_events');
        const filters = [];
        const query = {
          select: () => query,
          eq: (column, value) => {
            filters.push([column, '=', value]);
            return query;
          },
          gte: (column, value) => {
            filters.push([column, '>=', value]);
            return query;
          },
          maybeSingle: async () => {
            for (const [column] of filters)
              assert.ok(['workspace_id', 'click_id', 'ts'].includes(column));
            const result = await db.query(
              'SELECT click_id FROM public.redirect_events WHERE ' +
                filters.map(([column, op], i) => `${column} ${op} $${i + 1}`).join(' AND '),
              filters.map(([, , value]) => value),
            );
            return { data: result.rows[0] ?? null, error: null };
          },
        };
        return query;
      },
    };
    class CheckoutStripe {
      checkout = {
        sessions: {
          create: async (value) => {
            sessions.push(value);
            return { id: 'cs_offline', url: 'https://example.org/checkout' };
          },
        },
      };
    }
    const checkoutCode = ts.transpileModule(
      [
        '_shared/redirect-api.ts',
        '_shared/redirect-workspace.ts',
        'create-checkout-session/index.ts',
      ]
        .map(source)
        .join('\n'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
    ).outputText;
    new Function(
      'Deno',
      'Stripe',
      'getServiceClient',
      'corsResponse',
      'jsonResponse',
      'errorResponse',
      checkoutCode,
    )(
      {
        env: { get: () => 'offline-fixture' },
        serve: (fn) => {
          checkoutHandler = fn;
        },
      },
      CheckoutStripe,
      () => checkoutClient,
      () => new Response(null),
      (body, status) => new Response(JSON.stringify(body), { status }),
      (message, status) => new Response(message, { status }),
    );
    for (const recurring of [false, true]) {
      for (const [click, expected] of [
        [visit.id, visit.id],
        [foreignClick, null],
        [expiredClick, null],
        [webcrypto.randomUUID(), null],
        ['invalid', null],
      ]) {
        const response = await checkoutHandler(
          new Request('https://fixture.example/checkout', {
            method: 'POST',
            // Public request headers must not choose the donation's workspace.
            headers: { 'content-type': 'application/json', 'x-qg-redirect-workspace': other },
            body: JSON.stringify({
              amount: 500,
              email: 'fixture@example.org',
              qg_click_id: click,
              donation_type: recurring ? 'recurring' : 'one_time',
              ...(recurring ? { interval: 'month' } : {}),
            }),
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(sessions.at(-1).metadata.qg_click_id, expected ?? undefined);
        if (recurring)
          assert.equal(
            sessions.at(-1).subscription_data.metadata.qg_click_id,
            expected ?? undefined,
          );
        assert.equal(donations.at(-1).redirect_click_id, expected);
      }
    }
    console.log(
      'Donation checkout: actual handler accepts recent Queer Guide clicks and excludes foreign, expired, missing and malformed clicks from payment/subscription metadata and donation records. No Stripe requests were sent.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
  const metadata = { qg_click_id: visit.id, user_id: user };
  const records = [];
  const paymentNotices = [];
  let noticeUnavailable = false;
  const client = {
    rpc: async (name, args) => {
      if (name === 'email_notice_verified_payment') {
        paymentNotices.push(args);
        return {
          data: !noticeUnavailable,
          error: noticeUnavailable ? { message: 'offline provenance fixture' } : null,
        };
      }
      assert.equal(name, 'record_redirect_conversion');
      records.push(args.p_event);
      try {
        const {
          rows: [result],
        } = await db.query('SELECT public.record_redirect_conversion($1::jsonb) AS data', [
          JSON.stringify(args.p_event),
        ]);
        return { data: result.data, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({
          data: {
            user_id: user,
            email: 'fixture@example.com',
            currency: 'chf',
            redirect_click_id: visit.id,
          },
          error: null,
        }),
        update: () => query,
        upsert: () => query,
        insert: () => query,
        then: (resolve, reject) =>
          Promise.resolve({ data: [{ id: 'offline-donation' }], error: null }).then(
            resolve,
            reject,
          ),
      };
      return query;
    },
  };
  let handler;
  const code = ts.transpileModule(
    [
      '_shared/redirect-api.ts',
      '_shared/redirect-stripe.ts',
      'stripe-webhook/helpers.ts',
      'stripe-webhook/index.ts',
    ]
      .map(source)
      .join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  const secret = 'whsec_offline_redirect_fixture';
  new Function('Deno', 'Stripe', 'getServiceClient', 'reportApiError', 'crypto', code)(
    {
      env: { get: (key) => (key === 'STRIPE_WEBHOOK_SECRET' ? secret : 'sk_test_offline_fixture') },
      serve: (fn) => {
        handler = fn;
      },
    },
    Stripe,
    () => client,
    () => {},
    webcrypto,
  );
  const created = Math.floor(Date.now() / 1000) + 2;
  const checkout = {
    id: 'cs_fixture',
    payment_status: 'paid',
    amount_total: 4990,
    currency: 'chf',
    customer: 'cus_fixture',
    metadata,
  };
  const call = async (type, object, eventId = 'evt_fixture', valid = true) => {
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type,
      created,
      data: { object },
      livemode: false,
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: valid ? secret : 'wrong_secret',
    });
    return handler(
      new Request('https://fixture.supabase.co/functions/v1/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload,
      }),
    );
  };
  const oldConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal(
      (await call('checkout.session.completed', checkout, 'evt_invalid', false)).status,
      400,
    );
  } finally {
    console.error = oldConsoleError;
  }
  assert.equal(records.length, 0, 'Invalid signature reached tracking');
  assert.equal(paymentNotices.length, 0, 'Invalid signature reached payment notices');
  assert.equal(
    (
      await call(
        'checkout.session.completed',
        { ...checkout, payment_status: 'unpaid' },
        'evt_unpaid',
      )
    ).status,
    200,
  );
  assert.equal(records.length, 0, 'Unpaid checkout credited revenue');
  assert.equal(paymentNotices.length, 0, 'Unpaid checkout created a payment notice');
  assert.equal((await call('checkout.session.completed', checkout)).status, 200);
  assert.equal((await call('checkout.session.completed', checkout)).status, 200);
  assert.equal(
    (
      await call(
        'invoice.paid',
        {
          id: 'in_fixture',
          subscription: 'sub_fixture',
          customer: 'cus_fixture',
          currency: 'chf',
          amount_paid: 500,
          billing_reason: 'subscription_cycle',
        },
        'evt_renewal',
      )
    ).status,
    200,
  );
  assert.equal(
    paymentNotices.length,
    3,
    'Verified paid checkouts/renewal did not record provenance',
  );
  assert.deepEqual(
    paymentNotices.map((n) => n.p_event),
    ['evt_fixture', 'evt_fixture', 'evt_renewal'],
  );
  assert.ok(paymentNotices.every((n) => n.p_donation === 'offline-donation'));
  noticeUnavailable = true;
  console.error = () => {};
  try {
    assert.equal(
      (await call('checkout.session.completed', checkout)).status,
      500,
      'Provenance failure must request a webhook retry',
    );
  } finally {
    console.error = oldConsoleError;
    noticeUnavailable = false;
  }
  assert.equal((await call('checkout.session.completed', checkout)).status, 200);
  const {
    rows: [totals],
  } = await db.query(
    'SELECT count(*)::int AS events,sum(amount)::text AS amount FROM public.redirect_link_conversions',
  );
  assert.equal(totals.events, 2, 'Webhook retry inflated conversion counts');
  assert.equal(Number(totals.amount), 54.9, 'Stripe minor units were misinterpreted');
  const {
    rows: [performance],
  } = await db.query('SELECT * FROM public.redirect_variant_performance($1)', [link.id]);
  assert.equal(Number(performance.sales), 2, 'Verified sales did not reach experiment metrics');
  console.log(
    'Offline Stripe→redirect conversions: real signature verification, paid-only revenue, retry deduplication, renewal attribution and A/B metrics passed.',
  );
} finally {
  await db.close();
}
