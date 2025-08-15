import { useState, useEffect } from "react";
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
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    } else if (lowerStatus.includes('criminalised') || lowerStatus.includes('prohibited')) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    } else if (lowerStatus.includes('partial') || lowerStatus.includes('limited')) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    } else {
      return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('legal') || lowerStatus.includes('protected')) {
      return 'bg-green-100 text-green-800 border-green-200';
    } else if (lowerStatus.includes('criminalised') || lowerStatus.includes('prohibited')) {
      return 'bg-red-100 text-red-800 border-red-200';
    } else if (lowerStatus.includes('partial') || lowerStatus.includes('limited')) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    } else {
      return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Card className={`${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-rainbow" />
            LGBT+ Rights & Legal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-rainbow" />
            LGBT+ Rights & Legal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load LGBT+ rights data at this time.</p>
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
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
          LGBT+ Rights & Legal Status
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Based on data from ILGA World Database • Last updated: {jurisdictionData.lastUpdated}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Criminalization Status */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold">Same-Sex Activity</h4>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(jurisdictionData.criminalisation.status)}
            <Badge variant="outline" className={getStatusColor(jurisdictionData.criminalisation.status)}>
              {jurisdictionData.criminalisation.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {jurisdictionData.criminalisation.description}
          </p>
          {jurisdictionData.criminalisation.penalty !== "None" && jurisdictionData.criminalisation.penalty !== "Unknown" && (
            <p className="text-sm text-red-600 pl-6 font-medium">
              Penalty: {jurisdictionData.criminalisation.penalty}
            </p>
          )}
        </div>

        <Separator />

        {/* Same-Sex Marriage */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold">Same-Sex Marriage</h4>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(jurisdictionData.sameSeMarriage.status)}
            <Badge variant="outline" className={getStatusColor(jurisdictionData.sameSeMarriage.status)}>
              {jurisdictionData.sameSeMarriage.status}
            </Badge>
            {jurisdictionData.sameSeMarriage.date && (
              <span className="text-sm text-muted-foreground">
                (Since {new Date(jurisdictionData.sameSeMarriage.date).getFullYear()})
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {jurisdictionData.sameSeMarriage.description}
          </p>
        </div>

        <Separator />

        {/* Anti-Discrimination */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold">Anti-Discrimination Protection</h4>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(jurisdictionData.antidiscrimination.status)}
            <Badge variant="outline" className={getStatusColor(jurisdictionData.antidiscrimination.status)}>
              {jurisdictionData.antidiscrimination.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {jurisdictionData.antidiscrimination.description}
          </p>
          {jurisdictionData.antidiscrimination.scope.length > 0 && (
            <div className="pl-6">
              <p className="text-sm font-medium mb-2">Protected areas:</p>
              <div className="flex flex-wrap gap-1">
                {jurisdictionData.antidiscrimination.scope.map((area) => (
                  <Badge key={area} variant="secondary" className="text-xs">
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Additional Protections */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Constitutional Protection</h5>
            <div className="flex items-center gap-2">
              {jurisdictionData.constitutionalProtection ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">
                {jurisdictionData.constitutionalProtection ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Hate Crime Laws</h5>
            <div className="flex items-center gap-2">
              {jurisdictionData.hateClimeLaws ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">
                {jurisdictionData.hateClimeLaws ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 mb-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sources:</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {jurisdictionData.sources.map((source, index) => (
              <div key={index}>• {source}</div>
            ))}
            <div className="pt-2">
              <a 
                href="https://database.ilga.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                View full ILGA World Database
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}