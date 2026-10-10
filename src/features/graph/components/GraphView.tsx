import { withModuleClasses } from '@/shared/lib/css-classes';
import graphStyles from './GraphView.module.css';
import attachmentsStyles from '../../attachments/components/Attachments.module.css';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = { ...graphStyles, ...attachmentsStyles };

export function GraphView() {
  const graph = useWorkspaceStore((state) => state.ui.graph);
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));
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
              data-graph-search
              type="search"
              placeholder="Filter notes…"
              autoComplete="off"
            />
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              data-graph-zoom-out
              title="Zoom out"
            >
              <Icon name="minus" size="14" />
            </button>
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              data-graph-fit
              title="Fit graph"
            >
              Fit
            </button>
            <button
              className={withModuleClasses(styles, 'graph-control-btn')}
              data-graph-zoom-in
              title="Zoom in"
            >
              <Icon name="plus" size="14" />
            </button>
          </div>
        </div>
        <div className={withModuleClasses(styles, 'graph-stage')}>
          {graph.nodes.length ? (
            <svg
              className={withModuleClasses(styles, 'graph-svg')}
              data-graph-svg
              viewBox="0 0 1000 700"
              preserveAspectRatio="xMidYMid meet"
            >
              <rect x="0" y="0" width="1000" height="700" fill="transparent" />
              <g
                data-graph-viewport
                transform={`translate(${500 * (1 - graph.scale) + graph.panX} ${350 * (1 - graph.scale) + graph.panY}) scale(${graph.scale})`}
              >
                {graph.edges.map((edge) => {
                  const a = positions.get(edge.source);
                  const b = positions.get(edge.target);
                  return a && b ? (
                    <line
                      key={`${edge.source}:${edge.target}`}
                      className={withModuleClasses(styles, 'graph-edge')}
                      data-graph-edge
                      data-graph-source={edge.source}
                      data-graph-target={edge.target}
                      x1={a.x.toFixed(1)}
                      y1={a.y.toFixed(1)}
                      x2={b.x.toFixed(1)}
                      y2={b.y.toFixed(1)}
                    />
                  ) : null;
                })}
                {graph.nodes.map((node) => {
                  const radius = Math.min(15, 6 + Math.sqrt(node.degree) * 2.1);
                  return (
                    <g
                      key={node.id}
                      className={withModuleClasses(
                        styles,
                        `graph-node ${node.current ? 'current' : ''}`,
                      )}
                      data-graph-page={node.id}
                      data-graph-title={node.title}
                      transform={`translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${node.title}`}
                    >
                      <circle r={radius.toFixed(1)} />
                      <text x={(radius + 6).toFixed(1)} y="4">
                        {node.title}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className={withModuleClasses(styles, 'graph-empty')}>
              <div>
                <b>No notes yet</b>Create pages and connect them with Link to page blocks.
              </div>
            </div>
          )}
          <div className={withModuleClasses(styles, 'graph-legend')}>
            Drag to move · click a node to open · Link to page connects notes
          </div>
        </div>
      </div>
    </section>
  );
}
