import { MessagingInterface } from "@/components/messaging/MessagingInterface";
import Container from "@mui/material/Container";
import { AuthGate } from "@/components/layout/AuthGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTranslation } from 'react-i18next';

export default function Messages() {
  const { t } = useTranslation();
  return (
    <AuthGate title={t('pages.messages.title', 'Messages')} description={t('pages.messages.signInDesc', 'Please sign in to access your messages.')}>
      <Container sx={{ py: 4 }}>
        <PageHeader
          title="Messages"
          subtitle={t('pages.messages.subtitle', 'Stay connected with your community')}
        />
        <MessagingInterface />
      </Container>
    </AuthGate>
  );
}
