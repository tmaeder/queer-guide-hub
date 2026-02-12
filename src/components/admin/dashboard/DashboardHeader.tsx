import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Box, Typography, Container } from "@mui/material";
import {
  Shield,
  RefreshCw,
  Settings,
  Bell,
  Filter,
  Grid3X3,
  List
} from "lucide-react";

interface DashboardHeaderProps {
  isAdmin: boolean;
  isModerator: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  filterPeriod: string;
  onFilterPeriodChange: (value: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onRefresh: () => void;
  lastUpdate?: Date;
}

export function DashboardHeader({
  isAdmin,
  isModerator,
  autoRefresh,
  onAutoRefreshChange,
  filterPeriod,
  onFilterPeriodChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  lastUpdate
}: DashboardHeaderProps) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 40 }}>
      <Container maxWidth={false} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, bgcolor: 'primary.main', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Shield style={{ height: 24, width: 24, color: 'white' }} />
              </Box>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'text.primary' }}>Admin Dashboard</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Monitor and manage your platform
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, mt: 1.5 }}>
              <Badge variant={isAdmin ? "default" : "secondary"} sx={{ fontWeight: 500 }}>
                {isAdmin ? "Administrator" : isModerator ? "Moderator" : "Staff"}
              </Badge>
              {lastUpdate && (
                <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Time Period Filter */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Filter style={{ height: 16, width: 16, color: 'rgba(0, 0, 0, 0.6)' }} />
              <Select value={filterPeriod} onValueChange={onFilterPeriodChange}>
                <SelectTrigger sx={{ width: 128 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </Box>

            {/* View Mode Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: 1, borderColor: 'divider', borderRadius: 2, p: 0.5 }}>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('grid')}
                sx={{ height: 28, width: 28, p: 0, minWidth: 28 }}
              >
                <Grid3X3 style={{ height: 16, width: 16 }} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('list')}
                sx={{ height: 28, width: 28, p: 0, minWidth: 28 }}
              >
                <List style={{ height: 16, width: 16 }} />
              </Button>
            </Box>

            {/* Auto Refresh Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={onAutoRefreshChange}
              />
              <Label htmlFor="auto-refresh" sx={{ fontSize: 14 }}>
                Auto-refresh
              </Label>
            </Box>

            {/* Manual Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              sx={{ gap: 1 }}
            >
              <RefreshCw style={{ height: 16, width: 16 }} />
              Refresh
            </Button>

            {/* Settings */}
            <Button variant="outline" size="sm">
              <Settings style={{ height: 16, width: 16 }} />
            </Button>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}