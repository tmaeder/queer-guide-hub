import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLOR_GROUP_LABELS, COLOR_TOKENS, type ColorGroup } from './tokenCatalog';
import { TokenColorRow } from './TokenColorRow';
import { TokenPreviewPanel } from './TokenPreviewPanel';
import { MotionSection, RadiusSection, TypographySection } from './TokenSections';
import { FontsSection } from './FontsSection';
import type { DesignSettingsController } from './useDesignSettings';

const GROUP_ORDER: ColorGroup[] = ['core', 'surface', 'text', 'sidebar', 'feedback'];

export function TokensTab({ controller }: { controller: DesignSettingsController }) {
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        {GROUP_ORDER.map((group) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-title">{COLOR_GROUP_LABELS[group]}</CardTitle>
            </CardHeader>
            <CardContent>
              {COLOR_TOKENS.filter((t) => t.group === group).map((token) => (
                <TokenColorRow key={token.key} token={token} controller={controller} />
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Fonts</CardTitle>
          </CardHeader>
          <CardContent>
            <FontsSection controller={controller} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Typography scale</CardTitle>
          </CardHeader>
          <CardContent>
            <TypographySection controller={controller} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Radii</CardTitle>
          </CardHeader>
          <CardContent>
            <RadiusSection controller={controller} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Motion</CardTitle>
          </CardHeader>
          <CardContent>
            <MotionSection controller={controller} />
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-20">
          <TokenPreviewPanel draft={controller.draft} />
        </div>
      </div>
    </div>
  );
}
