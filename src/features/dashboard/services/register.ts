// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';

export function registerDashboard(runtime: EditorRuntime) {
  function renderHome() {
    runtime.els.editorDock?.classList.add('hidden');
    runtime.bindEditorElements(null);
    runtime.els.graphView?.classList.add('hidden');
    runtime.els.attachmentsView?.classList.add('hidden');
    runtime.closeAttachmentPreview();
    runtime.els.editorView.classList.add('hidden');
    runtime.els.homeView.classList.remove('hidden');
    runtime.els.breadcrumbs.innerHTML = runtime.htmlWithStyles(
      `${runtime.navigationHistoryButtonsMarkup()}<span class="crumb">Home</span>`,
    );
    const recent = runtime.state.pages.slice().reverse().slice(0, 6);
    runtime.publish();

    runtime.publish();
  }

  Object.assign(runtime, { renderHome });
}
