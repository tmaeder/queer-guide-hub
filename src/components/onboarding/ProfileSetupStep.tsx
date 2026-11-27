import { UsernameSelector } from '@/components/auth/UsernameSelector';
import { AvatarQuickPick } from '@/components/profile/AvatarQuickPick';
import type { AvatarConfig } from '@/components/profile/avatarConfig';

interface Props {
  username: string | null;
  onUsernameChange: (u: string | null) => void;
  avatar: AvatarConfig | null;
  onAvatarChange: (a: AvatarConfig | null) => void;
  /** Render only one of the two controls. Omit for both. */
  only?: 'username' | 'avatar';
}

/**
 * Username + avatar pickers, shared by onboarding and /claim-username.
 *
 * These used to be a mandatory second screen BEFORE the account existed, and
 * the values were discarded by the trigger anyway. `handle_new_user` now mints
 * both, so this is a refinement step: whatever the user does here overwrites a
 * working default, and skipping leaves them with a real handle and avatar.
 */
export function ProfileSetupStep({
  username,
  onUsernameChange,
  avatar,
  onAvatarChange,
  only,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      {only !== 'avatar' && (
        <div className="flex flex-col gap-2">
          <UsernameSelector value={username} onChange={onUsernameChange} prepick />
        </div>
      )}

      {only !== 'username' && (
        <div className="flex flex-col gap-2">
          <AvatarQuickPick value={avatar} onChange={onAvatarChange} prepick />
        </div>
      )}
    </div>
  );
}
