import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Check, AlertCircle } from "lucide-react";
import { Personality } from "@/hooks/usePersonalities";

interface PersonalityCardProps {
  personality: Personality;
  onClick?: () => void;
}

export function PersonalityCard({ personality, onClick }: PersonalityCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getVerificationIcon = () => {
    switch (personality.verification_status) {
      case 'verified':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'disputed':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
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

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer" onClick={onClick}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={personality.image_url} alt={personality.name} />
            <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              {getInitials(personality.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-lg group-hover:text-primary transition-colors truncate">
                {personality.name}
              </h3>
              {getVerificationIcon()}
              {personality.is_featured && (
                <Badge variant="secondary" className="text-xs bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                  Featured
                </Badge>
              )}
            </div>
            
            {personality.pronouns && (
              <p className="text-sm text-muted-foreground mb-1">
                {personality.pronouns}
              </p>
            )}
            
            {personality.profession && (
              <p className="text-sm font-medium text-foreground mb-2">
                {personality.profession}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {personality.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
            {personality.description}
          </p>
        )}

        {personality.fields && personality.fields.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
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

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {personality.birth_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{calculateAge()}</span>
              </div>
            )}
            
            {personality.nationality && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{personality.nationality}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span>{personality.view_count}</span>
          </div>
        </div>

        {personality.website_url && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                window.open(personality.website_url, '_blank');
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Website
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}