import { APP_NAME } from './../../app-identity';
import { withModuleClasses } from '@/shared/lib/css-classes';
import statusStyles from './Status.module.css';
import { Component, type ComponentChildren } from 'preact';

const styles = statusStyles;

export class ErrorBoundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(`${APP_NAME} rendering failed`, error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <div className={withModuleClasses(styles, 'spa-status')} role="alert">
          <h1>{APP_NAME} could not open</h1>
          <p>Your workspace is still stored locally.</p>
          <button onClick={() => window.location.reload()}>Reload application</button>
        </div>
      );
    return this.props.children;
  }
}
