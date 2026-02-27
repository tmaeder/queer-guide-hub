import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const AdminSubmissions = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Inbox style={{ width: 28, height: 28 }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Community Submissions
        </Typography>
      </Box>

      <EmptyState
        icon={Inbox}
        title="No submissions yet"
        description="Community submissions from the /submit page will appear here for review."
      />
    </Container>
  );
};

export default AdminSubmissions;
