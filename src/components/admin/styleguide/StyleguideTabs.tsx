import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RowEditorDialog, type FieldSpec } from './RowEditorDialog';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  CATEGORY_LABELS,
  SCENARIO_LABELS,
  useStyleguideAdmin,
  type StyleguideExample,
  type StyleguideRule,
  type StyleguideTerm,
} from '@/hooks/useStyleguide';

/**
 * The three editing tabs.
 *
 * Inactive rows are shown, greyed, rather than hidden: retiring a rule is the
 * normal way to remove one (delete is there but is not the habit we want),
 * and a retired rule you cannot see is a rule somebody re-adds in six months.
 */

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const SEVERITY_RULE = [
  { value: 'must', label: 'Must — binding, kept in every prompt profile' },
  { value: 'never', label: 'Never — prohibition, kept in every prompt profile' },
  { value: 'should', label: 'Should — preference, dropped from the compact profile' },
];

const SEVERITY_TERM = [
  { value: 'never', label: 'Never — not in our voice at all' },
  { value: 'avoid', label: 'Avoid — use the replacement unless there is a reason not to' },
  { value: 'context', label: 'Depends — correct in some contexts, wrong in others' },
];

const RULE_FIELDS: FieldSpec[] = [
  {
    key: 'slug',
    label: 'Slug',
    kind: 'text',
    required: true,
    hint: 'lowercase-with-hyphens; permanent handle for this rule',
  },
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    required: true,
    hint: 'The rule in one line, as you would say it out loud',
  },
  {
    key: 'section',
    label: 'Section',
    kind: 'select',
    options: SECTION_ORDER.map((s) => ({ value: s, label: SECTION_LABELS[s] })),
  },
  { key: 'severity', label: 'Severity', kind: 'select', options: SEVERITY_RULE },
  {
    key: 'body',
    label: 'Rule',
    kind: 'textarea',
    rows: 5,
    required: true,
    hint: 'What to do. Specific enough to act on.',
  },
  {
    key: 'rationale',
    label: 'Why',
    kind: 'textarea',
    rows: 3,
    hint: 'Shown to readers on /styleguide. This is what lets someone apply the rule to a case you did not list.',
  },
  {
    key: 'applies_to',
    label: 'Applies to',
    kind: 'list',
    required: true,
    hint: 'Comma-separated scopes. Leave as "all" unless the rule really only governs one surface.',
  },
  { key: 'sort_order', label: 'Order', kind: 'number' },
  { key: 'is_active', label: 'Active', kind: 'switch' },
];

const TERM_FIELDS: FieldSpec[] = [
  { key: 'slug', label: 'Slug', kind: 'text', required: true, hint: 'lowercase-with-hyphens' },
  {
    key: 'avoid',
    label: 'Do not write',
    kind: 'list',
    required: true,
    hint: 'Comma-separated. Include every spelling that appears in the wild.',
  },
  {
    key: 'preferred',
    label: 'Write instead',
    kind: 'text',
    hint: 'Leave empty when there is no swap and the sentence has to be rewritten — that is a valid entry, as long as you give a reason.',
  },
  { key: 'category', label: 'Category', kind: 'select', options: options(CATEGORY_LABELS) },
  { key: 'severity', label: 'Severity', kind: 'select', options: SEVERITY_TERM },
  {
    key: 'rationale',
    label: 'Why',
    kind: 'textarea',
    rows: 3,
    hint: 'Required if there is no replacement.',
  },
  {
    key: 'context_note',
    label: 'When it is fine',
    kind: 'textarea',
    rows: 2,
    hint: 'Quotations, statute names, a community’s own name for itself.',
  },
  { key: 'sort_order', label: 'Order', kind: 'number' },
  { key: 'is_active', label: 'Active', kind: 'switch' },
];

const EXAMPLE_FIELDS: FieldSpec[] = [
  { key: 'slug', label: 'Slug', kind: 'text', required: true },
  { key: 'title', label: 'Title', kind: 'text', required: true },
  { key: 'scenario', label: 'Scenario', kind: 'select', options: options(SCENARIO_LABELS) },
  {
    key: 'before_text',
    label: 'Before',
    kind: 'textarea',
    rows: 6,
    required: true,
    hint: 'Real text that was actually published or actually came out of a pipeline.',
  },
  { key: 'after_text', label: 'After', kind: 'textarea', rows: 8, required: true },
  {
    key: 'note',
    label: 'What changed',
    kind: 'textarea',
    rows: 4,
    hint: 'Which rules the rewrite applies. Examples are the most expensive part of the prompt; the note is what earns that.',
  },
  { key: 'sort_order', label: 'Order', kind: 'number' },
  { key: 'is_active', label: 'Active', kind: 'switch' },
];

const NEW_RULE = {
  section: 'persona',
  severity: 'must',
  applies_to: ['all'],
  sort_order: 100,
  is_active: true,
};
const NEW_TERM = {
  category: 'general',
  severity: 'avoid',
  avoid: [],
  sort_order: 100,
  is_active: true,
};
const NEW_EXAMPLE = { scenario: 'generic', sort_order: 100, is_active: true };

type Table = 'styleguide_rules' | 'styleguide_terms' | 'styleguide_examples';

