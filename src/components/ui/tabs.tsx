import * as React from 'react';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import { motion } from 'motion/react';
import { tweens } from '@/lib/motion';

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: '', onValueChange: () => {} });

interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      defaultValue = '',
      value: controlledValue,
      onValueChange,
      className,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;
    const handleChange = (newValue: string) => {
      if (!isControlled) setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
        <div ref={ref} className={className} style={style} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = 'Tabs';

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Layout variant. Defaults to 'scrollable' (for tab sets that may
   * overflow). Pass 'fullWidth' for fixed tab sets inside dialogs — this
   * guarantees tab hitboxes match their visual position across resize /
   * scroll (avoids MUI's scrollable inner-scroller offset).
   */
  variant?: 'fullWidth' | 'standard' | 'scrollable';
}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, variant = 'scrollable', ..._props }, ref) => {
    const { value, onValueChange } = React.useContext(TabsContext);
    return (
      <MuiTabs
        ref={ref as React.Ref<HTMLDivElement>}
        value={value}
        onChange={(_, newValue) => onValueChange(newValue)}
        className={className}
        variant={variant}
        scrollButtons={variant === 'scrollable' ? 'auto' : false}
        sx={{
          minHeight: 40,
          bgcolor: 'action.hover',
          borderRadius: 1.25,
          p: 0.5,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTabs-flexContainer': { gap: 0.5 },
          '& .MuiTab-root': {
            minHeight: 32,
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            color: 'text.secondary',
            '&.Mui-selected': { bgcolor: 'background.paper', color: 'text.primary' },
          },
        }}
      >
        {children}
      </MuiTabs>
    );
  },
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, disabled, id, ...props }, ref) => (
    <MuiTab
      ref={ref as React.Ref<HTMLDivElement>}
      value={value}
      label={children}
      disabled={disabled}
      className={className}
      id={id ?? `tab-${value}`}
      aria-controls={`tabpanel-${value}`}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, style, ...props }, ref) => {
    const { value: activeValue } = React.useContext(TabsContext);
    const active = value === activeValue;
    // Opacity-only transition, no y-translate, no AnimatePresence exit:
    // a translating exit panel would linger briefly and intercept clicks on
    // the tab bar. Tab switches are semantically instant.
    if (!active) return null;
    return (
      <motion.div
        ref={ref}
        key={value}
        className={className}
        style={{ marginTop: 8, ...style }}
        role="tabpanel"
        aria-labelledby={`tab-${value}`}
        id={`tabpanel-${value}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={tweens.fast}
        {...(props as object)}
      >
        {children}
      </motion.div>
    );
  },
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
