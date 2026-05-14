import React from 'react';
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
      <div className="sticky top-16 z-10 bg-background py-2">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <span className="flex items-center gap-1.5">
                {tab.icon && <tab.icon style={{ width: 14, height: 14 }} />}
                {tab.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
