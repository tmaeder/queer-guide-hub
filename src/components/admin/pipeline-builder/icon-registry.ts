/**
 * Explicit icon registry for the pipeline builder.
 *
 * Pipeline node types store an icon name as a string (in the
 * `pipeline_node_types` table or inline JSON in pipeline definitions).
 * Rendering used to do `import * as Icons from 'lucide-react'` and look
 * up `Icons[d.icon]` at runtime — which forced Rollup to mark every icon
 * in lucide-react as live, ballooning the `lucide` chunk to ~600 KB raw
 * (the entire library) and shipping all of it on initial page load.
 *
 * This registry enumerates every icon currently referenced from a
 * pipeline node definition (sourced from `supabase/migrations/`) plus the
 * fixed set of UI icons BaseNode uses internally. Unknown icon names
 * fall back to `Box` — same behaviour the dynamic lookup had when a
 * string didn't match any export.
 *
 * If you add a new icon to a node type definition (in a migration or via
 * the admin UI), add it here too. The build won't fail without it — the
 * node will just render a Box.
 */
import {
  // BaseNode status icons (referenced via string).
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  // BaseNode chrome (referenced directly).
  Box,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Timer,
  // Icons referenced from pipeline_node_types rows / pipeline JSON.
  Bed,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Copy,
  Database,
  Gauge,
  GitMerge,
  Home,
  Hotel,
  Map,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Ticket,
  Wand2,
  // Reasonable defaults for new node types the admin might add. Cheap to
  // include — each named import is a few hundred bytes.
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bot,
  Bug,
  Cog,
  Download,
  FileText,
  Filter,
  Flag,
  Globe,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  Mail,
  Merge,
  Network,
  Plug,
  Play,
  RefreshCw,
  Rss,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  ShoppingCart,
  Star,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

import type { ComponentType } from 'react';

type IconComponent = ComponentType<{ className?: string }>;

export const pipelineIcons: Record<string, IconComponent> = {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Box,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Timer,
  Bed,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Copy,
  Database,
  Gauge,
  GitMerge,
  Home,
  Hotel,
  Map,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Ticket,
  Wand2,
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bot,
  Bug,
  Cog,
  Download,
  FileText,
  Filter,
  Flag,
  Globe,
  Image: ImageIcon,
  Layers,
  LayoutDashboard,
  Link: LinkIcon,
  Mail,
  Merge,
  Network,
  Plug,
  Play,
  RefreshCw,
  Rss,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  ShoppingCart,
  Star,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  Workflow,
  Zap,
};

export function resolvePipelineIcon(name: string | undefined | null): IconComponent {
  if (!name) return Box;
  return pipelineIcons[name] ?? Box;
}

export { Box, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Timer };
