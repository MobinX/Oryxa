declare module 'ffmpeg-static' {
  /** Absolute path to the platform's ffmpeg binary, or null when no build exists for it. */
  const path: string | null;
  export default path;
}
