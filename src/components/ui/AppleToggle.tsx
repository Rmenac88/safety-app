import React from 'react';

interface AppleToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  activeColor?: string; // Optional custom color, defaults to Apple System Green (#34C759)
  ariaLabel?: string;
}

export const AppleToggle: React.FC<AppleToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  activeColor = '#34C759',
  ariaLabel = 'Basculer',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex items-center shrink-0 w-[51px] h-[31px] rounded-full p-[2px] cursor-pointer outline-none transition-colors duration-300 select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
      }`}
      style={{
        backgroundColor: checked ? activeColor : 'rgba(120, 120, 128, 0.32)',
        boxShadow: checked
          ? `0 0 16px ${activeColor}40, inset 0 0 0 1px rgba(255,255,255,0.2)`
          : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Apple Sliding Knob ────────────────────────────────────────── */}
      <span
        className="pointer-events-none block w-[27px] h-[27px] rounded-full bg-white transition-transform duration-300"
        style={{
          transform: checked ? 'translateX(20px)' : 'translateX(0px)',
          transitionTimingFunction: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
          boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.16), 0 3px 1px rgba(0, 0, 0, 0.1)',
        }}
      />
    </button>
  );
};
