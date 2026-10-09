export function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Recognize only supported raster images and container formats for private listing media. */
export function sniffListingMedia(buf: Buffer): string | null {
  const image = sniff(buf);
  if (image === 'image/jpeg' || image === 'image/png') return image;
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  return null;
}
