import { MessagingInterface } from "@/components/messaging/MessagingInterface";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ p: 3 }}>
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography color="text.secondary">Please log in to access your messages.</Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Box sx={{ width: '100%', p: { xs: 1.5, sm: 3 } }}>
      <Box sx={{ mb: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '1.875rem' } }}>Messages</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>Stay connected with your community</Typography>
      </Box>

      <MessagingInterface />
    </Box>
  );
}
