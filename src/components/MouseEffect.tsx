import { useEffect, useState } from 'react';

export function MouseEffect() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPointer, setIsPointer] = useState(false);

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      const target = e.target as HTMLElement;
      // Determine if we are hovering over a clickable element
      setIsPointer(
        window.getComputedStyle(target).cursor === 'pointer' ||
        target.tagName.toLowerCase() === 'button' ||
        target.tagName.toLowerCase() === 'a' ||
        target.closest('button') !== null ||
        target.closest('a') !== null
      );
    };

    window.addEventListener('mousemove', updateMousePosition);
    
    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
    };
  }, []);

  return (
    <>
      {/* Outer trailing circle */}
      <div 
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full border-2 border-cyan/40 transition-all duration-300 ease-out"
        style={{
          width: isPointer ? '48px' : '32px',
          height: isPointer ? '48px' : '32px',
          transform: `translate(${position.x - (isPointer ? 24 : 16)}px, ${position.y - (isPointer ? 24 : 16)}px)`,
          opacity: 0.6,
          boxShadow: isPointer ? '0 0 15px rgba(6, 182, 212, 0.4)' : 'none',
        }}
      />
      {/* Inner glowing dot */}
      <div 
        className="pointer-events-none fixed top-0 left-0 z-[10000] rounded-full bg-cyan transition-transform duration-75 ease-linear"
        style={{
          width: '6px',
          height: '6px',
          transform: `translate(${position.x - 3}px, ${position.y - 3}px) scale(${isPointer ? 1.5 : 1})`,
          boxShadow: '0 0 10px rgba(6, 182, 212, 0.8)',
        }}
      />
    </>
  );
}
