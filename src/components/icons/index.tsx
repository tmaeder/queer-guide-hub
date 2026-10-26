/**
 * The site's icon components — every one a custom Icon System v2 drawing.
 *
 * This module replaced `lucide-react` wholesale. It keeps lucide's export
 * NAMES so ~785 call sites moved by changing one import path, but nothing here
 * draws a lucide glyph: each name resolves to a slug in
 * `components/transit/iconDefs.ts`, and several names share one drawing
 * (`CheckCircle`, `CircleCheck` and `BadgeCheck` are all `success`).
 *
 * Size comes from the caller the way it did under lucide — the `size` prop, a
 * Tailwind `h-N`/`size-N` class, or an inline width — and is then bumped by
 * `displaySize()`, so the whole product steps up one size from one place.
 * `fill="none"` (or `style.fill: none`, or `hollow`) draws the outline only:
 * the "off" half of a heart or star toggle.
 *
 * Add a name by adding a line to the map below; draw a new glyph in
 * `transit/defs/`. Importing `lucide-react` is an ESLint error.
 */
import { forwardRef, type CSSProperties, type ForwardRefExoticComponent, type RefAttributes, type SVGProps } from 'react';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { displaySize } from '@/components/transit/iconKit';
import type { TransitIconName } from '@/components/transit/transitIconPaths';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'name'> {
  size?: number | string;
  /** Accepted for call-site compatibility and ignored: v2 strokes are set by size. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  /** Outline only, no track colour — the "off" state of a toggle icon. */
  hollow?: boolean;
}

export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

/** The v2 drawing an icon component resolves to — lets a plate redraw the same glyph large. */
export const iconSlug = (icon: unknown): TransitIconName | undefined =>
  (icon as { slug?: TransitIconName } | null)?.slug;
/** Kept under the old names so typed props (`icon: LucideIcon`) did not have to move. */
export type LucideIcon = Icon;
export type LucideProps = IconProps;

/** Tailwind spacing unit → px for the size classes icons are written with. */
function classSize(className?: string): number | null | 'css' {
  if (!className) return null;
  for (const token of className.split(/\s+/)) {
    const m = token.match(/^(?:size|h|w)-(?:(\d+(?:\.5)?)|\[(\d+(?:\.\d+)?)px\]|(.+))$/);
    if (!m) continue;
    if (m[1]) return Number(m[1]) * 4;
    if (m[2]) return Number(m[2]);
    return 'css'; // h-full, size-auto, h-[1em] …: the stylesheet owns the size
  }
  return null;
}

/**
 * Lucide drew these as outlines and call sites filled them with a `fill-*` class
 * to mean "on" (liked, starred, saved). A v2 drawing is filled by default, so for
 * these the old convention is kept: no fill class means the hollow "off" state.
 */
const TOGGLE_SLUGS = new Set<TransitIconName>(['saved', 'star', 'bookmark', 'thumbs-up', 'thumbs-down']);
const hasFillClass = (className?: string) => /(^|\s)(?:[a-z-]+:)*fill-(?!none\b)/.test(className ?? '');

export function iconFor(slug: TransitIconName, displayName: string): Icon {
  // `data-icon="chevron-right"`: a stable hook for tests and selectors, named after
  // the export so a test reads the same name the call site imports.
  const kebab = displayName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();
  const C = forwardRef<SVGSVGElement, IconProps>(function IconComponent(
    { size, strokeWidth: _sw, absoluteStrokeWidth: _asw, hollow, fill, color, style, className, 'aria-label': ariaLabel, ...rest },
    ref,
  ) {
    const fromClass = classSize(className);
    const styleW = typeof style?.width === 'number' ? style.width : null;
    const px = styleW ?? (typeof fromClass === 'number' ? fromClass : Number(size ?? 24) || 24);
    const off =
      hollow ??
      (fill === 'none' ||
        style?.fill === 'none' ||
        (TOGGLE_SLUGS.has(slug) && !hasFillClass(className) && (fill == null || fill === 'none')));
    const shown = displaySize(px);
    // lucide's `color` tinted the stroke. Here it tints the outline (via
    // currentColor) — passing it to TransitIcon would switch to the
    // single-colour map-pin rendition and skip the size bump.
    const tint = color ? { color } : null;
    const sized: CSSProperties | undefined =
      fromClass === 'css' ? { ...style, ...tint } : { ...style, ...tint, width: shown, height: shown, flexShrink: 0 };
    return (
      <TransitIcon
        ref={ref}
        name={slug}
        size={px}
        label={ariaLabel}
        hollow={off}
        data-icon={kebab}
        className={className}
        style={sized}
        {...rest}
      />
    );
  });
  C.displayName = displayName;
  (C as unknown as { slug: TransitIconName }).slug = slug;
  return C;
}

