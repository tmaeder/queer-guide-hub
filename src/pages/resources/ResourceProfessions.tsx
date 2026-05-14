import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Briefcase } from 'lucide-react';

interface ResourceProfessionsProps {
  professions: string[];
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export function ResourceProfessions({
  professions,
  onBack,
  onNavigate,
}: ResourceProfessionsProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
          Back
        </Button>
        <Briefcase style={{ width: 18, height: 18 }} />
        <h6 className="text-base font-semibold">Professions</h6>
        <Badge variant="secondary">{professions.length}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {professions.map((profession) => (
          <button
            key={profession}
            onClick={() =>
              onNavigate(`/personalities?profession=${encodeURIComponent(profession)}`)
            }
            className="inline-flex items-center px-3.5 py-1.5 rounded-full cursor-pointer bg-background text-inherit border-0 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-all duration-150"
            style={{ minHeight: 36 }}
          >
            <span className="font-medium" style={{ fontSize: '0.8rem' }}>{profession}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
