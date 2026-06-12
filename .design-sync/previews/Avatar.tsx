import { Avatar, AvatarImage, AvatarFallback } from 'queer-guide';

// Deterministic placeholder portrait (no network in static capture).
const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d4d4d4"/><circle cx="100" cy="78" r="34" fill="#a3a3a3"/><path d="M40 200 Q100 120 160 200 Z" fill="#a3a3a3"/></svg>`,
  );

export const Initials = () => (
  <div className="flex items-center gap-4">
    <Avatar>
      <AvatarFallback>MJ</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>AR</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>KT</AvatarFallback>
    </Avatar>
  </div>
);

export const WithImage = () => (
  <Avatar>
    <AvatarImage src={PORTRAIT} alt="Marsha J., local guide in Berlin" />
    <AvatarFallback>MJ</AvatarFallback>
  </Avatar>
);

export const Sizes = () => (
  <div className="flex items-end gap-4">
    <Avatar className="h-8 w-8">
      <AvatarFallback className="text-xs">SR</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>SR</AvatarFallback>
    </Avatar>
    <Avatar className="h-16 w-16">
      <AvatarFallback className="text-lg">SR</AvatarFallback>
    </Avatar>
  </div>
);

export const ProfileRow = () => (
  <div className="flex w-80 items-center gap-4">
    <Avatar className="h-12 w-12">
      <AvatarFallback>LN</AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <p className="text-15 font-medium text-foreground">Lena N.</p>
      <p className="text-13 text-muted-foreground">Local guide · Amsterdam</p>
    </div>
  </div>
);

export const StackedGroup = () => (
  <div className="flex -space-x-2">
    {['DK', 'PB', 'YO', 'TC'].map((initials) => (
      <Avatar key={initials} className="border-2 border-background">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
    ))}
    <Avatar className="border-2 border-background">
      <AvatarFallback className="text-xs">+8</AvatarFallback>
    </Avatar>
  </div>
);
