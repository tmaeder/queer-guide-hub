import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const AdminSubmissions = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Inbox style={{ width: 28, height: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Community Submissions
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Inbox style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.4 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            No submissions yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Community submissions from the /submit page will appear here for review.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminSubmissions;
