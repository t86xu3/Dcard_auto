const STORAGE_KEY = 'savedProductLinks';

export function getSavedLinks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function addSavedLink(item) {
  const links = getSavedLinks();
  const id = String(item.itemId || item.id);
  if (links.some(l => l.id === id)) return false;

  links.push({
    id,
    productName: item.productName || item.name || '',
    link: item.offerLink || item.productLink || '',
    imageUrl: item.imageUrl || '',
    price: item._price || item.priceMin || '',
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  return true;
}

export function removeSavedLink(id) {
  const links = getSavedLinks().filter(l => l.id !== String(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function clearSavedLinks() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSaved(id) {
  return getSavedLinks().some(l => l.id === String(id));
}
