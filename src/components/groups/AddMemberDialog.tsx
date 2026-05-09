import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { UserPlus } from 'lucide-react';
import { useSearchProfiles, useGroupMemberManagement } from '@/hooks/useGroupMemberManagement';

interface AddMemberDialogProps { groupId: string; existingMemberIds: string[]; onMemberAdded: () => void; }

export function AddMemberDialog({ groupId, existingMemberIds, onMemberAdded }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { results, isSearching } = useSearchProfiles(search, existingMemberIds);
  const { addMember } = useGroupMemberManagement(groupId);
  const handleSelect = async (userId: string) => {
    await addMember.mutateAsync({ userId });
    onMemberAdded(); setOpen(false); setSearch('');
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><UserPlus style={{ height: 16, width: 16, marginRight: 8 }} />Add Member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isSearching ? 'Searching...' : search.length < 2 ? 'Type at least 2 characters' : 'No users found'}</CommandEmpty>
            <CommandGroup>
              {results.map((profile) => (
                <CommandItem key={profile.user_id} value={profile.user_id} onSelect={() => handleSelect(profile.user_id)}>
                  <div className="flex items-center gap-2">
                    <Avatar style={{ height: 32, width: 32 }}><AvatarImage src={profile.avatar_url || undefined} /><AvatarFallback>{profile.display_name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                    <span>{profile.display_name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
