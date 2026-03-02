import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayProps {
  imageSrc: string;
  onCropChange: (crop: CropRect) => void;
  initialCrop?: CropRect;
}

type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'right' | 'bottom' | 'left' | 'move';

const MIN_SIZE = 40; // Minimum crop dimension in px

const CropOverlay: React.FC<CropOverlayProps> = ({ imageSrc, onCropChange, initialCrop }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLayout, setImgLayout] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect>({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  const [dragging, setDragging] = useState<HandleType | null>(null);
  const dragStart = useRef<{ mx: number; my: number; crop: CropRect }>({ mx: 0, my: 0, crop: { x: 0, y: 0, width: 0, height: 0 } });

  // Update image layout on load/resize
  const updateLayout = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const img = imgRef.current;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (!natW || !natH) return;

    const scale = Math.min(container.width / natW, container.height / natH);
    const w = natW * scale;
    const h = natH * scale;
    const x = (container.width - w) / 2;
    const y = (container.height - h) / 2;
    setImgLayout({ x, y, w, h });
  }, []);

  useEffect(() => {
    if (initialCrop) setCrop(initialCrop);
  }, [initialCrop]);

  useEffect(() => {
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [updateLayout]);

  // Convert normalized crop to px
  const toPx = useCallback((c: CropRect) => {
    if (!imgLayout) return { x: 0, y: 0, w: 0, h: 0 };
    return {
      x: imgLayout.x + c.x * imgLayout.w,
      y: imgLayout.y + c.y * imgLayout.h,
      w: c.width * imgLayout.w,
      h: c.height * imgLayout.h,
    };
  }, [imgLayout]);

  const getCoords = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { mx: e.touches[0].clientX, my: e.touches[0].clientY };
    }
    if ('clientX' in e) {
      return { mx: (e as React.MouseEvent).clientX, my: (e as React.MouseEvent).clientY };
    }
    return { mx: 0, my: 0 };
  };

  const startDrag = (handle: HandleType, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { mx, my } = getCoords(e);
    dragStart.current = { mx, my, crop: { ...crop } };
    setDragging(handle);
  };

  const onMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!dragging || !imgLayout) return;
    e.preventDefault();

    let mx: number, my: number;
    if ('touches' in e && e.touches.length > 0) {
      mx = e.touches[0].clientX;
      my = e.touches[0].clientY;
    } else if ('clientX' in e) {
      mx = (e as MouseEvent).clientX;
      my = (e as MouseEvent).clientY;
    } else return;

    const dx = (mx - dragStart.current.mx) / imgLayout.w;
    const dy = (my - dragStart.current.my) / imgLayout.h;
    const prev = dragStart.current.crop;
    const minNorm = MIN_SIZE / Math.max(imgLayout.w, imgLayout.h);

    let next = { ...prev };

    switch (dragging) {
      case 'move': {
        let nx = prev.x + dx;
        let ny = prev.y + dy;
        nx = Math.max(0, Math.min(1 - prev.width, nx));
        ny = Math.max(0, Math.min(1 - prev.height, ny));
        next = { ...prev, x: nx, y: ny };
        break;
      }
      case 'tl': {
        const nx = Math.max(0, Math.min(prev.x + prev.width - minNorm, prev.x + dx));
        const ny = Math.max(0, Math.min(prev.y + prev.height - minNorm, prev.y + dy));
        next = { x: nx, y: ny, width: prev.x + prev.width - nx, height: prev.y + prev.height - ny };
        break;
      }
      case 'tr': {
        const nw = Math.max(minNorm, Math.min(1 - prev.x, prev.width + dx));
        const ny = Math.max(0, Math.min(prev.y + prev.height - minNorm, prev.y + dy));
        next = { x: prev.x, y: ny, width: nw, height: prev.y + prev.height - ny };
        break;
      }
      case 'bl': {
        const nx = Math.max(0, Math.min(prev.x + prev.width - minNorm, prev.x + dx));
        const nh = Math.max(minNorm, Math.min(1 - prev.y, prev.height + dy));
        next = { x: nx, y: prev.y, width: prev.x + prev.width - nx, height: nh };
        break;
      }
      case 'br': {
        const nw = Math.max(minNorm, Math.min(1 - prev.x, prev.width + dx));
        const nh = Math.max(minNorm, Math.min(1 - prev.y, prev.height + dy));
        next = { x: prev.x, y: prev.y, width: nw, height: nh };
        break;
      }
      case 'top': {
        const ny = Math.max(0, Math.min(prev.y + prev.height - minNorm, prev.y + dy));
        next = { ...prev, y: ny, height: prev.y + prev.height - ny };
        break;
      }
      case 'bottom': {
        const nh = Math.max(minNorm, Math.min(1 - prev.y, prev.height + dy));
        next = { ...prev, height: nh };
        break;
      }
      case 'left': {
        const nx = Math.max(0, Math.min(prev.x + prev.width - minNorm, prev.x + dx));
        next = { ...prev, x: nx, width: prev.x + prev.width - nx };
        break;
      }
      case 'right': {
        const nw = Math.max(minNorm, Math.min(1 - prev.x, prev.width + dx));
        next = { ...prev, width: nw };
        break;
      }
    }

    setCrop(next);
    onCropChange(next);
  }, [dragging, imgLayout, onCropChange]);

  const onEnd = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      const opts: AddEventListenerOptions = { passive: false };
      window.addEventListener('mousemove', onMove, opts);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, opts);
      window.addEventListener('touchend', onEnd);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
      };
    }
  }, [dragging, onMove, onEnd]);

  const px = toPx(crop);

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'rgba(99,102,241,0.9)',
    border: '2px solid #fff',
    cursor,
    touchAction: 'none',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  });

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black" style={{ touchAction: 'none' }}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Crop"
        onLoad={updateLayout}
        className="absolute object-contain"
        style={{
          top: imgLayout?.y ?? 0,
          left: imgLayout?.x ?? 0,
          width: imgLayout?.w ?? '100%',
          height: imgLayout?.h ?? '100%',
        }}
        draggable={false}
      />

      {imgLayout && (
        <>
          {/* Dark overlay outside crop */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(to right, 
              rgba(0,0,0,0.6) ${px.x}px, transparent ${px.x}px, transparent ${px.x + px.w}px, rgba(0,0,0,0.6) ${px.x + px.w}px)`,
          }} />
          {/* Top dark band */}
          <div className="absolute pointer-events-none" style={{
            left: px.x, top: imgLayout.y, width: px.w, height: px.y - imgLayout.y,
            background: 'rgba(0,0,0,0.6)',
          }} />
          {/* Bottom dark band */}
          <div className="absolute pointer-events-none" style={{
            left: px.x, top: px.y + px.h, width: px.w, height: imgLayout.y + imgLayout.h - px.y - px.h,
            background: 'rgba(0,0,0,0.6)',
          }} />

          {/* Crop border */}
          <div
            style={{
              position: 'absolute',
              left: px.x,
              top: px.y,
              width: px.w,
              height: px.h,
              border: '2px solid rgba(99,102,241,0.8)',
              cursor: 'move',
              touchAction: 'none',
            }}
            onMouseDown={e => startDrag('move', e)}
            onTouchStart={e => startDrag('move', e)}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
              backgroundSize: '33.33% 33.33%',
            }} />
          </div>

          {/* Corner handles */}
          <div style={{ ...handleStyle('nw-resize'), left: px.x - 14, top: px.y - 14 }}
            onMouseDown={e => startDrag('tl', e)} onTouchStart={e => startDrag('tl', e)} />
          <div style={{ ...handleStyle('ne-resize'), left: px.x + px.w - 14, top: px.y - 14 }}
            onMouseDown={e => startDrag('tr', e)} onTouchStart={e => startDrag('tr', e)} />
          <div style={{ ...handleStyle('sw-resize'), left: px.x - 14, top: px.y + px.h - 14 }}
            onMouseDown={e => startDrag('bl', e)} onTouchStart={e => startDrag('bl', e)} />
          <div style={{ ...handleStyle('se-resize'), left: px.x + px.w - 14, top: px.y + px.h - 14 }}
            onMouseDown={e => startDrag('br', e)} onTouchStart={e => startDrag('br', e)} />

          {/* Side handles */}
          <div style={{ ...handleStyle('n-resize'), left: px.x + px.w / 2 - 14, top: px.y - 14, width: 32, height: 12, borderRadius: 4 }}
            onMouseDown={e => startDrag('top', e)} onTouchStart={e => startDrag('top', e)} />
          <div style={{ ...handleStyle('s-resize'), left: px.x + px.w / 2 - 14, top: px.y + px.h + 2, width: 32, height: 12, borderRadius: 4 }}
            onMouseDown={e => startDrag('bottom', e)} onTouchStart={e => startDrag('bottom', e)} />
          <div style={{ ...handleStyle('w-resize'), left: px.x - 14, top: px.y + px.h / 2 - 6, width: 12, height: 32, borderRadius: 4 }}
            onMouseDown={e => startDrag('left', e)} onTouchStart={e => startDrag('left', e)} />
          <div style={{ ...handleStyle('e-resize'), left: px.x + px.w + 2, top: px.y + px.h / 2 - 6, width: 12, height: 32, borderRadius: 4 }}
            onMouseDown={e => startDrag('right', e)} onTouchStart={e => startDrag('right', e)} />
        </>
      )}
    </div>
  );
};

export default CropOverlay;
