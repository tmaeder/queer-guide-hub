import { useQuery } from '@tanstack/react-query';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { Button } from '@/components/ui/button';
import { listFromWhere } from '@/hooks/usePageFetchers';

const ADDRESS = 'test@queer.guide';

interface TestInboxMessage {
  id: string;
  from_address: string;
  subject: string;
  received_at: string;
  body_text: string | null;
}

export default function TestInboxTab() {
  const messages = useQuery({
    queryKey: ['admin', 'test-inbox', ADDRESS],
    queryFn: () =>
      listFromWhere<TestInboxMessage>(
        'email_ingestions',
        'id, from_address, subject, received_at, body_text',
        [{ col: 'to_address', val: ADDRESS }],
        { order: { col: 'received_at', ascending: false }, limit: 50 },
      ),
  });

  return (
    <section aria-labelledby="test-inbox-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="test-inbox-title" className="text-lg font-semibold">
            Test inbox
          </h2>
          <p className="text-sm text-muted-foreground">
            Latest 50 messages received at {ADDRESS}. Message bodies are shown as plain text.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={messages.isFetching}
          onClick={() => void messages.refetch()}
        >
          Refresh
        </Button>
      </div>

      {messages.isPending && <AdminTextSkeleton />}
      {messages.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load the test inbox. Use Refresh to try again.
        </p>
      )}
      {messages.isSuccess && messages.data.length === 0 && (
        <AdminEmpty
          noun="messages"
          description={`Send a test email to ${ADDRESS} to see it here.`}
        />
      )}
      <ul className="space-y-2">
        {messages.data?.map((message) => (
          <li key={message.id} className="rounded-element border">
            <details className="p-4">
              <summary className="cursor-pointer break-words text-sm">
                <span className="font-medium">{message.subject}</span>
                <span className="block pl-4 text-muted-foreground">
                  {message.from_address || 'Unknown sender'} ·{' '}
                  <time dateTime={message.received_at}>
                    {new Date(message.received_at).toLocaleString()}
                  </time>
                </span>
              </summary>
              <p className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">
                {message.body_text || 'This message has no text body.'}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
