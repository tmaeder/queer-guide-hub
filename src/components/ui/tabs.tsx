import * as React from "react"
import MuiTabs from "@mui/material/Tabs"
import MuiTab from "@mui/material/Tab"
import { AnimatePresence, motion } from "motion/react"
import { tweens } from "@/lib/motion"

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => {} });

interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue = "", value: controlledValue, onValueChange, className, children, style, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;
    const handleChange = (newValue: string) => {
      if (!isControlled) setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
        <div ref={ref} className={className} style={style} {...props}>{children}</div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => {
    const { value, onValueChange } = React.useContext(TabsContext);
    return (
      <MuiTabs
        ref={ref as any}
        value={value}
        onChange={(_, newValue) => onValueChange(newValue)}
        className={className}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 40,
          bgcolor: 'action.hover',
          borderRadius: 1.25,
          p: 0.5,
          '& .MuiTabs-indicator': { display: 'none' },
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
  }
);
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, disabled, ...props }, ref) => (
    <MuiTab ref={ref as any} value={value} label={children} disabled={disabled} className={className} {...props} />
  )
);
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, style, ...props }, ref) => {
    const { value: activeValue } = React.useContext(TabsContext);
    const active = value === activeValue;
    return (
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            ref={ref}
            key={value}
            className={className}
            style={{ marginTop: 8, ...style }}
            role="tabpanel"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={tweens.fast}
            {...(props as object)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
