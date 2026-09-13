import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The editorial micro-guide, shown above the editing tabs.
 *
 * It exists because the people who should own this vocabulary — community
 * editors — are not prompt engineers, and the failure mode of handing them a
 * text box that feeds a language model is that they either write nothing or
 * write instructions to the model. Both produce a worse styleguide than a
 * clear form with four rules in front of it.
 *
 * Deliberately short. A micro-guide nobody reads is the same as no guide.
 */
export function EditorMicroGuide() {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <h2 className="mb-2 text-title font-bold">Writing for this page</h2>
        <p className="mb-4 max-w-prose text-13 text-muted-foreground">
          You are writing a standard for people, not a prompt for a machine. Write the rule the way
          you would say it to a new contributor over coffee. The compiler handles the rest.
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="rules">
            <AccordionTrigger>Adding a rule</AccordionTrigger>
            <AccordionContent>
              <ul className="max-w-prose list-disc space-y-2 pl-6 text-13">
                <li>
                  <span className="font-bold">Say what to do, not what to be.</span> &ldquo;Name the
                  night a venue is busiest&rdquo; is a rule. &ldquo;Be authentic&rdquo; is not —
                  nobody, human or machine, can act on it.
                </li>
                <li>
                  <span className="font-bold">Pick the severity honestly.</span> Must and Never are
                  binding and survive into the cheapest prompt profile. Should is a preference and
                  is dropped when we compile a short version. If everything is a Must, nothing is.
                </li>
                <li>
                  <span className="font-bold">Fill in the reason.</span> The reason is not
                  decoration: it is what lets an editor apply the rule to a case you did not think
                  of, and it is shown to readers on the public page. A rule with no reason gets
                  argued about forever.
                </li>
                <li>
                  <span className="font-bold">Scope it if it is not universal.</span> Leave
                  &ldquo;applies to&rdquo; as <code>all</code> unless the rule genuinely only
                  governs one surface — for example a glossary-only rule about not addressing the
                  reader.
                </li>
                <li>
                  <span className="font-bold">Do not write to the model.</span> Never &ldquo;You are
                  a helpful assistant&rdquo;, never &ldquo;Always respond in JSON&rdquo;, never
                  &ldquo;ignore previous instructions&rdquo;. Those are the job of the code that
                  calls the model, and anything shaped like an instruction to it is stripped before
                  it is sent.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="terms">
            <AccordionTrigger>Adding a term</AccordionTrigger>
            <AccordionContent>
              <ul className="max-w-prose list-disc space-y-2 pl-6 text-13">
                <li>
                  <span className="font-bold">List every spelling in the wild.</span> The
                  &ldquo;avoid&rdquo; list is matched as written, so put the real variants in it:
                  <code>transwoman</code>, <code>trans-woman</code>, <code>a transgender</code>.
                </li>
                <li>
                  <span className="font-bold">
                    Leave &ldquo;preferred&rdquo; empty when there is no swap.
                  </span>{' '}
                  Some phrases do not have a better version — they have a different sentence.
                  &ldquo;Sketchy neighbourhood&rdquo; becomes a sourced risk or it becomes nothing.
                  An empty preferred with a reason is a complete, valid entry.
                </li>
                <li>
                  <span className="font-bold">Never means never in our voice.</span> If a word is
                  fine inside a quotation, a statute name or a community&rsquo;s own name for
                  itself, say so in the context note rather than downgrading the severity.
                </li>
                <li>
                  <span className="font-bold">One concept per entry.</span> Do not bundle unrelated
                  words because they feel similar; they will need different reasons later.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="examples">
            <AccordionTrigger>Adding a before/after example</AccordionTrigger>
            <AccordionContent>
              <ul className="max-w-prose list-disc space-y-2 pl-6 text-13">
                <li>
                  <span className="font-bold">Use a real &ldquo;before&rdquo;.</span> Paste text
                  that actually got published or actually came out of a pipeline. An invented bad
                  example teaches the wrong lesson because it is bad in ways nothing really
                  produces.
                </li>
                <li>
                  <span className="font-bold">Change one class of thing at a time.</span> An example
                  that fixes voice, adds three facts and reorganises the structure demonstrates
                  nothing in particular.
                </li>
                <li>
                  <span className="font-bold">Write the note.</span> Say which rule the rewrite is
                  applying. Examples are the most expensive part of the compiled prompt, and the
                  note is what makes one worth its cost.
                </li>
                <li>
                  <span className="font-bold">Do not invent facts in the &ldquo;after&rdquo;.</span>
                  If your rewrite adds a detail, it has to be a real one — the examples are read as
                  a model of good output, including their factual habits.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="publishing">
            <AccordionTrigger>Publishing, and which number to bump</AccordionTrigger>
            <AccordionContent>
              <div className="max-w-prose space-y-2 text-13">
                <p>
                  Edits are live on this page immediately and reach the public page and the content
                  pipelines only when you publish. That gap is deliberate: it lets you finish a
                  thought before a dozen automated jobs start following it.
                </p>
                <ul className="list-disc space-y-2 pl-6">
                  <li>
                    <span className="font-bold">Patch</span> — you fixed wording, a typo, or added a
                    reason to a rule that already existed.
                  </li>
                  <li>
                    <span className="font-bold">Minor</span> — you added a rule, term or example, or
                    made an existing one less strict.
                  </li>
                  <li>
                    <span className="font-bold">Major</span> — you reversed something. A rule now
                    says the opposite of what it said, or you removed one. This is the signal to
                    whoever integrates with us that output they checked against the old version
                    needs checking again.
                  </li>
                </ul>
                <p>
                  Read the preview before you publish. It is the exact text the models receive, and
                  publishing is how it reaches them.
                </p>
                <p>
                  Nothing here is destructive: every published version is kept, and you can make an
                  older one current again from the Versions tab.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
