import { Building, Star, MapPin, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface VenuesStatsProps {
  venues: any[];
}

export function VenuesStats({ venues }: VenuesStatsProps) {
  const stats = [
    {
      icon: Building,
      label: "Total Venues",
      value: venues.length,
      color: "text-primary"
    },
    {
      icon: Star,
      label: "Featured",
      value: venues.filter(v => v.featured).length,
      color: "text-yellow-500"
    },
    {
      icon: MapPin,
      label: "Verified",
      value: venues.filter(v => v.verified).length,
      color: "text-green-500"
    },
    {
      icon: Globe,
      label: "Cities",
      value: new Set(venues.map(v => v.city)).size,
      color: "text-blue-500"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}