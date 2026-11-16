// Last state (URL query + window scroll) of each list page for this browser tab.
// Stored per list path, so entering a list from the sidebar resumes where the user left it.
const PREFIX = 'list-state:';

export function getListState(path) {
  try {
    return JSON.parse(sessionStorage.getItem(PREFIX + path) || 'null');
  } catch {
    return null;
  }
}

export function saveListState(path, state) {
  sessionStorage.setItem(PREFIX + path, JSON.stringify(state));
}
