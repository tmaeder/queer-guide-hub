import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Check, AlertCircle, Star, Clock, Heart, Briefcase } from "lucide-react";
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
    <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-muted/20 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 hover:-translate-y-2 cursor-pointer border-0 ring-1 ring-border hover:ring-primary/20 animate-fade-in" onClick={handleCardClick}>
      {/* Featured Badge */}
      {personality.is_featured && (
        <div className="absolute top-4 right-4 z-10">
          <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg animate-pulse">
            <Star className="h-3 w-3 mr-1" />
            Featured
          </Badge>
        </div>
      )}

      {/* Living Status Indicator */}
      <div className="absolute top-4 left-4 z-10">
        {personality.is_living ? (
          <div className="flex items-center gap-1 bg-green-500/10 text-green-700 px-2 py-1 rounded-full text-xs font-medium border border-green-200">
            <Heart className="h-3 w-3" />
            Living
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-muted/80 text-muted-foreground px-2 py-1 rounded-full text-xs font-medium border">
            <Clock className="h-3 w-3" />
            Historical
          </div>
        )}
      </div>

      <CardHeader className="pb-4 pt-12">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-background shadow-lg group-hover:ring-primary/20 transition-all duration-300">
              <AvatarImage 
                src={personality.image_url} 
                alt={personality.name} 
                className="object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <AvatarFallback className="text-xl font-bold bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                {getInitials(personality.name)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1">
              {getVerificationBadge()}
            </div>
          </div>
          
          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="font-bold text-xl group-hover:text-primary transition-colors duration-300 line-clamp-2 leading-tight">
              {personality.name}
            </h3>
            
            {personality.pronouns && (
              <p className="text-sm text-muted-foreground font-medium">
                {personality.pronouns}
              </p>
            )}
            
            {personality.profession && (
              <Button 
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-sm font-semibold text-primary hover:text-primary/80 hover:bg-transparent hover:underline transition-all duration-200"
                onClick={handleProfessionClick}
              >
                <Briefcase className="h-3 w-3 mr-1" />
                {personality.profession}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {personality.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {personality.description}
          </p>
        )}

        {personality.fields && personality.fields.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {personality.fields.slice(0, 3).map((field, index) => (
              <Badge 
                key={index} 
                variant="outline" 
                className="text-xs bg-muted/50 hover:bg-primary/10 hover:border-primary/20 transition-colors duration-200"
              >
                {field}
              </Badge>
            ))}
            {personality.fields.length > 3 && (
              <Badge 
                variant="outline" 
                className="text-xs bg-muted/50 hover:bg-primary/10 hover:border-primary/20 transition-colors duration-200"
              >
                +{personality.fields.length - 3} more
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            {personality.birth_date && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span className="font-medium">{calculateAge()}</span>
              </div>
            )}
            
            {personality.nationality && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary transition-colors duration-200"
                onClick={handleNationalityClick}
              >
                <MapPin className="h-3 w-3 mr-1" />
                {personality.nationality}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span className="font-medium">{personality.view_count.toLocaleString()}</span>
          </div>
        </div>

        {personality.website_url && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full hover-scale bg-background hover:bg-primary hover:text-primary-foreground transition-all duration-300"
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