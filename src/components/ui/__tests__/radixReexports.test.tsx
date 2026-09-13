/**
 * The shadcn primitives that this repo re-exports unchanged are imported BY
 * NAME (`import { Root as Dialog }`) rather than aliased off the namespace
 * (`const Dialog = DialogPrimitive.Root`), so react-refresh can see they
 * originate in another module and the file keeps fast refresh.
 *
 * That rewrite moved the mapping from a member expression into an import
 * specifier, where a wrong name — `Overlay as DialogClose` — still typechecks
 * and still builds, and only fails when a user clicks the thing. Nothing else
 * in the tree can catch that, so the mapping is asserted directly here.
 *
 * Mutation-tested: `Close as DialogClose` → `Overlay as DialogClose` in
 * dialog.tsx fails this file.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as AccordionPrim from '@radix-ui/react-accordion';
import * as AlertDialogPrim from '@radix-ui/react-alert-dialog';
import * as DialogPrim from '@radix-ui/react-dialog';
import * as DropdownPrim from '@radix-ui/react-dropdown-menu';
import * as HoverCardPrim from '@radix-ui/react-hover-card';
import * as PopoverPrim from '@radix-ui/react-popover';
import * as SelectPrim from '@radix-ui/react-select';
import * as TabsPrim from '@radix-ui/react-tabs';
import * as TooltipPrim from '@radix-ui/react-tooltip';

import { Accordion } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogTrigger, AlertDialogPortal } from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Select, SelectGroup, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

describe('re-exported radix primitives are the same values', () => {
  it('identity holds for every rewritten export', () => {
    const pairs: Array<[string, unknown, unknown]> = [
      ['Accordion', Accordion, AccordionPrim.Root],
      ['AlertDialog', AlertDialog, AlertDialogPrim.Root],
      ['AlertDialogTrigger', AlertDialogTrigger, AlertDialogPrim.Trigger],
      ['AlertDialogPortal', AlertDialogPortal, AlertDialogPrim.Portal],
      ['Dialog', Dialog, DialogPrim.Root],
      ['DialogTrigger', DialogTrigger, DialogPrim.Trigger],
      ['DialogPortal', DialogPortal, DialogPrim.Portal],
      ['DialogClose', DialogClose, DialogPrim.Close],
      ['DropdownMenu', DropdownMenu, DropdownPrim.Root],
      ['DropdownMenuTrigger', DropdownMenuTrigger, DropdownPrim.Trigger],
      ['DropdownMenuGroup', DropdownMenuGroup, DropdownPrim.Group],
      ['DropdownMenuPortal', DropdownMenuPortal, DropdownPrim.Portal],
      ['DropdownMenuSub', DropdownMenuSub, DropdownPrim.Sub],
      ['DropdownMenuRadioGroup', DropdownMenuRadioGroup, DropdownPrim.RadioGroup],
      ['HoverCard', HoverCard, HoverCardPrim.Root],
      ['HoverCardTrigger', HoverCardTrigger, HoverCardPrim.Trigger],
      ['Popover', Popover, PopoverPrim.Root],
      ['PopoverTrigger', PopoverTrigger, PopoverPrim.Trigger],
      ['PopoverAnchor', PopoverAnchor, PopoverPrim.Anchor],
      ['Select', Select, SelectPrim.Root],
      ['SelectGroup', SelectGroup, SelectPrim.Group],
      ['SelectValue', SelectValue, SelectPrim.Value],
      ['Tabs', Tabs, TabsPrim.Root],
      ['Tooltip', Tooltip, TooltipPrim.Root],
      ['TooltipTrigger', TooltipTrigger, TooltipPrim.Trigger],
      ['TooltipProvider', TooltipProvider, TooltipPrim.Provider],
    ];
    expect(pairs).toHaveLength(26);
    for (const [name, got, want] of pairs) {
      expect(got, name).toBeDefined();
      expect(got, name).toBe(want);
    }
  });

  it('a dialog still opens and renders through the re-exported portal', async () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Hello dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(await screen.findByText('Hello dialog')).toBeInTheDocument();
  });

  it('tabs still switch through the re-exported root', () => {
    render(
      <Tabs defaultValue="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel-a</TabsContent>
        <TabsContent value="b">panel-b</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('panel-b')).toBeInTheDocument();
    expect(screen.queryByText('panel-a')).toBeNull();
  });
});
