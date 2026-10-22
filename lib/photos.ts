/**
 * Default photography, used until the owner adds their own in Admin → Settings.
 * All from Unsplash, free to use under the Unsplash License (https://unsplash.com/license).
 */
const u = (id: string, w: number) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const DEFAULT_HERO = u("photo-1773904215697-e6c21fc27ac2", 2000); // barber chairs, dim light (Tanya Barrow)

export const DEFAULT_GALLERY = [
  { src: u("photo-1599351431202-1e0f0137899a", 1200), alt: "Barber trimming hair with a straight razor" }, // Agustin Fernandez
  { src: u("photo-1647140655214-e4a2d914971f", 900), alt: "Barber cutting hair with scissors" }, // Nate Johnston
  { src: u("photo-1621605815971-fbc98d665033", 900), alt: "Clippers, scissors and grooming tools" }, // Andrea Donato
  { src: u("photo-1783908688260-0c47404926f3", 900), alt: "Barber in black gloves cutting a client's hair" }, // Peter Vimalis
  { src: u("photo-1781768526571-ef9c333279c7", 900), alt: "Classic barbershop interior" }, // Barney Goodman
];

export const DEFAULT_VISIT = u("photo-1621645582931-d1d3e6564943", 1200); // barber chair (Joshua Lawrence)

export function heroImage(url: string) {
  return url.trim() || DEFAULT_HERO;
}

export function galleryImages(text: string): { src: string; alt: string }[] {
  const own = text.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https:\/\/\S+$/.test(s));
  return own.length ? own.slice(0, 9).map((src) => ({ src, alt: "Inside the shop" })) : DEFAULT_GALLERY;
}

export function usesDefaultPhotos(heroUrl: string, galleryText: string) {
  return !heroUrl.trim() || !galleryText.trim();
}
