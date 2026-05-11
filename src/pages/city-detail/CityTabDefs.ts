import {
  Info,
  Shield,
  Building,
  Calendar,
  Plane,
  FileText,
  Map as MapIcon,
} from 'lucide-react';

export const CITY_TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'rights', label: 'Rights', icon: Shield },
  { id: 'venues', label: 'Venues', icon: Building },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'news', label: 'News', icon: FileText },
  { id: 'map', label: 'Map', icon: MapIcon },
];
