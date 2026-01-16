/**
 * Smart Placeholder Image System
 * Returns the appropriate image for a menu item:
 * 1. User-uploaded image (first priority)
 * 2. Keyword-matched placeholder (second priority)
 * 3. Category-based placeholder (third priority)
 * 4. Generic food image (fallback)
 */

/**
 * Get the best matching placeholder image name based on item name and category
 * @param {string} itemName - The name of the menu item
 * @param {string} category - The category of the item
 * @param {boolean} isVeg - Whether the item is vegetarian
 * @returns {string|null} - The placeholder image filename or null
 */
function getPlaceholderImageName(itemName, category, isVeg) {
  if (!itemName) return null;
  
  const name = itemName.toLowerCase().trim();
  const cat = category ? category.toLowerCase().trim() : '';
  
  // Chinese dishes - High priority exact matches
  if (name.includes('hakka noodles') || name.includes('chowmein') || name.includes('chow mein')) {
    return 'noodles.jpeg';
  }
  if (name.includes('fried rice')) {
    return 'fried-rice.jpeg';
  }
  if (name.includes('manchurian') || name.includes('manchurian')) {
    return 'manchurian.jpeg';
  }
  if (name.includes('spring roll')) {
    return 'spring-rolls.jpeg';
  }
  if (name.includes('chilli paneer') || name.includes('chilly paneer')) {
    return 'chilli-paneer.jpeg';
  }
  if (name.includes('chinese platter') || (name.includes('platter') && cat.includes('chinese'))) {
    return 'chinese-platter.jpeg';
  }
  
  // Broader Chinese/Indo-Chinese matches
  if (name.includes('noodles')) {
    return 'noodles.jpeg';
  }
  
  // Appetizers & Starters
  if (name.includes('paneer tikka')) {
    return 'paneer-tikka.jpeg';
  }
  if (name.includes('kebab') || name.includes('kabab')) {
    return 'kebab.jpg';
  }
  if (name.includes('soya chaap') || name.includes('chaap')) {
    return 'soya-chaap.jpeg';
  }
  if (name.includes('crispy corn') || name.includes('corn')) {
    return 'crispy-corn.jpeg';
  }
  if (name.includes('potato') || name.includes('aloo')) {
    return 'potato-dish.jpg';
  }
  if (name.includes('tandoori platter') || name.includes('sizzler') || name.includes('mixed platter')) {
    return 'tandoori-platter.jpeg';
  }
  if (name.includes('salt') && name.includes('pepper')) {
    return 'salt-pepper.jpeg';
  }
  
  // Main Course dishes
  if (name.includes('thali')) {
    return 'thali.jpeg';
  }
  if (name.includes('paneer') && (name.includes('curry') || name.includes('masala') || name.includes('gravy'))) {
    return 'paneer-curry.jpeg';
  }
  if (name.includes('dal') || name.includes('daal') || name.includes('makhani')) {
    return 'daal-makhni.jpg';
  }
  if (name.includes('bhaji') || name.includes('pav bhaji')) {
    return 'bhaji.jpeg';
  }
  
  // Breads
  if (name.includes('kulcha') || name.includes('bhatura') || name.includes('pao') || 
      name.includes('naan') || name.includes('roti') || name.includes('paratha') || 
      name.includes('chapati')) {
    return 'indian-bread.jpeg';
  }
  
  // Desserts & Sweets
  if (name.includes('ice cream') || name.includes('icecream')) {
    return 'icecream.jpeg';
  }
  if (name.includes('chocolate') || name.includes('brownie')) {
    return 'chocolate.jpeg';
  }
  if (name.includes('pastry') || name.includes('cake')) {
    return 'pastry.jpeg';
  }
  if (name.includes('croissant')) {
    return 'croissant.jpeg';
  }
  
  // Fast Food
  if (name.includes('burger')) {
    return 'burgers.jpeg';
  }
  if (name.includes('pasta')) {
    return 'pasta.jpeg';
  }
  
  // Category-based fallbacks (less specific matching)
  if (cat.includes('chinese') || cat.includes('indo-chinese') || cat.includes('indo chinese')) {
    // If it's Chinese category but didn't match above, check for common Chinese items
    if (name.includes('rice')) return 'fried-rice.jpeg';
    if (name.includes('noodles')) return 'noodles.jpeg';
    // General Chinese fallback
    return 'chinese-platter.jpeg';
  }
  
  if (cat.includes('appetizer') || cat.includes('starter') || cat.includes('snacks')) {
    return 'appetizer.jpeg';
  }
  
  if (cat.includes('main course') || cat.includes('main-course') || cat.includes('curry') || cat.includes('gravy')) {
    // Check if it's paneer-based
    if (name.includes('paneer')) return 'paneer-curry.jpeg';
    // Generic curry fallback
    return 'paneer-curry.jpeg';
  }
  
  if (cat.includes('bread') || cat.includes('roti') || cat.includes('naan')) {
    return 'indian-bread.jpeg';
  }
  
  if (cat.includes('dal') || cat.includes('lentil')) {
    return 'daal-makhni.jpg';
  }
  
  if (cat.includes('dessert') || cat.includes('sweet')) {
    return 'icecream.jpeg';
  }
  
  if (cat.includes('beverage') || cat.includes('drink') || cat.includes('juice')) {
    return 'chocolate.jpeg';
  }
  
  if (cat.includes('burger') || cat.includes('fast food')) {
    return 'burgers.jpeg';
  }
  
  if (cat.includes('pasta') || cat.includes('italian')) {
    return 'pasta.jpeg';
  }
  
  // No match found
  return null;
}

/**
 * Get the display image URL for a menu item
 * For React Native, we'll use the backend URL or a local asset
 * @param {Object} menuItem - The menu item object
 * @param {string} menuItem.name - Item name
 * @param {string} menuItem.category - Item category
 * @param {boolean} menuItem.isVeg - Whether item is veg
 * @param {string} menuItem.image - Legacy single image URL
 * @param {Array} menuItem.images - Array of image objects with url property
 * @param {string} baseUrl - Base URL for placeholder images (default: backend URL)
 * @returns {string|null} - The image URL to display, or null to hide image
 */
export function getDisplayImage(menuItem, baseUrl = 'https://dineopen.com') {
  // Priority 1: User-uploaded images (new format - array)
  if (menuItem.images && Array.isArray(menuItem.images) && menuItem.images.length > 0) {
    const firstImage = menuItem.images[0];
    if (firstImage && firstImage.url) {
      return firstImage.url;
    }
  }
  
  // Priority 2: User-uploaded image (legacy format - single string)
  if (menuItem.image && typeof menuItem.image === 'string' && menuItem.image.trim() !== '') {
    return menuItem.image;
  }
  
  // Priority 3: Smart keyword-matched placeholder
  const placeholderName = getPlaceholderImageName(
    menuItem.name, 
    menuItem.category, 
    menuItem.isVeg
  );
  
  if (placeholderName) {
    return `${baseUrl}/placeholder-images/${placeholderName}`;
  }
  
  // Priority 4: Generic fallback
  return `${baseUrl}/placeholder-images/appetizer.jpeg`;
}
