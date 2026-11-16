import { watch, nextTick } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { getListState, saveListState } from '../utils/listState';

// Position of the current browser history entry (set by vue-router).
// Going back returns to the same entry, while opening a page from the sidebar creates a new one.
const currentEntry = () => window.history.state?.position;

/**
 * Restores the list's window scroll position and filters when the user comes back
 * to this list via the back button (from a detail page). Opening the list from the
 * sidebar starts fresh (no restore).
 *
 * @param {import('vue').Ref<boolean>} loading - the list's loading flag
 */
export function useScrollRestore(loading) {
  const route = useRoute();
  let restored = false;

  onBeforeRouteLeave(() => {
    saveListState(route.path, { position: currentEntry(), fullPath: route.fullPath, scrollY: window.scrollY });
  });

  watch(loading, (isLoading) => {
    if (isLoading || restored) return;
    restored = true;
    const saved = getListState(route.path);
    if (!saved || saved.position !== currentEntry() || saved.fullPath !== route.fullPath) return;
    nextTick(() => window.scrollTo({ top: saved.scrollY || 0, behavior: 'instant' }));
  });
}
