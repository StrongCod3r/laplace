import { withModuleClasses } from '@/shared/lib/css-classes';
import dashboardStyles from './HomeView.module.css';
import { Icon, NoteIcon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = dashboardStyles;

export function HomeView() {
  const recent = useWorkspaceStore((state) => state.ui.recent);
  const hour = new Date().getHours();
  return (
    <section id="homeView" className={withModuleClasses(styles, 'home-view hidden')}>
      <div className={withModuleClasses(styles, 'home-inner')}>
        <h1 className={withModuleClasses(styles, 'home-heading')}>
          Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}
        </h1>
        <div className={withModuleClasses(styles, 'home-sub')}>Jump back into your workspace.</div>
        <div className={withModuleClasses(styles, 'home-grid')}>
          {recent.map((note) => (
            <div
              key={note.id}
              className={withModuleClasses(styles, 'home-card')}
              data-home-page={note.id}
            >
              <div className={withModuleClasses(styles, 'home-card-icon')}>
                <NoteIcon html={note.iconHTML} />
              </div>
              <div className={withModuleClasses(styles, 'home-card-title')}>{note.title}</div>
              <div className={withModuleClasses(styles, 'home-card-sub')}>
                {note.words} words · {note.blocks} blocks
              </div>
            </div>
          ))}
          <div className={withModuleClasses(styles, 'home-card')} data-home-action="new">
            <div className={withModuleClasses(styles, 'home-card-icon')}>
              <Icon name="file-plus" size="28" />
            </div>
            <div className={withModuleClasses(styles, 'home-card-title')}>New page</div>
            <div className={withModuleClasses(styles, 'home-card-sub')}>
              Start from a blank page
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