export const Accessibility = iconFor('accessibility', 'Accessibility');
export const Activity = iconFor('chart', 'Activity');
export const AirVent = iconFor('wind', 'AirVent');
export const AlarmClock = iconFor('hours', 'AlarmClock');
export const AlertCircle = iconFor('error', 'AlertCircle');
export const AlertOctagon = iconFor('error', 'AlertOctagon');
export const AlertTriangle = iconFor('warning', 'AlertTriangle');
export const AlignCenter = iconFor('align-center', 'AlignCenter');
export const AlignLeft = iconFor('align-left', 'AlignLeft');
export const AlignRight = iconFor('align-right', 'AlignRight');
export const Archive = iconFor('archive', 'Archive');
export const ArchiveRestore = iconFor('archive', 'ArchiveRestore');
export const ArrowDown = iconFor('arrow-down', 'ArrowDown');
export const ArrowDownRight = iconFor('external', 'ArrowDownRight');
export const ArrowDownToLine = iconFor('download', 'ArrowDownToLine');
export const ArrowDownUp = iconFor('sort', 'ArrowDownUp');
export const ArrowLeft = iconFor('arrow-left', 'ArrowLeft');
export const ArrowLeftRight = iconFor('swap', 'ArrowLeftRight');
export const ArrowRight = iconFor('arrow-right', 'ArrowRight');
export const ArrowRightLeft = iconFor('swap', 'ArrowRightLeft');
export const ArrowUp = iconFor('arrow-up', 'ArrowUp');
export const ArrowUpCircle = iconFor('arrow-up', 'ArrowUpCircle');
export const ArrowUpDown = iconFor('sort', 'ArrowUpDown');
export const ArrowUpFromLine = iconFor('upload', 'ArrowUpFromLine');
export const ArrowUpRight = iconFor('external', 'ArrowUpRight');
export const AtSign = iconFor('mail', 'AtSign');
export const Award = iconFor('award', 'Award');
export const Baby = iconFor('baby', 'Baby');
export const BadgeCheck = iconFor('success', 'BadgeCheck');
export const Ban = iconFor('blocked', 'Ban');
export const Banknote = iconFor('money', 'Banknote');
export const BarChart3 = iconFor('chart', 'BarChart3');
export const Bath = iconFor('shower', 'Bath');
export const Bed = iconFor('housing', 'Bed');
export const BedDouble = iconFor('housing', 'BedDouble');
export const Beer = iconFor('nightlife', 'Beer');
export const Bell = iconFor('alerts', 'Bell');
export const BellOff = iconFor('alerts-off', 'BellOff');
export const BellRing = iconFor('alerts', 'BellRing');
export const Bike = iconFor('bike', 'Bike');
export const Bold = iconFor('bold', 'Bold');
export const BookOpen = iconFor('library', 'BookOpen');
export const Bookmark = iconFor('bookmark', 'Bookmark');
export const BookmarkCheck = iconFor('bookmark', 'BookmarkCheck');
export const BookmarkPlus = iconFor('plus', 'BookmarkPlus');
export const Bot = iconFor('bot', 'Bot');
export const Box = iconFor('box', 'Box');
export const Boxes = iconFor('box', 'Boxes');
export const Briefcase = iconFor('briefcase', 'Briefcase');
export const BriefcaseMedical = iconFor('health', 'BriefcaseMedical');
export const Bug = iconFor('bug', 'Bug');
export const Building = iconFor('building', 'Building');
export const Building2 = iconFor('building', 'Building2');
export const Bus = iconFor('train', 'Bus');
export const BusFront = iconFor('train', 'BusFront');
export const Cake = iconFor('cake', 'Cake');
export const Calendar = iconFor('events', 'Calendar');
export const CalendarCheck = iconFor('success', 'CalendarCheck');
export const CalendarClock = iconFor('events', 'CalendarClock');
export const CalendarCog = iconFor('events', 'CalendarCog');
export const CalendarDays = iconFor('events', 'CalendarDays');
export const CalendarIcon = iconFor('events', 'CalendarIcon');
export const CalendarPlus = iconFor('plus', 'CalendarPlus');
export const CalendarRange = iconFor('events', 'CalendarRange');
export const CalendarX = iconFor('error', 'CalendarX');
export const Camera = iconFor('image', 'Camera');
export const Car = iconFor('car', 'Car');
export const CarFront = iconFor('car', 'CarFront');
export const CarTaxiFront = iconFor('car', 'CarTaxiFront');
export const Check = iconFor('check', 'Check');
export const CheckCheck = iconFor('check', 'CheckCheck');
export const CheckCircle = iconFor('success', 'CheckCircle');
export const CheckCircle2 = iconFor('success', 'CheckCircle2');
export const CheckSquare = iconFor('success', 'CheckSquare');
export const ChefHat = iconFor('restaurant', 'ChefHat');
export const ChevronDown = iconFor('chevron-down', 'ChevronDown');
export const ChevronLeft = iconFor('chevron-left', 'ChevronLeft');
export const ChevronRight = iconFor('chevron-right', 'ChevronRight');
export const ChevronUp = iconFor('chevron-up', 'ChevronUp');
export const ChevronsLeft = iconFor('chevron-left', 'ChevronsLeft');
export const ChevronsRight = iconFor('chevron-right', 'ChevronsRight');
export const ChevronsUpDown = iconFor('sort', 'ChevronsUpDown');
export const CigaretteOff = iconFor('blocked', 'CigaretteOff');
export const Circle = iconFor('dot', 'Circle');
export const CircleAlert = iconFor('error', 'CircleAlert');
export const CircleCheck = iconFor('success', 'CircleCheck');
export const CircleDashed = iconFor('loader', 'CircleDashed');
export const CircleEllipsis = iconFor('more', 'CircleEllipsis');
export const CircleHelp = iconFor('help', 'CircleHelp');
export const CircleSlash2 = iconFor('blocked', 'CircleSlash2');
export const ClipboardCheck = iconFor('success', 'ClipboardCheck');
export const ClipboardCopy = iconFor('copy', 'ClipboardCopy');
export const ClipboardList = iconFor('documents', 'ClipboardList');
export const ClipboardPaste = iconFor('copy', 'ClipboardPaste');
export const Clock = iconFor('hours', 'Clock');
export const Clock3 = iconFor('hours', 'Clock3');
export const Cloud = iconFor('cloud', 'Cloud');
export const CloudDrizzle = iconFor('rain', 'CloudDrizzle');
export const CloudFog = iconFor('cloud', 'CloudFog');
export const CloudLightning = iconFor('storm', 'CloudLightning');
export const CloudRain = iconFor('rain', 'CloudRain');
export const CloudSnow = iconFor('snow', 'CloudSnow');
export const CloudSun = iconFor('cloud', 'CloudSun');
export const Code = iconFor('code', 'Code');
export const Code2 = iconFor('code', 'Code2');
export const Coffee = iconFor('cafe', 'Coffee');
export const Cog = iconFor('settings', 'Cog');
export const Columns = iconFor('grid', 'Columns');
export const Columns2 = iconFor('grid', 'Columns2');
export const Command = iconFor('keyboard', 'Command');
export const Compass = iconFor('compass', 'Compass');
export const ConciergeBell = iconFor('housing', 'ConciergeBell');
export const Cookie = iconFor('cookie', 'Cookie');
export const Copy = iconFor('copy', 'Copy');
export const CopyCheck = iconFor('check', 'CopyCheck');
export const CornerDownLeft = iconFor('sub-item', 'CornerDownLeft');
export const CornerDownRight = iconFor('sub-item', 'CornerDownRight');
export const Crosshair = iconFor('locate', 'Crosshair');
export const Crown = iconFor('crown', 'Crown');
export const Database = iconFor('database', 'Database');
export const Dice5 = iconFor('dice', 'Dice5');
export const Disc3 = iconFor('music', 'Disc3');
export const Dog = iconFor('pet', 'Dog');
export const DollarSign = iconFor('money', 'DollarSign');
export const DoorClosed = iconFor('door', 'DoorClosed');
export const DoorOpen = iconFor('door', 'DoorOpen');
export const Download = iconFor('download', 'Download');
export const Drama = iconFor('theater', 'Drama');
export const Droplet = iconFor('drop', 'Droplet');
export const Droplets = iconFor('drop', 'Droplets');
export const Dumbbell = iconFor('gym', 'Dumbbell');
export const Ear = iconFor('ear', 'Ear');
export const Edit = iconFor('edit', 'Edit');
export const Edit3 = iconFor('edit', 'Edit3');
export const ExternalLink = iconFor('external', 'ExternalLink');
export const Eye = iconFor('eye', 'Eye');
export const EyeOff = iconFor('eye-off', 'EyeOff');
export const File = iconFor('documents', 'File');
export const FileCheck = iconFor('success', 'FileCheck');
export const FilePlus2 = iconFor('plus', 'FilePlus2');
export const FileQuestion = iconFor('documents', 'FileQuestion');
export const FileText = iconFor('documents', 'FileText');
export const FileWarning = iconFor('warning', 'FileWarning');
export const FileX = iconFor('error', 'FileX');
export const Film = iconFor('video', 'Film');
export const Filter = iconFor('filter', 'Filter');
export const Fingerprint = iconFor('identity', 'Fingerprint');
export const Flag = iconFor('flag', 'Flag');
export const Flame = iconFor('flame', 'Flame');
export const FlaskConical = iconFor('test-tube', 'FlaskConical');
export const Flower2 = iconFor('leaf', 'Flower2');
export const Folder = iconFor('documents', 'Folder');
export const FolderOpen = iconFor('documents', 'FolderOpen');
export const FolderPlus = iconFor('plus', 'FolderPlus');
export const Footprints = iconFor('walk', 'Footprints');
export const GanttChart = iconFor('chart', 'GanttChart');
export const Gauge = iconFor('chart', 'Gauge');
export const Gavel = iconFor('landmark', 'Gavel');
export const GitBranch = iconFor('workflow', 'GitBranch');
export const GitCompare = iconFor('compare', 'GitCompare');
export const GitFork = iconFor('workflow', 'GitFork');
export const GitMerge = iconFor('merge', 'GitMerge');
export const Globe = iconFor('globe', 'Globe');
export const Globe2 = iconFor('globe', 'Globe2');
export const GraduationCap = iconFor('education', 'GraduationCap');
export const Grid = iconFor('grid', 'Grid');
export const Grid3X3 = iconFor('grid', 'Grid3X3');
export const GripVertical = iconFor('grip', 'GripVertical');
export const Hand = iconFor('hand', 'Hand');
export const HandHeart = iconFor('care', 'HandHeart');
export const Handshake = iconFor('care', 'Handshake');
export const Hash = iconFor('hash', 'Hash');
export const Heading1 = iconFor('heading-1', 'Heading1');
export const Heading2 = iconFor('heading-2', 'Heading2');
export const Heading3 = iconFor('heading-3', 'Heading3');
export const Heading4 = iconFor('heading-4', 'Heading4');
export const Headphones = iconFor('music', 'Headphones');
export const Heart = iconFor('saved', 'Heart');
export const HeartHandshake = iconFor('care', 'HeartHandshake');
export const HeartPulse = iconFor('health', 'HeartPulse');
export const HelpCircle = iconFor('help', 'HelpCircle');
export const Highlighter = iconFor('highlighter', 'Highlighter');
export const History = iconFor('history', 'History');
export const Home = iconFor('home-base', 'Home');
export const Hotel = iconFor('housing', 'Hotel');
export const IdCard = iconFor('identity', 'IdCard');
export const Image = iconFor('image', 'Image');
export const ImageIcon = iconFor('image', 'ImageIcon');
export const ImageOff = iconFor('image', 'ImageOff');
export const ImagePlus = iconFor('plus', 'ImagePlus');
export const Images = iconFor('image', 'Images');
export const Inbox = iconFor('inbox', 'Inbox');
export const Info = iconFor('info-point', 'Info');
export const Italic = iconFor('italic', 'Italic');
export const Key = iconFor('access-key', 'Key');
export const KeyRound = iconFor('access-key', 'KeyRound');
export const Keyboard = iconFor('keyboard', 'Keyboard');
export const Landmark = iconFor('landmark', 'Landmark');
export const Languages = iconFor('globe', 'Languages');
export const Laugh = iconFor('smile', 'Laugh');
export const Layers = iconFor('layers', 'Layers');
export const LayoutDashboard = iconFor('grid', 'LayoutDashboard');
export const LayoutGrid = iconFor('grid', 'LayoutGrid');
export const LayoutTemplate = iconFor('grid', 'LayoutTemplate');
export const Leaf = iconFor('leaf', 'Leaf');
export const LifeBuoy = iconFor('lifebuoy', 'LifeBuoy');
export const Lightbulb = iconFor('idea', 'Lightbulb');
export const Link = iconFor('link', 'Link');
export const Link2 = iconFor('link', 'Link2');
export const Link2Off = iconFor('unlink', 'Link2Off');
export const List = iconFor('list', 'List');
export const ListOrdered = iconFor('list-ordered', 'ListOrdered');
export const ListPlus = iconFor('plus', 'ListPlus');
export const ListTree = iconFor('workflow', 'ListTree');
export const Loader = iconFor('loader', 'Loader');
export const Loader2 = iconFor('loader', 'Loader2');
export const LocateFixed = iconFor('locate', 'LocateFixed');
export const Lock = iconFor('lock', 'Lock');
export const LockKeyhole = iconFor('lock', 'LockKeyhole');
export const LogIn = iconFor('log-in', 'LogIn');
export const LogOut = iconFor('log-out', 'LogOut');
export const Luggage = iconFor('luggage', 'Luggage');
export const Mail = iconFor('mail', 'Mail');
export const MailCheck = iconFor('success', 'MailCheck');
export const MailX = iconFor('error', 'MailX');
export const Map = iconFor('map', 'Map');
export const MapPin = iconFor('pin', 'MapPin');
export const MapPinned = iconFor('pin', 'MapPinned');
export const Martini = iconFor('nightlife', 'Martini');
export const Maximize = iconFor('zoom-in', 'Maximize');
export const Maximize2 = iconFor('zoom-in', 'Maximize2');
export const Megaphone = iconFor('megaphone', 'Megaphone');
export const Meh = iconFor('smile', 'Meh');
export const Menu = iconFor('menu', 'Menu');
export const Merge = iconFor('merge', 'Merge');
export const MessageCircle = iconFor('chat', 'MessageCircle');
export const MessageSquare = iconFor('chat', 'MessageSquare');
export const MessageSquareOff = iconFor('blocked', 'MessageSquareOff');
export const MessageSquarePlus = iconFor('plus', 'MessageSquarePlus');
export const MessagesSquare = iconFor('chat', 'MessagesSquare');
export const Mic = iconFor('mic', 'Mic');
export const Mic2 = iconFor('mic', 'Mic2');
export const Microscope = iconFor('test-tube', 'Microscope');
export const Milestone = iconFor('route', 'Milestone');
export const Minus = iconFor('minus', 'Minus');
export const Monitor = iconFor('screen', 'Monitor');
export const Moon = iconFor('moon', 'Moon');
export const MoreHorizontal = iconFor('more', 'MoreHorizontal');
export const MoreVertical = iconFor('more', 'MoreVertical');
export const Mountain = iconFor('outdoor', 'Mountain');
export const MousePointer = iconFor('pointer', 'MousePointer');
export const MousePointerClick = iconFor('pointer', 'MousePointerClick');
export const Move = iconFor('grip', 'Move');
export const Music = iconFor('music', 'Music');
export const Navigation = iconFor('locate', 'Navigation');
export const Navigation2 = iconFor('locate', 'Navigation2');
export const Network = iconFor('workflow', 'Network');
export const Newspaper = iconFor('news', 'Newspaper');
export const NotebookPen = iconFor('documents', 'NotebookPen');
export const Package = iconFor('box', 'Package');
export const Paintbrush = iconFor('palette', 'Paintbrush');
export const Palette = iconFor('palette', 'Palette');
export const Palmtree = iconFor('outdoor', 'Palmtree');
export const PanelLeftClose = iconFor('panel', 'PanelLeftClose');
export const PanelLeftOpen = iconFor('panel', 'PanelLeftOpen');
export const PartyPopper = iconFor('party', 'PartyPopper');
export const Pause = iconFor('pause', 'Pause');
export const PawPrint = iconFor('pet', 'PawPrint');
export const PenLine = iconFor('edit', 'PenLine');
export const PenSquare = iconFor('edit', 'PenSquare');
export const Pencil = iconFor('edit', 'Pencil');
export const PencilLine = iconFor('edit', 'PencilLine');
export const Phone = iconFor('phone', 'Phone');
export const Pill = iconFor('pill', 'Pill');
export const Pin = iconFor('pushpin', 'Pin');
export const PinOff = iconFor('pushpin', 'PinOff');
export const Plane = iconFor('plane', 'Plane');
export const Play = iconFor('play', 'Play');
export const PlayCircle = iconFor('play', 'PlayCircle');
export const Plug = iconFor('plug', 'Plug');
export const PlugZap = iconFor('zap', 'PlugZap');
export const Plus = iconFor('plus', 'Plus');
export const Power = iconFor('plug', 'Power');
export const Presentation = iconFor('chart', 'Presentation');
export const Puzzle = iconFor('box', 'Puzzle');
export const Quote = iconFor('quote', 'Quote');
export const Radio = iconFor('music', 'Radio');
export const Rainbow = iconFor('rainbow', 'Rainbow');
export const Redo2 = iconFor('redo', 'Redo2');
export const RefreshCcw = iconFor('refresh', 'RefreshCcw');
export const RefreshCw = iconFor('refresh', 'RefreshCw');
export const Repeat = iconFor('refresh', 'Repeat');
export const Reply = iconFor('reply', 'Reply');
export const Rocket = iconFor('rocket', 'Rocket');
export const RotateCcw = iconFor('refresh', 'RotateCcw');
export const RotateCw = iconFor('refresh', 'RotateCw');
export const Route = iconFor('route', 'Route');
export const Rows3 = iconFor('list', 'Rows3');
export const Rss = iconFor('news', 'Rss');
export const Save = iconFor('save', 'Save');
export const Scale = iconFor('landmark', 'Scale');
export const ScanLine = iconFor('search', 'ScanLine');
export const ScanSearch = iconFor('search', 'ScanSearch');
export const Scissors = iconFor('salon', 'Scissors');
export const Search = iconFor('search', 'Search');
export const Send = iconFor('send', 'Send');
export const Server = iconFor('database', 'Server');
export const Settings = iconFor('settings', 'Settings');
export const Settings2 = iconFor('settings', 'Settings2');
export const Shapes = iconFor('box', 'Shapes');
export const Share2 = iconFor('share', 'Share2');
export const Shield = iconFor('shield', 'Shield');
export const ShieldAlert = iconFor('shield-alert', 'ShieldAlert');
export const ShieldBan = iconFor('blocked', 'ShieldBan');
export const ShieldCheck = iconFor('shield-check', 'ShieldCheck');
export const ShieldOff = iconFor('shield-alert', 'ShieldOff');
export const ShieldQuestion = iconFor('shield', 'ShieldQuestion');
export const Ship = iconFor('boat', 'Ship');
export const Shirt = iconFor('apparel', 'Shirt');
export const ShoppingBag = iconFor('shop', 'ShoppingBag');
export const ShoppingCart = iconFor('shop', 'ShoppingCart');
export const ShowerHead = iconFor('shower', 'ShowerHead');
export const Shuffle = iconFor('swap', 'Shuffle');
export const Siren = iconFor('warning', 'Siren');
export const SkipForward = iconFor('skip', 'SkipForward');
export const Skull = iconFor('skull', 'Skull');
export const SlidersHorizontal = iconFor('tune', 'SlidersHorizontal');
export const Smartphone = iconFor('phone', 'Smartphone');
export const Smile = iconFor('smile', 'Smile');
export const SmilePlus = iconFor('plus', 'SmilePlus');
export const SortAsc = iconFor('sort', 'SortAsc');
export const Sparkles = iconFor('sparkle', 'Sparkles');
export const SpellCheck = iconFor('success', 'SpellCheck');
export const SquareArrowOutUpRight = iconFor('external', 'SquareArrowOutUpRight');
export const SquareParking = iconFor('parking', 'SquareParking');
export const Star = iconFor('star', 'Star');
export const Stethoscope = iconFor('health', 'Stethoscope');
export const Sticker = iconFor('smile', 'Sticker');
export const StickyNote = iconFor('documents', 'StickyNote');
export const Store = iconFor('shop', 'Store');
export const Strikethrough = iconFor('strikethrough', 'Strikethrough');
export const Sun = iconFor('sun', 'Sun');
export const Sunrise = iconFor('sun', 'Sunrise');
export const Sunset = iconFor('sun', 'Sunset');
export const Syringe = iconFor('syringe', 'Syringe');
export const Table = iconFor('grid', 'Table');
export const Table2 = iconFor('grid', 'Table2');
export const Tag = iconFor('tag', 'Tag');
export const Tags = iconFor('tag', 'Tags');
export const Target = iconFor('target', 'Target');
export const Terminal = iconFor('code', 'Terminal');
export const TestTube = iconFor('test-tube', 'TestTube');
export const TestTubes = iconFor('test-tube', 'TestTubes');
export const Thermometer = iconFor('thermometer', 'Thermometer');
export const ThumbsDown = iconFor('thumbs-down', 'ThumbsDown');
export const ThumbsUp = iconFor('thumbs-up', 'ThumbsUp');
export const Ticket = iconFor('ticket', 'Ticket');
export const Timer = iconFor('hours', 'Timer');
export const Toilet = iconFor('restroom', 'Toilet');
export const Train = iconFor('train', 'Train');
export const TrainFront = iconFor('train', 'TrainFront');
export const TramFront = iconFor('train', 'TramFront');
export const Trash2 = iconFor('trash', 'Trash2');
export const Trees = iconFor('outdoor', 'Trees');
export const TrendingDown = iconFor('trend-down', 'TrendingDown');
export const TrendingUp = iconFor('trend-up', 'TrendingUp');
export const Trophy = iconFor('award', 'Trophy');
export const Tv = iconFor('screen', 'Tv');
export const Underline = iconFor('underline', 'Underline');
export const Undo2 = iconFor('undo', 'Undo2');
export const Unlock = iconFor('unlock', 'Unlock');
export const Unplug = iconFor('unlink', 'Unplug');
export const Upload = iconFor('upload', 'Upload');
export const User = iconFor('profile', 'User');
export const UserCheck = iconFor('profile', 'UserCheck');
export const UserCog = iconFor('profile', 'UserCog');
export const UserMinus = iconFor('user-remove', 'UserMinus');
export const UserPlus = iconFor('user-add', 'UserPlus');
export const UserRound = iconFor('profile', 'UserRound');
export const UserRoundPen = iconFor('profile', 'UserRoundPen');
export const UserX = iconFor('user-remove', 'UserX');
export const Users = iconFor('community', 'Users');
export const UsersRound = iconFor('community', 'UsersRound');
export const Utensils = iconFor('restaurant', 'Utensils');
export const UtensilsCrossed = iconFor('restaurant', 'UtensilsCrossed');
export const Verified = iconFor('success', 'Verified');
export const Video = iconFor('video', 'Video');
export const Volume2 = iconFor('volume', 'Volume2');
export const VolumeX = iconFor('mute', 'VolumeX');
export const Wallet = iconFor('money', 'Wallet');
export const Wand2 = iconFor('sparkle', 'Wand2');
export const WashingMachine = iconFor('laundry', 'WashingMachine');
export const Waves = iconFor('waves', 'Waves');
export const Waypoints = iconFor('route', 'Waypoints');
export const Webhook = iconFor('plug', 'Webhook');
export const Wifi = iconFor('wifi', 'Wifi');
export const WifiOff = iconFor('wifi-off', 'WifiOff');
export const Wind = iconFor('wind', 'Wind');
export const Wine = iconFor('nightlife', 'Wine');
export const Workflow = iconFor('workflow', 'Workflow');
export const Wrench = iconFor('settings', 'Wrench');
export const X = iconFor('close', 'X');
export const XCircle = iconFor('error', 'XCircle');
export const Zap = iconFor('zap', 'Zap');
export const ZoomIn = iconFor('zoom-in', 'ZoomIn');
export const ZoomOut = iconFor('zoom-out', 'ZoomOut');
