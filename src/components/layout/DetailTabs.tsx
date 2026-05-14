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
      <div className="sticky top-16 z-10 -mx-4 px-4 py-2 backdrop-blur-md bg-background/80 supports-[backdrop-filter]:bg-background/70 border-b border-border/60 sm:-mx-6 sm:px-6">
        <TabsList className="w-full overflow-x-auto">
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
