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
      <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-3 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <TabsList className="overflow-x-auto max-w-full no-scrollbar">
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
