import markup from './StartupSkeleton.html?raw';

// The same trusted markup is inlined by Vite before the application downloads.
export function StartupSkeleton() {
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
