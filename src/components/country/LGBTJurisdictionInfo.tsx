import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Shield, Heart, Scale, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useILGAData, LGBTJurisdiction } from "@/hooks/useILGAData";

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
          <div sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '75%' }}></div>
            <div sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '50%' }}></div>
            <div sx={{ height: 16, bgcolor: '#e5e7eb', borderRadius: 1, width: '66%' }}></div>
          </div>
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
        <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Based on data from ILGA World Database • Last updated: {jurisdictionData.lastUpdated}
        </p>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Criminalization Status */}
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Scale style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <h4 sx={{ fontWeight: 600 }}>Same-Sex Activity</h4>
          </div>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.criminalisation.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.criminalisation.status)}>
              {jurisdictionData.criminalisation.status}
            </Badge>
          </div>
          <p sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.criminalisation.description}
          </p>
          {jurisdictionData.criminalisation.penalty !== "None" && jurisdictionData.criminalisation.penalty !== "Unknown" && (
            <p sx={{ fontSize: '0.875rem', color: '#dc2626', pl: 3, fontWeight: 500 }}>
              Penalty: {jurisdictionData.criminalisation.penalty}
            </p>
          )}
        </div>

        <Separator />

        {/* Same-Sex Marriage */}
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Heart style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <h4 sx={{ fontWeight: 600 }}>Same-Sex Marriage</h4>
          </div>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.sameSeMarriage.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.sameSeMarriage.status)}>
              {jurisdictionData.sameSeMarriage.status}
            </Badge>
            {jurisdictionData.sameSeMarriage.date && (
              <span sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                (Since {new Date(jurisdictionData.sameSeMarriage.date).getFullYear()})
              </span>
            )}
          </div>
          <p sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.sameSeMarriage.description}
          </p>
        </div>

        <Separator />

        {/* Anti-Discrimination */}
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <h4 sx={{ fontWeight: 600 }}>Anti-Discrimination Protection</h4>
          </div>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(jurisdictionData.antidiscrimination.status)}
            <Badge variant="outline" style={getStatusStyle(jurisdictionData.antidiscrimination.status)}>
              {jurisdictionData.antidiscrimination.status}
            </Badge>
          </div>
          <p sx={{ fontSize: '0.875rem', color: 'text.secondary', pl: 3 }}>
            {jurisdictionData.antidiscrimination.description}
          </p>
          {jurisdictionData.antidiscrimination.scope.length > 0 && (
            <div sx={{ pl: 3 }}>
              <p sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1 }}>Protected areas:</p>
              <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {jurisdictionData.antidiscrimination.scope.map((area) => (
                  <Badge key={area} variant="secondary" sx={{ fontSize: '0.75rem' }}>
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Additional Protections */}
        <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <h5 sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Constitutional Protection</h5>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {jurisdictionData.constitutionalProtection ? (
                <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              ) : (
                <XCircle style={{ height: 16, width: 16, color: '#ef4444' }} />
              )}
              <span sx={{ fontSize: '0.875rem' }}>
                {jurisdictionData.constitutionalProtection ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <h5 sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Hate Crime Laws</h5>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {jurisdictionData.hateClimeLaws ? (
                <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              ) : (
                <XCircle style={{ height: 16, width: 16, color: '#ef4444' }} />
              )}
              <span sx={{ fontSize: '0.875rem' }}>
                {jurisdictionData.hateClimeLaws ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ExternalLink style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
            <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Sources:</span>
          </div>
          <div sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {jurisdictionData.sources.map((source, index) => (
              <div key={index}>• {source}</div>
            ))}
            <div sx={{ pt: 1 }}>
              <a 
                href="https://database.ilga.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                sx={{ color: 'primary.main', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                View full ILGA World Database
                <ExternalLink style={{ height: 12, width: 12 }} />
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}