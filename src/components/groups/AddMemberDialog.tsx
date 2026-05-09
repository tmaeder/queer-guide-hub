import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
interface Profile { user_id: string; display_name: string; avatar_url: string; }
interface AddMemberDialogProps { groupId: string; existingMemberIds: string[]; onMemberAdded: () => void; }
export function AddMemberDialog({ groupId, existingMemberIds, onMemberAdded }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase.from('profiles').select('user_id, display_name, avatar_url').ilike('display_name', `%${search}%`).not('user_id', 'in', `(${existingMemberIds.join(',')})`).limit(10);
      setResults(data || []); setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, existingMemberIds]);
  const handleSelect = async (profile: Profile) => {
    const { error } = await supabase.from('group_memberships').insert({ group_id: groupId, user_id: profile.user_id, role: 'member' });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Member added', description: `${profile.display_name} added to group.` });
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
                <CommandItem key={profile.user_id} value={profile.user_id} onSelect={() => handleSelect(profile)}>
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
