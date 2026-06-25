import { createUploadthing, type FileRouter } from 'uploadthing/next';

const f = createUploadthing();

export const ourFileRouter = {
  variantImage: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(async () => ({}))
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} as FileRouter;

export type OurFileRouter = typeof ourFileRouter;
