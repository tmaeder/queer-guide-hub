import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Shield, Heart, Scale, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useILGAData, LGBTJurisdiction } from "@/hooks/useILGAData";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface LGBTJurisdictionInfoProps {
  countryName: string;
  countryCode?: string;
  className?: string;
}

export default function LGBTJurisdictionInfo({ countryName, countryCode, className = "" }: LGBTJurisdictionInfoProps) {
  const [jurisdictionData, setJurisdictionData] = useState<LGBTJurisdiction | null>(null);
  const { fetchILGAData, loading, error } = useILGAData();

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchILGAData(countryCode, countryName);
      if (data) {
        setJurisdictionData(data);
      }
    };

    loadData();
  }, [countryCode, countryName, fetchILGAData]);

  const getStatusIcon = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('legal') || lowerStatus.includes('protected')) {
      return <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />;
    } else if (lowerStatus.includes('criminalised') || lowerStatus.includes('prohibited')) {
      return <XCircle style={{ height: 16, width: 16, color: '#ef4444' }} />;
    } else if (lowerStatus.includes('partial') || lowerStatus.includes('limited')) {
      return <AlertTriangle style={{ height: 16, width: 16, color: '#eab308' }} />;
    } else {
      return <Clock style={{ height: 16, width: 16, color: '#6b7280' }} />;
    }
  };

  const getStatusStyle = (status: string): React.CSSProperties => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('legal') || lowerStatus.includes('protected')) {
      return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
    } else if (lowerStatus.includes('criminalised') || lowerStatus.includes('prohibited')) {
      return { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
    } else if (lowerStatus.includes('partial') || lowerStatus.includes('limited')) {
      return { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' };
    } else {
      return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };
    }
  };

  if (loading) {
    return (
      <Card className={`${className}`}>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 20, width: 20 }} />
            LGBT+ Rights & Legal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '75%' }} />
            <Box sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '50%' }} />
            <Box sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '66%' }} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${className}`}>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 20, width: 20 }} />
            LGBT+ Rights & Legal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ color: 'var(--muted-foreground)' }}>Unable to load LGBT+ rights data at this time.</p>
        </CardContent>
      </Card>
    );
  }

  if (!jurisdictionData) {
    return null;
  }

  return (
    <Card className={`${className}`}>
      <CardHeader>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Shield style={{ height: 20, width: 20, color: 'hsl(var(--primary))' }} />
          LGBT+ Rights & Legal Status
        </CardTitle>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Based on data from ILGA World Database • Last updated: {jurisdictionData.lastUpdated}
        </Typography>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Criminalization Status */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Scale style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>Same-Sex Activity</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.criminalisation.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.criminalisation.status)}>
              {jurisdictionData.criminalisation.status}
            </Badge>
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.criminalisation.description}
          </Typography>
          {jurisdictionData.criminalisation.penalty !== "None" && jurisdictionData.criminalisation.penalty !== "Unknown" && (
            <Typography sx={{ fontSize: '0.875rem', color: '#dc2626', pl: 3, fontWeight: 500 }}>
              Penalty: {jurisdictionData.criminalisation.penalty}
            </Typography>
          )}
        </Box>

        <Separator />

        {/* Same-Sex Marriage */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Heart style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>Same-Sex Marriage</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.sameSeMarriage.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.sameSeMarriage.status)}>
              {jurisdictionData.sameSeMarriage.status}
            </Badge>
            {jurisdictionData.sameSeMarriage.date && (
              <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                (Since {new Date(jurisdictionData.sameSeMarriage.date).getFullYear()})
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.sameSeMarriage.description}
          </Typography>
        </Box>

        <Separator />

        {/* Anti-Discrimination */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>Anti-Discrimination Protection</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.antidiscrimination.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.antidiscrimination.status)}>
              {jurisdictionData.antidiscrimination.status}
            </Badge>
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.antidiscrimination.description}
          </Typography>
          {jurisdictionData.antidiscrimination.scope.length > 0 && (
            <Box sx={{ pl: 3 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1 }}>Protected areas:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {jurisdictionData.antidiscrimination.scope.map((area) => (
                  <Badge key={area} variant="secondary" sx={{ fontSize: '0.75rem' }}>
                    {area}
                  </Badge>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        <Separator />

        {/* Additional Protections */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="h5" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Constitutional Protection</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {jurisdictionData.constitutionalProtection ? (
                <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              ) : (
                <XCircle style={{ height: 16, width: 16, color: '#ef4444' }} />
              )}
              <Box component="span" sx={{ fontSize: '0.875rem' }}>
                {jurisdictionData.constitutionalProtection ? 'Yes' : 'No'}
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="h5" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Hate Crime Laws</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {jurisdictionData.hateClimeLaws ? (
                <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              ) : (
                <XCircle style={{ height: 16, width: 16, color: '#ef4444' }} />
              )}
              <Box component="span" sx={{ fontSize: '0.875rem' }}>
                {jurisdictionData.hateClimeLaws ? 'Yes' : 'No'}
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Sources */}
        <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ExternalLink style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Sources:</Box>
          </Box>
          <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {jurisdictionData.sources.map((source, index) => (
              <div key={index}>• {source}</div>
            ))}
            <Box sx={{ pt: 1 }}>
              <Box
                component="a"
                href="https://database.ilga.org/"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'primary.main', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                View full ILGA World Database
                <ExternalLink style={{ height: 12, width: 12 }} />
              </Box>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}