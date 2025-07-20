import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  MapPin, 
  Globe, 
  Users, 
  Calendar,
  Building,
  Star,
  Heart,
  ExternalLink,
  Clock,
  Thermometer,
  Mountain,
  Phone,
  Mail,
  DollarSign,
  GraduationCap,
  Landmark,
  Info,
  Scale,
  Flag,
  Plane,
  Shield,
  Briefcase,
  TrendingUp,
  FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFavorites } from "@/hooks/useFavorites";

type CountryWithRelations = {
  id: string;
  name: string;
  code: string;
  capital?: string;
  population?: number;
  area_km2?: number;
  latitude?: number;
  longitude?: number;
  currency?: string;
  languages?: string[];
  timezone?: string;
  government_type?: string;
  capital_coordinates?: any;
  national_anthem?: string;
  national_day?: string;
  calling_code?: string;
  internet_tld?: string;
  driving_side?: string;
  major_religions?: string[];
  gdp_usd?: number;
  gdp_per_capita_usd?: number;
  human_development_index?: number;
  life_expectancy?: number;
  literacy_rate?: number;
  climate_zones?: string[];
  natural_resources?: string[];
  unesco_sites?: string[];
  major_industries?: string[];
  exports?: string[];
  imports?: string[];
  visa_requirements?: any;
  lgbt_rights_status?: string;
  lgbt_legal_status?: string;
  lgbti_criminalization?: any;
  lgbti_expression_restrictions?: any;
  lgbti_association_restrictions?: any;
  lgbti_constitutional_protection?: any;
  lgbti_goods_services_protection?: any;
  lgbti_health_protection?: any;
  lgbti_education_protection?: any;
  lgbti_bullying_protection?: any;
  lgbti_employment_protection?: any;
  lgbti_housing_protection?: any;
  lgbti_hate_crime_law?: any;
  lgbti_incitement_prohibition?: any;
  lgbti_conversion_therapy_regulation?: string;
  lgbti_same_sex_unions?: string;
  lgbti_adoption_rights?: string;
  lgbti_intersex_protection?: string;
  lgbti_gender_recognition?: any;
  lgbti_data_last_updated?: string;
  description?: string;
  flag_emoji?: string;
  national_symbols?: any;
};

