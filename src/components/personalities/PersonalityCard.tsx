import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Check, AlertCircle, Star, Clock, Heart } from "lucide-react";
import { Personality } from "@/hooks/usePersonalities";
interface PersonalityCardProps {
  personality: Personality;
  onClick?: () => void;
}
export function PersonalityCard({
  personality,
  onClick
}: PersonalityCardProps) {
  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getVerificationBadge = () => {
    switch (personality.verification_status) {
      case 'verified':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-green-500/10 text-green-700 border-green-200 hover:bg-green-500/20 transition-colors">
            <Check className="h-3 w-3" />
            Verified
          </Badge>
        );
      case 'disputed':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500/10 text-yellow-700 border-yellow-200 hover:bg-yellow-500/20 transition-colors">
            <AlertCircle className="h-3 w-3" />
            Disputed
          </Badge>
        );
      default:
        return null;
    }
  };

  const calculateAge = () => {
    if (!personality.birth_date) return null;
    const birthDate = new Date(personality.birth_date);
    const endDate = personality.death_date ? new Date(personality.death_date) : new Date();
    const age = endDate.getFullYear() - birthDate.getFullYear();
    return personality.is_living ? `${age} years old` : `${age} years`;
  };

  const handleCardClick = () => {
    // Navigate to detail page
    window.location.href = `/personalities/${personality.id}`;
  };

  const handleProfessionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `/personalities?profession=${encodeURIComponent(personality.profession || '')}`;
  };

  const handleNationalityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `/countries?search=${encodeURIComponent(personality.nationality || '')}`;
  };

  const handleWebsiteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(personality.website_url, '_blank');
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={handleCardClick}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-16 w-16">
            <AvatarImage 
              src={personality.image_url} 
              alt={personality.name}
              className="object-cover"
            />
            <AvatarFallback className="text-lg font-semibold">
              {getInitials(personality.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-lg line-clamp-1">
                {personality.name}
              </h3>
              <div className="flex items-center gap-2 ml-2">
                {personality.is_featured && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Featured
                  </Badge>
                )}
                {getVerificationBadge()}
              </div>
            </div>
            
            {personality.pronouns && (
              <p className="text-sm text-muted-foreground mb-2">
                {personality.pronouns}
              </p>
            )}
            
            {personality.profession && (
              <Button 
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-sm text-primary hover:underline"
                onClick={handleProfessionClick}
              >
                {personality.profession}
              </Button>
            )}
          </div>
        </div>

        {personality.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {personality.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {personality.is_living ? (
                <>
                  <Heart className="h-3 w-3 text-green-600" />
                  <span>Living</span>
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  <span>Historical</span>
                </>
              )}
            </div>
            
            {personality.birth_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{calculateAge()}</span>
              </div>
            )}
            
            {personality.nationality && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs hover:underline"
                onClick={handleNationalityClick}
              >
                <MapPin className="h-3 w-3 mr-1" />
                {personality.nationality}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span>{personality.view_count.toLocaleString()}</span>
          </div>
        </div>

        {personality.fields && personality.fields.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {personality.fields.slice(0, 3).map((field, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {field}
              </Badge>
            ))}
            {personality.fields.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{personality.fields.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {personality.website_url && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={handleWebsiteClick}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Visit Website
          </Button>
        )}
      </CardContent>
    </Card>
  );
}