import * as React from "react"
import MuiAccordion from "@mui/material/Accordion"
import MuiAccordionSummary from "@mui/material/AccordionSummary"
import MuiAccordionDetails from "@mui/material/AccordionDetails"
import { ChevronDown } from "lucide-react"

type AccordionType = "single" | "multiple";

interface AccordionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue'> {
  type?: AccordionType;
  collapsible?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
}

const AccordionContext = React.createContext<{
  expanded: string[];
  toggle: (value: string) => void;
}>({ expanded: [], toggle: () => {} });

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ type = "single", collapsible = false, defaultValue, value: controlledValue, onValueChange, className, children, style, ...props }, ref) => {
    const initialValue = defaultValue ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue]) : [];
    const [internalExpanded, setInternalExpanded] = React.useState<string[]>(initialValue);
    const isControlled = controlledValue !== undefined;
    const expanded = isControlled ? (Array.isArray(controlledValue) ? controlledValue : [controlledValue]) : internalExpanded;

    const toggle = (value: string) => {
      let next: string[];
      if (type === "single") {
        next = expanded.includes(value) ? (collapsible ? [] : expanded) : [value];
      } else {
        next = expanded.includes(value) ? expanded.filter((v) => v !== value) : [...expanded, value];
      }
      if (!isControlled) setInternalExpanded(next);
      onValueChange?.(type === "single" ? (next[0] || "") : next);
    };

    return (
      <AccordionContext.Provider value={{ expanded, toggle }}>
        <div ref={ref} className={className} style={style} {...props}>{children}</div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = "Accordion"

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  disabled?: boolean;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, disabled, className, children, style, ...props }, ref) => {
    const { expanded, toggle } = React.useContext(AccordionContext);
    const isExpanded = expanded.includes(value);
    return (
      <MuiAccordion
        ref={ref}
        expanded={isExpanded}
        onChange={() => !disabled && toggle(value)}
        disabled={disabled}
        disableGutters
        elevation={0}
        className={className}
        sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, borderBottom: 1, borderColor: 'divider', ...((style as any) || {}) }}
      >
        {children}
      </MuiAccordion>
    );
  }
);
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.HTMLAttributes<HTMLButtonElement>>(
  ({ className, children, style, ...props }, ref) => (
    <MuiAccordionSummary
      ref={ref as any}
      expandIcon={<ChevronDown style={{ width: 16, height: 16 }} />}
      className={className}
      sx={{
        px: 0,
        fontWeight: 500,
        '&:hover': { textDecoration: 'underline' },
        '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(180deg)' },
      }}
      {...(props as any)}
    >
      {children}
    </MuiAccordionSummary>
  )
);
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <MuiAccordionDetails ref={ref} className={className} sx={{ px: 0, pb: 2, fontSize: '0.875rem' }} style={style} {...(props as any)}>
      {children}
    </MuiAccordionDetails>
  )
);
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
