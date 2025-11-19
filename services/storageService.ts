import { get, set } from 'idb-keyval';
import { TapeFileSchema } from '../types';

export interface StoredTape {
  id: string;
  characterName: string;
  timestamp: number;
  imgBase64: string;
  data: TapeFileSchema;
}

const LIBRARY_KEY = 'living-tv-library';

export const saveTapeToLibrary = async (tape: StoredTape): Promise<void> => {
  const library = (await get<StoredTape[]>(LIBRARY_KEY)) || [];
  
  // Check if tape already exists by ID (update it)
  const index = library.findIndex((t) => t.id === tape.id);
  if (index >= 0) {
    library[index] = tape;
  } else {
    // Add to the beginning
    library.unshift(tape);
  }
  
  await set(LIBRARY_KEY, library);
};

export const getLibrary = async (): Promise<StoredTape[]> => {
  return (await get<StoredTape[]>(LIBRARY_KEY)) || [];
};

export const deleteTapeFromLibrary = async (id: string): Promise<void> => {
  const library = (await get<StoredTape[]>(LIBRARY_KEY)) || [];
  const newLibrary = library.filter((t) => t.id !== id);
  await set(LIBRARY_KEY, newLibrary);
};

export const clearLibrary = async (): Promise<void> => {
  await set(LIBRARY_KEY, []);
};