export default function CountryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('country');

  const [country, setCountry] = useState<CountryWithRelations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchCountryDetails();
    }
  }, [id]);

  const fetchCountryDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setCountry(data);
    } catch (error) {
      console.error('Error fetching country details:', error);
      toast({
        title: "Error",
        description: "Failed to load country details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!country) return;
    
    try {
      await toggleFavorite(country.id);
      toast({
        title: isFavorited(country.id) ? "Removed from favorites" : "Added to favorites",
        description: `${country.name} ${isFavorited(country.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number): string => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  const renderLGBTStatus = () => {
    if (!country?.lgbt_rights_status && !country?.lgbt_legal_status) return null;
    
    const getStatusColor = (status: string) => {
      const lowerStatus = status.toLowerCase();
      if (lowerStatus.includes('legal') || lowerStatus.includes('protected')) return 'bg-green-100 text-green-800';
      if (lowerStatus.includes('illegal') || lowerStatus.includes('criminalized')) return 'bg-red-100 text-red-800';
      return 'bg-yellow-100 text-yellow-800';
    };

    return (
      <div className="space-y-2">
        {country.lgbt_rights_status && (
          <div>
            <span className="text-sm font-medium">LGBTQ+ Rights Status:</span>
            <Badge className={`ml-2 ${getStatusColor(country.lgbt_rights_status)}`}>
              {country.lgbt_rights_status}
            </Badge>
          </div>
        )}
        {country.lgbt_legal_status && (
          <div>
            <span className="text-sm font-medium">Legal Status:</span>
            <Badge className={`ml-2 ${getStatusColor(country.lgbt_legal_status)}`}>
              {country.lgbt_legal_status}
            </Badge>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading country details...</div>
        </div>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Country Not Found</h1>
            <Button onClick={() => navigate('/directory')}>Back to Directory</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate('/directory')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
          <Button variant="outline" onClick={handleFavoriteToggle}>
            <Heart className={`h-4 w-4 mr-2 ${isFavorited(country.id) ? 'fill-primary text-primary' : ''}`} />
            {isFavorited(country.id) ? 'Remove from Favorites' : 'Add to Favorites'}
          </Button>
        </div>

        {/* Hero Section */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              {country.flag_emoji && (
                <span className="text-6xl">{country.flag_emoji}</span>
              )}
              <div>
                <h1 className="text-4xl font-bold">{country.name}</h1>
                <p className="text-xl text-muted-foreground">
                  {country.capital && `Capital: ${country.capital}`}
                </p>
              </div>
            </div>

            {country.description && (
              <p className="text-muted-foreground leading-relaxed mt-4">{country.description}</p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="economy">Economy</TabsTrigger>
            <TabsTrigger value="government">Government</TabsTrigger>
            <TabsTrigger value="geography">Geography</TabsTrigger>
            <TabsTrigger value="culture">Culture</TabsTrigger>
            <TabsTrigger value="lgbti">LGBTI Rights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.population && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Population</span>
                      <span className="font-medium">{country.population.toLocaleString()}</span>
                    </div>
                  )}
                  {country.area_km2 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Area</span>
                      <span className="font-medium">{country.area_km2.toLocaleString()} km²</span>
                    </div>
                  )}
                  {country.currency && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Currency</span>
                      <span className="font-medium">{country.currency}</span>
                    </div>
                  )}
                  {country.calling_code && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Calling Code</span>
                      <span className="font-medium">{country.calling_code}</span>
                    </div>
                  )}
                  {country.internet_tld && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Internet TLD</span>
                      <span className="font-medium">{country.internet_tld}</span>
                    </div>
                  )}
                  {country.driving_side && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Driving Side</span>
                      <span className="font-medium capitalize">{country.driving_side}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Languages & Culture */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Languages & Culture
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.languages && country.languages.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">Languages</span>
                      <div className="flex flex-wrap gap-1">
                        {country.languages.map((language, index) => (
                          <Badge key={index} variant="outline" className="text-xs">{language}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {country.major_religions && country.major_religions.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">Major Religions</span>
                      <div className="flex flex-wrap gap-1">
                        {country.major_religions.map((religion, index) => (
                          <Badge key={index} variant="outline" className="text-xs">{religion}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {country.national_anthem && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">National Anthem</span>
                      <span className="font-medium text-sm">{country.national_anthem}</span>
                    </div>
                  )}
                  {country.national_day && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">National Day</span>
                      <span className="font-medium">{new Date(country.national_day).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* LGBTQ+ Rights */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    LGBTQ+ Rights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderLGBTStatus()}
                  {!country.lgbt_rights_status && !country.lgbt_legal_status && (
                    <p className="text-muted-foreground text-sm">No LGBTQ+ rights information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="demographics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Population Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.population && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Population</span>
                      <span className="font-medium">{country.population.toLocaleString()}</span>
                    </div>
                  )}
                  {country.area_km2 && country.population && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Population Density</span>
                      <span className="font-medium">
                        {Math.round(country.population / country.area_km2)} people/km²
                      </span>
                    </div>
                  )}
                  {country.life_expectancy && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Life Expectancy</span>
                      <span className="font-medium">{country.life_expectancy} years</span>
                    </div>
                  )}
                  {country.literacy_rate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Literacy Rate</span>
                      <span className="font-medium">{country.literacy_rate}%</span>
                    </div>
                  )}
                  {country.human_development_index && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">HDI</span>
                      <span className="font-medium">{country.human_development_index}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="economy" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Economic Indicators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Economic Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.gdp_usd && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">GDP</span>
                      <span className="font-medium">{formatCurrency(country.gdp_usd)}</span>
                    </div>
                  )}
                  {country.gdp_per_capita_usd && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">GDP per Capita</span>
                      <span className="font-medium">{formatCurrency(country.gdp_per_capita_usd)}</span>
                    </div>
                  )}
                  {country.currency && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Currency</span>
                      <span className="font-medium">{country.currency}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Industries */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Major Industries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.major_industries && country.major_industries.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {country.major_industries.map((industry, index) => (
                        <Badge key={index} variant="outline">{industry}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No industry information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Exports */}
              <Card>
                <CardHeader>
                  <CardTitle>Major Exports</CardTitle>
                </CardHeader>
                <CardContent>
                  {country.exports && country.exports.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {country.exports.map((export_item, index) => (
                        <Badge key={index} variant="secondary">{export_item}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No export information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Imports */}
              <Card>
                <CardHeader>
                  <CardTitle>Major Imports</CardTitle>
                </CardHeader>
                <CardContent>
                  {country.imports && country.imports.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {country.imports.map((import_item, index) => (
                        <Badge key={index} variant="outline">{import_item}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No import information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="government" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    Government Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.government_type && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Government Type</span>
                      <span className="font-medium">{country.government_type}</span>
                    </div>
                  )}
                  {country.capital && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Capital</span>
                      <span className="font-medium">{country.capital}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Visa Requirements */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Visa Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.visa_requirements && Object.keys(country.visa_requirements).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(country.visa_requirements).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-medium text-sm">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No visa requirement information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="geography" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Climate & Geography */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5" />
                    Climate & Geography
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {country.climate_zones && country.climate_zones.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">Climate Zones</span>
                      <div className="flex flex-wrap gap-1">
                        {country.climate_zones.map((zone, index) => (
                          <Badge key={index} variant="outline" className="text-xs">{zone}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {country.latitude && country.longitude && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Coordinates</span>
                      <span className="font-medium text-xs">
                        {country.latitude.toFixed(4)}, {country.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {country.timezone && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Timezone</span>
                      <span className="font-medium">{country.timezone}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Natural Resources */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mountain className="h-5 w-5" />
                    Natural Resources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.natural_resources && country.natural_resources.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {country.natural_resources.map((resource, index) => (
                        <Badge key={index} variant="outline">{resource}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No natural resource information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="culture" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UNESCO Sites */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-5 w-5" />
                    UNESCO World Heritage Sites
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.unesco_sites && country.unesco_sites.length > 0 ? (
                    <ul className="space-y-2">
                      {country.unesco_sites.map((site, index) => (
                        <li key={index} className="text-sm">• {site}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No UNESCO sites information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* National Symbols */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flag className="h-5 w-5" />
                    National Symbols
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.national_symbols && Object.keys(country.national_symbols).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(country.national_symbols).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-medium text-sm">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No national symbols information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lgbti" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {/* Criminalization */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    Criminalization of Same-Sex Relations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.lgbti_criminalization ? (
                    <div className="space-y-3">
                      {country.lgbti_criminalization.status && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <Badge 
                            variant={country.lgbti_criminalization.status.toLowerCase().includes('legal') ? 'default' : 'destructive'}
                          >
                            {country.lgbti_criminalization.status}
                          </Badge>
                        </div>
                      )}
                      {country.lgbti_criminalization.penalty && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Penalty</span>
                          <span className="font-medium text-sm">{country.lgbti_criminalization.penalty}</span>
                        </div>
                      )}
                      {country.lgbti_criminalization.last_amended && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Last Amendment</span>
                          <span className="font-medium text-sm">{country.lgbti_criminalization.last_amended}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No criminalization data available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Constitutional Protection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Constitutional Protection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.lgbti_constitutional_protection ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {['SO', 'GI', 'GE', 'SC'].map((type) => (
                        <div key={type} className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">
                            {type === 'SO' ? 'Sexual Orientation' : 
                             type === 'GI' ? 'Gender Identity' :
                             type === 'GE' ? 'Gender Expression' : 'Sex Characteristics'}
                          </div>
                          <Badge 
                            variant={country.lgbti_constitutional_protection[type] === 'Yes' ? 'default' : 'secondary'}
                          >
                            {country.lgbti_constitutional_protection[type] || 'No'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No constitutional protection data available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Discrimination Protection Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: 'lgbti_goods_services_protection', title: 'Goods & Services', icon: DollarSign },
                  { key: 'lgbti_health_protection', title: 'Healthcare', icon: Heart },
                  { key: 'lgbti_education_protection', title: 'Education', icon: GraduationCap },
                  { key: 'lgbti_employment_protection', title: 'Employment', icon: Briefcase },
                  { key: 'lgbti_housing_protection', title: 'Housing', icon: Building },
                  { key: 'lgbti_hate_crime_law', title: 'Hate Crime Law', icon: Scale }
                ].map(({ key, title, icon: Icon }) => (
                  <Card key={key}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4" />
                        {title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {country[key as keyof CountryWithRelations] ? (
                        <div className="grid grid-cols-2 gap-2">
                          {['SO', 'GI', 'GE', 'SC'].map((type) => (
                            <div key={type} className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{type}</span>
                              <Badge 
                                variant={(country[key as keyof CountryWithRelations] as any)?.[type] === 'Yes' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {(country[key as keyof CountryWithRelations] as any)?.[type] || 'No'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No data available.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Legal Rights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Same-Sex Unions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge 
                      variant={country.lgbti_same_sex_unions?.toLowerCase().includes('yes') || 
                               country.lgbti_same_sex_unions?.toLowerCase().includes('legal') ? 'default' : 'secondary'}
                    >
                      {country.lgbti_same_sex_unions || 'No data'}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Adoption Rights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge 
                      variant={country.lgbti_adoption_rights?.toLowerCase().includes('possible') || 
                               country.lgbti_adoption_rights?.toLowerCase().includes('legal') ? 'default' : 'secondary'}
                    >
                      {country.lgbti_adoption_rights || 'No data'}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Intersex Protection
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge 
                      variant={country.lgbti_intersex_protection?.toLowerCase().includes('yes') || 
                               country.lgbti_intersex_protection?.toLowerCase().includes('protected') ? 'default' : 'secondary'}
                    >
                      {country.lgbti_intersex_protection || 'No data'}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Conversion Therapy */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Conversion Therapy Regulation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge 
                    variant={country.lgbti_conversion_therapy_regulation?.toLowerCase().includes('banned') || 
                             country.lgbti_conversion_therapy_regulation?.toLowerCase().includes('restricted') ? 'default' : 'secondary'}
                  >
                    {country.lgbti_conversion_therapy_regulation || 'No regulation'}
                  </Badge>
                </CardContent>
              </Card>

              {/* Legal Gender Recognition */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Legal Gender Recognition
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {country.lgbti_gender_recognition ? (
                    <div className="space-y-3">
                      {Object.entries(country.lgbti_gender_recognition).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {String(value)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No legal gender recognition data available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Data Last Updated */}
              {country.lgbti_data_last_updated && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center text-sm text-muted-foreground">
                      LGBTI data last updated: {new Date(country.lgbti_data_last_updated).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}