import { ModernAudioPlayer } from 'queer-guide';
import { StaticState } from './_static';

// Renditions point at non-loading paths — the player chrome renders, media
// stays at 0:00 (capture is offline by design).
const AUDIO = {
  id: 'a1',
  title: 'Queer history walk: Schöneberg',
  artist: 'Queer Guide editorial',
  duration_seconds: 1260,
  renditions: [
    {
      format: 'progressive',
      codec: 'aac',
      container: 'mp4',
      file_path: '/audio/schoeneberg-walk.m4a',
    },
  ],
};

export const Default = () => (
  <>
    <StaticState />
    <div className="w-96">
      <ModernAudioPlayer audio={AUDIO} />
    </div>
  </>
);
