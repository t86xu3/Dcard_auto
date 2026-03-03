const STORAGE_KEY = 'savedProductLinks';

export function getSavedLinks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * 生成用戶專屬聯盟導購連結
 * 有 affiliate_id → 組裝 s.shopee.tw/an_redir 格式
 * 無 affiliate_id → fallback 到原始 offerLink
 */
export function generateAffiliateLink(item, affiliateSettings) {
  const originalLink = item.offerLink || item.productLink || '';
  if (!affiliateSettings?.affiliate_id) return originalLink;

  // 取得商品原始連結（非聯盟連結）作為 origin_link
  const originLink = item.productLink || item.offerLink || '';
  if (!originLink) return originalLink;

  const params = new URLSearchParams({
    origin_link: originLink,
    affiliate_id: affiliateSettings.affiliate_id,
  });
  if (affiliateSettings.sub_id) {
    params.set('sub_id', affiliateSettings.sub_id);
  }
  return `https://s.shopee.tw/an_redir?${params.toString()}`;
}

export function addSavedLink(item, affiliateSettings) {
  const links = getSavedLinks();
  const id = String(item.itemId || item.id);
  if (links.some(l => l.id === id)) return false;

  links.push({
    id,
    productName: item.productName || item.name || '',
    link: generateAffiliateLink(item, affiliateSettings),
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

export function markAsCopied(ids) {
  const idSet = new Set(ids.map(String));
  const links = getSavedLinks().map(l =>
    idSet.has(l.id) ? { ...l, copied: true } : l
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}
