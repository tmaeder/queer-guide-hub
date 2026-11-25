/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import { ShareMenu } from '../ShareMenu';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { ShareEntityDialog } from '@/components/messaging/ShareEntityDialog';

const mocks = vi.hoisted(() => ({
  user: { id: 'u1' },
  flag: vi.fn().mockResolvedValue({ success: true }),
  toast: vi.fn(),
  success: vi.fn(),
  send: vi.fn(),
  conversation: vi.fn().mockResolvedValue('conversation'),
  members: vi.fn().mockResolvedValue([{ id: 'm1', display_name: 'Test Member', avatar_url: null }]),
  groups: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useModeration', () => ({
  useModeration: () => ({ createFlag: mocks.flag, loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
vi.mock('@/hooks/useMessaging', () => ({
  useMessaging: () => ({ startConversation: mocks.conversation, sendMessage: mocks.send }),
}));
vi.mock('@/hooks/useSendEventDialog', () => ({
  fetchSendEventMembers: mocks.members,
  fetchSendEventGroups: mocks.groups,
  postEventToGroup: vi.fn(),
}));

async function instance() {
  const i18n = createInstance();
  await i18n.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
  });
  return i18n;
}

describe('shared entity action localization', () => {
  it('updates the share trigger and menu when the locale changes', async () => {
    const i18n = await instance();
    render(
      <I18nextProvider i18n={i18n}>
        <ShareMenu url="https://queer.guide/personalities/test" />
      </I18nextProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Teilen' }));
    expect(await screen.findByRole('menuitem', { name: 'Link kopieren' })).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('sends canonical report values from a translated form', async () => {
    const i18n = await instance();
    render(
      <I18nextProvider i18n={i18n}>
        <ReportDialog
          open
          onOpenChange={vi.fn()}
          contentType="personalities"
          contentId="p1"
          contentName="Test Person"
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'Problem melden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Art des Problems' }));
    await userEvent.click(screen.getByRole('option', { name: 'Korrektur vorschlagen' }));
    await userEvent.type(screen.getByLabelText('Beschreibung'), 'Die Quelle ist falsch.');
    await userEvent.type(screen.getByLabelText('Änderungsvorschlag'), 'Neue geprüfte Quelle');
    await userEvent.click(screen.getByRole('button', { name: 'Meldung senden' }));
    await waitFor(() =>
      expect(mocks.flag).toHaveBeenCalledWith({
        content_type: 'personalities',
        content_id: 'p1',
        flag_type: 'CORRECTION',
        reason: 'Die Quelle ist falsch.',
        suggested_changes: { text: 'Neue geprüfte Quelle' },
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith(de.entityActions.reportSuccess);
  });

  it('keeps in-app sharing operational with translated controls and status', async () => {
    const i18n = await instance();
    const entity = {
      entity_table: 'personalities',
      entity_id: 'p1',
      title: 'Test Person',
      path: '/personalities/test',
    };
    render(
      <I18nextProvider i18n={i18n}>
        <ShareEntityDialog open onOpenChange={vi.fn()} entity={entity} />
      </I18nextProvider>,
    );
    await userEvent.click(await screen.findByRole('option', { name: /Test Member/ }));
    await userEvent.type(screen.getByPlaceholderText('Notiz hinzufügen (optional)'), 'Hallo');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        'conversation',
        'Hallo',
        undefined,
        'entity_share',
        expect.objectContaining({ entity_id: 'p1', kind: 'entity_share' }),
      ),
    );
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Gesendet',
      description: 'An Test Member gesendet',
    });
  });
});
