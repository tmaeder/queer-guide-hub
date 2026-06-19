import { useEffect, useState } from 'react';
import { Copy, Check, ThumbsUp } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildRoadmapPrompt,
  roadmapColumns,
  type RoadmapItem,
  type RoadmapStage,
} from '@/hooks/useRoadmap';

interface Props {
  open: boolean;
  item: RoadmapItem | null;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onSetStage: (stage: RoadmapStage) => void;
}

const EFFORTS = ['S', 'M', 'L'] as const;
const IMPACTS = ['low', 'med', 'high'] as const;

export function RoadmapItemDrawer({ open, item, onClose, onSave, onSetStage }: Props) {
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [criteria, setCriteria] = useState('');
  const [areas, setAreas] = useState('');
  const [effort, setEffort] = useState<string>('');
  const [impact, setImpact] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item) return;
    // Effect synchronizes local form state with the selected item (external prop).
    // React Compiler can't infer the sync direction — documented exemption, matches
    // FeedbackDetailDrawer's pattern.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(item.title);
    setProblem(item.problem ?? '');
    setSolution(item.proposed_solution ?? '');
    setCriteria((item.acceptance_criteria ?? []).join('\n'));
    setAreas(item.affected_areas ?? '');
    setEffort(item.effort ?? '');
    setImpact(item.impact ?? '');
    setPrompt(item.handoff_prompt ?? '');
    setCopied(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [item]);

  if (!item) return null;

  const acceptanceList = criteria
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const save = () =>
    onSave({
      title: title.trim() || 'Untitled idea',
      problem,
      proposed_solution: solution,
      acceptance_criteria: acceptanceList,
      affected_areas: areas,
      effort: effort || null,
      impact: impact || null,
    });

  const generate = () => {
    const text = buildRoadmapPrompt({
      ...item,
      title: title.trim() || item.title,
      problem,
      proposed_solution: solution,
      acceptance_criteria: acceptanceList,
      affected_areas: areas,
      effort: (effort || null) as RoadmapItem['effort'],
      impact: (impact || null) as RoadmapItem['impact'],
    });
    setPrompt(text);
    // Persist the prompt and move the item to handed_off.
    onSave({
      title: title.trim() || 'Untitled idea',
      problem,
      proposed_solution: solution,
      acceptance_criteria: acceptanceList,
      affected_areas: areas,
      effort: effort || null,
      impact: impact || null,
      handoff_prompt: text,
      stage: 'handed_off',
    });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[600px] md:max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Roadmap item
            <Badge variant="secondary" className="gap-1">
              <ThumbsUp className="h-3 w-3" />
              {item.vote_rollup}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} />
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={item.stage} onValueChange={(v) => onSetStage(v as RoadmapStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roadmapColumns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Effort</Label>
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {EFFORTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Impact</Label>
              <Select value={impact} onValueChange={setImpact}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {IMPACTS.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Problem</Label>
            <Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} onBlur={save} />
          </div>

          <div className="space-y-2">
            <Label>Proposed solution</Label>
            <Textarea rows={3} value={solution} onChange={(e) => setSolution(e.target.value)} onBlur={save} />
          </div>

          <div className="space-y-2">
            <Label>Acceptance criteria (one per line)</Label>
            <Textarea
              rows={4}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              onBlur={save}
            />
          </div>

          <div className="space-y-2">
            <Label>Affected areas</Label>
            <Input value={areas} onChange={(e) => setAreas(e.target.value)} onBlur={save} />
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Claude Code prompt</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={generate}>
                  Generate
                </Button>
                <Button size="sm" variant="outline" onClick={copy} disabled={!prompt}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>
            <Textarea
              rows={10}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Click Generate to compose a ready-to-paste prompt from the fields above."
              className="font-mono text-xs"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
