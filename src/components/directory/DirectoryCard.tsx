import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Globe, Building2 } from "lucide-react";
import { Country, City } from "@/hooks/useDirectory";

interface DirectoryCardProps {
  type: "continent" | "country" | "city";
  name: string;
  data?: Country | City | any;
  onClick?: () => void;
}

export const DirectoryCard = ({ type, name, data, onClick }: DirectoryCardProps) => {
  const formatPopulation = (population?: number | null) => {
    if (!population) return null;
    if (population >= 1000000) {
      return `${(population / 1000000).toFixed(1)}M`;
    } else if (population >= 1000) {
      return `${(population / 1000).toFixed(0)}K`;
    }
    return population.toString();
  };

  const getIcon = () => {
    switch (type) {
      case "continent":
        return <Globe className="h-5 w-5 text-primary" />;
      case "country":
        return <MapPin className="h-5 w-5 text-primary" />;
      case "city":
        return <Building2 className="h-5 w-5 text-primary" />;
      default:
        return null;
    }
  };

  const getSubtitle = () => {
    if (type === "country" && data) {
      const country = data as Country;
      return (
        <div className="space-y-1">
          {country.capital && (
            <p className="text-sm text-muted-foreground">Capital: {country.capital}</p>
          )}
          {country.regions && (
            <Badge variant="secondary" className="text-xs">
              {country.regions.name}
            </Badge>
          )}
        </div>
      );
    }
    
    if (type === "city" && data) {
      const city = data as City;
      return (
        <div className="space-y-1">
          {city.countries && (
            <p className="text-sm text-muted-foreground">{city.countries.name}</p>
          )}
          <div className="flex gap-2">
            {city.is_capital && (
              <Badge variant="default" className="text-xs">
                Capital
              </Badge>
            )}
            {city.is_major_city && (
              <Badge variant="secondary" className="text-xs">
                Major City
              </Badge>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const getStats = () => {
    if (data?.population) {
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{formatPopulation(data.population)}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 ${
        onClick ? "hover:bg-accent/50" : ""
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="text-lg">{name}</span>
          </div>
          {getStats()}
        </CardTitle>
      </CardHeader>
      {getSubtitle() && (
        <CardContent className="pt-0">
          {getSubtitle()}
        </CardContent>
      )}
    </Card>
  );
};