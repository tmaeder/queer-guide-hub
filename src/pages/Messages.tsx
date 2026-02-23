import { MessagingInterface } from "@/components/messaging/MessagingInterface";
import Container from "@mui/material/Container";
import { AuthGate } from "@/components/layout/AuthGate";
import { PageHeader } from "@/components/layout/PageHeader";

export default function Messages() {
  return (
    <AuthGate title="Messages" description="Please sign in to access your messages.">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageHeader
          title="Messages"
          subtitle="Stay connected with your community"
        />
        <MessagingInterface />
      </Container>
    </AuthGate>
  );
}
