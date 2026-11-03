import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Alert, Button, Card, Text } from '@/components/ui';
import { space } from '@/theme/tokens';
import { PackError } from './format';
import { useInstallPack, useInstalledPacks, usePackIndex, useRemovePack } from './hooks';
import { packsConfigured } from './service';
import { mergeRows, SECURITY_CODES } from './rows';

export function OfflineCitiesSection() {
  const { t, i18n } = useTranslation();
  const index = usePackIndex();
  const installed = useInstalledPacks();
  const install = useInstallPack();
  const remove = useRemovePack();

  const configured = packsConfigured();
  const rows = mergeRows(index.data?.packs ?? [], installed.data ?? []);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const installError = install.error;
  const errorText =
    installError instanceof PackError && SECURITY_CODES.has(installError.code)
      ? t('packs.verifyFailed')
      : installError
        ? t('packs.failed', { reason: installError.message })
        : null;

  return (
    <Card>
      <Text variant="title" accessibilityRole="header">
        {t('packs.title')}
      </Text>
      <Text>{t('packs.body')}</Text>
      {!configured ? <Text muted>{t('packs.notConfigured')}</Text> : null}
      {configured && index.isLoading ? <Text muted>{t('packs.loading')}</Text> : null}
      {configured && index.isError ? <Text muted>{t('packs.error')}</Text> : null}

      {rows.map((row) => {
        const busy =
          (install.isPending && install.variables?.id === row.id) ||
          (remove.isPending && remove.variables === row.id);
        const stale =
          row.available && row.installed && row.available.sha256 !== row.installed.sha256;
        return (
          <View key={row.id} style={styles.row} testID={`pack-${row.id}`}>
            <View style={styles.rowText}>
              <Text variant="body" style={styles.name}>
                {row.name}
              </Text>
              <Text variant="small" muted>
                {[
                  t('packs.places', { count: (row.installed?.venue_count ?? row.available?.venues) || 0 }),
                  row.installed ? t('packs.installed') : null,
                  row.installed ? t('packs.updated', { date: date(row.installed.generated_at) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {row.available && (!row.installed || stale) ? (
              <Button
                label={row.installed ? t('packs.update') : t('packs.download')}
                disabled={busy}
                onPress={() => install.mutate(row.available!)}
              />
            ) : null}
            {row.installed ? (
              <Button
                tone="secondary"
                label={t('packs.remove')}
                disabled={busy}
                onPress={() => remove.mutate(row.id)}
              />
            ) : null}
          </View>
        );
      })}

      {errorText ? (
        <Alert message={errorText} />
      ) : null}
      {rows.some((r) => r.installed) ? (
        <Text variant="small" muted>
          {t('packs.discreetNote')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  rowText: { flex: 1, minWidth: 160, gap: space[1] },
  name: { fontWeight: '700' },
});
