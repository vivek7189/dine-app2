import { useWindowDimensions } from 'react-native';

const BREAKPOINTS = {
  tablet: 768,
  tabletLandscape: 1024,
};

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= BREAKPOINTS.tablet;
  const isLandscape = width > height;
  const deviceType = width >= BREAKPOINTS.tabletLandscape
    ? 'tabletLandscape'
    : isTablet
      ? 'tablet'
      : 'phone';

  // Grid column calculator: phone default, +1 tablet portrait, +2 tablet landscape
  const gridColumns = (phoneColumns = 2) => {
    if (!isTablet) return phoneColumns;
    if (isLandscape) return phoneColumns + 2;
    return phoneColumns + 1;
  };

  // Responsive value selector
  // Usage: r(phoneVal, tabletVal, tabletLandscapeVal)
  // Or: r({ phone: 2, tablet: 3, tabletLandscape: 4 })
  const r = (phoneOrObj, tabletVal, landscapeVal) => {
    if (typeof phoneOrObj === 'object' && phoneOrObj !== null) {
      if (deviceType === 'tabletLandscape' && phoneOrObj.tabletLandscape !== undefined) {
        return phoneOrObj.tabletLandscape;
      }
      if (isTablet && phoneOrObj.tablet !== undefined) {
        return phoneOrObj.tablet;
      }
      return phoneOrObj.phone;
    }
    if (deviceType === 'tabletLandscape' && landscapeVal !== undefined) return landscapeVal;
    if (isTablet && tabletVal !== undefined) return tabletVal;
    return phoneOrObj;
  };

  // Font scaler: 1x on phone, 1.15x on tablet
  const fs = (phoneSize) => {
    if (!isTablet) return phoneSize;
    return Math.round(phoneSize * 1.15);
  };

  // Spacing scaler: 1x on phone, 1.25x on tablet
  const sp = (phoneSpacing) => {
    if (!isTablet) return phoneSpacing;
    return Math.round(phoneSpacing * 1.25);
  };

  // Modal width calculator - returns style object
  const modalWidth = (phoneMax = 500) => {
    if (!isTablet) return { width: '100%', maxWidth: phoneMax };
    const tabletMax = Math.min(phoneMax * 1.4, width * 0.6);
    return { width: '70%', maxWidth: tabletMax };
  };

  return {
    width,
    height,
    isTablet,
    isLandscape,
    deviceType,
    gridColumns,
    r,
    fs,
    sp,
    modalWidth,
  };
}
