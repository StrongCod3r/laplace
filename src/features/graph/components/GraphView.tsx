import { useLayoutEffect, useRef } from 'preact/hooks';
import { GraphScene } from '../services/scene';
import { withModuleClasses } from '@/shared/lib/css-classes';
import graphStyles from './GraphView.module.css';
import attachmentsStyles from '../../attachments/components/Attachments.module.css';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = { ...graphStyles, ...attachmentsStyles };

export function GraphView() {
  const graph = useWorkspaceStore((state) => state.ui.graph);
  const active = useWorkspaceStore((state) => state.ui.mainView === 'graph');
  const vaultId = useWorkspaceStore((state) => state.ui.activeVaultId);
  const canvasHost = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLOutputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const scene = useRef<GraphScene | null>(null);

  useLayoutEffect(() => {
    if (!canvasHost.current) return;
    const instance = new GraphScene(
      canvasHost.current,
      (id) => {
        useWorkspaceStore.getState().controller?.invoke('openPage', id, { newTab: true });
      },
      zoomLabel.current,
    );
    scene.current = instance;
    if (search.current) search.current.value = '';
    return () => {
      instance.dispose();
      scene.current = null;
    };
  }, [vaultId]);

  useLayoutEffect(() => {
    scene.current?.setActive(active);
    if (active) scene.current?.setGraph(graph);
  }, [active, graph, vaultId]);
  return (
    <section
      id="graphView"
      className={withModuleClasses(styles, 'graph-view hidden')}
      aria-label="Graph view"
    >
      <div className={withModuleClasses(styles, 'graph-shell')}>
        <div className={withModuleClasses(styles, 'graph-toolbar')}>
          <div className={withModuleClasses(styles, 'graph-title')}>
            <b>Graph view</b>
            <span>
              {graph.nodes.length} notes · {graph.edges.length} links
            </span>
          </div>
          <div className={withModuleClasses(styles, 'graph-controls')}>
            <input
              className={withModuleClasses(styles, 'graph-search')}
              ref={search}
              onInput={(event) => scene.current?.search(event.currentTarget.value)}
              aria-label="Filter notes"
              data-graph-search
              type="search"
              placeholder="Filter notes…"
              autoComplete="off"
            />
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              onClick={() => scene.current?.zoom(1 / 1.2)}
              aria-label="Zoom out"
              data-graph-zoom-out
              title="Zoom out"
            >
              <Icon name="minus" size="14" />
            </button>
            <output
              ref={zoomLabel}
              className={withModuleClasses(styles, 'graph-zoom-level')}
              aria-label="Zoom level"
            >
              100%
            </output>
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              onClick={() => scene.current?.fit()}
              aria-label="Fit graph"
              data-graph-fit
              title="Fit graph"
            >
              Fit
            </button>
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              onClick={() => scene.current?.zoom(1.2)}
              aria-label="Zoom in"
              data-graph-zoom-in
              title="Zoom in"
            >
              <Icon name="plus" size="14" />
            </button>
          </div>
        </div>
        <div className={withModuleClasses(styles, 'graph-stage')}>
          <div
            ref={canvasHost}
            className={withModuleClasses(styles, 'graph-canvas')}
            data-graph-canvas
            tabIndex={0}
            role="group"
            aria-label="Note graph. Click inside a family circle to focus the group. Double-click a node to center and zoom in. Right-click to fit the entire graph. Middle-click or Ctrl/Cmd-click a node to open its page. Drag nodes to move them, drag the background to pan, and scroll to zoom. Use arrow keys to select a note, Enter or Space to open it, plus and minus to zoom, and zero to fit."
          />
          {!graph.nodes.length && (
            <div className={withModuleClasses(styles, 'graph-empty')}>
              <div>
                <b>No notes yet</b>Create pages and connect them with Link to page blocks.
              </div>
            </div>
          )}
          <div className={withModuleClasses(styles, 'graph-legend')}>
            Click a circle or double-click a node to focus · Middle-click or Ctrl/Cmd-click to open
            · right-click to fit · drag to rearrange · scroll to zoom
          </div>
        </div>
      </div>
    </section>
  );
}
