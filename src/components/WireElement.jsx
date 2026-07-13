function ImagePlaceholder({ stroke, strokeWidth }) {
  return (
    <svg className="el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="1"
        y1="1"
        x2="99"
        y2="99"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="99"
        y1="1"
        x2="1"
        y2="99"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function WireElement({ el, selected, onPointerDown, dimmed }) {
  const style = {
    left: el.x,
    top: el.y,
    width: Math.max(el.w, 1),
    height: Math.max(Math.abs(el.h) || (el.type === 'line' ? 1 : el.h), 1),
    zIndex: el.z,
    opacity: dimmed ? Math.min(el.opacity ?? 1, 1) * 0.28 : el.opacity,
  }

  if (el.type === 'line') {
    const x2 = el.w
    const y2 = el.h
    const minX = Math.min(0, x2)
    const minY = Math.min(0, y2)
    const boxW = Math.max(Math.abs(x2), 1)
    const boxH = Math.max(Math.abs(y2), 1)
    return (
      <div
        className={`wire-el wire-el--line${selected ? ' is-selected' : ''}`}
        style={{
          left: el.x + minX,
          top: el.y + minY,
          width: boxW,
          height: boxH,
          zIndex: el.z,
          opacity: dimmed ? Math.min(el.opacity ?? 1, 1) * 0.28 : el.opacity,
        }}
        data-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
      >
        <svg className="el-svg" width={boxW} height={boxH}>
          <line
            x1={0 - minX}
            y1={0 - minY}
            x2={x2 - minX}
            y2={y2 - minY}
            stroke={el.stroke}
            strokeWidth={el.strokeWidth}
          />
        </svg>
      </div>
    )
  }

  if (el.type === 'text') {
    return (
      <div
        className={`wire-el wire-el--text${selected ? ' is-selected' : ''}`}
        style={style}
        data-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
      >
        <span
          style={{
            fontSize: el.fontSize,
            color: el.fill,
            lineHeight: 1.2,
            wordBreak: 'break-word',
            display: 'block',
            width: '100%',
            textAlign: el.textAlign === 'middle' ? 'center' : el.textAlign || 'left',
          }}
        >
          {el.text || 'Text'}
        </span>
      </div>
    )
  }

  if (el.type === 'circle') {
    return (
      <div
        className={`wire-el wire-el--circle${selected ? ' is-selected' : ''}`}
        style={{
          ...style,
          borderRadius: '50%',
          border: `${el.strokeWidth}px solid ${el.stroke}`,
          background: el.fill === 'transparent' ? 'transparent' : el.fill,
          boxSizing: 'border-box',
        }}
        data-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
      />
    )
  }

  if (el.type === 'image') {
    return (
      <div
        className={`wire-el wire-el--image${selected ? ' is-selected' : ''}`}
        style={style}
        data-id={el.id}
        onPointerDown={(e) => onPointerDown(e, el.id)}
      >
        <ImagePlaceholder stroke={el.stroke} strokeWidth={el.strokeWidth} />
      </div>
    )
  }

  // rect
  return (
    <div
      className={`wire-el wire-el--rect${selected ? ' is-selected' : ''}`}
      style={{
        ...style,
        border: `${el.strokeWidth}px solid ${el.stroke}`,
        background: el.fill === 'transparent' ? 'transparent' : el.fill,
        borderRadius: el.cornerRadius,
        boxSizing: 'border-box',
      }}
      data-id={el.id}
      onPointerDown={(e) => onPointerDown(e, el.id)}
    />
  )
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function SelectionOverlay({ bounds, zoom, onHandleDown }) {
  if (!bounds) return null
  return (
    <div
      className="selection-overlay"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
      }}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          className={`resize-handle resize-handle--${h}`}
          style={{ transform: `scale(${1 / zoom})` }}
          onPointerDown={(e) => onHandleDown(e, h)}
        />
      ))}
    </div>
  )
}
