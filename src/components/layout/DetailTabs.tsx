import React from 'react';
import Box from '@mui/material/Box';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LucideIcon } from 'lucide-react';

interface TabDef {
  value: string;
  label: string;
  icon?: LucideIcon;
}

interface DetailTabsProps {
  tabs: TabDef[];
  defaultValue?: string;
  children: React.ReactNode;
}

export function DetailTabs({ tabs, defaultValue, children }: DetailTabsProps) {
  const initial = defaultValue || tabs[0]?.value || '';
  return (
    <Tabs defaultValue={initial}>
      <Box sx={{ position: 'sticky', top: 64, zIndex: 10, bgcolor: 'background.default', py: 1 }}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {tab.icon && <tab.icon style={{ width: 14, height: 14 }} />}
                {tab.label}
              </Box>
            </TabsTrigger>
          ))}
        </TabsList>
      </Box>
      {children}
    </Tabs>
  );
}
