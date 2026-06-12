import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  Badge,
} from 'queer-guide';

const rows = [
  { country: 'Malta', marriage: 'Legal since 2017', score: 94 },
  { country: 'Iceland', marriage: 'Legal since 2010', score: 93 },
  { country: 'Spain', marriage: 'Legal since 2005', score: 91 },
  { country: 'Canada', marriage: 'Legal since 2005', score: 90 },
  { country: 'Germany', marriage: 'Legal since 2017', score: 87 },
  { country: 'Thailand', marriage: 'Legal since 2025', score: 79 },
];

export const EqualityIndexTable = () => (
  <div className="w-[640px]">
    <Table>
      <TableCaption>Equality Index — top destinations, updated June 2026.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Country</TableHead>
          <TableHead>Marriage equality</TableHead>
          <TableHead style={{ textAlign: 'right' }}>Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.country}>
            <TableCell style={{ fontWeight: 500 }}>{r.country}</TableCell>
            <TableCell>
              <Badge variant="soft">{r.marriage}</Badge>
            </TableCell>
            <TableCell style={{ textAlign: 'right' }}>{r.score}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Average</TableCell>
          <TableCell style={{ textAlign: 'right' }}>89</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  </div>
);

export const VenueHoursTable = () => (
  <div className="w-[560px]">
    <Table>
      <TableCaption>Opening hours — SchwuZ, Berlin-Neukölln.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead>Programme</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>Thursday</TableCell>
          <TableCell>20:00 – 03:00</TableCell>
          <TableCell className="text-muted-foreground">Queer karaoke</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>Friday</TableCell>
          <TableCell>23:00 – 06:00</TableCell>
          <TableCell className="text-muted-foreground">House &amp; pop floors</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>Saturday</TableCell>
          <TableCell>23:00 – 07:00</TableCell>
          <TableCell className="text-muted-foreground">Drag stage night</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>Sunday</TableCell>
          <TableCell>18:00 – 00:00</TableCell>
          <TableCell className="text-muted-foreground">Community bingo</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);
