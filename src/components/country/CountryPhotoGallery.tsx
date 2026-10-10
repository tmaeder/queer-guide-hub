import { Image } from '@/components/ui/Image';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

/** A small destination album; full photographs stay available without a large hero. */
export function CountryPhotoGallery({ photos }: { photos: { src: string; caption: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {photos.map((photo) => (
        <Dialog key={photo.src}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 rounded-element"
            >
              <Image
                src={photo.src}
                alt=""
                aspect="card"
                imageRole="cover"
                referrerPolicy="no-referrer"
              />
              <span className="mt-2 block text-13 font-bold">{photo.caption}</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl" aria-describedby={undefined}>
            <DialogTitle>{photo.caption}</DialogTitle>
            <Image
              src={photo.src}
              alt={photo.caption}
              aspect="auto"
              fit="contain"
              className="max-h-[70vh]"
              priority
              referrerPolicy="no-referrer"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
