import { lazy, Suspense } from 'preact/compat';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { StartupSkeleton } from './components/StartupSkeleton';

const WorkspacePage = lazy(() => import('@/features/workspace/pages/WorkspacePage'));

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<StartupSkeleton />}>
        <WorkspacePage />
      </Suspense>
    </ErrorBoundary>
  );
}
