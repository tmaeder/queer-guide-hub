import { Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VenueCard } from "./VenueCard";

interface VenuesListProps {
  venues: any[];
  onEdit: (venue: any) => void;
  onDelete: (venue: any) => void;
}

export function VenuesList({ venues, onEdit, onDelete }: VenuesListProps) {
  if (venues.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No venues found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search criteria or add a new venue to get started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Venues ({venues.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}