function useRowActions(table: Table) {
  const { upsert, remove } = useStyleguideAdmin();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const save = async (row: Record<string, unknown>) => {
    await upsert.mutateAsync({ table, row });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ table, id: deleting });
      toast.success('Deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
    setDeleting(null);
  };

  return {
    editing,
    setEditing,
    deleting,
    setDeleting,
    save,
    confirmDelete,
    saving: upsert.isPending,
  };
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function DeleteConfirm({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            Published versions keep their own copy, so this does not change any prompt already in
            use. If you only want it to stop applying, turn it inactive instead — a retired entry
            stays visible here and stops somebody re-adding it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RulesTab({ rules }: { rules: StyleguideRule[] }) {
  const a = useRowActions('styleguide_rules');

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => a.setEditing({ ...NEW_RULE })}>
          <Plus className="mr-2 size-4" /> New rule
        </Button>
      </div>

      {SECTION_ORDER.filter((s) => rules.some((r) => r.section === s)).map((section) => (
        <section key={section} className="mb-8">
          <h3 className="mb-2 text-title font-bold">{SECTION_LABELS[section]}</h3>
          {rules
            .filter((r) => r.section === section)
            .map((rule) => (
              <Card key={rule.id} className={rule.is_active ? 'mb-2' : 'mb-2 opacity-50'}>
                <CardContent className="flex items-start gap-4 pt-6">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={rule.severity === 'never' ? 'destructive' : 'outline'}>
                        {rule.severity}
                      </Badge>
                      <span className="font-bold">{rule.title}</span>
                      {!rule.is_active ? <Badge variant="outline">retired</Badge> : null}
                    </div>
                    <p className="text-13 text-muted-foreground">{rule.body}</p>
                  </div>
                  <RowActions
                    onEdit={() => a.setEditing({ ...rule })}
                    onDelete={() => a.setDeleting(rule.id)}
                  />
                </CardContent>
              </Card>
            ))}
        </section>
      ))}

      <RowEditorDialog
        key={String(a.editing?.id ?? 'new')}
        open={a.editing !== null}
        onOpenChange={(o) => !o && a.setEditing(null)}
        title={a.editing?.id ? 'Edit rule' : 'New rule'}
        description="Write the rule the way you would say it to a new contributor."
        fields={RULE_FIELDS}
        value={a.editing ?? {}}
        saving={a.saving}
        onSave={a.save}
      />
      <DeleteConfirm
        open={a.deleting !== null}
        onCancel={() => a.setDeleting(null)}
        onConfirm={a.confirmDelete}
      />
    </div>
  );
}

export function TermsTab({ terms }: { terms: StyleguideTerm[] }) {
  const a = useRowActions('styleguide_terms');
  const categories = [...new Set(terms.map((t) => t.category))];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => a.setEditing({ ...NEW_TERM })}>
          <Plus className="mr-2 size-4" /> New term
        </Button>
      </div>

      {categories.map((category) => (
        <section key={category} className="mb-8">
          <h3 className="mb-2 text-title font-bold">{CATEGORY_LABELS[category] ?? category}</h3>
          {terms
            .filter((t) => t.category === category)
            .map((term) => (
              <div
                key={term.id}
                className={`flex items-start gap-4 border-b border-border-hairline py-4 ${
                  term.is_active ? '' : 'opacity-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge variant={term.severity === 'never' ? 'destructive' : 'outline'}>
                      {term.severity}
                    </Badge>
                    <span className="text-muted-foreground line-through">
                      {term.avoid.join(', ')}
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                    <span className="font-bold">{term.preferred ?? 'rewrite the sentence'}</span>
                  </div>
                  {term.rationale ? (
                    <p className="mt-2 text-13 text-muted-foreground">{term.rationale}</p>
                  ) : null}
                </div>
                <RowActions
                  onEdit={() => a.setEditing({ ...term })}
                  onDelete={() => a.setDeleting(term.id)}
                />
              </div>
            ))}
        </section>
      ))}

      <RowEditorDialog
        key={String(a.editing?.id ?? 'new')}
        open={a.editing !== null}
        onOpenChange={(o) => !o && a.setEditing(null)}
        title={a.editing?.id ? 'Edit term' : 'New term'}
        description="What we do not write, what we write instead, and why."
        fields={TERM_FIELDS}
        value={a.editing ?? {}}
        saving={a.saving}
        onSave={a.save}
      />
      <DeleteConfirm
        open={a.deleting !== null}
        onCancel={() => a.setDeleting(null)}
        onConfirm={a.confirmDelete}
      />
    </div>
  );
}

export function ExamplesTab({ examples }: { examples: StyleguideExample[] }) {
  const a = useRowActions('styleguide_examples');

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => a.setEditing({ ...NEW_EXAMPLE })}>
          <Plus className="mr-2 size-4" /> New example
        </Button>
      </div>

      {examples.map((example) => (
        <Card key={example.id} className={example.is_active ? 'mb-4' : 'mb-4 opacity-50'}>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <Badge variant="outline" className="mb-2">
                  {SCENARIO_LABELS[example.scenario] ?? example.scenario}
                </Badge>
                <h3 className="text-title font-bold">{example.title}</h3>
              </div>
              <RowActions
                onEdit={() => a.setEditing({ ...example })}
                onDelete={() => a.setDeleting(example.id)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                  Before
                </p>
                <p className="whitespace-pre-line text-13 text-muted-foreground">
                  {example.before_text}
                </p>
              </div>
              <div>
                <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                  After
                </p>
                <p className="whitespace-pre-line text-13">{example.after_text}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <RowEditorDialog
        key={String(a.editing?.id ?? 'new')}
        open={a.editing !== null}
        onOpenChange={(o) => !o && a.setEditing(null)}
        title={a.editing?.id ? 'Edit example' : 'New example'}
        description="A real before, a rewrite that changes one class of thing, and a note saying which rule it applies."
        fields={EXAMPLE_FIELDS}
        value={a.editing ?? {}}
        saving={a.saving}
        onSave={a.save}
      />
      <DeleteConfirm
        open={a.deleting !== null}
        onCancel={() => a.setDeleting(null)}
        onConfirm={a.confirmDelete}
      />
    </div>
  );
}
