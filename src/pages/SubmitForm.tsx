import { lazy, Suspense } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

const SubmitVenue = lazy(() => import('./SubmitVenue'));
const SubmitEvent = lazy(() => import('./SubmitEvent'));

const formComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  venue: SubmitVenue,
  event: SubmitEvent,
};

const SubmitForm = () => {
  const { contentType } = useParams<{ contentType: string }>();

  if (!contentType || !formComponents[contentType]) {
    return <Navigate to="/submit" replace />;
  }

  const FormComponent = formComponents[contentType];

  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      }
    >
      <FormComponent />
    </Suspense>
  );
};

export default SubmitForm;
