/**
 * EmailIngestionsPanel — Admin view for email ingestion pipeline results.
 *
 * Shows email_ingestions table with status, extracted counts, processing time.
 * Expandable rows show AI extraction results and links to created entities.
 */

import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { ChevronDown, ChevronRight, Mail, Calendar, MapPin, AlertCircle, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';

interface EmailIngestion {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  status: string;
  extracted_events: number;
  extracted_venues: number;
  inserted_event_ids: string[];
  inserted_venue_ids: string[];
  ai_extraction: Record<string, unknown> | null;
  processing_ms: number | null;
  error_message: string | null;
  received_at: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  completed: 'success',
  processing: 'warning',
  failed: 'error',
  no_content: 'default',
};

export const EmailIngestionsPanel: React.FC = () => {
  const [ingestions, setIngestions] = useState<EmailIngestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchIngestions();
  }, [statusFilter]);

  const fetchIngestions = async () => {
    setLoading(true);
    let query = supabase
      .from('email_ingestions')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(50);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setIngestions((data as EmailIngestion[]) || []);
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={48} sx={{ mb: 1, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Mail size={20} />
          <Typography variant="h6">Email Ingestions</Typography>
          <Chip label={ingestions.length} size="small" />
        </Box>
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All Statuses</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="processing">Processing</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
          <MenuItem value="no_content">No Content</MenuItem>
        </TextField>
      </Box>

      {ingestions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography>No email ingestions found</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>From</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Events</TableCell>
                <TableCell align="center">Venues</TableCell>
                <TableCell>Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ingestions.map((ing) => (
                <React.Fragment key={ing.id}>
                  <TableRow
                    hover
                    onClick={() => toggleExpand(ing.id)}
                    sx={{ cursor: 'pointer', '& > td': { borderBottom: expandedId === ing.id ? 'none' : undefined } }}
                  >
                    <TableCell>
                      <IconButton size="small">
                        {expandedId === ing.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {ing.from_address}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                        {ing.subject || '(no subject)'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ing.status}
                        size="small"
                        color={STATUS_COLORS[ing.status] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {ing.extracted_events > 0 && (
                        <Chip icon={<Calendar size={12} />} label={ing.extracted_events} size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {ing.extracted_venues > 0 && (
                        <Chip icon={<MapPin size={12} />} label={ing.extracted_venues} size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(ing.received_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>

                  {/* Expanded row */}
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 0, px: 0 }}>
                      <Collapse in={expandedId === ing.id}>
                        <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                          {/* Processing info */}
                          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                            {ing.processing_ms != null && (
                              <Chip icon={<Clock size={12} />} label={`${ing.processing_ms}ms`} size="small" />
                            )}
                            {ing.error_message && (
                              <Chip icon={<AlertCircle size={12} />} label={ing.error_message} size="small" color="error" variant="outlined" />
                            )}
                          </Box>

                          {/* Created entities */}
                          {ing.inserted_event_ids?.length > 0 && (
                            <Box sx={{ mb: 1 }}>
                              <Typography variant="caption" fontWeight={600}>Created Events:</Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                {ing.inserted_event_ids.map((id) => (
                                  <Chip
                                    key={id}
                                    label={id.slice(0, 8)}
                                    size="small"
                                    component={Link}
                                    to={`/events/${id}`}
                                    clickable
                                    variant="outlined"
                                    color="primary"
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                          {ing.inserted_venue_ids?.length > 0 && (
                            <Box sx={{ mb: 1 }}>
                              <Typography variant="caption" fontWeight={600}>Created Venues:</Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                {ing.inserted_venue_ids.map((id) => (
                                  <Chip
                                    key={id}
                                    label={id.slice(0, 8)}
                                    size="small"
                                    component={Link}
                                    to={`/venues/${id}`}
                                    clickable
                                    variant="outlined"
                                    color="secondary"
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}

                          {/* AI Extraction preview */}
                          {ing.ai_extraction && (
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" fontWeight={600}>AI Extraction:</Typography>
                              <Box
                                component="pre"
                                sx={{
                                  mt: 0.5,
                                  p: 1,
                                  bgcolor: 'background.paper',
                                  borderRadius: 1,
                                  fontSize: '0.7rem',
                                  overflow: 'auto',
                                  maxHeight: 200,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                {JSON.stringify(ing.ai_extraction, null, 2)}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default EmailIngestionsPanel;
