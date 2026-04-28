import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderTabProps {
  title: string;
  description: string;
  bullets: string[];
}

export function PlaceholderTab({ title, description, bullets }: PlaceholderTabProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {description}
        </Typography>
        <Box component="ul" sx={{ mt: 2 }}>
          {bullets.map((b) => (
            <li key={b}>
              <Typography variant="body2">{b}</Typography>
            </li>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
