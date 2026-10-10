/**
 * The sharing half of a two-party workbook: which of MY answers may be
 * revealed, and the handshake with one partner.
 *
 * TWO INDEPENDENT OPT-INS, AND THE UI MUST NOT IMPLY ONE
 *
 * An answer reaches a partner only when BOTH are true: this reader marked that
 * specific answer shareable, and both people hold a live `workbook` grant on
 * each other. Neither alone reveals anything, and the default for both is
 * withhold. That mirrors `kink_share_view`, where `include_in_share` on a
 * category is a separate decision from the visibility tier.
 *
 * "NOTHING TO SHOW" IS DELIBERATELY AMBIGUOUS
 *
 * `workbook_compare` returns an empty set both when the handshake is
 * incomplete and when there is no shared overlap — it returns rather than
 * raising, precisely so a client cannot tell a partner's refusal from an empty
 * list. So this component describes the state from the HANDSHAKE STATUS and
 * never infers it from a row count: with status 'requested_by_me' it says you
 * are waiting, and it does not and cannot say whether they have answers.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  useMyWorkbookAnswers,
  useSetAnswerShared,
  useWorkbookCompareStatus,
  useWorkbookCompare,
  useSetWorkbookGrant,
} from '@/hooks/useWorkbookAnswers';
import type { WorkbookDetail } from '@/hooks/useTagWorkbooks';
import { WorkbookCompareView } from './WorkbookCompareView';

export function WorkbookShareStep({
  workbook,
  onBack,
  partnerId: partnerIdProp,
}: {
  workbook: WorkbookDetail;
  onBack: () => void;
  partnerId?: string | null;
}) {
  const { t } = useTranslation();
  // Answerable steps only — a prose step has nothing to share.
  const answerable = workbook.steps.filter((s) => s.kind === 'prompt' || s.kind === 'checklist');
  const stepIds = answerable.map((s) => s.id);
  const { data: answers } = useMyWorkbookAnswers(stepIds);
  const setShared = useSetAnswerShared();
  const setGrant = useSetWorkbookGrant();

  const [partnerId] = useState<string | null>(partnerIdProp ?? null);
  const { data: status } = useWorkbookCompareStatus(partnerId);
  const { data: compareRows } = useWorkbookCompare(workbook.id, partnerId);

  const written = answerable.filter((s) => answers?.get(s.id)?.body);
  const sharedCount = written.filter((s) => answers?.get(s.id)?.shared).length;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-0 items-center gap-1.5 text-13 text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('workbooks.backToSteps', 'Back to the questions')}
      </button>

      <h1 className="mt-2 font-display text-display leading-tight">
        {t('workbooks.share.title', 'What you share')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          'workbooks.share.intro',
          'Pick the answers you are willing to show. Nothing is revealed until your partner has also shared theirs with you, and you can switch any of these back off at any time.',
        )}
      </p>

      <section className="mt-8" aria-labelledby="share-answers-heading">
        <h2 id="share-answers-heading" className="font-display text-headline leading-tight">
          {t('workbooks.share.yourAnswers', 'Your answers')}
          <Badge variant="outline" className="ml-2 rounded-badge align-middle text-2xs">
            {t('workbooks.share.nOfM', '{{shared}} of {{total}} shared', {
              shared: sharedCount,
              total: written.length,
            })}
          </Badge>
        </h2>

        {written.length === 0 ? (
          <p className="mt-4 text-13 italic text-muted-foreground">
            {t(
              'workbooks.share.nothingWritten',
              'You have not written anything yet. There is nothing to share.',
            )}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-4 p-0">
            {written.map((step) => {
              const answer = answers?.get(step.id);
              const on = !!answer?.shared;
              return (
                <li
                  key={step.id}
                  className="flex items-start justify-between gap-4 rounded-container bg-surface-container p-4"
                >
                  <div className="min-w-0">
                    <p className="text-13 font-bold">{step.prompt_md ?? step.key}</p>
                    {/* Truncated, not hidden: the reader needs to recognise
                        which answer they are about to reveal. */}
                    <p className="mt-2 line-clamp-2 text-13 text-muted-foreground">
                      {answer?.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {on ? (
                      <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                    <Switch
                      checked={on}
                      onCheckedChange={(next) =>
                        setShared.mutate({ step_id: step.id, shared: next })
                      }
                      aria-label={t('workbooks.share.toggleLabel', 'Share "{{prompt}}"', {
                        prompt: step.prompt_md ?? step.key,
                      })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="share-partner-heading">
        <h2 id="share-partner-heading" className="font-display text-headline leading-tight">
          {t('workbooks.share.partner', 'Your partner')}
        </h2>

        {!partnerId ? (
          // No partner picker is wired yet, and saying so is better than an
          // affordance that does nothing. The grant machinery underneath is
          // live — see useSetWorkbookGrant — and this is the surface that
          // chooses WHO, which belongs with the match/conversation flow.
          <p className="mt-4 text-13 text-muted-foreground">
            {t(
              'workbooks.share.noPartnerYet',
              'Open this workbook from a conversation to compare with someone. Your share choices above are saved either way.',
            )}
          </p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-4">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-13">
                {status === 'active'
                  ? t('workbooks.share.statusActive', 'You have both shared. Comparison is live.')
                  : status === 'requested_by_me'
                    ? t(
                        'workbooks.share.statusWaiting',
                        'You have shared. Waiting for them to share back.',
                      )
                    : status === 'requested_by_other'
                      ? t(
                          'workbooks.share.statusTheirs',
                          'They have shared with you. Share back to see the comparison.',
                        )
                      : t('workbooks.share.statusNone', 'Not shared with each other yet.')}
              </p>
            </div>
            <Button
              size="sm"
              variant={status === 'active' || status === 'requested_by_me' ? 'outline' : 'default'}
              className="mt-4 gap-1.5 rounded-element"
              onClick={() =>
                setGrant.mutate({
                  other: partnerId,
                  active: !(status === 'active' || status === 'requested_by_me'),
                })
              }
            >
              {status === 'active' || status === 'requested_by_me' ? (
                t('workbooks.share.revoke', 'Stop sharing')
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t('workbooks.share.grant', 'Share with them')}
                </>
              )}
            </Button>

            {status === 'active' && (
              <WorkbookCompareView rows={compareRows ?? []} className="mt-8" />
            )}
          </>
        )}
      </section>
    </div>
  );
}
