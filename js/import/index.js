import { localSource } from './local-source.js';

// Registry of available import sources. The Library page renders one upload
// action per entry here. Add a cloud source (e.g. js/import/gdrive-source.js)
// and list it below to make it available — no other file needs to change.
export const importSources = [localSource];
