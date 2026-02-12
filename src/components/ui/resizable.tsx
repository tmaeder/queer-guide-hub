import React from "react"
import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

const ResizablePanelGroup = ({
  style,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      ...(props.direction === 'vertical' ? { flexDirection: 'column' as const } : {}),
      ...style,
    }}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  style,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    style={{
      position: 'relative',
      display: 'flex',
      width: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#e5e5e5',
      ...style,
    }}
    {...props}
  >
    {withHandle && (
      <div style={{
        zIndex: 10,
        display: 'flex',
        height: 16,
        width: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        border: '1px solid #e5e5e5',
        backgroundColor: '#f5f5f5',
      }}>
        <GripVertical style={{ height: 10, width: 10 }} />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
