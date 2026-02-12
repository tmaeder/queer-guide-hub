import * as React from "react"
import * as RechartsPrimitive from "recharts"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const CHART_CONTAINER_STYLES = `
[data-chart] .recharts-cartesian-axis-tick text { fill: #999999; }
[data-chart] .recharts-cartesian-grid line[stroke='#ccc'] { stroke: rgba(229,229,229,0.5); }
[data-chart] .recharts-curve.recharts-tooltip-cursor { stroke: #e5e5e5; }
[data-chart] .recharts-dot[stroke='#fff'] { stroke: transparent; }
[data-chart] .recharts-layer { outline: none; }
[data-chart] .recharts-polar-grid [stroke='#ccc'] { stroke: #e5e5e5; }
[data-chart] .recharts-radial-bar-background-sector { fill: #f5f5f5; }
[data-chart] .recharts-rectangle.recharts-tooltip-cursor { fill: #f5f5f5; }
[data-chart] .recharts-reference-line [stroke='#ccc'] { stroke: #e5e5e5; }
[data-chart] .recharts-sector[stroke='#fff'] { stroke: transparent; }
[data-chart] .recharts-sector { outline: none; }
[data-chart] .recharts-surface { outline: none; }
`;

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, style, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <style>{CHART_CONTAINER_STYLES}</style>
      <div
        data-chart={chartId}
        ref={ref}
        style={{
          display: 'flex',
          aspectRatio: '16 / 9',
          justifyContent: 'center',
          fontSize: '0.75rem',
          ...style,
        }}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([_, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  // Create safe CSS content by sanitizing and validating inputs
  const createSafeCSS = (id: string, colorConfig: Array<[string, any]>) => {
    // Sanitize the chart ID to prevent CSS injection
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '');

    return Object.entries(THEMES)
      .map(([theme, prefix]) => {
        const safePrefix = prefix.replace(/[^a-zA-Z0-9-_.\s]/g, '');
        const colorRules = colorConfig
          .map(([key, itemConfig]) => {
            // Sanitize the key
            const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '');
            const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;

            // Validate that color is a safe CSS color value
            if (color && /^#[0-9A-Fa-f]{3,6}$|^rgb\(|^rgba\(|^hsl\(|^hsla\(|^[a-zA-Z]+$/.test(color)) {
              return `  --color-${safeKey}: ${color};`;
            }
            return null;
          })
          .filter(Boolean)
          .join('\n');

        return `${safePrefix} [data-chart="${safeId}"] {\n${colorRules}\n}`;
      })
      .join('\n');
  };

  const safeCSS = createSafeCSS(id, colorConfig);

  // Use ref to safely inject CSS instead of dangerouslySetInnerHTML
  const styleRef = React.useRef<HTMLStyleElement>(null);

  React.useEffect(() => {
    if (styleRef.current) {
      styleRef.current.textContent = safeCSS;
    }
  }, [safeCSS]);

  return <style ref={styleRef} />
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      style,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    const labelStyle: React.CSSProperties = {
      fontWeight: 500,
      ...(labelClassName ? {} : {}),
    }

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div style={labelStyle}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div style={labelStyle}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        style={{
          display: 'grid',
          minWidth: '8rem',
          alignItems: 'start',
          gap: 6,
          backgroundColor: '#ffffff',
          padding: '6px 10px',
          fontSize: '0.75rem',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
          borderRadius: 4,
          border: '1px solid #e5e5e5',
          ...style,
        }}
      >
        {!nestLabel ? tooltipLabel : null}
        <div style={{ display: 'grid', gap: 6 }}>
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color

            const indicatorStyles: React.CSSProperties = (() => {
              const base: React.CSSProperties = {
                flexShrink: 0,
                borderRadius: indicator === "dot" ? '50%' : 2,
              }
              if (indicator === "dot") {
                return { ...base, height: 10, width: 10, backgroundColor: indicatorColor }
              }
              if (indicator === "line") {
                return { ...base, width: 4, height: '100%', backgroundColor: indicatorColor }
              }
              if (indicator === "dashed") {
                return {
                  ...base,
                  width: 0,
                  height: '100%',
                  borderLeft: '1.5px dashed',
                  borderColor: indicatorColor,
                  backgroundColor: 'transparent',
                  ...(nestLabel ? { marginTop: 2, marginBottom: 2 } : {}),
                }
              }
              return base
            })()

            return (
              <div
                key={item.dataKey}
                style={{
                  display: 'flex',
                  width: '100%',
                  flexWrap: 'wrap',
                  alignItems: indicator === "dot" ? 'center' : 'stretch',
                  gap: 8,
                }}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div style={indicatorStyles} />
                      )
                    )}
                    <div
                      style={{
                        display: 'flex',
                        flex: 1,
                        justifyContent: 'space-between',
                        lineHeight: 1,
                        alignItems: nestLabel ? 'flex-end' : 'center',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        {nestLabel ? tooltipLabel : null}
                        <span style={{ color: '#999999' }}>
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                          color: '#333333',
                        }}>
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { style, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref
  ) => {
    const { config } = useChart()

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          ...(verticalAlign === "top" ? { paddingBottom: 12 } : { paddingTop: 12 }),
          ...style,
        }}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  style={{
                    height: 8,
                    width: 8,
                    flexShrink: 0,
                    borderRadius: '50%',
                    backgroundColor: item.color,
                  }}
                />
              )}
              <span style={{ fontSize: '0.75rem', color: '#555555' }}>
                {itemConfig?.label}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
