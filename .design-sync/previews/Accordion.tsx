import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from 'queer-guide';

// Capture harness freezes the clock — the radix open animation
// (animate-accordion-down, height keyframe from 0) would freeze the open
// panel at height 0. Force the settled state.
const AccordionStatic = () => (
  <style>{`[data-state="open"][role="region"]{animation:none!important;height:auto!important}`}</style>
);

export const LocalLawsFaq = () => (
  <div style={{ width: 560 }}>
    <AccordionStatic />
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is same-sex marriage legal in Thailand?</AccordionTrigger>
        <AccordionContent>
          Yes. The Marriage Equality Act took effect in January 2025, making Thailand the
          first country in Southeast Asia to recognize same-sex marriage, including joint
          adoption and inheritance rights.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Do I need to carry ID in Bangkok?</AccordionTrigger>
        <AccordionContent>
          Police can ask foreigners for identification. A photocopy of your passport plus
          your entry stamp is usually accepted for day-to-day checks.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Are public displays of affection safe?</AccordionTrigger>
        <AccordionContent>
          Bangkok and the major islands are broadly welcoming, especially in Silom and
          around queer-owned venues. Rural areas are more conservative — local norms favor
          discretion for all couples.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-4">
        <AccordionTrigger>Can trans travelers update gender markers locally?</AccordionTrigger>
        <AccordionContent>
          No. Thailand does not yet recognize legal gender changes for visitors or
          residents. Carry documents that match your passport for flights and hotels.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
);
