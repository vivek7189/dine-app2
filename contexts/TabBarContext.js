import React, { createContext, useContext, useRef, useCallback } from 'react';
import { Animated } from 'react-native';

const TabBarContext = createContext(null);

export function TabBarProvider({ children }) {
  // 0 = visible, 1 = hidden
  const translateY = useRef(new Animated.Value(0)).current;
  const isHidden = useRef(false);
  const lastScrollY = useRef(0);
  const scrollThreshold = 10; // minimum scroll delta to trigger hide/show

  const hide = useCallback(() => {
    if (isHidden.current) return;
    isHidden.current = true;
    Animated.timing(translateY, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const show = useCallback(() => {
    if (!isHidden.current) return;
    isHidden.current = false;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  // Call this from onScroll in screens
  const handleScroll = useCallback((currentY) => {
    const delta = currentY - lastScrollY.current;
    if (delta > scrollThreshold && currentY > 50) {
      hide(); // scrolling down
    } else if (delta < -scrollThreshold) {
      show(); // scrolling up
    }
    lastScrollY.current = currentY;
  }, [hide, show]);

  // Reset to visible (call when screen focuses or unmounts)
  const reset = useCallback(() => {
    lastScrollY.current = 0;
    show();
  }, [show]);

  return (
    <TabBarContext.Provider value={{ translateY, handleScroll, hide, show, reset }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}
