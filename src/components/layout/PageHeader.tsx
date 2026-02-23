/**
 * PageHeader — Unified page header component.
 *
 * Renders a consistent H1 + optional subtitle + optional actions slot
 * on a solid Paper surface. Used across all public pages.
 *
 * Usage:
 *   <PageHeader title="Venues" subtitle="Discover LGBTQ+ spaces worldwide" />
 *   <PageHeader title="Events" actions={<Button>Create</Button>} />
 */

import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  /** Page title (H1) */
  title: string;
  /** Optional subtitle text */
  subtitle?: string;
  /** Optional actions slot (buttons, toggles, etc.) rendered to the right on desktop */
  actions?: React.ReactNode;
  /** Center-align title and subtitle (for hero-style headers) */
  center?: boolean;
  /** Extra content below the title row (filters, tabs, etc.) */
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  center = false,
  children,
}) => {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2.5, sm: 3 },
        mb: 3,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: center ? 'column' : 'row' },
          alignItems: { xs: 'flex-start', sm: center ? 'center' : 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
          textAlign: center ? 'center' : 'left',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 700, mb: subtitle ? 0.5 : 0 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body1" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {actions}
          </Box>
        )}
      </Box>
      {children && <Box sx={{ mt: 2 }}>{children}</Box>}
    </Paper>
  );
};
