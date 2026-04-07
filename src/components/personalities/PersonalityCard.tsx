import { Box, Typography } from '@mui/material';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, Calendar, MapPin, Check, AlertCircle, Star, Clock, Heart } from "lucide-react";
import { Personality } from "@/hooks/usePersonalities";
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

interface PersonalityCardProps {
  personality?: Personality;
  loading?: boolean;
  onClick?: () => void;
}
export function PersonalityCard({
  personality,
  loading = false,
  onClick
}: PersonalityCardProps) {
  if (loading || !personality) {
    return (
      <Skeleton name="personality-card" loading={true} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }
  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getVerificationBadge = () => {
    switch (personality.verification_status) {
      case 'verified':
        return (
          <Badge variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'success.light', color: 'success.dark', borderColor: 'success.light' }}>
            <Check sx={{ height: '12px', width: '12px' }} />
            Verified
          </Badge>
        );
      case 'disputed':
        return (
          <Badge variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'warning.light', color: 'warning.dark', borderColor: 'warning.light' }}>
            <AlertCircle sx={{ height: '12px', width: '12px' }} />
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
    <Card sx={{ '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s', cursor: 'pointer' }} onClick={handleCardClick}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Avatar sx={{ height: '64px', width: '64px' }}>
            <AvatarImage
              src={personality.image_url}
              alt={personality.name}
              sx={{ objectFit: 'cover' }}
            />
            <AvatarFallback sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
              {getInitials(personality.name)}
            </AvatarFallback>
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {personality.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
                {personality.is_featured && (
                  <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
                    <Star sx={{ height: '12px', width: '12px', mr: 0.5 }} />
                    Featured
                  </Badge>
                )}
                {getVerificationBadge()}
              </Box>
            </Box>

            {personality.pronouns && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {personality.pronouns}
              </Typography>
            )}

            {personality.profession && (
              <Button
                variant="ghost"
                size="sm"
                sx={{ height: 'auto', p: 0, fontSize: '0.875rem', color: 'primary.main' }}
                onClick={handleProfessionClick}
              >
                {personality.profession}
              </Button>
            )}
          </Box>
        </Box>

        {personality.description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', mb: 2 }}>
            {personality.description}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {personality.is_living ? (
                <>
                  <Heart sx={{ height: '12px', width: '12px', color: 'success.main' }} />
                  <Typography component="span">Living</Typography>
                </>
              ) : (
                <>
                  <Clock sx={{ height: '12px', width: '12px' }} />
                  <Typography component="span">Historical</Typography>
                </>
              )}
            </Box>

            {personality.birth_date && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Calendar sx={{ height: '12px', width: '12px' }} />
                <Typography component="span">{calculateAge()}</Typography>
              </Box>
            )}

            {personality.nationality && (
              <Button
                variant="ghost"
                size="sm"
                sx={{ height: 'auto', p: 0, fontSize: '0.75rem' }}
                onClick={handleNationalityClick}
              >
                <MapPin sx={{ height: '12px', width: '12px', mr: 0.5 }} />
                {personality.nationality}
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Eye sx={{ height: '12px', width: '12px' }} />
            <Typography component="span">{personality.view_count.toLocaleString()}</Typography>
          </Box>
        </Box>

        {personality.fields && personality.fields.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {personality.fields.slice(0, 3).map((field, index) => (
              <Badge key={index} variant="outline" sx={{ fontSize: '0.75rem' }}>
                {field}
              </Badge>
            ))}
            {personality.fields.length > 3 && (
              <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                +{personality.fields.length - 3} more
              </Badge>
            )}
          </Box>
        )}

        {personality.website_url && (
          <Button
            variant="outline"
            size="sm"
            sx={{ width: '100%' }}
            onClick={handleWebsiteClick}
          >
            <ExternalLink sx={{ height: '16px', width: '16px', mr: 1 }} />
            Visit Website
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
