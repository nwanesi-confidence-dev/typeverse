import React, {useEffect, useState} from 'react';
import {
  Check,
  Compass,
  Flame,
  Keyboard,
  Plus,
  Rocket,
  Shield,
  Star,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {
  idbDelete,
  saveProfile,
  setActiveProfileId,
} from '@/src/db/storage';
import type {UserProfile} from '@/src/types/app';

export const PROFILE_AVATARS = [
  {id: 'keyboard', label: 'Keyboard', Icon: Keyboard},
  {id: 'rocket', label: 'Rocket', Icon: Rocket},
  {id: 'flame', label: 'Flame', Icon: Flame},
  {id: 'star', label: 'Star', Icon: Star},
  {id: 'compass', label: 'Compass', Icon: Compass},
  {id: 'zap', label: 'Zap', Icon: Zap},
  {id: 'shield', label: 'Shield', Icon: Shield},
  {id: 'user', label: 'User', Icon: User},
] as const;

export const PROFILE_COLOURS = [
  '#22D3EE',
  '#34D399',
  '#FBBF24',
  '#F472B6',
  '#A78BFA',
  '#60A5FA',
];

export function renderProfileAvatar(avatarId: string, className = 'w-4 h-4') {
  const found =
    PROFILE_AVATARS.find((a) => a.id === avatarId) ?? PROFILE_AVATARS[0];
  const Icon = found.Icon;
  return <Icon className={className} aria-hidden="true" />;
}

interface ProfileManagerModalProps {
  open: boolean;
  profiles: UserProfile[];
  activeProfileId: string;
  onClose: () => void;
  onProfileChanged: (activeId: string, updatedList: UserProfile[]) => void;
}

export const ProfileManagerModal: React.FC<ProfileManagerModalProps> = ({
  open,
  profiles,
  activeProfileId,
  onClose,
  onProfileChanged,
}) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>('rocket');
  const [colour, setColour] = useState<string>(PROFILE_COLOURS[0]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = async (id: string) => {
    soundEngine.playUiTap();
    await setActiveProfileId(id);
    onProfileChanged(id, profiles);
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    soundEngine.playUiTap();

    const newProfile: UserProfile = {
      id: `profile-${Date.now()}`,
      name: trimmed.slice(0, 24),
      avatar,
      colour,
      createdAt: Date.now(),
    };
    await saveProfile(newProfile);
    await setActiveProfileId(newProfile.id);
    const updated = [...profiles, newProfile];
    onProfileChanged(newProfile.id, updated);
    setName('');
    setCreating(false);
    onClose();
  };

  const handleDelete = async (id: string) => {
    if (profiles.length <= 1) return;
    soundEngine.playUiTap();
    await idbDelete('profiles', id);
    await idbDelete('progress', id);
    const remaining = profiles.filter((p) => p.id !== id);
    const nextActive =
      id === activeProfileId ? remaining[0].id : activeProfileId;
    if (id === activeProfileId) {
      await setActiveProfileId(nextActive);
    }
    onProfileChanged(nextActive, remaining);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profiles-modal-title"
      onClick={onClose}
    >
      <div
        className="tv-surface w-[min(100%,32rem)] max-h-[92%] overflow-y-auto rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between pb-3 border-b"
          style={{borderColor: 'var(--tv-border)'}}
        >
          <div>
            <h2 id="profiles-modal-title" className="font-display text-xl font-bold">
              Local Profiles
            </h2>
            <p className="text-xs mt-0.5" style={{color: 'var(--tv-text-muted)'}}>
              Saved offline on this device. No password required.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Close profiles"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                style={{
                  borderColor: isActive ? 'var(--tv-accent)' : 'var(--tv-border)',
                  backgroundColor: isActive ? 'var(--tv-surface-elevated)' : 'var(--tv-bg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleSelect(p.id)}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{backgroundColor: `${p.colour}24`, color: p.colour}}
                  >
                    {renderProfileAvatar(p.avatar, 'w-4 h-4')}
                  </span>
                  <span className="truncate font-semibold text-sm">{p.name}</span>
                  {isActive && (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{color: 'var(--tv-accent)'}}
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Active</span>
                    </span>
                  )}
                </button>

                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(p.id)}
                    className="rounded-lg p-1.5 opacity-65 hover:opacity-100"
                    style={{color: 'var(--tv-error)'}}
                    aria-label={`Delete profile ${p.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {creating ? (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="rounded-xl border p-4 space-y-4"
            style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          >
            <div className="space-y-1.5">
              <label htmlFor="new-profile-name" className="text-xs font-medium">
                Profile Name
              </label>
              <input
                id="new-profile-name"
                type="text"
                maxLength={24}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--tv-surface)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium">Avatar</div>
              <div className="flex flex-wrap gap-2">
                {PROFILE_AVATARS.map((item) => {
                  const Icon = item.Icon;
                  const active = avatar === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAvatar(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border"
                      style={{
                        borderColor: active ? colour : 'var(--tv-border)',
                        backgroundColor: active ? `${colour}22` : 'var(--tv-surface)',
                        color: active ? colour : 'var(--tv-text-muted)',
                      }}
                      aria-label={item.label}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium">Accent Colour</div>
              <div className="flex flex-wrap gap-2">
                {PROFILE_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColour(c)}
                    className="h-7 w-7 rounded-full border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: colour === c ? 'var(--tv-text)' : 'transparent',
                    }}
                    aria-label={`Select colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text-muted)'}}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg px-4 py-1.5 text-xs font-semibold"
                style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
              >
                Create Profile
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold"
              style={{borderColor: 'var(--tv-accent)', color: 'var(--tv-accent)'}}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Profile</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold"
              style={{backgroundColor: 'var(--tv-surface-elevated)'}}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
